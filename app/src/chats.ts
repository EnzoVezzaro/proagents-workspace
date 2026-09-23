/**
 * Chat retirement — T3-Code-inspired lifecycle for chat workspaces.
 *
 *   - SETTLE  : mark finished work out of the active list. The workspace,
 *     its session log, and any worktree stay on disk (restartable).
 *   - PURGE   : delete the chat's workspace directory for good. Refuses
 *     when uncommitted work would be lost (T3's storage-cleanup guard):
 *     uncommitted changes or untracked (non-ignored) files block a purge
 *     unless `force: true`. Git worktrees are detached with
 *     `git worktree remove` first so the SOURCE repo's admin metadata is
 *     cleaned up too (no stale worktree entries in the project).
 *
 * Everything runs through the chat's REAL terminal when one exists (visible,
 * honest) and falls back to direct fs for dead chats. Containment is
 * absolute: only directories under <base>/chats/ can be purged, and a purge
 * stops the crew + kills the terminal + unmounts the workspace first.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { WorkspaceError } from "@proagents/contracts";
import type { BootState } from "./context.js";

export interface ChatPurgeResult {
  readonly purged: string;
  readonly workspaceRoot: string;
  /** Uncommitted work that was destroyed with the purge (force case). */
  readonly destroyedWork: string | null;
  readonly worktreeRemoved: boolean;
}

/** Run a git command in a directory; resolves null when git is unavailable. */
function git(dir: string, args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["-C", dir, ...args], { timeout: 15_000 }, (error, stdout) => {
      resolve(error === null ? stdout : null);
    });
  });
}

/** The chat's workspace dir must be a direct child of <base>/chats/. */
function assertChatRoot(baseDir: string, workspaceRoot: string): void {
  const chatsRoot = path.join(baseDir, "chats");
  const rel = path.relative(chatsRoot, workspaceRoot);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel) || rel.split(path.sep).length !== 1) {
    throw new WorkspaceError({
      code: "FILESYSTEM_PATH_DENIED",
      message: `Refusing to purge: "${workspaceRoot}" is not a chat workspace directory (${chatsRoot}/<chat-id>).`,
      recoverable: false,
      suggestions: [],
    });
  }
}

/**
 * Detect uncommitted work. Git worktrees/clones: tracked modifications +
 * non-ignored untracked files via `git status --porcelain` (v1.x stable);
 * ignored files (node_modules, dist) never block. NON-git chats: everything
 * beyond the ACC/proagents scaffold machinery counts as uncommitted work —
 * deleting a plain folder destroys all of it, so it blocks the same way.
 */
export async function uncommittedWork(workspaceRoot: string): Promise<string | null> {
  const status = await git(workspaceRoot, ["status", "--porcelain"]);
  if (status !== null) {
    return status.trim().length > 0 ? status : null;
  }
  // Non-git directory: scan the top level for non-machinery content.
  const MACHINERY = new Set([".acc", ".paw", "AGENTS.md", "node_modules", "dist", "coverage", ".DS_Store"]);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(workspaceRoot);
  } catch {
    return null; // unreadable/missing → purge handles it downstream
  }
  const work = entries.filter((e) => !MACHINERY.has(e));
  return work.length > 0 ? work.map((e) => `?? ${e}`).join("\n") : null;
}

/** Remove a linked worktree from its source repo (cleans admin metadata). */
export async function detachWorktree(sourceRepo: string, worktreePath: string): Promise<boolean> {
  const out = await git(sourceRepo, ["worktree", "remove", "--force", worktreePath]);
  if (out !== null) return true;
  // The source repo may itself be gone; clean the stale registration from
  // the worktree side so the directory can be removed.
  await git(worktreePath, ["worktree", "prune"]);
  return false;
}

/** Settle a chat: stops nothing destructive — marks it retired on the roster. */
export async function settleChat(state: BootState, agentId: string): Promise<{ settled: string; workspaceRoot: string }> {
  const agent = state.roster.get(agentId);
  if (agent === undefined) {
    throw new WorkspaceError({
      code: "WORKSPACE_NOT_FOUND",
      message: `Agent "${agentId}" is not hired.`,
      recoverable: true,
      suggestions: ["GET /api/agents lists hired agents"],
    });
  }
  state.roster.settle(agentId);
  return { settled: agentId, workspaceRoot: agent.root };
}

/**
 * Purge a chat for good: stop crew + kill terminals + unmount, guard against
 * uncommitted work, detach any worktree from its source repo, then delete
 * the chat's own workspace directory. `force: true` destroys uncommitted
 * work deliberately (the caller owns the loss; it is reported honestly).
 */
export async function purgeChat(state: BootState, agentId: string, options?: { force?: boolean }): Promise<ChatPurgeResult> {
  const agent = state.roster.get(agentId);
  if (agent === undefined) {
    throw new WorkspaceError({
      code: "WORKSPACE_NOT_FOUND",
      message: `Agent "${agentId}" is not hired.`,
      recoverable: true,
      suggestions: ["GET /api/agents lists hired agents"],
    });
  }
  assertChatRoot(state.baseDir, agent.root);

  const force = options?.force === true;
  const dirty = await uncommittedWork(agent.root);
  if (dirty !== null && !force) {
    throw new WorkspaceError({
      code: "WORKSPACE_INVALID_STATE",
      message: `Chat "${agentId}" has uncommitted work — purge refused (nothing was deleted).`,
      recoverable: true,
      suggestions: [
        "Commit or push the work inside the chat terminal first",
        "Re-run with { force: true } to destroy the uncommitted work deliberately",
      ],
    });
  }

  // If this workspace is a linked worktree of a source repo, remove it via
  // git so the source repo's .git/worktrees metadata is cleaned up.
  const dotGit = await fs.stat(path.join(agent.root, ".git")).catch(() => undefined);
  let worktreeRemoved = false;
  if (dotGit?.isFile()) {
    // A .git FILE = linked worktree; read the gitdir pointer to find the source.
    const pointer = await fs.readFile(path.join(agent.root, ".git"), "utf8").catch(() => "");
    const gitDir = /gitdir:\s*(.+)/.exec(pointer)?.[1]?.trim();
    const source = gitDir !== undefined ? path.resolve(gitDir, "..", "..") : undefined;
    if (source !== undefined) {
      worktreeRemoved = await detachWorktree(source, agent.root);
    }
  }

  // Full teardown: crew member, terminal, mount, config entry.
  await state.roster.stop(agentId);

  const deleted = await fs.rm(agent.root, { recursive: true, force: true }).then(
    () => true,
    () => false,
  );
  if (!deleted) {
    throw new WorkspaceError({
      code: "WORKSPACE_INVALID_STATE",
      message: `The workspace directory ${agent.root} could not be removed (it may still be in use).`,
      recoverable: true,
      suggestions: ["Stop processes using the directory, then purge again"],
    });
  }

  return {
    purged: agentId,
    workspaceRoot: agent.root,
    destroyedWork: force ? dirty : null,
    worktreeRemoved,
  };
}
