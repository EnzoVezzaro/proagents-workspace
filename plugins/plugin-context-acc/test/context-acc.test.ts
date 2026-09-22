/**
 * Contract tests for the ACC context plugin (temporary .acc pack fixture).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { accContextPlugin } from "../src/index.js";

type ContextProviderShaped = {
  name: string;
  contractVersion: string;
  health(): Promise<{ status: string; message: string }>;
  index(paths?: readonly string[]): Promise<void>;
  query(request: { text: string; limit?: number }): Promise<{
    provider: string;
    entries: readonly { id: string; path: string; summary: string }[];
  }>;
  inspect(): Promise<{ provider: string; entries: readonly { id: string; path: string; summary: string }[] }>;
};

function makeCtx(config: unknown, root: string) {
  const registered: { id: string; provider: Record<string, unknown> }[] = [];
  const events: string[] = [];
  const ctx = {
    pluginId: "context-acc",
    config,
    pluginOptions: () => ({ root }),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    events: {
      on: () => ({ id: "t", unsubscribe() {} }),
      off: () => {},
      emit: async (name: string) => {
        events.push(name);
      },
    },
    permissions: { require: () => {}, approve: async () => "approved" as const },
    services: {
      register: (def: { id: string }, provider: Record<string, unknown>) => {
        registered.push({ id: def.id, provider });
      },
    },
  } as unknown as Parameters<typeof accContextPlugin.activate>[0];
  return {
    events,
    provider(): ContextProviderShaped {
      accContextPlugin.activate(ctx);
      const entry = registered.find((r) => r.id === "context");
      if (!entry) throw new Error("context service not registered");
      return entry.provider as unknown as ContextProviderShaped;
    },
  };
}

describe("acc context plugin", () => {
  const root = mkdtempSync(path.join(tmpdir(), "paw-acc-"));

  beforeAll(() => {
    mkdirSync(path.join(root, ".acc/config/workflows"), { recursive: true });
    mkdirSync(path.join(root, ".acc/config/standards"), { recursive: true });
    writeFileSync(
      path.join(root, ".acc/config/standards/security.md"),
      "# Security Model\n\nDeclarative permissions and approval policies apply.\n"
    );
    writeFileSync(
      path.join(root, ".acc/config/workflows/release.md"),
      "# Release Checklist\n\nRun the full verification gate before tagging.\n"
    );
    writeFileSync(path.join(root, ".acc/notes.txt"), "ignored: wrong extension\n");
  });

  it("registers the context service with contract version 1.0.0", () => {
    const h = makeCtx({ context: { providers: ["acc"] } }, root);
    const provider = h.provider();
    expect(provider.name).toBe("context-acc");
    expect(provider.contractVersion).toBe("1.0.0");
  });

  it("health is healthy when .acc/ exists, degraded when missing", async () => {
    const h = makeCtx({ context: { providers: ["acc"] } }, root);
    const provider = h.provider();
    const health = await provider.health();
    expect(health.status).toBe("healthy");

    const empty = makeCtx({ context: { providers: ["acc"] } }, path.join(root, "empty"));
    const provider2 = empty.provider();
    const health2 = await provider2.health();
    expect(health2.status).toBe("degraded");
    expect(health2.message).toMatch(/not found/);
  });

  it("indexes only documentation extensions under .acc/", async () => {
    const h = makeCtx({ context: { providers: ["acc"] } }, root);
    const provider = h.provider();
    await provider.index();
    const pack = await provider.inspect();
    const ids = pack.entries.map((e) => e.id);
    expect(ids).toContain(path.join(".acc", "config", "standards", "security.md"));
    expect(ids.some((id) => id.endsWith("notes.txt"))).toBe(false);
    expect(h.events).toContain("context/indexed");
  });

  it("ranks queries by term matches over path + summary", async () => {
    const h = makeCtx({ context: { providers: ["acc"] } }, root);
    const provider = h.provider();
    await provider.index();
    const pack = await provider.query({ text: "security permissions", limit: 2 });
    expect(pack.entries.length).toBeGreaterThan(0);
    expect(pack.entries[0]?.path).toMatch(/security\.md$/);
  });

  it("query with no matches returns an empty entry list, not an error", async () => {
    const h = makeCtx({ context: { providers: ["acc"] } }, root);
    const provider = h.provider();
    await provider.index();
    const pack = await provider.query({ text: "zzz-quantum-flux" });
    expect(pack.entries).toEqual([]);
  });
});
