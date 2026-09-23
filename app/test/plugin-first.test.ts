/**
 * Plugin-first architecture tests (spec section 146): the product layer must
 * derive agent kinds and harness launch commands from the PLUGIN CATALOG's
 * runtime descriptors — never from a hard-coded table. These tests pin the
 * derivation: if someone reintroduces an agent-kind→binary switch, this file
 * fails.
 */
import { describe, expect, it } from "vitest";
import { bundledPlugins } from "../src/plugins.js";
import { agentKinds } from "../src/routes.js";

describe("plugin-first agent-kind derivation (spec section 146)", () => {
  it("derives agent kinds from plugin manifest runtime descriptors, not a table", async () => {
    const { kinds } = await agentKinds();
    // Agent AND harness adapter plugins with a process runtime contribute
    // launchable kinds, deduped by kind (codex has both).
    const expected = [...new Set(
      bundledPlugins()
        .filter((p) => p.manifest.runtime?.kind === "process"
          && (p.manifest.capabilities.includes("agent") || p.manifest.capabilities.includes("harness")))
        .map((p) => p.manifest.provider ?? p.manifest.id.replace(/^agent-/, "")),
    )].sort();
    expect(kinds.map((k) => k.kind).sort()).toEqual(expected);
    // Every kind's binary comes from the descriptor.
    for (const kind of kinds) {
      const plugin = bundledPlugins().find(
        (p) => (p.manifest.provider ?? p.manifest.id.replace(/^agent-/, "")) === kind.kind
          && p.manifest.runtime?.kind === "process",
      );
      expect(kind.bin).toBe(plugin?.manifest.runtime?.command);
    }
  });

  it("dedupes kinds across agent + harness plugins and lists adapters", async () => {
    const { kinds } = await agentKinds();
    // One row per KIND even when several plugins provide it (codex ships an
    // agent plugin and a harness adapter sharing the provider value).
    const kindSet = kinds.map((k) => k.kind);
    expect(new Set(kindSet).size).toBe(kindSet.length);
    const codex = kinds.find((k) => k.kind === "codex");
    expect(codex).toBeDefined();
    expect(codex?.adapters.length).toBeGreaterThanOrEqual(1);
    expect(codex?.bin).toBe("codex");
  });

  it("reports honest availability per declared command", async () => {
    const { kinds } = await agentKinds();
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of kinds) {
      expect(typeof k.installed).toBe("boolean");
      expect(k.bin.length).toBeGreaterThan(0);
    }
  });

  it("every launchable plugin declares kind=process with a command (descriptor completeness)", () => {
    const agents = bundledPlugins().filter((p) => p.manifest.capabilities.includes("agent"));
    for (const p of agents) {
      // Either a full process descriptor (launchable) or deliberately not
      // launchable — but never a descriptor-less process plugin that would
      // force consumers to hard-code knowledge about it.
      if (p.manifest.runtime?.kind === "process") {
        expect(p.manifest.runtime.command, `${p.manifest.id} missing runtime.command`).toBeTruthy();
      }
    }
  });
});
