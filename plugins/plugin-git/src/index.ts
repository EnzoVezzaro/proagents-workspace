/**
 * Git repository capability plugin.
 *
 * Implements the Repository contract with conservative default guards
 * (spec section 35): force push, branch deletion, hard reset, clean -fd,
 * tag deletion, remote changes and history rewriting are BLOCKED unless the
 * workspace configuration explicitly allows them (repository.options.guards).
 * Allowed guarded operations additionally pass the approval policy, so
 * interactive runs ask and headless runs fail closed.
 */
import { definePlugin, WorkspaceError, defineService, DEFAULT_GIT_GUARDS } from "@proagents/workspace";
import { execFile } from "node:child_process";
import { mkdir as fsMkdir } from "node:fs/promises";
import path from "node:path";
import type {
  GitGuardPolicy,
  GuardedGitOperation,
  ProviderHealth,
  RepositoryProvider,
} from "@proagents/workspace";

const gitDefinition = defineService<RepositoryProvider>({
  id: "repository",
  contractVersion: "1.0.0",
  requiredPermissions: ["repository"],
});

function run(
  cwd: string,
  args: readonly string[],
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [...args],
      { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
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

function guardVerdict(
  guards: GitGuardPolicy,
  operation: GuardedGitOperation,
  options?: { force?: boolean; delete?: boolean }
): { allowed: boolean; reason?: string } {
  const flag: Record<GuardedGitOperation, boolean> = {
    push: !options?.force || guards.forcePush,
    branch: !options?.delete || guards.branchDeletion,
    tag: !options?.delete || guards.tagDeletion,
    remote: guards.remoteChanges,
    "history-rewrite": guards.historyRewrite,
  };
  if (flag[operation]) return { allowed: true };
  return {
    allowed: false,
    reason: `git ${operation} is guarded by default (spec section 35); enable it explicitly in repository.options.guards`,
  };
}

export const gitPlugin = definePlugin({
  manifest: {
    id: "git",
    name: "Git Repository",
    version: "0.1.0",
    description: "Guarded git clone/status/commit/push with conservative defaults",
    capabilities: ["repository"],
    dependencies: [],
    permissions: ["repository"],
    compatibility: { workspaceApi: "^1.0.0", repositoryContract: "^1.0.0" },
  },
  activate(ctx) {
    const root = path.resolve(String(ctx.pluginOptions()["root"] ?? "/workspace/repo"));
    const options = (ctx.config.repository?.options ?? {}) as {
      guards?: Partial<GitGuardPolicy>;
    };
    const guards: GitGuardPolicy = { ...DEFAULT_GIT_GUARDS, ...options.guards };

    /**
     * Guarded-operation gate (spec section 35). Policy first: a blocked op
     * never reaches execution and emits protection/intervened. Then approval:
     * an allowed guarded op still passes the approval policy.
     */
    const guardOrThrow = async (
      operation: GuardedGitOperation,
      opOptions?: { force?: boolean; delete?: boolean }
    ): Promise<void> => {
      const verdict = guardVerdict(guards, operation, opOptions);
      if (!verdict.allowed) {
        await ctx.events.emit("protection/intervened", {
          operation: `git.${operation}`,
          target: root,
          action: "blocked",
        });
        throw new WorkspaceError({
          code: "GIT_OPERATION_BLOCKED",
          message: verdict.reason ?? `git ${operation} is blocked by the git guard policy.`,
          provider: "git",
          recoverable: false,
          suggestions: [
            "Enable the operation explicitly under repository.options.guards in workspace.yaml",
            "Use a non-destructive alternative (regular push, new branch)",
          ],
        });
      }
      const decision = await ctx.permissions.approve(
        { operation: `git.${operation}`, target: root, pluginId: "git" },
        true
      );
      if (decision === "denied") {
        throw new WorkspaceError({
          code: "PERMISSION_DENIED",
          message: `git ${operation} denied by approval policy.`,
          provider: "git",
          recoverable: true,
          suggestions: ["Re-run interactively to approve", "Adjust approval.mode in workspace.yaml"],
        });
      }
    };

    const commandError = (stderr: string, fallback: string, recoverable = true) =>
      new WorkspaceError({
        code: "GIT_COMMAND_FAILED",
        message: stderr.trim() || fallback,
        provider: "git",
        recoverable,
        suggestions: ["Inspect the git output above", "Check credentials, remotes and network allowlist"],
      });

    const provider: RepositoryProvider = {
      name: "git",
      contractVersion: "1.0.0",
      health: async (): Promise<ProviderHealth> => {
        const probe = await run(root, ["rev-parse", "--is-inside-work-tree"], 10_000);
        return probe.code === 0
          ? { status: "healthy", message: `repository at ${root}` }
          : { status: "degraded", message: probe.stderr.trim() || `${root} is not a git repository yet` };
      },

      async clone(request) {
        const args = ["clone"];
        if (request.depth !== undefined) args.push("--depth", String(request.depth));
        if (request.branch !== undefined) args.push("--branch", request.branch);
        args.push(request.repository, request.targetPath);
        await ctx.events.emit("repository/cloning", { provider: "git", repository: request.repository });
        // The clone target's parent must exist for git to spawn into it.
        await fsMkdir(path.dirname(path.resolve(request.targetPath)), { recursive: true });
        const result = await run(path.dirname(path.resolve(request.targetPath)), args, 120_000);
        if (result.code !== 0) throw commandError(result.stderr, `git clone failed for ${request.repository}`);
        const head = await run(request.targetPath, ["rev-parse", "HEAD"], 10_000);
        await ctx.events.emit("repository/cloned", {
          provider: "git",
          repository: request.repository,
          commit: head.stdout.trim() || undefined,
        });
        return { path: path.resolve(request.targetPath), commit: head.stdout.trim() };
      },

      async status(repoPath) {
        const branchOut = await run(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"], 10_000);
        if (branchOut.code !== 0) throw commandError(branchOut.stderr, `${repoPath} is not a git repository`, false);
        const porcelain = await run(repoPath, ["status", "--porcelain"], 10_000);
        const files = porcelain.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => line.split(/\s+/).slice(1).join(" "));
        return { branch: branchOut.stdout.trim(), dirty: files.length > 0, files };
      },

      async commit(request) {
        if (request.addAll) await run(request.path, ["add", "-A"], 30_000);
        const result = await run(request.path, ["commit", "-m", request.message], 30_000);
        if (result.code !== 0) throw commandError(result.stderr, "git commit failed");
        const head = await run(request.path, ["rev-parse", "HEAD"], 10_000);
        await ctx.events.emit("repository/changed", { provider: "git", repository: request.path });
        return { commit: head.stdout.trim() };
      },

      async push(request) {
        await guardOrThrow("push", { force: request.force });
        const args = ["push"];
        if (request.remote !== undefined) args.push(request.remote);
        if (request.branch !== undefined) args.push(request.branch);
        if (request.force) args.push("--force");
        const result = await run(request.path, args, 120_000);
        if (result.code !== 0) throw commandError(result.stderr, "git push failed");
        const remote = request.remote ?? "origin";
        return { pushedTo: request.branch !== undefined ? `${remote}/${request.branch}` : remote };
      },

      guard: (operation, opOptions) => guardVerdict(guards, operation, opOptions),
    };

    ctx.services.register(gitDefinition, provider, "git");
  },
});
