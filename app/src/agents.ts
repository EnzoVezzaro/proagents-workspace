/**
 * Hired-agent runtime manager — REAL harness in a REAL terminal.
 *
 * Hiring a proagent (PROAGENTS-WORKSPACE-UI.md §8–12, README §141):
 *   1. DECLARE a named workspace entry in the effective config (isolated
 *      root, sandbox policy, plugin activation, session log).
 *   2. Mount it through the kernel `WorkspaceManager`.
 *   3. Open a REAL PTY rooted in the workspace (TerminalManager).
 *   4. Launch the chosen harness CLI *inside that terminal* — the user
 *      watches and interacts with the live agent exactly like in the
 *      DeepSeek Harness or a VS Code integrated terminal.
 *
 * Isolation: each hire owns its own directory (chats/<id> by default); a
 * chat never binds a project in place — the wizard materializes the project
 * INTO the chat's workspace (clone or per-chat copy).
 * There is NO simulated agent layer: `prompt` types the message into the
 * terminal (the running harness reads it from the PTY), and the agent's
 * output IS the terminal stream. The terminal is the single source of truth;
 * the transcript here only records what the user asked.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { WorkspaceError, type WorkspaceConfig } from "@proagents/contracts";
import type { MountedWorkspace } from "@proagents/kernel";
import { bundledPlugins } from "./plugins.js";
import { findProfile, type AgentProfile } from "./profiles.js";
import type { TerminalManager } from "./terminal.js";

export interface HiredAgent {
  readonly id: string;
  readonly profileId: string;
  readonly profile: AgentProfile;
  readonly agentKind: string;
  readonly workspaceId: string;
  readonly root: string;
  readonly sandbox: string;
  readonly status: "hired" | "working" | "stopped" | "settled";
  readonly hiredAt: string;
  readonly terminalId: string;
  /** What the USER asked (agent output lives in the terminal stream). */
  readonly transcript: { role: "user" | "agent"; text: string; at: string }[];
}

/** The subset of WorkspaceManager the roster drives. */
interface ManagerShaped {
  mount(id: string, o?: { sandbox?: string; root?: string }): Promise<MountedWorkspace>;
  unmount(id: string): Promise<void>;
  list(): readonly MountedWorkspace[];
}

/**
 * Harness launch command for an agent kind — resolved from the PLUGIN
 * CATALOG's runtime descriptors (spec section 146, plugin-first). The app
 * never hard-codes an agent-kind → binary mapping: a newly installed agent
 * plugin becomes launchable without touching this file. Agent kinds are the
 * plugin `provider` values (claude, dsh, opencode, …).
 */
function harnessCommand(agentKind: string): string {
  const hit = bundledPlugins().find(
    (p) => p.manifest.provider === agentKind || p.manifest.id === `agent-${agentKind}`,
  );
  const command = hit?.manifest.runtime?.command;
  if (hit === undefined || hit.manifest.runtime?.kind !== "process" || command === undefined) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: `No launchable agent plugin for kind "${agentKind}".`,
      recoverable: true,
      suggestions: ["GET /api/agents/kinds lists the launchable harnesses from the plugin catalog"],
    });
  }
  return command;
}

function whichAsync(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [binary], (error) => resolve(error === null));
  });
}

export class AgentRoster {
  /** Hired agents by agent id (also the workspace id — 1:1). */
  private readonly agents = new Map<string, HiredAgent>();
  private counter = 0;

  constructor(
    private readonly manager: ManagerShaped,
    private readonly options: {
      /** The effective config — the SAME object the manager reads entries from. */
      config: WorkspaceConfig;
      baseDir: string;
      sessionsRoot: string;
      /** REAL terminal manager (node-pty). */
      terminals: TerminalManager;
    }
  ) {}

  list(): readonly HiredAgent[] {
    return [...this.agents.values()].sort((a, b) => a.hiredAt.localeCompare(b.hiredAt));
  }

  get(agentId: string): HiredAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Hire: declare + mount the isolated workspace, open a REAL terminal in
   * it, verify the harness CLI exists (fail-closed before anything runs),
   * then launch the harness inside the terminal. Optional `task` is typed
   * as the first message once the harness is up. `root` (base-dir relative)
   * is the chat's own workspace; it defaults to a fresh `chats/<agentId>`.
   */
  async hire(request: {
    profileId: string;
    agentKind: string;
    /** Base-dir-relative workspace root; default chats/<agentId> (own, empty). */
    root?: string;
    sandbox?: string;
    task?: string;
    name?: string;
    /** Named lifecycle this chat runs (config `lifecycle.definitions`). */
    lifecycleRef?: string;
    /**
     * Open the REAL terminal but do NOT launch the harness yet — the wizard
     * runs its provisioning commands in the raw shell first, then calls
     * `launchHarness`. Without this, setup commands would be typed into the
     * running harness's stdin instead of the shell.
     */
    deferLaunch?: boolean;
  }): Promise<HiredAgent> {
    const profile = findProfile(request.profileId);
    if (profile === undefined) {
      throw new WorkspaceError({
        code: "CONFIG_INVALID",
        message: `Unknown agent profile "${request.profileId}".`,
        recoverable: true,
        suggestions: ["GET /api/wizard/profiles returns the hireable profiles"],
      });
    }

    // 1. The agent id doubles as the workspace id (1:1 agent ↔ workspace).
    this.counter += 1;
    const agentId = request.name !== undefined && request.name.trim().length > 0
      ? slugify(request.name)
      : `${request.profileId}-${this.counter}`;
    if (this.agents.has(agentId)) {
      throw new WorkspaceError({
        code: "WORKSPACE_ALREADY_MOUNTED",
        message: `An agent named "${agentId}" already exists.`,
        recoverable: true,
        suggestions: ["Choose a different name", "Stop the existing agent first"],
      });
    }

    // 2. Fail-closed BEFORE creating anything: the harness binary must exist.
    const launch = harnessCommand(request.agentKind);
    if (!(await whichAsync(launch.split(" ")[0] ?? launch))) {
      throw new WorkspaceError({
        code: "AGENT_PROVIDER_UNAVAILABLE",
        message: `The ${request.agentKind} CLI ("${launch}") is not installed on this machine.`,
        recoverable: true,
        suggestions: ["Pick an agent kind whose CLI is installed (GET /api/agents/kinds probes them)", "Install the CLI, then hire again"],
      });
    }

    // 3. Root: the agent's OWN chat workspace by default — a per-agent
    //    subdirectory `chats/<agentId>` of the base dir (never a shared or
    //    in-place project root; the wizard materializes projects INTO this
    //    empty workspace). Every hired agent is isolated by default.
    const absoluteRoot = path.resolve(this.options.baseDir, request.root ?? path.join("chats", agentId));
    await fs.mkdir(absoluteRoot, { recursive: true });
    const relativeRoot = path.relative(this.options.baseDir, absoluteRoot);

    // 4. Declare the entry in the effective config (same object the manager
    //    reads) with ONLY the matching agent plugin — per-workspace plugin
    //    activation is the isolation boundary (spec §141).
    const config = this.options.config;
    if (config.workspaces === undefined) config.workspaces = {};
    config.workspaces[agentId] = {
      root: relativeRoot,
      ...(request.sandbox !== undefined ? { sandbox: { mode: request.sandbox as "read-only" | "workspace-write" | "danger-full-access" } } : {}),
      plugins: [{ id: `agent-${request.agentKind}` }, { id: "shell" }],
      // Every chat runs the workspace's default development lifecycle
      // (spec sections 6/16) unless the hire request names one.
      lifecycle: { ref: request.lifecycleRef ?? "default" },
    };

    // 5. Mount through the kernel: scoped registry, sandbox policy, session
    //    log, plugin activation — all per workspace (spec §141–143).
    let mounted: MountedWorkspace;
    try {
      mounted = await this.manager.mount(agentId, {
        root: absoluteRoot,
        ...(request.sandbox !== undefined ? { sandbox: request.sandbox } : {}),
      });
    } catch (error) {
      delete config.workspaces[agentId]; // entry only exists while hireable
      throw error;
    }

    try {
      // 6. REAL terminal in the workspace; the harness launches inside it
      //    (immediately, or after the wizard's provisioning when deferred).
      const tty = this.options.terminals.create(agentId, mounted.root);
      if (request.deferLaunch !== true) {
        this.options.terminals.runCommand(tty.id, launch);
      }

      const hired: HiredAgent = {
        id: agentId,
        profileId: profile.id,
        profile,
        agentKind: request.agentKind,
        workspaceId: mounted.workspaceId,
        root: mounted.root,
        sandbox: mounted.sandbox,
        status: request.deferLaunch === true ? "hired" : "working",
        hiredAt: new Date().toISOString(),
        terminalId: tty.id,
        transcript: [],
      };
      this.agents.set(agentId, hired);
      void mounted.log
        .append({
          timestamp: new Date().toISOString(),
          workspaceId: agentId,
          sessionId: tty.id,
          kind: "agent/launched-in-terminal",
          provider: request.agentKind,
          data: { command: launch, terminalId: tty.id },
        })
        .catch(() => undefined);

      // Kickoff task: typed into the live harness after it settles.
      if (request.deferLaunch !== true && request.task !== undefined && request.task.trim().length > 0) {
        const text = request.task.trim();
        setTimeout(() => {
          this.options.terminals.runCommand(tty.id, text);
          const current = this.agents.get(agentId);
          if (current !== undefined) {
            this.agents.set(agentId, {
              ...current,
              transcript: [...current.transcript, { role: "user", text, at: new Date().toISOString() }],
            });
          }
        }, 2000);
      }
      return this.agents.get(agentId) as HiredAgent;
    } catch (error) {
      // Fail-closed: no half-hired agents. Reverse the terminal + mount + entry.
      this.options.terminals.killWorkspace(agentId);
      await this.manager.unmount(agentId).catch(() => undefined);
      delete config.workspaces[agentId];
      throw error;
    }
  }

  /**
   * Launch the harness CLI in the workspace's REAL terminal (after deferred
   * provisioning). Optional `task` is typed once the harness settles.
   */
  launchHarness(agentId: string, task?: string): void {
    const agent = this.agents.get(agentId);
    if (agent === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Agent "${agentId}" is not hired.`,
        recoverable: true,
        suggestions: [],
      });
    }
    const launch = harnessCommand(agent.agentKind);
    this.options.terminals.runCommand(agent.terminalId, launch);
    this.agents.set(agentId, { ...agent, status: "working" });
    if (task !== undefined && task.trim().length > 0) {
      const text = task.trim();
      setTimeout(() => {
        this.options.terminals.runCommand(agent.terminalId, text);
        const current = this.agents.get(agentId);
        if (current !== undefined) {
          this.agents.set(agentId, {
            ...current,
            transcript: [...current.transcript, { role: "user", text, at: new Date().toISOString() }],
          });
        }
      }, 2500);
    }
  }

  /**
   * Send a message to the crew member: typed into the harness running in
   * its REAL terminal. The response is the terminal stream — the UI's
   * terminal pane shows it live; no second-hand copy is invented here.
   */
  async prompt(agentId: string, text: string): Promise<{ typed: true; terminalId: string }> {
    const agent = this.agents.get(agentId);
    if (agent === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Agent "${agentId}" is not hired (or already stopped).`,
        recoverable: true,
        suggestions: ["Hire the agent first", "GET /api/agents lists hired agents"],
      });
    }
    const tty = this.options.terminals.list(agentId)[0];
    if (tty === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_INVALID_STATE",
        message: `No live terminal for "${agentId}" — the harness may have exited.`,
        recoverable: true,
        suggestions: ["Restart the chat (hire again)"],
      });
    }
    const message = text.replace(/\r?\n/g, " ").trim(); // one line into the PTY
    this.options.terminals.runCommand(tty.id, message);
    this.agents.set(agentId, {
      ...agent,
      status: "working",
      transcript: [...agent.transcript, { role: "user", text: message, at: new Date().toISOString() }],
    });
    void this.appendSessionLog(agentId, "agent/prompt", { text: message });
    return { typed: true, terminalId: tty.id };
  }

  /**
   * Append to the workspace's kernel session log (§143). Fire-and-forget:
   * the log is the durable audit trail; a failed append must never fail the
   * prompt path (the terminal stream already carries the activity).
   */
  private appendSessionLog(agentId: string, kind: string, data: Record<string, unknown>): void {
    const mounted = this.manager.list().find((m) => m.workspaceId === agentId);
    const agent = this.agents.get(agentId);
    if (mounted === undefined || agent === undefined) return;
    void mounted.log
      .append({
        timestamp: new Date().toISOString(),
        workspaceId: agentId,
        sessionId: agent.terminalId,
        kind,
        provider: agent.agentKind,
        data,
      })
      .catch(() => undefined);
  }

  /**
   * The stage executor for this chat's lifecycle runs: stage work is typed
   * into the harness's REAL terminal (there is no other execution surface —
   * the terminal is the single source of truth). Stage success is reported
   * honestly as `ok: true` when the prompt was delivered; stage SEMANTICS
   * (did the tests pass?) stay the harness's job, surfaced via the terminal
   * stream and session log — the runner never fakes a verdict.
   */
  buildStageExecutor(agentId: string): (stage: import("@proagents/contracts").LifecycleStage, ctx: { attempt: number }) => Promise<{ ok: boolean; durationMs: number }> {
    return async (stage, ctx) => {
      const startedAt = Date.now();
      const agent = this.agents.get(agentId);
      if (agent === undefined || this.options.terminals.list(agentId)[0] === undefined) {
        return { ok: false, durationMs: Date.now() - startedAt };
      }
      const stageAgent = stage.agents[0];
      const line = stageAgent?.task ?? stage.name;
      const message = `[lifecycle:${stage.id}]${ctx.attempt > 1 ? ` (attempt ${ctx.attempt})` : ""} ${line}`.replace(/\r?\n/g, " ").trim();
      const tty = this.options.terminals.list(agentId)[0];
      if (tty === undefined) return { ok: false, durationMs: Date.now() - startedAt };
      this.options.terminals.runCommand(tty.id, message);
      this.agents.set(agentId, {
        ...agent,
        transcript: [...agent.transcript, { role: "user", text: message, at: new Date().toISOString() }],
      });
      return { ok: true, durationMs: Date.now() - startedAt };
    };
  }

  /** Stop an agent: kill its terminal (the harness with it), unmount, drop. */
  async stop(agentId: string): Promise<void> {
    if (this.agents.get(agentId) === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Agent "${agentId}" is not hired.`,
        recoverable: true,
        suggestions: ["GET /api/agents lists hired agents"],
      });
    }
    this.options.terminals.killWorkspace(agentId);
    const agent = this.agents.get(agentId);
    if (agent !== undefined) {
      this.agents.set(agentId, { ...agent, status: "stopped" });
    }
    if (this.manager.list().some((m) => m.workspaceId === agentId)) {
      await this.manager.unmount(agentId);
    }
  }

  /**
   * Settle a chat (T3-Code model): mark finished work out of the active
   * list WITHOUT destroying anything — the workspace, session log, and
   * worktree stay on disk and the chat can be resumed later. Nothing is
   * killed here: settled ≠ stopped.
   */
  settle(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Agent "${agentId}" is not hired.`,
        recoverable: true,
        suggestions: ["GET /api/agents lists hired agents"],
      });
    }
    this.agents.set(agentId, { ...agent, status: "settled" });
  }
}

function slugify(input: string): string {
  const s = input.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (s.length === 0) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: `Agent name "${input}" produces an empty id.`,
      recoverable: true,
      suggestions: ["Use letters, digits or dashes"],
    });
  }
  return s;
}
