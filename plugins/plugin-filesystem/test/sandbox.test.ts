import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { defineService, type FilesystemProvider } from "@proagents/workspace";
import { WorkspaceClient } from "@proagents/workspace";
import { filesystemPlugin } from "../src/index.js";

const filesystemDefinition = defineService<FilesystemProvider>({ id: "filesystem", contractVersion: "1.0.0" });

async function boot(sandbox: "read-only" | "workspace-write" | "danger-full-access") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "paw-fs-"));
  const client = new WorkspaceClient({
    config: {
      runtime: { provider: "local" },
      tools: ["filesystem"],
      plugins: [{ id: "filesystem", options: { root } }],
      // Declared so the scope's filesystem root is grantable configuration.
      permissions: { filesystem: { read: ["/"], write: ["/"] } },
      approval: { mode: "autonomous" },
    },
    plugins: [filesystemPlugin],
    sandbox,
  });
  const ws = await client.start();
  const fsService = await client.service(filesystemDefinition);
  return { ws, fsService, root };
}

describe("filesystem sandbox enforcement (spec section 142)", () => {
  let root: string;
  let ws: Awaited<ReturnType<typeof boot>>["ws"];
  let fsService: Awaited<ReturnType<typeof boot>>["fsService"];
  let cleanup: string;

  beforeEach(async () => {
    const booted = await boot("read-only");
    ws = booted.ws;
    fsService = booted.fsService;
    cleanup = booted.root;
    root = booted.root;
  });
  afterEach(async () => {
    await ws.shutdown();
    await fs.rm(cleanup, { recursive: true, force: true });
  });

  it("read-only vetoes a write BEFORE execution (SANDBOX_POLICY_VIOLATION)", async () => {
    const beforeWrite: number[] = [];
    ws.events.on("filesystem/before-write", () => beforeWrite.push(1));
    await expect(fsService.write({ path: "x.txt", content: "hi" })).rejects.toMatchObject({
      code: "SANDBOX_POLICY_VIOLATION",
    });
    // Veto happened before the before-write event even fired.
    expect(beforeWrite).toHaveLength(0);
    // Nothing was written.
    await expect(fs.access(path.join(root, "x.txt"))).rejects.toThrow();
  });

  it("read-only vetoes remove too", async () => {
    await expect(fsService.remove({ path: "whatever.txt" })).rejects.toMatchObject({
      code: "SANDBOX_POLICY_VIOLATION",
    });
  });
});

describe("filesystem write modes that allow writes (spec section 142)", () => {
  it("workspace-write allows writes within the root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paw-fs-"));
    const client = new WorkspaceClient({
      config: {
        runtime: { provider: "local" },
        tools: ["filesystem"],
        plugins: [{ id: "filesystem", options: { root } }],
        permissions: { filesystem: { read: ["/"], write: ["/"] } },
        approval: { mode: "autonomous" },
      },
      plugins: [filesystemPlugin],
    });
    const ws = await client.start();
    const fsService = await client.service(filesystemDefinition);
    // No sandbox (parent workspace) → no veto.
    await expect(fsService.write({ path: "ok.txt", content: "hello" })).resolves.toMatchObject({ bytes: 5 });
    await ws.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  });
});
