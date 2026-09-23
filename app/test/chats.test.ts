/**
 * Chat retirement tests (T3-Code-inspired settle/purge lifecycle).
 *
 * Settle parks finished work (nothing destroyed). Purge deletes the chat's
 * workspace FOR GOOD — guarded: uncommitted tracked/untracked work refuses
 * the purge unless force is set; linked worktrees are detached from their
 * source repo; containment is absolute (only <base>/chats/<id> dirs).
 * Real git runs against a real temp repo — the guard is the product.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { WorkspaceError } from "@proagents/contracts";
import type { MountedWorkspace } from "@proagents/kernel";
import { AgentRoster } from "../src/agents.js";
import { TerminalManager } from "../src/terminal.js";
import { uncommittedWork, purgeChat } from "../src/chats.js";
import type { BootState } from "../src/context.js";

let tmpBase = "";

beforeEach(async () => {
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "paw-chats-"));
});

afterEach(async () => {
  await fs.rm(tmpBase, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function makeState(overrides: Partial<BootState> = {}): BootState {
  const config: { workspaces?: Record<string, unknown> } = {};
  const mounted = new Map<string, MountedWorkspace>();
  const manager = {
    async mount(id: string, o?: { root?: string }) {
      const m = { workspaceId: id, root: o?.root ?? path.join(tmpBase, "chats", id), sandbox: "workspace-write", log: { append: async () => {}, tail: async () => [] } };
      mounted.set(id, m as unknown as MountedWorkspace);
      return m as unknown as MountedWorkspace;
    },
    async unmount(id: string) { mounted.delete(id); },
    list: () => [...mounted.values()] as unknown as readonly MountedWorkspace[],
  };
  const terminals = new TerminalManager("/bin/cat");
  const roster = new AgentRoster(manager as never, {
    config: config as never,
    baseDir: tmpBase,
    sessionsRoot: path.join(tmpBase, "sessions"),
    terminals,
  });
  return { roster, terminals, manager: manager as never, config: config as never, baseDir: tmpBase, ...overrides } as BootState;
}

async function hireChat(state: BootState, id: string): Promise<void> {
  await state.roster.hire({ profileId: "nodejs-engineer", agentKind: "claude", root: path.join("chats", id), name: id });
}

describe("uncommittedWork guard", () => {
  it("returns null for a non-git directory (nothing tracked to lose)", async () => {
    const dir = path.join(tmpBase, "plain");
    await fs.mkdir(dir, { recursive: true });
    expect(await uncommittedWork(dir)).toBeNull();
  });

  it("returns null for a clean worktree", async () => {
    const repo = path.join(tmpBase, "repo");
    await fs.mkdir(repo, { recursive: true });
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "t@t"); git(repo, "config", "user.name", "t");
    await fs.writeFile(path.join(repo, "a.txt"), "x");
    git(repo, "add", "."); git(repo, "commit", "-qm", "init");
    expect(await uncommittedWork(repo)).toBeNull();
  });

  it("detects modified tracked files and non-ignored untracked files", async () => {
    const repo = path.join(tmpBase, "repo2");
    await fs.mkdir(repo, { recursive: true });
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "t@t"); git(repo, "config", "user.name", "t");
    await fs.writeFile(path.join(repo, "a.txt"), "x");
    git(repo, "add", "."); git(repo, "commit", "-qm", "init");
    await fs.writeFile(path.join(repo, "a.txt"), "edited");
    expect(await uncommittedWork(repo)).toContain("M a.txt");
    await fs.writeFile(path.join(repo, "new.txt"), "untracked");
    expect(await uncommittedWork(repo)).toContain("?? new.txt");
    // Ignored files never block a purge.
    await fs.writeFile(path.join(repo, ".gitignore"), "node_modules/\n");
    await fs.mkdir(path.join(repo, "node_modules"));
    await fs.writeFile(path.join(repo, "node_modules", "x"), "dep");
    const status = await uncommittedWork(repo);
    expect(status).not.toContain("node_modules");
  });
});

describe("purgeChat", () => {
  it("refuses to purge a directory outside chats/ (containment)", async () => {
    const state = makeState();
    await state.roster.hire({ profileId: "nodejs-engineer", agentKind: "claude", root: "outside", name: "esc1" });
    await expect(purgeChat(state, "esc1")).rejects.toMatchObject({ code: "FILESYSTEM_PATH_DENIED" });
  });

  it("refuses a chat with uncommitted work and deletes nothing", async () => {
    const state = makeState();
    await hireChat(state, "dirty");
    await fs.writeFile(path.join(tmpBase, "chats", "dirty", "wip.txt"), "half-done");
    await expect(purgeChat(state, "dirty")).rejects.toMatchObject({ code: "WORKSPACE_INVALID_STATE" });
    // Nothing was deleted: the agent and its directory survive.
    expect(state.roster.get("dirty")).toBeDefined();
    await fs.access(path.join(tmpBase, "chats", "dirty"));
    await state.roster.stop("dirty");
  });

  it("purges a clean chat: stops crew, unmounts, removes the directory", async () => {
    const state = makeState();
    await hireChat(state, "clean");
    const root = path.join(tmpBase, "chats", "clean");
    const result = await purgeChat(state, "clean");
    expect(result.purged).toBe("clean");
    expect(result.worktreeRemoved).toBe(false);
    await expect(fs.access(root)).rejects.toMatchObject({ code: "ENOENT" });
    expect(state.roster.get("clean")?.status).toBe("stopped");
  });

  it("force purges a dirty chat and reports the destroyed work honestly", async () => {
    const state = makeState();
    await hireChat(state, "forced");
    await fs.writeFile(path.join(tmpBase, "chats", "forced", "wip.txt"), "lost");
    const result = await purgeChat(state, "forced", { force: true });
    expect(result.destroyedWork).toContain("?? wip.txt");
    await expect(fs.access(path.join(tmpBase, "chats", "forced"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("purges a linked-worktree chat and detaches it from the source repo", async () => {
    // Real source repo with a real linked worktree (the T3 model).
    const repo = path.join(tmpBase, "srcrepo");
    await fs.mkdir(repo, { recursive: true });
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "t@t"); git(repo, "config", "user.name", "t");
    await fs.writeFile(path.join(repo, "a.txt"), "x");
    git(repo, "add", "."); git(repo, "commit", "-qm", "init");

    const state = makeState();
    // Hire a chat whose workspace becomes a worktree of the source repo.
    const wtPath = path.join(tmpBase, "chats", "wt");
    await fs.mkdir(wtPath, { recursive: true });
    execFileSync("git", ["-C", repo, "worktree", "add", "-b", "chat-src", wtPath], { encoding: "utf8" });
    await state.roster.hire({ profileId: "nodejs-engineer", agentKind: "claude", root: "chats/wt", name: "wt" });

    const result = await purgeChat(state, "wt");
    expect(result.worktreeRemoved).toBe(true);
    // The chat dir is gone AND the source repo's worktree list is clean.
    await expect(fs.access(wtPath)).rejects.toMatchObject({ code: "ENOENT" });
    const list = git(repo, "worktree", "list", "--porcelain");
    expect(list).not.toContain("chats/wt");
  });
});
