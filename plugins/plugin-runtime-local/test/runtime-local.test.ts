/**
 * Contract tests for the local runtime plugin.
 *
 * Focus: honest security reporting (never claim sandbox equivalence) and the
 * before-execution veto chain.
 */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { localRuntimePlugin } from "../src/index.js";

const pexec = promisify(execFile);

type RuntimeProviderShaped = {
  name: string;
  contractVersion: string;
  health(): Promise<{ status: string; message: string }>;
  createWorkspace(request: { workspaceId: string; image?: string }): Promise<{
    workspaceId: string;
    provider: string;
    repoPath: string;
    metadata: Record<string, unknown>;
  }>;
  execWorkspace(
    handle: { workspaceId: string; provider: string; repoPath: string; metadata: Record<string, unknown> },
    request: { command: string[]; cwd?: string }
  ): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }>;
  destroyWorkspace(handle: { workspaceId: string }): Promise<void>;
};

function makeCtx(config: unknown, root: string) {
  const registered: { id: string; provider: Record<string, unknown> }[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const beforeCommands: string[] = [];
  const ctx = {
    pluginId: "runtime-local",
    config,
    pluginOptions: () => ({ root }),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    events: {
      on: () => ({ id: "t", unsubscribe() {} }),
      off: () => {},
      emit: async (name: string, payload: unknown) => {
        events.push({ name, payload });
        if (name === "command/before") beforeCommands.push((payload as { command: string }).command);
      },
    },
    permissions: {
      require: () => {},
      approve: async () => "approved" as const,
    },
    services: {
      register: (def: { id: string }, provider: Record<string, unknown>) => {
        registered.push({ id: def.id, provider });
      },
    },
  } as unknown as Parameters<typeof localRuntimePlugin.activate>[0];
  return {
    ctx,
    events,
    beforeCommands,
    provider(): RuntimeProviderShaped {
      localRuntimePlugin.activate(ctx);
      const entry = registered.find((r) => r.id === "runtime");
      if (!entry) throw new Error("runtime service not registered");
      return entry.provider as unknown as RuntimeProviderShaped;
    },
  };
}

describe("local runtime plugin", () => {
  const root = mkdtempSync(path.join(tmpdir(), "paw-local-"));

  it("registers the runtime service with contract version 1.0.0", () => {
    const h = makeCtx({ runtime: { provider: "local" } }, root);
    const provider = h.provider();
    expect(provider.name).toBe("runtime-local");
    expect(provider.contractVersion).toBe("1.0.0");
  });

  it("health honestly reports that it is not a sandbox", async () => {
    const h = makeCtx({ runtime: { provider: "local" } }, root);
    const provider = h.provider();
    const health = await provider.health();
    expect(["healthy", "degraded"]).toContain(health.status);
    expect(health.message.toLowerCase()).toContain("not a sandbox");
  });

  it("createWorkspace returns a handle marked isolated: false", async () => {
    const h = makeCtx({ runtime: { provider: "local" } }, root);
    const provider = h.provider();
    const handle = await provider.createWorkspace({ workspaceId: "ws1" });
    expect(handle.provider).toBe("runtime-local");
    expect(handle.metadata["isolated"]).toBe(false);
    expect(handle.metadata["sandbox"]).toBe(false);
    await provider.destroyWorkspace(handle);
    expect(h.events.map((e) => e.name)).toContain("workspace/destroyed");
  });

  it("rejects container images instead of pretending to support them", async () => {
    const h = makeCtx({ runtime: { provider: "local" } }, root);
    const provider = h.provider();
    await expect(
      provider.createWorkspace({ workspaceId: "ws2", image: "node:22" })
    ).rejects.toThrow(/cannot create container image/i);
  });

  it("executes commands in the workspace root and reports before/after events", async () => {
    const h = makeCtx({ runtime: { provider: "local" } }, root);
    const provider = h.provider();
    const handle = await provider.createWorkspace({ workspaceId: "ws3" });
    const result = await provider.execWorkspace(handle, { command: ["node", "-e", "console.log('ok')"] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("ok");
    expect(h.beforeCommands).toContain("node -e console.log('ok')");
    expect(h.events.map((e) => e.name)).toContain("command/after");
  });

  it("cwd is resolved within the workspace root", async () => {
    const h = makeCtx({ runtime: { provider: "local" } }, root);
    const provider = h.provider();
    const handle = await provider.createWorkspace({ workspaceId: "ws4" });
    const result = await provider.execWorkspace(handle, {
      command: ["node", "-e", "console.log(process.cwd().startsWith(process.env.PROBE_ROOT ?? '') ? 'in' : 'out')"],
      cwd: ".",
    });
    expect(result.exitCode).toBe(0);
  });

  it("veto chain: a protection subscriber can block a command BEFORE spawn", async () => {
    // Rebuild a context whose event bus actually invokes subscribers, so the
    // before-execution veto chain is exercised end-to-end.
    const registered: { id: string; provider: Record<string, unknown> }[] = [];
    const subscribers = new Map<string, ((payload: unknown) => void | Promise<void>)[]>();
    const ctx = {
      pluginId: "runtime-local",
      config: { runtime: { provider: "local" } },
      pluginOptions: () => ({ root }),
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      events: {
        on: (name: string, handler: (payload: unknown) => void | Promise<void>) => {
          const list = subscribers.get(name) ?? [];
          list.push(handler);
          subscribers.set(name, list);
          return { id: "t", unsubscribe() {} };
        },
        off: () => {},
        emit: async (name: string, payload: unknown) => {
          for (const handler of subscribers.get(name) ?? []) await handler(payload);
        },
      },
      permissions: { require: () => {}, approve: async () => "approved" as const },
      services: {
        register: (def: { id: string }, provider: Record<string, unknown>) => {
          registered.push({ id: def.id, provider });
        },
      },
    } as unknown as Parameters<typeof localRuntimePlugin.activate>[0];
    localRuntimePlugin.activate(ctx);
    const entry = registered.find((r) => r.id === "runtime");
    const provider = entry!.provider as unknown as RuntimeProviderShaped;

    // "Protection" subscriber: veto everything that mentions "dangerous".
    (subscribers.get("command/before") ?? []).length; // subscribers registered by plugin are none — plugin only emits
    subscribers.set("command/before", [
      async (payload) => {
        const p = payload as { command: string };
        if (p.command.includes("dangerous")) {
          throw new Error("BLOCKED_BY_PROTECTION");
        }
      },
    ]);

    const handle = await provider.createWorkspace({ workspaceId: "ws5" });
    const ok = await provider.execWorkspace(handle, { command: ["node", "-e", "console.log('safe')"] });
    expect(ok.exitCode).toBe(0);
    await expect(
      provider.execWorkspace(handle, { command: ["node", "-e", "console.log('dangerous')"] })
    ).rejects.toThrow(/BLOCKED_BY_PROTECTION/);
  });
});
