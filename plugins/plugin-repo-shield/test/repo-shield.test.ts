/**
 * Contract tests for the Repo Shield protection plugin.
 *
 * The core guarantee: destructive operations are vetoed BEFORE execution,
 * via both the Protection capability and the before-execution event chain.
 */
import { describe, expect, it } from "vitest";
import { repoShieldPlugin } from "../src/index.js";

type ProtectionProviderShaped = {
  name: string;
  contractVersion: string;
  health(): Promise<{ status: string; message: string }>;
  evaluate(request: { operation: string; target: string; details?: Record<string, unknown> }): Promise<{
    action: "allow" | "block" | "requires-approval";
    reason: string;
  }>;
};

function makeCtx() {
  const registered: { id: string; provider: Record<string, unknown> }[] = [];
  const interventions: unknown[] = [];
  // A real await-chain event bus so the veto is exercised end-to-end.
  const subscribers = new Map<string, ((payload: unknown) => void | Promise<void>)[]>();
  const events = {
    on(name: string, handler: (payload: unknown) => void | Promise<void>) {
      const list = subscribers.get(name) ?? [];
      list.push(handler);
      subscribers.set(name, list);
      return { id: "t", unsubscribe() {} };
    },
    off(name: string, handler: (payload: unknown) => void | Promise<void>) {
      subscribers.set(name, (subscribers.get(name) ?? []).filter((h) => h !== handler));
    },
    async emit(name: string, payload: unknown) {
      if (name === "protection/intervened") interventions.push(payload);
      for (const handler of subscribers.get(name) ?? []) await handler(payload);
    },
  };
  const ctx = {
    pluginId: "repo-shield",
    config: {},
    pluginOptions: () => ({}),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    events,
    permissions: { require: () => {}, approve: async () => "approved" as const },
    services: {
      register: (def: { id: string }, provider: Record<string, unknown>) => {
        registered.push({ id: def.id, provider });
      },
    },
  } as unknown as Parameters<typeof repoShieldPlugin.activate>[0];
  return {
    interventions,
    before: async (payload: { command: string }) => {
      for (const handler of subscribers.get("command/before") ?? []) await handler(payload);
    },
    beforeWrite: async (payload: { path: string }) => {
      for (const handler of subscribers.get("filesystem/before-write") ?? []) await handler(payload);
    },
    provider(): ProtectionProviderShaped {
      repoShieldPlugin.activate(ctx);
      const entry = registered.find((r) => r.id === "protection");
      if (!entry) throw new Error("protection service not registered");
      return entry.provider as unknown as ProtectionProviderShaped;
    },
  };
}

describe("repo-shield protection plugin", () => {
  it("registers the protection service with contract version 1.0.0", () => {
    const h = makeCtx();
    const provider = h.provider();
    expect(provider.name).toBe("repo-shield");
    expect(provider.contractVersion).toBe("1.0.0");
  });

  it("health self-test passes (destructive commands are blocked)", async () => {
    const h = makeCtx();
    const provider = h.provider();
    const health = await provider.health();
    expect(health.status).toBe("healthy");
  });

  it.each([
    "git push --force origin main",
    "git reset --hard HEAD~3",
    "git clean -fd",
    "git branch -D feature",
    "git tag -d v1.0.0",
    "git rebase -i main",
    "rm -rf /",
    "shutdown -h now",
  ])("blocks destructive command: %s", async (command) => {
    const h = makeCtx();
    const provider = h.provider();
    const decision = await provider.evaluate({ operation: "command", target: command });
    expect(decision.action).toBe("block");
  });

  it.each([
    "pnpm test",
    "git status",
    "git commit -m 'docs: update'",
    "node build.js",
  ])("allows safe command: %s", async (command) => {
    const h = makeCtx();
    const provider = h.provider();
    const decision = await provider.evaluate({ operation: "command", target: command });
    expect(decision.action).toBe("allow");
  });

  it("blocks direct .git and .env writes, allows normal files", async () => {
    const h = makeCtx();
    const provider = h.provider();
    expect((await provider.evaluate({ operation: "filesystem.write", target: "/workspace/repo/.git/config" })).action).toBe("block");
    expect((await provider.evaluate({ operation: "filesystem.write", target: "/workspace/repo/.env" })).action).toBe("block");
    expect((await provider.evaluate({ operation: "filesystem.write", target: "/workspace/repo/src/index.ts" })).action).toBe("allow");
  });

  it("requires approval for network egress", async () => {
    const h = makeCtx();
    const provider = h.provider();
    const decision = await provider.evaluate({ operation: "network.egress", target: "registry.npmjs.org" });
    expect(decision.action).toBe("requires-approval");
  });

  it("veto chain: command/before THROWS before execution and records the intervention", async () => {
    const h = makeCtx();
    h.provider(); // activate subscribers
    await expect(h.before({ command: "git push --force origin main" })).rejects.toThrow(/PROTECTION_BLOCKED/);
    expect(h.interventions.length).toBe(1);
  });

  it("veto chain: safe commands pass through without intervention", async () => {
    const h = makeCtx();
    h.provider();
    await expect(h.before({ command: "pnpm test" })).resolves.toBeUndefined();
    expect(h.interventions.length).toBe(0);
  });

  it("veto chain: filesystem/before-write blocks .env writes before bytes hit the disk", async () => {
    const h = makeCtx();
    h.provider();
    await expect(h.beforeWrite({ path: "/workspace/repo/.env" })).rejects.toThrow(/PROTECTION_BLOCKED/);
  });
});
