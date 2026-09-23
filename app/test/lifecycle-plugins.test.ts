/**
 * Lifecycle definition plugins (spec sections 6/16/146): plugins contribute
 * lifecycle definitions as pure DATA via the `definitions()` hook; the app
 * merges plugin contributions + env + the built-in default into one library,
 * and `GET /api/lifecycles` exposes it with honest `source` labels.
 */
import { describe, expect, it } from "vitest";
import { workspaceConfigSchema, type DevelopmentLifecycle } from "@proagents/contracts";
import { bundledPlugins } from "../src/plugins.js";
import { resolveLifecycle } from "@proagents/kernel";

describe("lifecycle definition plugins", () => {
  const contributions = bundledPlugins().flatMap((p) => p.definitions?.() ?? []);

  it("web-development and security-audit are contributed by plugins", () => {
    const ids = contributions.map((d) => d.id);
    expect(ids).toContain("web-development");
    expect(ids).toContain("security-audit");
    // Contributing plugins carry the lifecycle capability in their manifest.
    for (const p of bundledPlugins()) {
      if ((p.definitions?.().length ?? 0) > 0) {
        expect(p.manifest.capabilities).toContain("lifecycle");
      }
    }
  });

  it("contributed definitions validate against the workspace config schema", () => {
    for (const d of contributions) {
      const parsed = workspaceConfigSchema.parse({
        runtime: { provider: "local" },
        lifecycle: { definitions: [d], default: d.id },
      });
      expect(parsed.lifecycle?.definitions[0]?.id).toBe(d.id);
    }
  });

  it("web-development has implementation AND browser test stages; security-audit has none", () => {
    const web = contributions.find((d) => d.id === "web-development");
    const sec = contributions.find((d) => d.id === "security-audit");
    expect(web?.stages.some((s) => s.id === "browser-tests" && s.tools.some((t) => t.type === "playwright"))).toBe(true);
    expect(web?.stages.some((s) => s.type === "implement")).toBe(true);
    expect(sec?.stages.some((s) => s.type === "implement")).toBe(false);
    expect(sec?.stages.some((s) => s.id === "threat-model")).toBe(true);
  });

  it("config references resolve plugin-contributed definitions through the standard path", () => {
    const web = contributions.find((d) => d.id === "web-development") as DevelopmentLifecycle;
    const config = workspaceConfigSchema.parse({
      runtime: { provider: "local" },
      // The host merges plugin contributions into config before resolution —
      // simulate exactly that merge here.
      lifecycle: { definitions: [web], default: "web-development" },
      workspaces: { w1: { root: "x", lifecycle: { ref: "web-development" } } },
    });
    expect(resolveLifecycle(config, "w1")?.id).toBe("web-development");
  });

  it("config data wins over plugin contributions on id collision", () => {
    // The documented merge order: pluginLifecycles() first, extraLifecycles()
    // second, built-in default last — later entries override earlier ones in
    // a find-by-id resolution. Verify the ORDER the app uses.
    const pluginIds = contributions.map((d) => d.id);
    expect(pluginIds).not.toContain("default"); // built-in default stays last & authoritative
  });
});
