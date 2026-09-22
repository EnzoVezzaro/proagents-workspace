/**
 * Shell capability plugin.
 *
 * Every command emits `command/before` and AWAITS it — protection subscribers
 * veto before spawn (spec sections 101–102). Dangerous commands additionally
 * pass the approval policy (spec section 34).
 */
import { definePlugin, WorkspaceError, defineService } from "@proagents/workspace";
import { execFile } from "node:child_process";
import type { ProviderHealth, ShellProvider } from "@proagents/workspace";

const shellDefinition = defineService<ShellProvider>({
  id: "shell",
  contractVersion: "1.0.0",
  requiredPermissions: ["shell"],
});

/**
 * Commands that always count as dangerous for approval mode `guarded`.
 * Network egress, privileged actions, destructive filesystem operations and
 * eval-style remote code make the operation go through human approval
 * (headless then fails closed). `curl`/`git push --force` are NOT caught here
 * by design — they are blocked outright by the repo-shield protection layer.
 */
const DANGEROUS =
  /\b(rm\s+-[rf]|sudo|curl|wget|nc|ncat|ssh|scp|sftp|telnet|ftp|node\s+-[ep]\b|python\S*\s+-c\b|\|\s*sh|shutdown|reboot|mkfs|dd\s+if=)/;

export const shellPlugin = definePlugin({
  manifest: {
    id: "shell",
    provider: "shell",
    name: "Shell",
    version: "0.1.0",
    description: "Permission-checked shell command execution",
    capabilities: ["shell"],
    dependencies: [],
    permissions: ["shell"],
    compatibility: { workspaceApi: "^1.0.0", shellContract: "^1.0.0" },
  },
  activate(ctx) {
    const provider: ShellProvider = {
      name: "shell",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        const probe = await new Promise<{ code: number | null }>((resolve) => {
          execFile("sh", ["-c", "true"], { timeout: 5_000 }, (error) =>
            resolve({ code: error === null ? 0 : 1 })
          );
        });
        return {
          status: probe.code === 0 ? "healthy" : "unavailable",
          message: probe.code === 0 ? "shell available" : "shell probe failed",
        };
      },
      async exec(request) {
        ctx.permissions.require({ pluginId: "shell", category: "shell" });
        const started = Date.now();
        // Protection & policy veto BEFORE execution (spec sections 101–102).
        await ctx.events.emit("command/before", { command: request.command, args: [], cwd: request.cwd });
        const dangerous = DANGEROUS.test(request.command);
        const decision = await ctx.permissions.approve(
          { operation: "shell.exec", target: request.command, pluginId: "shell" },
          dangerous
        );
        if (decision === "denied") {
          throw new WorkspaceError({
            code: "SHELL_COMMAND_DENIED",
            message: `Command denied by approval policy: ${request.command}`,
            provider: "shell",
            recoverable: false,
            suggestions: ["Adjust approval.mode", "Avoid the command or split it into safer steps"],
          });
        }
        const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
          execFile(
            "sh",
            ["-c", request.command],
            {
              cwd: request.cwd,
              timeout: request.timeoutMs ?? 120_000,
              env: request.env ? { ...process.env, ...request.env } : process.env,
              maxBuffer: 16 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
              const code = error === null ? 0 : (error as NodeJS.ErrnoException & { code?: number }).code ?? 1;
              if (error !== null && typeof (error as { code?: unknown }).code !== "number") {
                reject(error);
                return;
              }
              resolve({ code: typeof code === "number" ? code : 1, stdout: String(stdout), stderr: String(stderr) });
            }
          );
        });
        const durationMs = Date.now() - started;
        await ctx.events.emit("command/after", {
          command: request.command,
          args: [],
          exitCode: result.code,
          durationMs,
        });
        return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, durationMs };
      },
    };

    ctx.services.register(shellDefinition, provider, "shell");
  },
});
