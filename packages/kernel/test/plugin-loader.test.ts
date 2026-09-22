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

  it("activates bundled (implicit) plugins whose provider value the config references", async () => {
    // The defect regression: a catalog plugin declaring provider: "local"
    // must be pulled in by runtime.provider: "local" — previously config
    // provider values ("local") were compared to plugin ids ("runtime-local").
    const loader = new PluginLoader();
    const activated: string[] = [];
    loader.add("runtime-local", () =>
      plugin({ id: "runtime-local", provider: "local", capabilities: ["runtime"] }, activated), { implicit: true });
    loader.add("filesystem", () =>
      plugin({ id: "filesystem", provider: "filesystem", capabilities: ["filesystem"] }, activated), { implicit: true });
    loader.add("shell", () =>
      plugin({ id: "shell", provider: "shell", capabilities: ["shell"] }, activated), { implicit: true });
    const plan = await loader.resolve({
      runtime: { provider: "local" },
      repository: undefined,
      tools: ["shell", "filesystem"],
    } as never);
    // resolve() builds the activation plan; activation itself is the
    // Workspace's job — a matching provider value is enough to select it.
    expect(plan.map((p) => p.manifest.id).sort()).toEqual(["filesystem", "runtime-local", "shell"]);
  });

  it("does not activate bundled plugins the config does not reference", async () => {
    const loader = new PluginLoader();
    loader.add("repo-shield", () => plugin({ id: "repo-shield", provider: "repo-shield", capabilities: ["protection"] }), { implicit: true });
    const plan = await loader.resolve({
      runtime: { provider: "local" },
      repository: undefined,
      tools: [],
    } as never);
    expect(plan.map((p) => p.manifest.id)).toEqual([]);
  });

  it("defaults the provider value to the plugin id when absent", async () => {
    const loader = new PluginLoader();
    const activated: string[] = [];
    // Legacy plugin without a provider field is referenced by its id.
    loader.add("legacy-runtime", () => plugin({ id: "legacy-runtime", capabilities: ["runtime"] }, activated), { implicit: true });
    const plan = await loader.resolve({
      runtime: { provider: "legacy-runtime" },
      repository: undefined,
      tools: [],
    } as never);
    expect(plan.map((p) => p.manifest.id)).toEqual(["legacy-runtime"]);
  });

  it("skips bundled plugins with an invalid manifest instead of crashing the workspace", async () => {
    const loader = new PluginLoader();
    const bad = { ...plugin({ id: "broken" }), manifest: { id: "broken", name: "broken" } as PluginManifest };
    loader.add("broken", () => bad, { implicit: true });
    loader.add("good", () => plugin({ id: "good", capabilities: ["tool"] }, []), { implicit: true });
    const plan = await loader.resolve({
      runtime: { provider: "local" },
      repository: undefined,
      tools: ["tool"],
    } as never);
    expect(plan.map((p) => p.manifest.id)).toEqual(["good"]);
  });

  it("still fails explicitly declared plugins with an invalid manifest", async () => {
    const loader = new PluginLoader();
    const bad = { ...plugin({ id: "broken" }), manifest: { id: "broken", name: "broken" } as PluginManifest };
    loader.add("broken", () => bad);
    await expect(
      loader.resolve(configWith([{ id: "broken" }]) as never)
    ).rejects.toMatchObject({ code: "PLUGIN_MANIFEST_INVALID" });
  });
});
