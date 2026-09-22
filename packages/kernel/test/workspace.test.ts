import { describe, expect, it } from "vitest";
import { defineService, type ProviderHealth } from "@proagents/contracts";
import { Workspace, type DiscoveredFactory } from "../src/workspace.js";
import type { PluginContext, WorkspacePlugin } from "../src/plugin-loader.js";

interface FakeRuntime {
  ping(): string;
}
const runtimeDefinition = defineService<FakeRuntime>({ id: "runtime", contractVersion: "1.0.0" });

function fakeRuntimePlugin(health?: ProviderHealth): { factory: DiscoveredFactory; registered: () => boolean } {
  let registered = false;
  const plugin: WorkspacePlugin = {
    manifest: {
      id: "local",
      name: "Local runtime",
      version: "0.1.0",
      capabilities: ["runtime"],
      dependencies: [],
      permissions: [],
      compatibility: { workspaceApi: "^1.0.0" },
    },
    activate(ctx: PluginContext) {
      ctx.services.register(runtimeDefinition, { ping: () => "pong" }, "local");
      registered = true;
    },
    ...(health ? { health: async () => health } : {}),
  };
  return { factory: { source: "local", load: () => plugin }, registered: () => registered };
}

function workspaceConfig(): unknown {
  return {
    runtime: { provider: "local" },
    plugins: [{ id: "local" }],
    approval: { mode: "autonomous" },
  };
}

describe("Workspace", () => {
  it("validates configuration at the boundary", async () => {
    await expect(
      Workspace.create({ config: { runtime: { provider: "" } } }, [])
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("activates plugins, registers services, and reaches ready", async () => {
    const { factory, registered } = fakeRuntimePlugin();
    const ws = await Workspace.create({ config: workspaceConfig() }, [factory]);
    await ws.initialize();
    expect(ws.lifecycle.current).toBe("ready");
    expect(registered()).toBe(true);
    const runtime = ws.services.get(runtimeDefinition);
    expect(runtime.ping()).toBe("pong");
    expect(ws.pluginIds).toEqual(["local"]);
  });

  it("resolves services through the registry, never direct instantiation", async () => {
    const { factory } = fakeRuntimePlugin();
    const ws = await Workspace.create({ config: workspaceConfig() }, [factory]);
    await ws.initialize();
    // The service is not reachable until registered by the plugin activation.
    expect(ws.services.has(runtimeDefinition)).toBe(true);
  });

  it("emits lifecycle events around initialization", async () => {
    const { factory } = fakeRuntimePlugin();
    const ws = await Workspace.create({ config: workspaceConfig() }, [factory]);
    const seen: string[] = [];
    ws.events.on("workspace/initializing", () => seen.push("initializing"));
    ws.events.on("workspace/ready", () => seen.push("ready"));
    await ws.initialize();
    expect(seen).toEqual(["initializing", "ready"]);
  });

  it("aggregates plugin health for paw doctor", async () => {
    const { factory } = fakeRuntimePlugin({
      status: "healthy",
      message: "local runtime ok",
    });
    const ws = await Workspace.create({ config: workspaceConfig() }, [factory]);
    await ws.initialize();
    const report = await ws.doctor();
    expect(report).toEqual([
      { pluginId: "local", health: { status: "healthy", message: "local runtime ok" } },
    ]);
  });

  it("shuts down in reverse activation order", async () => {
    const order: string[] = [];
    const make = (id: string, deps: string[]): DiscoveredFactory => ({
      source: id,
      load: () => ({
        manifest: {
          id,
          name: id,
          version: "0.1.0",
          capabilities: ["tool"],
          dependencies: deps,
          permissions: [],
          compatibility: {},
        },
        activate: () => order.push(`activate:${id}`),
        deactivate: () => order.push(`deactivate:${id}`),
      }),
    });
    const ws = await Workspace.create(
      { config: { runtime: { provider: "local" }, plugins: [{ id: "a" }, { id: "b" }] } },
      [make("a", ["b"]), make("b", [])]
    );
    await ws.initialize();
    await ws.shutdown();
    expect(order).toEqual(["activate:b", "activate:a", "deactivate:a", "deactivate:b"]);
  });

  it("rejects an unsatisfiable declared workspaceApi (CONFIG_VERSION_UNSUPPORTED)", async () => {
    await expect(
      Workspace.create({ config: { ...workspaceConfig(), workspaceApi: "^2.0.0" } }, [])
    ).rejects.toMatchObject({ code: "CONFIG_VERSION_UNSUPPORTED" });
  });

  it("accepts a satisfiable declared workspaceApi", async () => {
    const { factory } = fakeRuntimePlugin();
    const ws = await Workspace.create({ config: { ...workspaceConfig(), workspaceApi: "^1.0.0" } }, [factory]);
    await ws.initialize();
    expect(ws.lifecycle.current).toBe("ready");
  });

  it("unwinds already-activated plugins when a later activation fails (spec section 60)", async () => {
    const order: string[] = [];
    const ok = (id: string): DiscoveredFactory => ({
      source: id,
      load: () => ({
        manifest: {
          id,
          name: id,
          version: "0.1.0",
          capabilities: ["tool"],
          dependencies: [],
          permissions: [],
          compatibility: {},
        },
        activate() {
          order.push(`activate:${id}`);
        },
        deactivate() {
          order.push(`deactivate:${id}`);
        },
      }),
    });
    const boom: DiscoveredFactory = {
      source: "boom",
      load: () => ({
        manifest: {
          id: "boom",
          name: "boom",
          version: "0.1.0",
          capabilities: ["tool"],
          dependencies: [],
          permissions: [],
          compatibility: {},
        },
        activate() {
          order.push("activate:boom");
          throw new Error("activation exploded");
        },
      }),
    };
    const ws = await Workspace.create(
      { config: { runtime: { provider: "local" }, plugins: [{ id: "a" }, { id: "boom" }] } },
      [ok("a"), boom]
    );
    const errors: unknown[] = [];
    ws.events.on("workspace/error", (p) => errors.push(p));
    await expect(ws.initialize()).rejects.toThrow("activation exploded");
    // The surviving plugin was deactivated in reverse order.
    expect(order).toEqual(["activate:a", "activate:boom", "deactivate:a"]);
    expect(ws.lifecycle.current).toBe("error");
    expect(errors).toHaveLength(1);
    // shutdown() after a failed initialize() is a safe no-op.
    await expect(ws.shutdown()).resolves.toBeUndefined();
  });

  it("shutdown() is idempotent and never double-deactivates", async () => {
    let deactivated = 0;
    const factory: DiscoveredFactory = {
      source: "local",
      load: () => ({
        manifest: {
          id: "local",
          name: "local",
          version: "0.1.0",
          capabilities: ["tool"],
          dependencies: [],
          permissions: [],
          compatibility: {},
        },
        activate() {},
        deactivate() {
          deactivated += 1;
        },
      }),
    };
    const ws = await Workspace.create(
      { config: { runtime: { provider: "local" }, plugins: [{ id: "local" }] } },
      [factory]
    );
    await ws.initialize();
    await ws.shutdown();
    await ws.shutdown();
    expect(deactivated).toBe(1);
    expect(ws.lifecycle.current).toBe("stopped");
  });
});
