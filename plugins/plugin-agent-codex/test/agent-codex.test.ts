/**
 * Contract tests for the codex agent plugin.
 *
 * The codex binary is not assumed present: tests pin down the honest
 * availability contract instead of mocking the CLI.
 */
import { describe, expect, it } from "vitest";
import { codexAgentPlugin } from "../src/index.js";

type AgentProviderShaped = {
  name: string;
  contractVersion: string;
  health(): Promise<{ status: string; message: string }>;
  available(): Promise<boolean>;
  startSession(options?: { workingDirectory?: string }): Promise<{ sessionId: string }>;
};

function makeCtx(config: unknown) {
  const registered: { id: string; provider: Record<string, unknown> }[] = [];
  const events: string[] = [];
  const ctx = {
    pluginId: "agent-codex",
    config,
    pluginOptions: () => ({}),
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
  } as unknown as Parameters<typeof codexAgentPlugin.activate>[0];
  return {
    events,
    provider(): AgentProviderShaped {
      codexAgentPlugin.activate(ctx);
      const entry = registered.find((r) => r.id === "agent");
      if (!entry) throw new Error("agent service not registered");
      return entry.provider as unknown as AgentProviderShaped;
    },
  };
}

describe("codex agent plugin", () => {
  it("registers the agent service with contract version 1.0.0", () => {
    const h = makeCtx({ agent: { provider: "codex" } });
    const provider = h.provider();
    expect(provider.name).toBe("agent-codex");
    expect(provider.contractVersion).toBe("1.0.0");
  });

  it("available() agrees with health() — no silent degradation", async () => {
    const h = makeCtx({ agent: { provider: "codex" } });
    const provider = h.provider();
    const isAvailable = await provider.available();
    const health = await provider.health();
    if (isAvailable) {
      expect(health.status).toBe("healthy");
    } else {
      expect(health.status).toBe("unavailable");
      expect(health.message).toMatch(/codex CLI not found/);
    }
  });

  it("startSession fails with AGENT_PROVIDER_UNAVAILABLE when codex is missing", async () => {
    const h = makeCtx({ agent: { provider: "codex" } });
    const provider = h.provider();
    if (await provider.available()) return; // codex installed: skip the failure path
    await expect(provider.startSession()).rejects.toThrow(/codex CLI not found/);
  });

  it("startSession emits agent lifecycle events when available", async () => {
    const h = makeCtx({ agent: { provider: "codex" } });
    const provider = h.provider();
    if (!(await provider.available())) return; // availability-dependent test
    const session = await provider.startSession();
    expect(session.sessionId).toMatch(/^codex-/);
    expect(h.events).toContain("agent/started");
  });
});
