import { describe, expect, it } from "vitest";
import { defineService } from "@proagents/contracts";
import { definePlugin, WorkspaceClient } from "../src/index.js";

const runtimeDefinition = defineService<{ ping(): string }>({
  id: "runtime",
  contractVersion: "1.0.0",
});

const demoPlugin = definePlugin({
  manifest: {
    id: "local",
    name: "Local runtime",
    version: "0.1.0",
    capabilities: ["runtime"],
    dependencies: [],
    permissions: [],
    compatibility: { workspaceApi: "^1.0.0" },
  },
  activate(ctx) {
    ctx.services.register(runtimeDefinition, { ping: () => "pong" }, "local");
  },
  health: async () => ({ status: "healthy", message: "ok" }),
});

function client(): WorkspaceClient {
  return new WorkspaceClient({
    config: {
      runtime: { provider: "local" },
      plugins: [{ id: "local" }],
      approval: { mode: "autonomous" },
    },
    plugins: [demoPlugin],
  });
}

describe("WorkspaceClient", () => {
  it("boots a workspace and reaches ready", async () => {
    const ws = await client().start();
    expect(ws.lifecycle.current).toBe("ready");
    await ws.events.emit("workspace/started", { workspaceId: ws.id });
  });

  it("exposes capabilities only through the service registry", async () => {
    const runtime = await client().service(runtimeDefinition);
    expect(runtime.ping()).toBe("pong");
  });

  it("reports plugin and service lists", async () => {
    const c = client();
    expect(await c.pluginList()).toEqual([
      { id: "local", version: "0.1.0", capabilities: ["runtime"] },
    ]);
    const services = await c.serviceList();
    expect(services).toEqual([
      { id: "runtime", contractVersion: "1.0.0", pluginId: "local", capability: "runtime" },
    ]);
  });

  it("aggregates doctor health", async () => {
    const report = await client().doctor();
    expect(report[0]?.health.status).toBe("healthy");
  });

  it("stops cleanly and can restart", async () => {
    const c = client();
    await c.start();
    await c.stop();
    const ws = await c.start();
    expect(ws.lifecycle.current).toBe("ready");
  });
});

describe("WorkspaceClient.validateConfig", () => {
  it("accepts a valid config without booting", () => {
    const result = WorkspaceClient.validateConfig({ runtime: { provider: "docker", image: "node:22" } });
    expect(result.ok).toBe(true);
  });

  it("reports actionable issues for invalid config", () => {
    const result = WorkspaceClient.validateConfig({ runtime: {} });
    expect(result.ok).toBe(false);
    expect(result.issues?.[0]).toContain("runtime.provider");
  });
});
