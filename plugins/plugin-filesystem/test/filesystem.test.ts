import { describe, expect, it, beforeEach } from "vitest";
import { WorkspaceClient, defineService, type FilesystemProvider } from "@proagents/workspace";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { filesystemPlugin } from "../src/index.js";

const filesystemDefinition = defineService<FilesystemProvider>({
  id: "filesystem",
  contractVersion: "1.0.0",
});

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "paw-fs-"));
});

async function boot() {
  const client = new WorkspaceClient({
    config: {
      runtime: { provider: "local" },
      plugins: [{ id: "filesystem", options: { root: tmp } }],
      approval: { mode: "autonomous" },
      permissions: { filesystem: { read: [tmp], write: [tmp] } },
    },
    plugins: [filesystemPlugin],
  });
  const ws = await client.start();
  const fsp = await client.service(filesystemDefinition);
  return { ws, fsp };
}

describe("filesystem plugin", () => {
  it("writes and reads back inside the sandbox", async () => {
    const { fsp } = await boot();
    const write = await fsp.write({ path: "hello.txt", content: "hi" });
    expect(write.bytes).toBe(2);
    expect(await fsp.read({ path: "hello.txt" })).toBe("hi");
  });

  it("denies path escapes with FILESYSTEM_PATH_DENIED", async () => {
    const { fsp } = await boot();
    await expect(fsp.read({ path: "../../../etc/passwd" })).rejects.toMatchObject({
      code: "FILESYSTEM_PATH_DENIED",
    });
  });

  it("emits before-write so protection can veto BEFORE execution", async () => {
    const { ws, fsp } = await boot();
    const seen: string[] = [];
    ws.events.on("filesystem/before-write", (p) => seen.push(p.path));
    ws.events.on("filesystem/before-write", () => {
      throw new Error("blocked by policy");
    });
    await expect(fsp.write({ path: "blocked.txt", content: "x" })).rejects.toThrow("blocked by policy");
    expect(seen.length).toBe(1);
    await expect(fsp.read({ path: "blocked.txt" })).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("lists files recursively", async () => {
    const { fsp } = await boot();
    await fsp.write({ path: "a/b/c.txt", content: "1" });
    await fsp.write({ path: "d.txt", content: "2" });
    const files = await fsp.list({ path: ".", recursive: true });
    expect(files.some((f) => f.endsWith("c.txt"))).toBe(true);
    expect(files.some((f) => f.endsWith("d.txt"))).toBe(true);
  });
});
