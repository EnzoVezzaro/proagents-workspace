/**
 * Behavior gate plugin (spec section 150): proves BEHAVIOR by executing the
 * gate's configured command through the shell capability. Exit 0 = passed;
 * any other exit is a blocker finding carrying the command's stderr. This is
 * the plainest gate — the "prove it" primitive for logic-only checkpoints.
 */
import { execFile } from "node:child_process";
import { definePlugin, WorkspaceError, defineService } from "@proagents/workspace";
import type { GateContext, GateProvider, GateResult } from "@proagents/workspace";

const gateDefinition = defineService<GateProvider>({
  id: "gate:behavior",
  contractVersion: "1.0.0",
});

function run(command: string, cwd: string, timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("sh", ["-c", command], { cwd, timeout: timeoutMs }, (error, _stdout, stderr) => {
      const rawCode = (error as { code?: unknown } | null)?.code;
      if (error !== null && typeof rawCode !== "number") {
        reject(error);
        return;
      }
      resolve({ code: error === null ? 0 : (rawCode as number), stderr: String(stderr) });
    });
  });
}

export const behaviorGatePlugin = definePlugin({
  manifest: {
    id: "gate-behavior",
    provider: "behavior",
    name: "Behavior Gate",
    version: "0.3.0",
    description: "Proves checkpoint behavior by executing a command (exit 0 = passed)",
    capabilities: ["gate"],
    dependencies: [],
    permissions: ["shell"],
    compatibility: { workspaceApi: "^1.0.0" },
  },
  activate(ctx) {
    const provider: GateProvider = {
      name: "gate-behavior",
      contractVersion: "1.0.0",
      health: async () => ({ status: "healthy", message: "behavior gate ready" }),
      async evaluate(context: GateContext): Promise<GateResult> {
        const started = Date.now();
        const command = (context.gate.config?.["command"] as string | undefined) ?? undefined;
        if (command === undefined) {
          throw new WorkspaceError({
            code: "CHECKPOINT_PLAN_INVALID",
            message: `behavior gate "${context.gate.id}" requires config.command`,
            recoverable: false,
            suggestions: ["Add config: { command: \"pnpm test\" } to the gate in the checkpoint plan"],
          });
        }
        const timeout = context.gate.policy.timeoutMs ?? 600_000;
        const outcome = await run(command, context.projectRoot, timeout);
        return {
          gateId: context.gate.id,
          status: outcome.code === 0 ? "passed" : "failed",
          findings:
            outcome.code === 0
              ? []
              : [{ severity: "blocker", location: "command", issue: `command failed (exit ${outcome.code})`, suggestion: outcome.stderr.trim().slice(0, 2000) || undefined }],
          durationMs: Date.now() - started,
        };
      },
    };
    ctx.services.register(gateDefinition, provider, "gate-behavior");
  },
});
