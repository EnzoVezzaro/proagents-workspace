import { describe, expect, it } from "vitest";
import type { PluginManifest } from "@proagents/contracts";
import { PluginLoader, type PluginContext, type WorkspacePlugin } from "../src/plugin-loader.js";

function manifest(overrides: Partial<PluginManifest>): PluginManifest {
  return {
    id: "p",
    name: "P",
    version: "0.1.0",
    capabilities: ["tool"],
    dependencies: [],
    permissions: [],
    compatibility: {},
    ...overrides,
  } as PluginManifest;
}

function plugin(overrides: Partial<PluginManifest>, activated?: string[]): WorkspacePlugin {
  return {
    manifest: manifest(overrides),
    activate(_ctx: PluginContext) {
      activated?.push(overrides.id ?? "p");
    },
  };
}

function configWith(plugins: { id: string }[]): Record<string, unknown> {
  return {
    runtime: { provider: "local" },
    plugins: plugins.map((p) => ({ id: p.id })),
  };
}

describe("PluginLoader", () => {
  it("activates in dependency order (dependencies before dependents)", async () => {
    const loader = new PluginLoader();
    const activated: string[] = [];
    loader.add("a", () => plugin({ id: "a", dependencies: ["b"] }, activated));
    loader.add("b", () => plugin({ id: "b" }, activated));
    const plan = await loader.resolve(configWith([{ id: "a" }, { id: "b" }]) as never);
    expect(plan.map((p) => p.manifest.id)).toEqual(["b", "a"]);
  });

  it("rejects dependency cycles", async () => {
    const loader = new PluginLoader();
    loader.add("a", () => plugin({ id: "a", dependencies: ["b"] }));
    loader.add("b", () => plugin({ id: "b", dependencies: ["a"] }));
    await expect(
      loader.resolve(configWith([{ id: "a" }, { id: "b" }]) as never)
    ).rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_CYCLE" });
  });

  it("rejects missing dependencies", async () => {
    const loader = new PluginLoader();
    loader.add("a", () => plugin({ id: "a", dependencies: ["ghost"] }));
    await expect(
      loader.resolve(configWith([{ id: "a" }]) as never)
    ).rejects.toMatchObject({ code: "PLUGIN_DEPENDENCY_MISSING" });
  });

  it("rejects workspace API incompatibility", async () => {
    const loader = new PluginLoader();
    loader.add("old", () => plugin({ id: "old", compatibility: { workspaceApi: "^9.0.0" } }));
    await expect(
      loader.resolve(configWith([{ id: "old" }]) as never)
    ).rejects.toMatchObject({ code: "PLUGIN_INCOMPATIBLE" });
  });

  it("fails declared-but-unregistered plugins with a load error", async () => {
    const loader = new PluginLoader();
    await expect(
      loader.resolve(configWith([{ id: "nope" }]) as never)
    ).rejects.toMatchObject({ code: "PLUGIN_LOAD_FAILED" });
  });
});
