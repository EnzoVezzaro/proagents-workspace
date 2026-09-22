/**
 * Docker runtime capability plugin.
 *
 * Creates isolated container workspaces via `docker run/exec`. The plugin
 * degrades honestly (spec sections 34, 62): when the docker CLI is missing
 * or the daemon is unreachable, health reports `unavailable` and operations
 * fail with actionable errors — never silently falling back to local exec,
 * because that would break the isolation promise.
 */
import { definePlugin, WorkspaceError, defineService } from "@proagents/workspace";
import { execFile } from "node:child_process";
import type {
  ProviderHealth,
  RuntimeExecRequest,
  RuntimeExecResult,
  RuntimeProvider,
  RuntimeWorkspaceHandle,
} from "@proagents/workspace";

const dockerRuntimeDefinition = defineService<RuntimeProvider>({
  id: "runtime",
  contractVersion: "1.0.0",
  requiredPermissions: ["shell"],
});

const DEFAULT_IMAGE = "node:22-bookworm-slim";

function docker(
  args: readonly string[],
  timeoutMs: number,
  execOptions: { env?: Record<string, string> } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      [...args],
      {
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: execOptions.env ? { ...process.env, ...execOptions.env } : process.env,
      },
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

interface DockerHandle extends RuntimeWorkspaceHandle {
  containerId: string;
  image: string;
}

export const dockerRuntimePlugin = definePlugin({
  manifest: {
    id: "runtime-docker",
    name: "Docker Runtime",
    version: "0.1.0",
    description: "Isolated container workspace runtime backed by the docker CLI",
    capabilities: ["runtime"],
    dependencies: [],
    permissions: ["shell"],
    compatibility: { workspaceApi: "^1.0.0", runtimeContract: "^1.0.0" },
  },
  activate(ctx) {
    const defaultImage = String(ctx.pluginOptions()["defaultImage"] ?? DEFAULT_IMAGE);

    const provider: RuntimeProvider = {
      name: "runtime-docker",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        try {
          const probe = await docker(["version", "--format", "{{.Server.Version}}"], 15_000);
          if (probe.code === 0) {
            return { status: "healthy", message: `docker daemon reachable (server ${probe.stdout.trim()})` };
          }
          return { status: "unavailable", message: probe.stderr.trim() || "docker daemon unreachable" };
        } catch (error) {
          return {
            status: "unavailable",
            message: error instanceof Error && /ENOENT/.test(error.message)
              ? "docker CLI not found on PATH"
              : `docker probe failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },

      async createWorkspace(request): Promise<RuntimeWorkspaceHandle> {
        const image = request.image ?? defaultImage;
        const name = `paw-${request.workspaceId}`;
        const args = [
          "run", "-d", "--name", name,
          "--rm",
          "--workdir", "/workspace/repo",
          "--cap-drop", "ALL",
          "--security-opt", "no-new-privileges",
        ];
        const networkMode = ctx.config.network?.mode;
        if (networkMode === "offline") args.push("--network", "none");
        args.push(image, "sleep", "infinity");
        const result = await docker(args, 120_000);
        if (result.code !== 0) {
          throw new WorkspaceError({
            code: "RUNTIME_START_FAILED",
            message: result.stderr.trim() || `docker run failed for image ${image}`,
            provider: "runtime-docker",
            recoverable: true,
            suggestions: [
              "Check that docker is installed and the daemon is running",
              "Check that the image exists locally or is pullable (network allowlist)",
            ],
          });
        }
        await ctx.events.emit("workspace/created", { workspaceId: request.workspaceId });
        return {
          workspaceId: request.workspaceId,
          provider: "runtime-docker",
          repoPath: "/workspace/repo",
          metadata: { isolated: true, sandbox: true, containerId: result.stdout.trim(), image },
        };
      },

      async execWorkspace(handle, request: RuntimeExecRequest): Promise<RuntimeExecResult> {
        const h = handle as DockerHandle;
        if (h.containerId === undefined) {
          throw new WorkspaceError({
            code: "RUNTIME_START_FAILED",
            message: "execWorkspace requires a container handle created by this provider",
            provider: "runtime-docker",
            recoverable: false,
            suggestions: ["Create a workspace with createWorkspace() before executing commands"],
          });
        }
        const started = Date.now();
        // Protection & permissions veto BEFORE spawn (spec sections 101–102).
        await ctx.events.emit("command/before", {
          command: request.command.join(" "),
          args: [],
          cwd: request.cwd,
        });
        ctx.permissions.require({ pluginId: "runtime-docker", category: "shell" });
        const decision = await ctx.permissions.approve(
          { operation: "runtime.exec", target: request.command.join(" "), pluginId: "runtime-docker" },
          false
        );
        if (decision === "denied") {
          throw new WorkspaceError({
            code: "PERMISSION_DENIED",
            message: `Command denied by approval policy: ${request.command.join(" ")}`,
            provider: "runtime-docker",
            recoverable: true,
            suggestions: ["Re-run interactively", "Adjust approval.mode"],
          });
        }
        const args = ["exec", "--workdir", request.cwd ? `/workspace/repo/${request.cwd}` : "/workspace/repo"];
        if (request.env) {
          for (const [key, value] of Object.entries(request.env)) args.push("-e", `${key}=${value}`);
        }
        args.push(h.containerId, ...request.command);
        const result = await docker(args, request.timeoutMs ?? 120_000);
        const durationMs = Date.now() - started;
        await ctx.events.emit("command/after", {
          command: request.command.join(" "),
          args: [],
          exitCode: result.code,
          durationMs,
        });
        return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, durationMs };
      },

      async stopWorkspace(handle): Promise<void> {
        const h = handle as DockerHandle;
        if (h.containerId !== undefined) await docker(["stop", h.containerId], 30_000);
      },

      async destroyWorkspace(handle): Promise<void> {
        const h = handle as DockerHandle;
        if (h.containerId !== undefined) {
          // --rm on the container makes this mostly a no-op, but stop first.
          await docker(["stop", h.containerId], 30_000);
        }
        await ctx.events.emit("workspace/destroyed", { workspaceId: handle.workspaceId });
      },
    };

    ctx.services.register(dockerRuntimeDefinition, provider, "runtime-docker");
  },
});
