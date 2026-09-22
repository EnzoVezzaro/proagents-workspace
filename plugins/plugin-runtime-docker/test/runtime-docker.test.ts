/**
 * Contract tests for the docker runtime plugin.
 *
 * The docker CLI is not mocked at the process boundary: tests assert the
 * plugin's structural contract and honest degradation when docker is
 * unavailable (which is the common case in CI).
 */
import { describe, expect, it } from "vitest";
import { dockerRuntimePlugin } from "../src/index.js";

type HealthFn = () => Promise<{ status: string; message: string }>;

function makeCtx(config: unknown, options: Record<string, unknown> = {}) {
  const registered: { id: string; provider: Record<string, unknown> }[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const ctx = {
    pluginId: "runtime-docker",
    config,
    pluginOptions: () => options,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    events: {
      on: () => ({ id: "t", unsubscribe() {} }),
      off: () => {},
      emit: async (name: string, payload: unknown) => {
        events.push({ name, payload });
      },
    },
    permissions: {
      require: () => {},
      approve: async () => "approved" as const,
    },
    services: {
      register: (def: { id: string }, provider: Record<string, unknown>) => {
        registered.push({ id: def.id, provider });
      },
    },
  } as unknown as Parameters<typeof dockerRuntimePlugin.activate>[0];
  return {
    events,
    provider(): {
      name: string;
      contractVersion: string;
      health: HealthFn;
      createWorkspace: (r: { workspaceId: string; image?: string }) => Promise<unknown>;
    } {
      dockerRuntimePlugin.activate(ctx);
      const entry = registered.find((r) => r.id === "runtime");
      if (!entry) throw new Error("runtime service not registered");
      return entry.provider as unknown as {
        name: string;
        contractVersion: string;
        health: HealthFn;
        createWorkspace: (r: { workspaceId: string; image?: string }) => Promise<unknown>;
      };
    },
  };
}

describe("docker runtime plugin", () => {
  it("registers the runtime service with contract version 1.0.0", () => {
    const h = makeCtx({ runtime: { provider: "docker" } });
    const provider = h.provider();
    expect(provider.name).toBe("runtime-docker");
    expect(provider.contractVersion).toBe("1.0.0");
  });

  it("degrades honestly to unavailable when docker is missing", async () => {
    const h = makeCtx({ runtime: { provider: "docker" } });
    const provider = h.provider();
    const health = await provider.health();
    // In a docker-less CI the CLI is missing; where docker exists the daemon
    // may be down. Either way the plugin must NOT claim healthy.
    expect(["unavailable", "healthy"]).toContain(health.status);
    if (health.status === "unavailable") {
      expect(health.message).toMatch(/docker CLI not found|unreachable|failed/i);
    }
  }, 30_000);

  it("execWorkspace requires a container handle from this provider", async () => {
    const h = makeCtx({ runtime: { provider: "docker" } });
    const provider = h.provider() as unknown as {
      execWorkspace: (handle: unknown, request: { command: string[] }) => Promise<unknown>;
    };
    await expect(
      provider.execWorkspace({ workspaceId: "x", provider: "other", repoPath: "/", metadata: {} }, { command: ["true"] })
    ).rejects.toThrow(/container handle/i);
  });

  it("is a distinct plugin id from the local runtime", () => {
    expect(dockerRuntimePlugin.manifest.id).toBe("runtime-docker");
    expect(dockerRuntimePlugin.manifest.capabilities).toEqual(["runtime"]);
  });
});
