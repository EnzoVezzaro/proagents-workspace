import { describe, expect, it } from "vitest";
import { defineService, type ShellProvider } from "@proagents/workspace";
import { WorkspaceClient } from "@proagents/workspace";
import { shellPlugin } from "../src/index.js";

const shellDefinition = defineService<ShellProvider>({ id: "shell", contractVersion: "1.0.0" });

async function boot(sandbox?: "read-only" | "workspace-write" | "danger-full-access") {
  const client = new WorkspaceClient({
    config: {
      runtime: { provider: "local" },
      plugins: [{ id: "shell" }],
      approval: { mode: "autonomous" },
    },
    plugins: [shellPlugin],
    ...(sandbox ? { sandbox } : {}),
  });
  const ws = await client.start();
  const shell = await client.service(shellDefinition);
  return { ws, shell };
}

describe("shell sandbox enforcement (spec section 142)", () => {
  it("read-only fails CLOSED with SANDBOX_UNAVAILABLE (a host shell cannot enforce read-only)", async () => {
    const { ws, shell } = await boot("read-only");
    const before: string[] = [];
    ws.events.on("command/before", (p) => before.push(p.command));
    await expect(shell.exec({ command: "echo should-not-run" })).rejects.toMatchObject({
      code: "SANDBOX_UNAVAILABLE",
    });
    // Fail-closed: nothing was spawned, not even the before-event chain ran to spawn.
    expect(before).toHaveLength(0);
    await ws.shutdown();
  });

  it("workspace-write executes normally", async () => {
    const { ws, shell } = await boot("workspace-write");
    const result = await shell.exec({ command: "echo ok" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("ok");
    await ws.shutdown();
  });

  it("no declared policy preserves the previous behavior (back-compat)", async () => {
    const { ws, shell } = await boot();
    const result = await shell.exec({ command: "echo legacy" });
    expect(result.exitCode).toBe(0);
    await ws.shutdown();
  });
});
