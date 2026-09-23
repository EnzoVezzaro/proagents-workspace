/**
 * REAL-terminal HTTP tests: a workspace PTY is created through the API,
 * keystrokes are sent through the input endpoint, and the output is read
 * back live over the SSE stream. No simulation — this is the actual
 * node-pty path end to end (shell stubbed to /bin/cat for determinism).
 */
import { describe, it, expect, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = mkdtempSync(path.join(tmpdir(), "paw-tty-test-"));
const PORT = "4690";
const server: ChildProcess = spawn("node", [path.join(__dirname, "..", "dist", "server.js")], {
  env: {
    ...process.env,
    PAW_UI_PORT: PORT,
    PAW_UI_BASE_DIR: BASE,
    PAW_UI_FS_ROOT: BASE,
    PAW_PLUGINS: "filesystem,shell",
    PAW_UI_SHELL: "/bin/cat", // deterministic: echoes every typed byte
    PAW_WORKSPACES: "probe=.", // declare a mountable workspace for the test
  },
  stdio: "ignore",
});

afterAll(() => {
  server.kill();
});

const url = (p: string) => `http://127.0.0.1:${PORT}${p}`;

async function waitReady(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url("/api/health"));
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not become ready");
}

/** Mount a workspace directly through the env-declared parent config. */
async function mountWorkspace(): Promise<string> {
  const res = await fetch(url("/api/workspaces/probe/mount"), { method: "POST", body: "{}" });
  if (res.status !== 200) throw new Error(`mount failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { workspaceId: string };
  return body.workspaceId;
}

/** Collect SSE frames from the terminal stream into a string. */
async function collectStream(ttyId: string, ms: number): Promise<string> {
  const res = await fetch(url(`/api/terminals/${encodeURIComponent(ttyId)}/stream`));
  expect(res.status).toBe(200);
  const reader = res.body?.getReader();
  if (reader === undefined) throw new Error("no stream body");
  let text = "";
  const decoder = new TextDecoder();
  const timer = setTimeout(() => void reader.cancel(), ms);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.includes("hello-from-pty")) break;
    }
  } catch {
    /* canceled — good enough */
  }
  clearTimeout(timer);
  return text;
}

describe("real terminal over HTTP (node-pty end to end)", () => {
  it("creates a PTY in the workspace and types into it, reading output over SSE", async () => {
    await waitReady();
    const ws = await mountWorkspace();

    const created = await fetch(url(`/api/workspaces/${ws}/terminal`), { method: "POST", body: "{}" });
    expect(created.status).toBe(200);
    const tty = (await created.json()) as { id: string; cwd: string; shell: string };
    expect(tty.id).toContain(ws);
    expect(tty.cwd).toBeTruthy();

    // Type through the input endpoint (as the xterm client does).
    const typed = await fetch(url(`/api/terminals/${encodeURIComponent(tty.id)}/input`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "hello-from-pty\r" }),
    });
    expect(typed.status).toBe(200);

    // The REAL PTY (/bin/cat) echoes it back — read it over SSE.
    const frames = await collectStream(tty.id, 4000);
    expect(frames).toContain("tty");
    expect(frames).toContain("hello-from-pty");
  });

  it("lists the workspace's live terminals and closes one", async () => {
    const ws = "probe";
    const list = await fetch(url(`/api/workspaces/${ws}/terminals`));
    const body = (await list.json()) as { terminals: { id: string }[] };
    expect(body.terminals.length).toBeGreaterThanOrEqual(1);
    const close = await fetch(url(`/api/terminals/${encodeURIComponent(body.terminals[0]?.id ?? "")}/close`), {
      method: "POST",
      body: "{}",
    });
    expect(close.status).toBe(200);
  });

  it("refuses terminals for an unmounted workspace", async () => {
    const res = await fetch(url("/api/workspaces/nope/terminal"), { method: "POST", body: "{}" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("WORKSPACE_NOT_FOUND");
  });

  it("inspects an agent: agent + workspace + terminal + session log in one view", async () => {
    // Hire through the API (claude exists in dev machines; the launch is a
    // real PTY command — /bin/cat shell echoes it back harmlessly).
    const hired = await fetch(url("/api/agents/hire"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId: "nodejs-engineer", agentKind: "claude", name: "insp-1" }),
    });
    expect(hired.status).toBe(200);
    const res = await fetch(url("/api/agents/insp-1/inspect"));
    expect(res.status).toBe(200);
    const d = (await res.json()) as {
      agent: { id: string; agentKind: string; status: string };
      workspace: { mounted: boolean; pluginIds: string[] };
      terminal: { live: boolean; id: string };
      contextFramework: string;
      sessionLog: unknown[];
    };
    expect(d.agent.id).toBe("insp-1");
    expect(d.agent.agentKind).toBe("claude");
    expect(d.workspace.mounted).toBe(true);
    expect(d.workspace.pluginIds).toContain("agent-claude");
    expect(d.terminal.live).toBe(true);
    expect(d.contextFramework).toBe("acc");
    expect(Array.isArray(d.sessionLog)).toBe(true);
    await fetch(url("/api/agents/insp-1/stop"), { method: "POST", body: "{}" });
  });

  it("404s the inspector for an unknown agent", async () => {
    const res = await fetch(url("/api/agents/ghost/inspect"));
    expect(res.status).toBe(404);
  });
});
