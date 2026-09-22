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
import { promises as fsp } from "node:fs";
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
    // The limit mirrors the shell/git providers, but SILENT truncation would
    // report a successful run with half the output — reject instead, so the
    // caller can never mistake a truncated result for the full one.
    const LIMIT = 16 * 1024 * 1024;
    let overflow: "stdout" | "stderr" | undefined;
    child.stdout?.on("data", (d: Buffer) => {
      if (overflow !== undefined) return;
      if (stdout.length + d.length > LIMIT) {
        overflow = "stdout";
        return;
      }
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (overflow !== undefined) return;
      if (stderr.length + d.length > LIMIT) {
        overflow = "stderr";
        return;
      }
      stderr += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (overflow !== undefined) {
        reject(new Error(`command output on ${overflow} exceeded ${LIMIT} bytes and was rejected (never silently truncated)`));
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export const localRuntimePlugin = definePlugin({
  manifest: {
    id: "runtime-local",
    provider: "local",
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
        // A missing root would fail the probe with ENOENT and be reported
        // "unavailable" — but the HOST runtime still works; the root just
        // does not exist yet. Probe from the process cwd and degrade.
        let rootExists = true;
        try {
          await fsp.stat(root);
        } catch {
          rootExists = false;
        }
        const probe = await exec(["node", "--version"], rootExists ? root : process.cwd(), undefined, 10_000);
        if (probe.code !== 0) {
          return {
            status: "degraded",
            message: `host probe failed: ${probe.stderr.trim()}`,
          };
        }
        return {
          status: rootExists ? "healthy" : "degraded",
          message: rootExists
            ? `local runtime ready (NOT a sandbox: commands run on the host as the current user)`
            : `local runtime works, but root ${root} does not exist yet (NOT a sandbox: commands run on the host as the current user)`,
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
