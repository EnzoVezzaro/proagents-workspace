/**
 * Local runtime capability plugin — the zero-cloud default path
 * (spec section 123).
 *
 * Executes commands directly on the host within the repo root. This is NOT a
 * sandbox and the plugin says so honestly (spec section 34: local execution
 * must never be presented as equivalent to a sandbox): `paw doctor` reports
 * the security model via health metadata, and every exec passes the command
 * veto events so protection still intervenes before execution.
 */
import { definePlugin, WorkspaceError, defineService } from "@proagents/workspace";
import { spawn } from "node:child_process";
import path from "node:path";
import type {
  ProviderHealth,
  RuntimeExecRequest,
  RuntimeExecResult,
  RuntimeProvider,
  RuntimeWorkspaceHandle,
} from "@proagents/workspace";

const localRuntimeDefinition = defineService<RuntimeProvider>({
  id: "runtime",
  contractVersion: "1.0.0",
  requiredPermissions: ["shell"],
});

function exec(
  command: readonly string[],
  cwd: string,
  env: Record<string, string> | undefined,
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0] ?? "true", command.slice(1), {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      timeout: timeoutMs,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      if (stdout.length < 16 * 1024 * 1024) stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < 16 * 1024 * 1024) stderr += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export const localRuntimePlugin = definePlugin({
  manifest: {
    id: "runtime-local",
    name: "Local Runtime",
    version: "0.1.0",
    description: "Zero-cloud local execution runtime (not a sandbox — honestly reported)",
    capabilities: ["runtime"],
    dependencies: [],
    permissions: ["shell"],
    compatibility: { workspaceApi: "^1.0.0", runtimeContract: "^1.0.0" },
  },
  activate(ctx) {
    const root = path.resolve(String(ctx.pluginOptions()["root"] ?? "/workspace/repo"));

    const provider: RuntimeProvider = {
      name: "runtime-local",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        const probe = await exec(["node", "--version"], root, undefined, 10_000);
        return {
          status: probe.code === 0 ? "healthy" : "degraded",
          message:
            probe.code === 0
              ? `local runtime ready (NOT a sandbox: commands run on the host as the current user)`
              : `host probe failed: ${probe.stderr.trim()}`,
        };
      },

      async createWorkspace(request): Promise<RuntimeWorkspaceHandle> {
        if (request.image !== undefined) {
          throw new WorkspaceError({
            code: "RUNTIME_START_FAILED",
            message: `The local runtime cannot create container image "${request.image}" — it executes on the host. Use the docker runtime plugin for images.`,
            provider: "runtime-local",
            recoverable: true,
            suggestions: ["Add plugin id 'runtime-docker' to workspace.yaml", "Omit the image to run locally"],
          });
        }
        await ctx.events.emit("workspace/created", { workspaceId: request.workspaceId });
        return {
          workspaceId: request.workspaceId,
          provider: "runtime-local",
          repoPath: root,
          metadata: {
            isolated: false,
            sandbox: false,
            note: "Local runtime executes on the host; the security model is the permission framework, not isolation.",
          },
        };
      },

      async execWorkspace(handle, request: RuntimeExecRequest): Promise<RuntimeExecResult> {
        const cwd = path.resolve(root, request.cwd ?? ".");
        const started = Date.now();
        // Protection & permissions veto BEFORE spawn (spec sections 101–102).
        await ctx.events.emit("command/before", {
          command: request.command.join(" "),
          args: [],
          cwd,
        });
        ctx.permissions.require({ pluginId: "runtime-local", category: "shell" });
        const decision = await ctx.permissions.approve(
          { operation: "runtime.exec", target: request.command.join(" "), pluginId: "runtime-local" },
          false
        );
        if (decision === "denied") {
          throw new WorkspaceError({
            code: "PERMISSION_DENIED",
            message: `Command denied by approval policy: ${request.command.join(" ")}`,
            provider: "runtime-local",
            recoverable: true,
            suggestions: ["Re-run interactively", "Adjust approval.mode"],
          });
        }
        const result = await exec(
          request.command,
          cwd,
          request.env === undefined ? undefined : { ...request.env },
          request.timeoutMs ?? 120_000
        );
        const durationMs = Date.now() - started;
        await ctx.events.emit("command/after", {
          command: request.command.join(" "),
          args: [],
          exitCode: result.code,
          durationMs,
        });
        return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, durationMs };
      },

      async stopWorkspace(): Promise<void> {
        // Local processes are short-lived; stop is a no-op by design.
      },

      async destroyWorkspace(handle): Promise<void> {
        await ctx.events.emit("workspace/destroyed", { workspaceId: handle.workspaceId });
      },
    };

    ctx.services.register(localRuntimeDefinition, provider, "runtime-local");
  },
});
