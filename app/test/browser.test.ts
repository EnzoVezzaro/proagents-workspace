/**
 * Folder-browse + desktop-shell route tests (real server, temp base dir).
 *
 * The "select folder" feature cannot use a native OS dialog from a browser,
 * so the server exposes a containment-checked filesystem browser. These
 * tests exercise it the way the UI does — over HTTP against the built
 * server — including the traversal refusal and the mkdir helper.
 */
import { describe, it, expect, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = path.join(tmpdir(), `paw-browser-test-${Date.now()}`);
mkdirSync(BASE, { recursive: true });
mkdirSync(path.join(BASE, "alpha"));
mkdirSync(path.join(BASE, "alpha", "beta"));
writeFileSync(path.join(BASE, "alpha", "beta", "f.txt"), "hello");

const PORT = "4689";
const server: ChildProcess = spawn("node", [path.join(__dirname, "..", "dist", "server.js")], {
  env: {
    ...process.env,
    PAW_UI_PORT: PORT,
    PAW_UI_BASE_DIR: BASE,
    PAW_UI_FS_ROOT: BASE,
    PAW_PLUGINS: "filesystem",
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

describe("folder browser routes (server-side select-folder)", () => {
  it("browses the base dir and lists real folders", async () => {
    await waitReady();
    const res = await fetch(url("/api/fs/browse?path="));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; entries: { name: string; type: string }[]; parent: string | null };
    expect(body.path).toBe("");
    expect(body.entries.map((e) => e.name)).toContain("alpha");
    expect(body.entries.every((e) => e.type === "dir")).toBe(true);
  });

  it("navigates into a subfolder and reports the parent", async () => {
    const res = await fetch(url(`/api/fs/browse?path=${encodeURIComponent("alpha/beta")}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { name: string }[]; parent: string };
    expect(body.entries.map((e) => e.name)).toContain("f.txt");
    expect(body.parent).toBe("alpha");
  });

  it("refuses traversal outside the base dir", async () => {
    const res = await fetch(url(`/api/fs/browse?path=${encodeURIComponent("../../etc")}`));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("FILESYSTEM_PATH_DENIED");
  });

  it("creates a folder under the current dir via mkdir", async () => {
    const res = await fetch(url("/api/fs/mkdir"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "fresh-project", path: "alpha" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string };
    expect(body.path).toBe("alpha/fresh-project");
    const verify = await fetch(url("/api/fs/browse?path=alpha"));
    const listing = (await verify.json()) as { entries: { name: string }[] };
    expect(listing.entries.map((e) => e.name)).toContain("fresh-project");
  });

  it("rejects multi-segment mkdir names", async () => {
    const res = await fetch(url("/api/fs/mkdir"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "a/b", path: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("reports desktop launch info (app window command)", async () => {
    const res = await fetch(url("/api/desktop"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { app: string; launchCommand: string };
    expect(body.app).toContain("ProAgents");
    expect(body.launchCommand.length).toBeGreaterThan(0);
  });
});
