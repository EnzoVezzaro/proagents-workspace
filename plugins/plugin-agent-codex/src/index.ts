/**
 * Codex agent capability plugin.
 *
 * Wraps the `codex` CLI when present (`codex exec --json`), with honest
 * availability detection: when the binary is missing, `available()` is false,
 * health reports unavailable, and startSession fails with AGENT_PROVIDER_
 * UNAVAILABLE instead of degrading silently. The agent is runtime-neutral by
 * design — other agents (Claude, Gemini, custom) are additional plugins.
 */
import { definePlugin, WorkspaceError, defineService } from "@proagents/workspace";
import { execFile } from "node:child_process";
import type { AgentResult, AgentSession, AgentProvider, ProviderHealth } from "@proagents/workspace";

const codexAgentDefinition = defineService<AgentProvider>({
  id: "agent",
  contractVersion: "1.0.0",
  requiredPermissions: ["shell"],
});

function which(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("which", [binary], (error, stdout) => resolve(error === null ? stdout.trim() : null));
  });
}

function run(
  args: readonly string[],
  options: { cwd?: string; timeoutMs: number }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "codex",
      [...args],
      { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 32 * 1024 * 1024 },
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

export const codexAgentPlugin = definePlugin({
  manifest: {
    id: "agent-codex",
    provider: "codex",
    name: "Codex Agent",
    version: "0.1.0",
    description: "Codex CLI agent adapter with honest availability detection",
    capabilities: ["agent", "harness"],
    dependencies: [],
    permissions: ["shell"],
    compatibility: { workspaceApi: "^1.0.0", agentContract: "^1.0.0" },
    // Plugin-first (spec §146) + harness adapter (§144): a Tier-2 process
    // adapter declares its launch command; honesty about the tier is part
    // of the contract, so the descriptor exists for catalog resolution.
    runtime: { kind: "process", command: "codex", label: "Codex" },
  },
  activate(ctx) {
    let counter = 0;
    let availableCache: boolean | null = null;

    const provider: AgentProvider = {
      name: "agent-codex",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        const isAvailable = await provider.available();
        return isAvailable
          ? { status: "healthy", message: "codex CLI found on PATH" }
          : { status: "unavailable", message: "codex CLI not found — install it or choose another agent provider" };
      },
      available: async (): Promise<boolean> => {
        if (availableCache === null) availableCache = (await which("codex")) !== null;
        return availableCache;
      },
      startSession: async (options?: { workingDirectory?: string }): Promise<AgentSession> => {
        if (!(await provider.available())) {
          throw new WorkspaceError({
            code: "AGENT_PROVIDER_UNAVAILABLE",
            message: "codex CLI not found on PATH",
            provider: "agent-codex",
            recoverable: true,
            suggestions: [
              "Install the codex CLI and re-run",
              "Configure a different agent provider in workspace.yaml (agent.provider)",
            ],
          });
        }
        await ctx.events.emit("agent/starting", { provider: "agent-codex" });
        counter += 1;
        const session: AgentSession = {
          sessionId: `codex-${Date.now()}-${counter}`,
          provider: "agent-codex",
        };
        if (options?.workingDirectory !== undefined) {
          (session as { workingDirectory?: string }).workingDirectory = options.workingDirectory;
        }
        await ctx.events.emit("agent/started", { provider: "agent-codex", sessionId: session.sessionId });
        return session;
      },
      run: async (session: AgentSession, prompt: { text: string; workingDirectory?: string }): Promise<AgentResult> => {
        const started = Date.now();
        await ctx.events.emit("command/before", {
          command: "codex exec",
          args: [prompt.text.slice(0, 80)],
          cwd: prompt.workingDirectory,
        });
        ctx.permissions.require({ pluginId: "agent-codex", category: "shell" });
        const result = await run(
          ["exec", "--json", prompt.text],
          { cwd: prompt.workingDirectory ?? (session as { workingDirectory?: string }).workingDirectory, timeoutMs: 600_000 }
        );
        const durationMs = Date.now() - started;
        await ctx.events.emit("command/after", {
          command: "codex exec",
          args: [],
          exitCode: result.code,
          durationMs,
        });
        return { exitCode: result.code, output: result.stdout, durationMs };
      },
      stopSession: async (session: AgentSession): Promise<void> => {
        await ctx.events.emit("agent/stopped", { provider: "agent-codex", sessionId: session.sessionId });
      },
    };

    ctx.services.register(codexAgentDefinition, provider, "agent-codex");
  },
});
