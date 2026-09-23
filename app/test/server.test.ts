/**
 * Control-room server integration test.
 *
 * Boots the BUILT server (app/dist/server.js) as a child process against a
 * temp base dir — the same way a user runs it — and exercises the kernel
 * paths: mount, kernel-mediated filesystem write, session endpoint, SSE
 * feed, and the approval-deny veto for dangerous shell commands.
 */
import { describe, expect, it, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const PORT = 4688;
const BASE = `http://127.0.0.1:${PORT}`;

let child: ChildProcess | null = null;
let baseDir = "";

async function waitForReady(timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not become ready in time");
}

async function startServer(): Promise<void> {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "paw-ui-test-"));
  await fs.mkdir(path.join(baseDir, "alpha"), { recursive: true });
  // Module-relative: app/test → app/dist/server.js (independent of vitest cwd).
  const serverPath = fileURLToPath(new URL("../dist/server.js", import.meta.url));
  child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PAW_UI_PORT: String(PORT),
      PAW_UI_BASE_DIR: baseDir,
      PAW_PLUGINS: "filesystem,shell",
      PAW_WORKSPACES: `alpha=./alpha`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    if (process.env.PAW_UI_TEST_DEBUG) process.stderr.write(chunk);
  });
  await waitForReady();
}

async function stopServer(): Promise<void> {
  if (child === null) return;
  const c = child;
  child = null;
  c.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => c.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
  c.kill("SIGKILL");
  await fs.rm(baseDir, { recursive: true, force: true });
}

afterAll(stopServer);

describe("control-room server (kernel projection)", () => {
  it("boots the real kernel and reports honest health", async () => {
    await startServer();
    const res = await fetch(`${BASE}/api/health`);
    expect(res.ok).toBe(true);
    const snap = (await res.json()) as {
      status: string;
      doctor: { pluginId: string; health: { status: string } }[];
      workspaces: { workspaceId: string }[];
    };
    expect(["ready", "degraded"]).toContain(snap.status);
    // Nothing is activated until referenced: catalog semantics (empty plugin set).
    expect(snap.workspaces).toEqual([]);
  });

  it("serves the chat-shell UI at /", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.ok).toBe(true);
    const html = await res.text();
    expect(html).toContain("ProAgents");
    // DSH-style: every chat is a configured workspace (chat + code panes).
    expect(html).toContain("new-chat-btn");
    expect(html).toContain("code-pane");
  });

  it("mounts a declared workspace and isolates its scope", async () => {
    const res = await fetch(`${BASE}/api/workspaces/alpha/mount`, { method: "POST", body: "{}" });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { workspaceId: string; sandbox: string; pluginIds: string[] };
    expect(body.workspaceId).toBe("alpha");
    expect(body.sandbox).toBe("workspace-write");
    expect(body.pluginIds).toContain("filesystem");

    const mountAgain = await fetch(`${BASE}/api/workspaces/alpha/mount`, { method: "POST", body: "{}" });
    expect(mountAgain.status).toBe(409); // WORKSPACE_ALREADY_MOUNTED
  });

  it("writes files through the kernel filesystem provider", async () => {
    const res = await fetch(`${BASE}/api/fs/write`, {
      method: "POST",
      body: JSON.stringify({ path: "hello.txt", content: "from the control room" }),
    });
    expect(res.ok).toBe(true);
    const onDisk = await fs.readFile(path.join(baseDir, "hello.txt"), "utf8");
    expect(onDisk).toBe("from the control room");
  });

  it("denies dangerous shell commands before execution (approval flow, spec 101-102)", async () => {
    const res = await fetch(`${BASE}/api/shell`, {
      method: "POST",
      body: JSON.stringify({ command: "rm -rf /" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("APPROVAL_REQUIRED");
    // Harmless commands still work.
    const ok = await fetch(`${BASE}/api/shell`, {
      method: "POST",
      body: JSON.stringify({ command: "echo ui-test-ok" }),
    });
    expect(ok.ok).toBe(true);
    const shell = (await ok.json()) as { stdout: string; exitCode: number };
    expect(shell.exitCode).toBe(0);
    expect(shell.stdout).toContain("ui-test-ok");
  });

  it("streams kernel events over SSE and survives client disconnects", async () => {
    const res = await fetch(`${BASE}/api/events?stream=sse`);
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: hello");
    reader.cancel(); // disconnect — the server must prune, not crash
    await new Promise((r) => setTimeout(r, 300));
    const health = await fetch(`${BASE}/api/health`);
    expect(health.ok).toBe(true);
  });

  it("rejects mounting undeclared workspaces (config reconstructability)", async () => {
    const res = await fetch(`${BASE}/api/workspaces/ghost/mount`, { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("WORKSPACE_NOT_FOUND");
  });
});
