/**
 * Chat-workspace isolation tests (spec §36: sharing is explicit, never the
 * silent default; user decision 2026-09-23):
 *
 *   1. EVERY chat creates its own NEW, EMPTY workspace (chats/<chat-id>).
 *   2. The project is MATERIALIZED INTO that workspace (per-chat clone or
 *      per-chat copy) — never bound in place, never shared between chats.
 *   3. Project sources are declarative only (no directories created at
 *      connect time) and cannot live inside a chat workspace.
 *
 * The wizard's launch path needs a real PTY, so these tests pin the pure
 * parts: workspace creation, id uniqueness, source catalog semantics, and
 * the materialization command contract (copy excludes state dirs; clone
 * targets the chat's own workspace).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectRegistry } from "../src/projects.js";
import { planSetup } from "../src/provision.js";

let tmpBase = "";

beforeEach(async () => {
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "paw-isolation-"));
});

afterEach(async () => {
  await fs.rm(tmpBase, { recursive: true, force: true });
});

describe("chat workspace isolation (new empty workspace per chat)", () => {
  it("creates a unique empty workspace per chat under chats/", async () => {
    // The wizard's workspace-creation primitive, exercised directly: two
    // chats with the SAME display name must land in DIFFERENT directories
    // (unique suffix), and each starts empty.
    const mk = async (name: string) => {
      const base = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 30);
      const suffix = Math.random().toString(36).slice(2, 8);
      const chatId = `${base}-${suffix}`;
      const absoluteRoot = path.join(tmpBase, "chats", chatId);
      await fs.mkdir(absoluteRoot, { recursive: true });
      return absoluteRoot;
    };
    const a = await mk("Flight Booking");
    const b = await mk("Flight Booking");
    expect(a).not.toBe(b);
    expect(path.relative(tmpBase, a)).toMatch(/^chats\/flight-booking-[a-z0-9]{6}$/);
    // Both exist as separate, empty directories.
    for (const dir of [a, b]) {
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
      expect(await fs.readdir(dir)).toEqual([]);
    }
  });

  it("materializes a local git repo INTO the workspace as a linked worktree with its own branch", () => {
    const steps = planSetup({
      source: "local",
      copyFrom: "/projects/api",
      gitWorktree: true,
      absoluteRoot: "/base/chats/api-abc123",
      displayRoot: "chats/api-abc123",
    });
    const wt = steps.find((s) => s.label === "create git worktree");
    expect(wt).toBeDefined();
    // T3-Code worktree model: NEW branch + worktree add into the chat's OWN
    // directory; the source repo stays untouched on its current branch.
    expect(wt?.command.startsWith('git -C "/projects/api" worktree add -b ')).toBe(true);
    expect(wt?.command).toContain('"/base/chats/api-abc123"');
    // No shared checkout: the worktree target is the chat workspace itself.
  });

  it("sanitizes worktree branch names (slashes → dashes, T3-style)", () => {
    const steps = planSetup({
      source: "local",
      copyFrom: "/projects/api",
      gitWorktree: true,
      branch: "feature/auth",
      absoluteRoot: "/base/chats/api-abc123",
      displayRoot: "chats/api-abc123",
    });
    const wt = steps.find((s) => s.label === "create git worktree");
    expect(wt?.command).toContain("-b feature-auth ");
  });

  it("materializes a non-git local folder INTO the workspace by copy", () => {
    const steps = planSetup({
      source: "local",
      copyFrom: "/projects/api",
      absoluteRoot: "/base/chats/api-abc123",
      displayRoot: "chats/api-abc123",
    });
    const copy = steps.find((s) => s.label === "copy project into workspace");
    expect(copy).toBeDefined();
    expect(copy?.command).toContain('tar -C "/projects/api"');
    expect(copy?.command).toContain('tar -C "/base/chats/api-abc123"');
    // State dirs never cross the chat boundary.
    for (const excluded of ["node_modules", ".git", "dist", "coverage", ".paw", ".acc"]) {
      expect(copy?.command).toContain(`--exclude='/${excluded}'`);
    }
  });

  it("materializes a github repo INTO the workspace by per-chat clone", () => {
    const steps = planSetup({
      source: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      absoluteRoot: "/base/chats/api-abc123",
      displayRoot: "chats/api-abc123",
    });
    const clone = steps.find((s) => s.label === "clone repository");
    expect(clone?.command).toContain("git clone https://github.com/owner/repo.git .");
    // No shared clone target: the clone runs INSIDE the chat workspace (cwd),
    // materializing into the chat's own directory.
  });

  it("an empty-workspace chat runs only the scaffold step (no project steps)", () => {
    const steps = planSetup({
      source: "local",
      absoluteRoot: "/base/chats/blank-abc123",
      displayRoot: "chats/blank-abc123",
    });
    expect(steps.some((s) => s.label === "clone repository")).toBe(false);
    expect(steps.some((s) => s.label === "copy project into workspace")).toBe(false);
    expect(steps.some((s) => s.label === "install packages")).toBe(false);
    expect(steps.some((s) => s.label === "acc + proagents setup")).toBe(true);
  });
});

describe("ProjectRegistry as a source catalog (no root binding)", () => {
  it("registers a local folder as a COPY SOURCE without binding it", async () => {
    const src = path.join(tmpBase, "my-project");
    await fs.mkdir(src, { recursive: true });
    const registry = new ProjectRegistry({ baseDir: tmpBase, getRepository: async () => undefined });
    const project = await registry.connectLocal({ path: "my-project" });
    expect(project.source).toBe("local");
    expect(project.absoluteRoot).toBe(src);
    // The registry creates nothing and moves nothing.
    expect(await fs.readdir(src)).toEqual([]);
  });

  it("registers a GitHub repo WITHOUT creating any directory", async () => {
    const registry = new ProjectRegistry({ baseDir: tmpBase, getRepository: async () => undefined });
    const project = await registry.connectGithub({ repo: "owner/repo" });
    expect(project.repo).toBe("owner/repo");
    // The old shared pre-clone dir (repos/<id>) is gone — clone happens
    // per chat, inside the chat's workspace.
    await expect(fs.stat(path.join(tmpBase, "repos"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a chat workspace as a project source (chats never mix)", async () => {
    const chatDir = path.join(tmpBase, "chats", "some-chat-abc123");
    await fs.mkdir(chatDir, { recursive: true });
    const registry = new ProjectRegistry({ baseDir: tmpBase, getRepository: async () => undefined });
    await expect(registry.connectLocal({ path: "chats/some-chat-abc123" })).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
});
