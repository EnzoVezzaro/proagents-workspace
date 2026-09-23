/**
 * CLI agent capability plugin — process adapters for installed coding-agent
 * CLIs (claude, codex, opencode, gemini).
 *
 * Honest availability detection: each adapter probes for its binary on PATH
 * (`which <bin>`); when missing, `available()` is false, health reports
 * unavailable, and session start fails with AGENT_PROVIDER_UNAVAILABLE
 * instead of degrading silently. This is a Tier-2 (process) harness adapter:
 * observability is reduced, enforcement is advisory — the plugin says so.
 *
 * Isolation: sessions run against the workspace ROOT given at startSession /
 * run time (the named workspace's root when mounted through the manager).
 * The shell + filesystem capabilities stay inside the same scope, so an
 * agent hired into `workspaces.frontend` only reaches that root.
 */
import { execFile } from "node:child_process";
import { definePlugin, WorkspaceError, defineService } from "@proagents/workspace";
import type {
  AgentProvider,
  AgentResult,
  AgentSession,
  PluginDefinition,
  ProviderHealth,
} from "@proagents/workspace";

/** Adapter table: capability id → CLI binary + flag conventions. */
const CLI_AGENTS: Record<string, { bin: string; label: string; flag: string }> = {
  claude: { bin: "claude", label: "Claude Code", flag: "-p" },
  codex: { bin: "codex", label: "Codex CLI", flag: "exec" },
  opencode: { bin: "opencode", label: "OpenCode", flag: "run" },
  gemini: { bin: "gemini", label: "Gemini CLI", flag: "-p" },
};

function which(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("which", [binary], (error, stdout) => resolve(error === null ? stdout.trim() : null));
  });
}

function run(
  bin: string,
  args: readonly string[],
  options: { cwd?: string; timeoutMs: number }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      [...args],
      { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const rawCode = (error as { code?: unknown } | null)?.code;
        if (error !== null && typeof rawCode !== "number") {
          reject(error);
          return;
        }
        resolve({ code: error === null ? 0 : (rawCode as number), stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}

export function cliAgentPlugin(caps: { id: string; provider: string }): PluginDefinition {
  const meta = CLI_AGENTS[caps.provider];
  if (meta === undefined) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: `Unknown CLI agent provider "${caps.provider}" (known: ${Object.keys(CLI_AGENTS).join(", ")}).`,
      recoverable: false,
      suggestions: ["Use one of the exported plugin constants instead of constructing adapters manually"],
    });
  }
  const definition = defineService<AgentProvider>({
    id: "agent",
    contractVersion: "1.0.0",
    requiredPermissions: ["shell"],
  });

  return definePlugin({
    manifest: {
      id: caps.id,
      provider: caps.provider,
      name: `${meta.label} Agent`,
      version: "0.1.0",
      description: `${meta.label} CLI agent adapter with honest availability detection`,
      capabilities: ["agent"],
      dependencies: [],
      permissions: ["shell"],
      compatibility: { workspaceApi: "^1.0.0", agentContract: "^1.0.0" },
      // Plugin-first (spec section 146): the plugin declares how it runs —
      // the product layer reads this generically, it never hard-codes the
      // agent-kind → binary mapping.
      runtime: { kind: "process", command: meta.bin, label: meta.label },
    },
    activate(ctx) {
      let counter = 0;
      let availableCache: boolean | null = null;

      const provider: AgentProvider = {
        name: caps.id,
        contractVersion: "1.0.0",
        health: async (): Promise<ProviderHealth> => {
          const isAvailable = await provider.available();
          return isAvailable
            ? { status: "healthy", message: `${meta.bin} CLI found on PATH` }
            : { status: "unavailable", message: `${meta.bin} CLI not found — hire with a different agent or install ${meta.label}` };
        },
        available: async (): Promise<boolean> => {
          if (availableCache === null) availableCache = (await which(meta.bin)) !== null;
          return availableCache;
        },
        startSession: async (options?: { workingDirectory?: string }): Promise<AgentSession> => {
          if (!(await provider.available())) {
            throw new WorkspaceError({
              code: "AGENT_PROVIDER_UNAVAILABLE",
              message: `${meta.bin} CLI not found on PATH`,
              provider: caps.id,
              recoverable: true,
              suggestions: [
                `Install ${meta.label} and re-run`,
                "Hire the agent with a different agent kind",
              ],
            });
          }
          await ctx.events.emit("agent/starting", { provider: caps.id });
          counter += 1;
          const session: AgentSession = {
            sessionId: `${caps.provider}-${Date.now()}-${counter}`,
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
              message: `${meta.bin} CLI not found on PATH`,
              provider: caps.id,
              recoverable: true,
              suggestions: [`Install ${meta.label}`, "Hire the agent with a different agent kind"],
            });
          }
          const started = Date.now();
          await ctx.events.emit("command/before", {
            command: meta.bin,
            args: [prompt.text.slice(0, 80)],
            cwd: prompt.workingDirectory,
          });
          ctx.permissions.require({ pluginId: caps.id, category: "shell" });
          const result = await run(
            meta.bin,
            [meta.flag, prompt.text],
            { cwd: prompt.workingDirectory ?? (session as { workingDirectory?: string }).workingDirectory, timeoutMs: 600_000 }
          );
          const durationMs = Date.now() - started;
          await ctx.events.emit("command/after", {
            command: meta.bin,
            args: [],
            exitCode: result.code,
            durationMs,
          });
          // Honest output: on failure the CLI's stderr is the diagnosis (e.g.
          // "Not logged in") — surface it instead of an empty stdout.
          const output = result.code === 0 ? result.stdout : `${result.stdout}${result.stderr}`.trim();
          return { exitCode: result.code, output, durationMs };
        },
        stopSession: async (session: AgentSession): Promise<void> => {
          await ctx.events.emit("agent/stopped", { provider: caps.id, sessionId: session.sessionId });
        },
      };

      ctx.services.register(definition, provider, caps.id);
    },
  });
}

export const agentClaudePlugin = cliAgentPlugin({ id: "agent-claude", provider: "claude" });
export const agentCodexPlugin = cliAgentPlugin({ id: "agent-codex", provider: "codex" });
export const agentOpencodePlugin = cliAgentPlugin({ id: "agent-opencode", provider: "opencode" });
export const agentGeminiPlugin = cliAgentPlugin({ id: "agent-gemini", provider: "gemini" });
