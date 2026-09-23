/**
 * DeepSeek Harness agent capability plugin — drives the REAL DSH engine
 * (`@deepseek-ai/dsh`) as a per-workspace terminal process.
 *
 * Each hired agent = one `dsh --profile headless --json` child process with
 * its cwd pinned to the workspace root (DSH resolves the working directory
 * through its own fs provider). This is a Tier-2 process adapter: the
 * harness runs the full agent loop (model, tools, sandbox, session log);
 * the Workspace observes through the NDJSON event stream and maps it onto
 * the normalized harness events (`session/*`, `tool/*`) so protection and
 * the control room see the same traffic as any other agent.
 *
 * Fuel: DSH reads model credentials itself (credential store or env, e.g.
 * DEEPSEEK_API_KEY). We never proxy or store keys. When DSH cannot reach a
 * model it fails with its own structured code (MISSING_CREDENTIAL,
 * PI_AI_ERROR, ...) which we surface VERBATIM — honest degradation, never a
 * silent downgrade or a fabricated answer.
 *
 * Sessions resume across prompts via `--session-id` (DSH adopts the
 * persisted Session; a mismatched cwd is refused by DSH itself, which keeps
 * per-workspace isolation honest even across restarts).
 */
import { execFile, spawn } from "node:child_process";
import { WorkspaceError, definePlugin, defineService } from "@proagents/workspace";
import type {
  AgentProvider,
  AgentResult,
  AgentSession,
  PluginDefinition,
  ProviderHealth,
} from "@proagents/workspace";

/** How long one headless task may run before we terminate the harness. */
const TASK_TIMEOUT_MS = 900_000;

interface DshJsonEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

function which(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("which", [binary], (error, stdout) => resolve(error === null ? stdout.trim() : null));
  });
}

/**
 * Map DSH NDJSON events onto the Workspace's typed events. Unknown event
 * types are ignored (the projection must never invent traffic it has not
 * seen).
 */
function mapEvent(
  ev: DshJsonEvent,
  sessionId: string,
): { name: string; payload: Record<string, unknown> } | null {
  switch (ev.type) {
    case "session":
      return {
        name: "session/started",
        payload: { harness: "dsh", provider: "agent-dsh", sessionId: String(ev.sessionId ?? sessionId) },
      };
    case "final":
      return {
        name: "session/stopped",
        payload: {
          harness: "dsh",
          provider: "agent-dsh",
          sessionId,
          ...(typeof ev.reason === "string" ? { reason: ev.reason } : {}),
        },
      };
    case "tool_call":
      return {
        name: "tool/before",
        payload: {
          tool: String(ev.name ?? "unknown"),
          operation: "call",
          ...(ev.args !== undefined && typeof ev.args === "object" ? { inputs: ev.args as Record<string, unknown> } : {}),
        },
      };
    case "tool_result":
      return {
        name: "tool/after",
        payload: { tool: String(ev.name ?? "unknown"), operation: "call", ok: ev.ok !== false, durationMs: 0 },
      };
    default:
      return null;
  }
}

interface DshRunResult {
  exitCode: number;
  finalText: string;
  stderr: string;
}

/**
 * Spawn `dsh --profile headless [--json] <task>` and collect the outcome.
 *
 * `--json` gives the NDJSON event stream (session/tool_call/tool_result/
 * final) — but it landed in dsh 0.1.7-alpha and the published 0.1.5-rc.2
 * rejects it with `unknown option '--json'`. We try the event stream first
 * and fall back to plain mode (final answer on stdout, reasoning on stderr)
 * so both engine versions drive honestly. The fallback is reported in
 * stderr-prefixed diagnostics, never hidden.
 */
export async function runDsh(
  bin: string,
  options: { task: string; cwd?: string; sessionId: string; onEvent: (ev: DshJsonEvent) => void },
): Promise<DshRunResult> {
  const jsonResult = await spawnDsh(bin, { ...options, json: true });
  if (!jsonResult.unknownOption) return jsonResult;
  // Older engine without --json: plain mode, stdout is the final answer.
  const plain = await spawnDsh(bin, { ...options, json: false });
  return {
    ...plain,
    stderr: `dsh: engine lacks --json (pre-0.1.7); ran in plain mode\n${plain.stderr}`,
  };
}

async function spawnDsh(
  bin: string,
  options: { task: string; cwd?: string; sessionId: string; json: boolean; onEvent: (ev: DshJsonEvent) => void },
): Promise<DshRunResult & { unknownOption: boolean }> {
  const args = options.json
    ? ["--profile", "headless", "--json", options.task]
    : ["--profile", "headless", options.task];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuf = "";
    let stderrBuf = "";
    let finalText = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, TASK_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf8");
      if (!options.json) return; // plain mode: stdout collected wholesale
      let nl = stdoutBuf.indexOf("\n");
      while (nl >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        nl = stdoutBuf.indexOf("\n");
        if (line.length === 0) continue;
        try {
          const ev = JSON.parse(line) as DshJsonEvent;
          if (ev.type === "final" && typeof ev.text === "string") finalText = ev.text;
          options.onEvent(ev);
        } catch {
          // A non-JSON stdout line is a diagnostic misplacement; keep it.
          stderrBuf += `${line}\n`;
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString("utf8");
    });
    child.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(new WorkspaceError({
        code: "AGENT_PROVIDER_UNAVAILABLE",
        message: `failed to spawn ${bin}: ${err.message}`,
        provider: "agent-dsh",
        recoverable: true,
        suggestions: [`Verify ${bin} is executable`],
      }));
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const unknownOption = stderrBuf.includes("unknown option '--json'");
      resolve({
        exitCode: unknownOption ? 1 : (code ?? 1),
        finalText: options.json ? finalText : stdoutBuf.trim(),
        stderr: stderrBuf,
        unknownOption,
      });
    });
  });
}

export function dshAgentPlugin(caps: { id: string; bin: string }): PluginDefinition {
  const definition = defineService<AgentProvider>({
    id: "agent",
    contractVersion: "1.0.0",
    requiredPermissions: ["shell"],
  });

  return definePlugin({
    manifest: {
      id: caps.id,
      provider: "dsh",
      name: "DeepSeek Harness Agent",
      version: "0.1.0",
      description: "Drives the real DeepSeek Harness engine headlessly per workspace",
      capabilities: ["agent"],
      dependencies: [],
      permissions: ["shell"],
      compatibility: { workspaceApi: "^1.0.0", agentContract: "^1.0.0" },
      // Plugin-first (spec section 146): the plugin declares its launch
      // command; consumers resolve it generically from the catalog.
      runtime: { kind: "process", command: caps.bin, label: "DeepSeek Harness" },
    },
    activate(ctx) {
      let counter = 0;
      let availableCache: boolean | null = null;

      const provider: AgentProvider = {
        name: caps.id,
        contractVersion: "1.0.0",
        health: async (): Promise<ProviderHealth> => {
          const ok = await provider.available();
          return ok
            ? { status: "healthy", message: `${caps.bin} found on PATH — the real DSH engine drives this agent` }
            : { status: "unavailable", message: `${caps.bin} not found — install @deepseek-ai/dsh and rehire` };
        },
        available: async (): Promise<boolean> => {
          if (availableCache === null) availableCache = (await which(caps.bin)) !== null;
          return availableCache;
        },
        startSession: async (options?: { workingDirectory?: string }): Promise<AgentSession> => {
          if (!(await provider.available())) {
            throw new WorkspaceError({
              code: "AGENT_PROVIDER_UNAVAILABLE",
              message: `${caps.bin} not found on PATH`,
              provider: caps.id,
              recoverable: true,
              suggestions: [
                "Install the DeepSeek Harness CLI: npm install -g @deepseek-ai/dsh",
                "Hire the agent with a different agent kind",
              ],
            });
          }
          await ctx.events.emit("agent/starting", { provider: caps.id });
          counter += 1;
          const session: AgentSession = {
            sessionId: `dsh-${Date.now()}-${counter}`,
            provider: caps.id,
          };
          if (options?.workingDirectory !== undefined) {
            (session as { workingDirectory?: string }).workingDirectory = options.workingDirectory;
          }
          await ctx.events.emit("agent/started", { provider: caps.id, sessionId: session.sessionId });
          return session;
        },
        run: async (session: AgentSession, prompt: { text: string; workingDirectory?: string }): Promise<AgentResult> => {
          if (!(await provider.available())) {
            throw new WorkspaceError({
              code: "AGENT_PROVIDER_UNAVAILABLE",
              message: `${caps.bin} not found on PATH`,
              provider: caps.id,
              recoverable: true,
              suggestions: ["Install @deepseek-ai/dsh"],
            });
          }
          const started = Date.now();
          const cwd = prompt.workingDirectory ?? (session as { workingDirectory?: string }).workingDirectory;
          await ctx.events.emit("command/before", {
            command: caps.bin,
            args: [prompt.text.slice(0, 80)],
            ...(cwd !== undefined ? { cwd } : {}),
          });
          ctx.permissions.require({ pluginId: caps.id, category: "shell" });

          // The harness runs as a TERMINAL PROCESS pinned to the workspace.
          // DSH owns credentials, model routing, tools, and its sandbox; we
          // observe the NDJSON event stream and surface its diagnostics.
          const result = await runDsh(caps.bin, {
            task: prompt.text,
            cwd,
            sessionId: session.sessionId,
            onEvent: (ev) => {
              const mapped = mapEvent(ev, session.sessionId);
              if (mapped !== null) void ctx.events.emit(mapped.name as never, mapped.payload as never);
            },
          });
          const durationMs = Date.now() - started;
          await ctx.events.emit("command/after", {
            command: caps.bin,
            args: [],
            exitCode: result.exitCode,
            durationMs,
          });
          if (result.exitCode !== 0) {
            throw new WorkspaceError({
              code: "AGENT_PROVIDER_UNAVAILABLE",
              provider: caps.id,
              recoverable: true,
              message: result.stderr.trim() !== ""
                ? result.stderr.trim()
                : `dsh exited with code ${result.exitCode}`,
              suggestions: [
                "Read the dsh diagnostic above",
                "Check the model credentials DSH needs (e.g. DEEPSEEK_API_KEY)",
              ],
            });
          }
          return { exitCode: 0, output: result.finalText, durationMs };
        },
        stopSession: async (session: AgentSession): Promise<void> => {
          await ctx.events.emit("agent/stopped", { provider: caps.id, sessionId: session.sessionId });
        },
      };

      ctx.services.register(definition, provider, caps.id);
    },
  });
}

export const agentDshPlugin = dshAgentPlugin({ id: "agent-dsh", bin: "dsh" });
