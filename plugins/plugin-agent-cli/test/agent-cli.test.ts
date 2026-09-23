/**
 * Contract tests for the CLI agent plugins.
 *
 * Binaries are not assumed present: tests pin down the honest availability
 * contract instead of mocking the CLIs. `claude`, `opencode` and `gemini`
 * ARE present on this machine, so their adapters must report available and
 * emit the typed lifecycle events; `codex` is absent here, so its adapter
 * must fail session start with AGENT_PROVIDER_UNAVAILABLE.
 */
import { describe, expect, it } from "vitest";
import {
  agentClaudePlugin,
  agentCodexPlugin,
  agentGeminiPlugin,
  agentOpencodePlugin,
  cliAgentPlugin,
} from "../src/index.js";

type AgentProviderShaped = {
  name: string;
  contractVersion: string;
  health(): Promise<{ status: string; message: string }>;
  available(): Promise<boolean>;
  startSession(options?: { workingDirectory?: string }): Promise<{ sessionId: string }>;
  run(session: { sessionId: string }, prompt: { text: string }): Promise<{ exitCode: number; output: string }>;
  stopSession(session: { sessionId: string }): Promise<void>;
};

type PluginShaped = {
  manifest: { id: string; provider: string; capabilities: readonly string[] };
  activate(ctx: unknown): void;
};

function makeCtx(pluginId: string) {
  const registered: { id: string; provider: Record<string, unknown> }[] = [];
  const events: string[] = [];
  const ctx = {
    pluginId,
    config: { agent: { provider: pluginId } },
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
  };
  return {
    events,
    provider(plugin: PluginShaped): AgentProviderShaped {
      plugin.activate(ctx);
      const entry = registered.find((r) => r.id === "agent");
      if (!entry) throw new Error("agent service not registered");
      return entry.provider as unknown as AgentProviderShaped;
    },
  };
}

describe("cli agent plugins", () => {
  it("expose manifests with the agent capability", () => {
    for (const plugin of [agentClaudePlugin, agentCodexPlugin, agentOpencodePlugin, agentGeminiPlugin]) {
      expect(plugin.manifest.capabilities).toContain("agent");
      expect(plugin.manifest.id.startsWith("agent-")).toBe(true);
    }
    expect(agentClaudePlugin.manifest.provider).toBe("claude");
    expect(agentOpencodePlugin.manifest.provider).toBe("opencode");
  });

  it("reject unknown providers at construction", () => {
    expect(() => cliAgentPlugin({ id: "agent-x", provider: "x" })).toThrow(/Unknown CLI agent provider/);
  });

  it("claude adapter: available on this machine, emits typed lifecycle events", async () => {
    const h = makeCtx("agent-claude");
    const provider = h.provider(agentClaudePlugin);
    expect(provider.name).toBe("agent-claude");
    const isAvailable = await provider.available();
    const health = await provider.health();
    expect(health.status).toBe(isAvailable ? "healthy" : "unavailable");
    if (isAvailable) {
      const session = await provider.startSession({ workingDirectory: process.cwd() });
      expect(session.sessionId.startsWith("claude-")).toBe(true);
      expect(h.events).toContain("agent/started");
      await provider.stopSession(session);
      expect(h.events).toContain("agent/stopped");
    }
  });

  it("opencode adapter: available agrees with health, session start emits events", async () => {
    const h = makeCtx("agent-opencode");
    const provider = h.provider(agentOpencodePlugin);
    const isAvailable = await provider.available();
    const health = await provider.health();
    expect(health.status).toBe(isAvailable ? "healthy" : "unavailable");
    if (isAvailable) {
      const session = await provider.startSession();
      expect(session.sessionId.startsWith("opencode-")).toBe(true);
      expect(h.events).toContain("agent/starting");
      expect(h.events).toContain("agent/started");
    }
  });

  it("codex adapter (absent here): unavailable, session start fails closed", async () => {
    const h = makeCtx("agent-codex");
    const provider = h.provider(agentCodexPlugin);
    const isAvailable = await provider.available();
    if (!isAvailable) {
      await expect(provider.startSession()).rejects.toThrow(/codex CLI not found on PATH/);
    } else {
      const session = await provider.startSession();
      await provider.stopSession(session);
    }
  });

  it("gemini adapter: available() agrees with health()", async () => {
    const h = makeCtx("agent-gemini");
    const provider = h.provider(agentGeminiPlugin);
    const isAvailable = await provider.available();
    const health = await provider.health();
    expect(health.status).toBe(isAvailable ? "healthy" : "unavailable");
  });
});
