/**
 * Workspace lifecycle integration test (spec section 91).
 *
 * Boots a REAL workspace — kernel + filesystem + shell + git + runtime-local +
 * context-acc + repo-shield plugins — and walks the documented flow:
 *
 *   local runtime → clone → context → edit (filesystem) → test (shell)
 *     → commit → push
 *
 * Plus the protection guarantees: a destructive command is vetoed BEFORE
 * execution, and a guarded git push passes the approval gate.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  WorkspaceClient,
  defineService,
  DEFAULT_GIT_GUARDS,
  type FilesystemProvider,
  type ShellProvider,
  type RepositoryProvider,
  type RuntimeProvider,
  type ContextProvider,
} from "@proagents/workspace";
import { filesystemPlugin } from "../../plugins/plugin-filesystem/src/index.js";
import { shellPlugin } from "../../plugins/plugin-shell/src/index.js";
import { gitPlugin } from "../../plugins/plugin-git/src/index.js";
import { localRuntimePlugin } from "../../plugins/plugin-runtime-local/src/index.js";
import { accContextPlugin } from "../../plugins/plugin-context-acc/src/index.js";
import { repoShieldPlugin } from "../../plugins/plugin-repo-shield/src/index.js";
const run = promisify(execFile);

const filesystemDefinition = defineService<FilesystemProvider>({ id: "filesystem", contractVersion: "1.0.0" });
const shellDefinition = defineService<ShellProvider>({ id: "shell", contractVersion: "1.0.0" });
const repositoryDefinition = defineService<RepositoryProvider>({ id: "repository", contractVersion: "1.0.0" });
const runtimeDefinition = defineService<RuntimeProvider>({ id: "runtime", contractVersion: "1.0.0" });
const contextDefinition = defineService<ContextProvider>({ id: "context", contractVersion: "1.0.0" });

let scratch: string;
let originRepo: string;

beforeAll(async () => {
  // A real origin repository to clone from.
  scratch = mkdtempSync(path.join(tmpdir(), "paw-lifecycle-"));
  originRepo = path.join(scratch, "origin.git");
  const seed = path.join(scratch, "seed");
  mkdirSync(seed, { recursive: true });
  await run("git", ["init", "--initial-branch=main", seed]);
  await run("git", ["-C", seed, "config", "user.email", "test@example.com"]);
  await run("git", ["-C", seed, "config", "user.name", "Integration Test"]);
  writeFileSync(path.join(seed, "README.md"), "# Lifecycle fixture\n");
  await run("git", ["-C", seed, "add", "-A"]);
  await run("git", ["-C", seed, "commit", "-m", "init"]);
  await run("git", ["clone", "--bare", seed, originRepo]);
});

async function bootWorkspace(root: string, approvalMode = "autonomous") {
  const client = new WorkspaceClient({
    config: {
      runtime: { provider: "local" },
      repository: { provider: "git" },
      context: { providers: ["context-acc"] },
      approval: { mode: approvalMode },
      permissions: {
        filesystem: { read: [root], write: [root] },
      },
      plugins: [
        { id: "filesystem", options: { root } },
        { id: "shell" },
        { id: "git", options: { root } },
        { id: "runtime-local", options: { root } },
        { id: "context-acc", options: { root } },
        { id: "repo-shield" },
      ],
    },
    plugins: [filesystemPlugin, shellPlugin, gitPlugin, localRuntimePlugin, accContextPlugin, repoShieldPlugin],
  });
  const ws = await client.start();
  return {
    ws,
    filesystem: await client.service(filesystemDefinition),
    shell: await client.service(shellDefinition),
    repository: await client.service(repositoryDefinition),
    runtime: await client.service(runtimeDefinition),
    context: await client.service(contextDefinition),
  };
}

describe("workspace lifecycle (spec section 91)", () => {
  it("runs the full flow: runtime → clone → context → edit → test → commit", async () => {
    // The repo lives INSIDE the workspace root, so the sandboxed filesystem
    // can edit files in the repository (spec section 91 flow).
    const root = path.join(scratch, "ws1");
    const repoPath = path.join(root, "repo");
    const { ws, runtime, repository, context, filesystem, shell } = await bootWorkspace(root);

    // 1. Runtime: create a local workspace (honestly not a sandbox).
    const handle = await runtime.createWorkspace({ workspaceId: "lifecycle-1" });
    expect(handle.metadata["isolated"]).toBe(false);

    // 2. Clone from origin.
    const clone = await repository.clone({ repository: originRepo, targetPath: repoPath });
    expect(clone.commit).toMatch(/^[0-9a-f]{40}$/);

    // 3. Context: index the repo's documentation.
    await context.index([repoPath]);
    const pack = await context.query({ text: "lifecycle fixture" });
    expect(pack.provider).toBe("context-acc");

    // 4. Edit through the sandboxed filesystem (relative to the workspace root).
    const write = await filesystem.write({ path: "repo/notes.md", content: "# Notes\nedited by the workspace\n" });
    expect(write.bytes).toBeGreaterThan(0);

    // 5. Verify through the shell (real command run inside the repo).
    const test = await shell.exec({ command: "cat notes.md", cwd: repoPath });
    expect(test.exitCode).toBe(0);
    expect(test.stdout).toContain("edited by the workspace");

    // 6. Commit through the repository provider.
    const commit = await repository.commit({ path: repoPath, message: "docs: workspace edit", addAll: true });
    expect(commit.commit).toMatch(/^[0-9a-f]{40}$/);
    const status = await repository.status(repoPath);
    expect(status.dirty).toBe(false);
    expect(status.branch).toBe("main");

    await ws.shutdown();
  }, 60_000);

  it("protection vetoes destructive commands BEFORE execution, in-band", async () => {
    const { ws, shell } = await bootWorkspace(path.join(scratch, "root2"));
    const interventions: unknown[] = [];
    ws.events.on("protection/intervened", (p) => interventions.push(p));

    await expect(shell.exec({ command: "git reset --hard HEAD~1" })).rejects.toThrow(/PROTECTION_BLOCKED/);
    await expect(shell.exec({ command: "git push --force origin main" })).rejects.toThrow(/PROTECTION_BLOCKED/);
    expect(interventions.length).toBeGreaterThanOrEqual(2);

    // The veto is before-execution: the shell never even spawned the command.
    await expect(shell.exec({ command: "echo safe" })).resolves.toMatchObject({ exitCode: 0 });

    await ws.shutdown();
  }, 30_000);

  it("repository guards block destructive git ops independently of the shell path", async () => {
    const repoPath = path.join(scratch, "work3");
    const { repository } = await bootWorkspace(path.join(scratch, "root3"));
    await repository.clone({ repository: originRepo, targetPath: repoPath });

    // Force push is guarded by default even via the typed API.
    await expect(repository.push({ path: repoPath, force: true })).rejects.toMatchObject({
      code: "GIT_OPERATION_BLOCKED",
    });
    // The sync guard() verdict agrees.
    expect(repository.guard("push", { force: true }).allowed).toBe(false);
    expect(DEFAULT_GIT_GUARDS.forcePush).toBe(false);
  }, 60_000);

  it("guarded push passes the approval gate when a human approves", async () => {
    const repoPath = path.join(scratch, "work4");
    let approvals = 0;
    const client = new WorkspaceClient({
      config: {
        runtime: { provider: "local" },
        repository: { provider: "git", options: { guards: { forcePush: true } } },
        approval: { mode: "guarded" },
        permissions: { filesystem: { read: [scratch], write: [scratch] } },
        plugins: [
          { id: "filesystem", options: { root: scratch } },
          { id: "git", options: { root: scratch } },
          { id: "repo-shield" },
        ],
      },
      plugins: [filesystemPlugin, gitPlugin, repoShieldPlugin],
      approvalFlow: {
        confirm: async () => {
          approvals++;
          return "approved";
        },
      },
    });
    const ws = await client.start();
    const repository = await client.service(repositoryDefinition);
    await repository.clone({ repository: originRepo, targetPath: repoPath });
    writeFileSync(path.join(repoPath, "extra.md"), "x\n");
    await repository.commit({ path: repoPath, message: "extra", addAll: true });

    // force push is allowed by guards here, so it goes to the approval gate,
    // the human approves, and the push actually hits the bare origin.
    const pushed = await repository.push({ path: repoPath, force: true, remote: "origin", branch: "main" });
    expect(pushed.pushedTo).toBe("origin/main");
    expect(approvals).toBe(1);
    await ws.shutdown();
  }, 60_000);

  it("doctor aggregates provider health across all activated plugins", async () => {
    const { ws } = await bootWorkspace(path.join(scratch, "root5"));
    const report = await ws.doctor();
    const ids = report.map((e) => e.serviceId).sort();
    // The git plugin registers under the capability id "repository" (spec section 9).
    expect(ids).toEqual(["context", "filesystem", "protection", "repository", "runtime", "shell"]);
    const protection = report.find((e) => e.serviceId === "protection");
    expect(protection?.health.status).toBe("healthy");
    await ws.shutdown();
  }, 30_000);

  it("offline events flow: workspace lifecycle events are emitted in order", async () => {
    const client = new WorkspaceClient({
      config: {
        runtime: { provider: "local" },
        plugins: [{ id: "shell" }],
        approval: { mode: "autonomous" },
      },
      plugins: [shellPlugin],
    });
    const ws = await client.start();
    const names: string[] = [];
    ws.events.on("workspace/stopping", () => names.push("stopping"));
    ws.events.on("workspace/stopped", () => names.push("stopped"));
    await ws.shutdown();
    expect(names).toEqual(["stopping", "stopped"]);
  });

  it("cleans up scratch on exit", async () => {
    // Placeholder to keep scratch cleanup after all suites in this file.
    expect(scratch).toBeTruthy();
    rmSync(scratch, { recursive: true, force: true });
  });
});
