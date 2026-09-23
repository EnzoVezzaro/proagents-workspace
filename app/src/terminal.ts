/**
 * TerminalManager — REAL terminals for the workspace control room.
 *
 * Every workspace gets a genuine PTY (node-pty) running the user's shell,
 * rooted in the workspace directory. There is no fake/exec-simulation layer:
 *
 *   - what you see in the terminal pane is the PTY's own byte stream;
 *   - the launch pipeline (clone/install/ACC setup) runs as real commands
 *     typed into that same PTY;
 *   - the harness (claude/dsh/opencode/…) is launched INSIDE the terminal
 *     and the user watches and interacts with it live, exactly like the
 *     DeepSeek Harness / VS Code integrated-terminal experience.
 *
 * Output is kept in a ring buffer so a newly connected SSE viewer replays
 * the session so far (VS Code "scrollback" behavior). Data is chunked and
 * flushed on a 40ms cadence to keep xterm rendering smooth.
 */
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { WorkspaceError } from "@proagents/contracts";

// node-pty is a native module; imported through createRequire so the server
// can start (and report an honest error) on machines where the build is
// unavailable.
type IPty = import("node-pty").IPty;

const RING_LIMIT = 400_000; // chars of scrollback per terminal
const FLUSH_MS = 40;

export interface TerminalInfo {
  readonly id: string;
  readonly workspaceId: string;
  readonly cwd: string;
  readonly shell: string;
  readonly createdAt: string;
}

export class TerminalManager {
  private readonly terms = new Map<
    string,
    {
      pty: IPty;
      info: TerminalInfo;
      ring: string;
      clients: Set<import("node:http").ServerResponse>;
      closed: boolean;
      flushTimer: NodeJS.Timeout | null;
      pending: string;
      seq: number;
      setupSeq: number;
    }
  >();
  private counter = 0;
  private readonly hub = new EventEmitter();

  constructor(private readonly shellPreference?: string) {}

  /** Spawn a real shell in a real PTY, rooted at `cwd`. */
  create(workspaceId: string, cwd: string, env?: Record<string, string>): TerminalInfo {
    const pty = this.requirePty();
    this.counter += 1;
    const id = `tty-${workspaceId}-${this.counter}`;
    const shell = this.shellPreference ?? process.env.SHELL ?? "/bin/zsh";
    const info: TerminalInfo = { id, workspaceId, cwd, shell, createdAt: new Date().toISOString() };
    const p = pty.spawn(shell, ["-l"], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env, TERM: "xterm-256color", ...(env ?? {}) } as Record<string, string>,
    });
    const entry = {
      pty: p,
      info,
      ring: "",
      clients: new Set<import("node:http").ServerResponse>(),
      closed: false,
      flushTimer: null as NodeJS.Timeout | null,
      pending: "",
      seq: 0,
      setupSeq: 0,
    };
    this.terms.set(id, entry);

    p.onData((data: string) => {
      const e = this.terms.get(id);
      if (e === undefined) return;
      e.ring = (e.ring + data).slice(-RING_LIMIT);
      e.pending += data;
      if (e.flushTimer === null) {
        e.flushTimer = setTimeout(() => this.flush(id), FLUSH_MS);
      }
      this.hub.emit("data", id, data);
    });
    p.onExit(({ exitCode }) => {
      const e = this.terms.get(id);
      if (e === undefined) return;
      this.write(id, `\r\n\x1b[90m[process exited with code ${exitCode}]\x1b[0m\r\n`);
      this.flush(id);
      e.closed = true;
      for (const res of e.clients) {
        try {
          res.end();
        } catch {
          /* already gone */
        }
      }
      this.hub.emit("exit", id, exitCode);
      this.terms.delete(id);
    });

    this.hub.emit("created", info);
    return info;
  }

  get(id: string): TerminalInfo | undefined {
    return this.terms.get(id)?.info;
  }

  list(workspaceId?: string): readonly TerminalInfo[] {
    return [...this.terms.values()]
      .map((e) => e.info)
      .filter((t) => workspaceId === undefined || t.workspaceId === workspaceId);
  }

  /** Write to the PTY (keyboard input, or programmatic commands ending in \r). */
  write(id: string, data: string): void {
    const e = this.terms.get(id);
    if (e === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Terminal "${id}" is gone.`,
        recoverable: false,
        suggestions: [],
      });
    }
    if (e.closed) return;
    e.pty.write(data);
    this.hub.emit("input", id, data);
  }

  /** Run a command in the terminal as if typed (adds the newline). */
  runCommand(id: string, command: string): void {
    this.write(id, `${command}\r`);
  }

  /**
   * Run a command in the terminal and wait for it to FINISH, capturing its
   * real exit code — the provisioning primitive. A unique sentinel is echoed
   * after the command (`; echo <marker> $?`); resolution waits for that
   * marker in the PTY OUTPUT, so slow commands (clone, pnpm install) are
   * awaited exactly as long as they take.
   *
   * The PTY ECHOES what we type, so the marker must never appear verbatim in
   * the typed command: it is assembled at runtime from two shell variables
   * (`A=…; B=…; echo $A$B $?`), so the full sentinel only ever exists in the
   * command's output — the echo can never false-positive the waiter.
   * The line is prefixed with a space so it stays out of interactive shell
   * history — the scrollback remains the visible, honest setup log.
   */
  runCommandAwait(id: string, command: string, options?: { timeoutMs?: number }): Promise<{ exitCode: number }> {
    const e = this.terms.get(id);
    if (e === undefined || e.closed) {
      return Promise.resolve({ exitCode: -1 });
    }
    const seq = e.setupSeq + 1;
    e.setupSeq = seq;
    const rand = Math.random().toString(36).slice(2, 8);
    const partA = `__PAW_${seq}_`;
    const partB = `${rand}__`;
    const marker = partA + partB;
    // Leading space: HISTCONTROL-style shells skip history for spaced lines.
    // `rc=$?` is captured IMMEDIATELY after the command — the variable
    // assignments between would otherwise reset $? to 0.
    const wrapped = ` ${command}; rc=$?; A=${partA} B=${partB}; echo $A$B $rc`;
    return new Promise((resolve) => {
      let buffer = "";
      let settled = false;
      const settle = (exitCode: number): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.hub.removeListener("data", handler);
        this.hub.removeListener("exit", exitHandler);
        resolve({ exitCode });
      };
      const handler = (emittedId: string, data: string): void => {
        if (settled || emittedId !== id) return; // hub is global: match OUR terminal only
        buffer += data;
        const idx = buffer.indexOf(marker);
        if (idx === -1) {
          // Bound the matcher buffer; markers are short and arrive contiguous.
          if (buffer.length > 10_000) buffer = buffer.slice(-2_000);
          return;
        }
        // The exit code follows the marker on the same echo line.
        const rest = buffer.slice(idx + marker.length).trim();
        const code = Number.parseInt(rest.split(/\s/)[0] ?? "", 10);
        settle(Number.isFinite(code) ? code : 1);
      };
      this.hub.on("data", handler);
      const timer = setTimeout(() => settle(254), options?.timeoutMs ?? 15 * 60_000);
      // Race safety: if the PTY exits before the marker (shell died, user
      // typed exit), settle immediately with a failure code.
      const exitHandler = (exitId: string): void => {
        if (exitId === id) settle(255);
      };
      this.hub.on("exit", exitHandler);
      this.write(id, wrapped + "\r");
    });
  }

  /** Current scrollback contents (the workspace's real setup/agent log). */
  scrollback(id: string): string | undefined {
    return this.terms.get(id)?.ring;
  }

  resize(id: string, cols: number, rows: number): void {
    const e = this.terms.get(id);
    if (e === undefined) return;
    e.pty.resize(cols, rows);
  }

  /** Kill the terminal; cleanup is synchronous so callers can assert state. */
  kill(id: string): void {
    const e = this.terms.get(id);
    if (e === undefined) return;
    e.closed = true;
    try {
      e.pty.kill();
    } catch {
      /* already dead */
    }
    for (const res of e.clients) {
      try {
        res.end();
      } catch {
        /* already gone */
      }
    }
    this.hub.emit("exit", id, null);
    this.terms.delete(id);
  }

  killWorkspace(workspaceId: string): void {
    for (const e of this.terms.values()) {
      if (e.info.workspaceId === workspaceId) this.kill(e.info.id);
    }
  }

  /** Replay buffer for a fresh SSE viewer (scrollback), then live attach. */
  attach(id: string, res: import("node:http").ServerResponse): { replay: string } {
    const e = this.terms.get(id);
    if (e === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Terminal "${id}" is gone.`,
        recoverable: false,
        suggestions: [],
      });
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(`event: tty\ndata: ${JSON.stringify(e.ring)}\n\n`);
    e.clients.add(res);
    res.on("close", () => {
      e.clients.delete(res);
    });
    return { replay: e.ring };
  }

  private flush(id: string): void {
    const e = this.terms.get(id);
    if (e === undefined) return;
    e.flushTimer = null;
    if (e.pending.length === 0 || e.clients.size === 0) {
      e.pending = "";
      return;
    }
    e.seq += 1;
    const frame = `event: tty\ndata: ${JSON.stringify(e.pending)}\n\n`;
    e.pending = "";
    for (const res of e.clients) {
      try {
        res.write(frame);
      } catch {
        e.clients.delete(res);
      }
    }
  }

  private requirePty(): typeof import("node-pty") {
    try {
      // node-pty ships CJS; ESM servers load it through createRequire.
      const req = createRequire(import.meta.url);
      return req("node-pty") as typeof import("node-pty");
    } catch (error) {
      throw new WorkspaceError({
        code: "TERMINAL_UNAVAILABLE",
        message: `Real PTY unavailable: ${error instanceof Error ? error.message : String(error)}. Rebuild with: pnpm rebuild node-pty`,
        recoverable: false,
        suggestions: ["pnpm rebuild node-pty"],
      });
    }
  }
}

/** Escape-free check: commands are typed into a PTY exactly as a user would. */
export function assertSingleLine(command: string): string {
  const trimmed = command.trim();
  if (trimmed.length === 0 || trimmed.includes("\n")) {
    throw new WorkspaceError({
      code: "SHELL_COMMAND_DENIED",
      message: "Provide a single-line command.",
      recoverable: true,
      suggestions: [],
    });
  }
  return trimmed;
}
