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
});
