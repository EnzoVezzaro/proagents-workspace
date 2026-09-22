/**
 * Contract tests for the git repository plugin.
 *
 * Focus: the conservative guard defaults (spec section 35) — destructive
 * operations are blocked unless explicitly enabled, and allowed operations
 * pass the approval gate.
 */
import { describe, expect, it } from "vitest";
import { gitPlugin } from "../src/index.js";
import { DEFAULT_GIT_GUARDS } from "@proagents/workspace";

type GuardFn = (
  operation: "push" | "branch" | "tag" | "remote" | "history-rewrite",
  options?: { force?: boolean; delete?: boolean }
) => { allowed: boolean; reason?: string };

type PushFn = (request: { path: string; force: boolean }) => Promise<{ pushedTo: string }>;

function makeCtx(config: unknown) {
  const registered: { id: string; provider: Record<string, unknown> }[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const approvals: { operation: string }[] = [];
  const permissionDecisions: ("approved" | "denied")[] = [];
  const ctx = {
    pluginId: "git",
    config,
    pluginOptions: () => ({}),
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
      approve: async (request: { operation: string }) => {
        approvals.push({ operation: request.operation });
        return permissionDecisions.length > 0 ? permissionDecisions.shift()! : "approved";
      },
    },
    services: {
      register: (def: { id: string }, provider: Record<string, unknown>) => {
        registered.push({ id: def.id, provider });
      },
    },
  } as unknown as Parameters<typeof gitPlugin.activate>[0];
  return {
    ctx,
    registered,
    events,
    approvals,
    permissionDecisions,
    provider(): { contractVersion: string; guard: GuardFn; push: PushFn } {
      gitPlugin.activate(ctx);
      const entry = registered.find((r) => r.id === "repository");
      if (!entry) throw new Error("repository service not registered");
      return entry.provider as unknown as { contractVersion: string; guard: GuardFn; push: PushFn };
    },
  };
}

describe("git plugin guards", () => {
  it("registers the repository service with the standard contract", () => {
    const h = makeCtx({ repository: { provider: "git" } });
    const provider = h.provider();
    expect(provider.contractVersion).toBe("1.0.0");
    expect(typeof provider.guard).toBe("function");
  });

  it("blocks force push, branch deletion and history rewrite by default", () => {
    const h = makeCtx({ repository: { provider: "git" } });
    const provider = h.provider();
    expect(provider.guard("push", { force: true })).toEqual({
      allowed: false,
      reason: expect.stringContaining("guarded by default"),
    });
    expect(provider.guard("branch", { delete: true }).allowed).toBe(false);
    expect(provider.guard("tag", { delete: true }).allowed).toBe(false);
    expect(provider.guard("remote").allowed).toBe(false);
    expect(provider.guard("history-rewrite").allowed).toBe(false);
  });

  it("allows regular push and non-deleting branch/tag operations", () => {
    const h = makeCtx({ repository: { provider: "git" } });
    const provider = h.provider();
    expect(provider.guard("push", { force: false }).allowed).toBe(true);
    expect(provider.guard("branch").allowed).toBe(true);
    expect(provider.guard("tag").allowed).toBe(true);
  });

  it("permits destructive ops only when explicitly enabled in repository.options.guards", () => {
    const h = makeCtx({
      repository: {
        provider: "git",
        options: { guards: { forcePush: true, historyRewrite: true } },
      },
    });
    const provider = h.provider();
    expect(provider.guard("push", { force: true }).allowed).toBe(true);
    expect(provider.guard("history-rewrite").allowed).toBe(true);
    expect(provider.guard("branch", { delete: true }).allowed).toBe(false);
  });

  it("defaults match the spec's conservative guard constants", () => {
    expect(DEFAULT_GIT_GUARDS).toEqual({
      forcePush: false,
      branchDeletion: false,
      hardReset: false,
      cleanFd: false,
      tagDeletion: false,
      remoteChanges: false,
      historyRewrite: false,
    });
  });

  it("guarded-but-allowed push still passes the approval gate", async () => {
    const h = makeCtx({
      repository: {
        provider: "git",
        options: { guards: { forcePush: true } },
      },
    });
    const provider = h.provider();
    h.permissionDecisions.push("approved");
    // Run against a non-repo path; the underlying git call fails, but the
    // approval must have been consulted first — proving the approval gate
    // wraps allowed guarded ops BEFORE execution.
    await expect(provider.push({ path: "/tmp/definitely-not-a-repo", force: true })).rejects.toThrow();
    expect(h.approvals.map((a) => a.operation)).toContain("git.push");
    expect(h.events.map((e) => e.name)).not.toContain("protection/intervened");
  });

  it("emits protection/intervened when a guard blocks", async () => {
    const h = makeCtx({ repository: { provider: "git" } });
    const provider = h.provider();
    await expect(provider.push({ path: "/tmp/x", force: true })).rejects.toThrow(/guarded by default/);
    expect(h.events.map((e) => e.name)).toContain("protection/intervened");
  });
});
