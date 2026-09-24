/**
 * CheckpointRunner tests (spec section 150): the attempt ≠ completion rule.
 * Gates are fake GateProvider registrations — the runner must stay
 * kind-agnostic (kernel purity).
 */
import { describe, expect, it } from "vitest";
import { CheckpointRunner, orderCheckpoints } from "../src/checkpoint-runner.js";
import { KernelEventBus } from "../src/event-bus.js";
import { ServiceRegistry } from "../src/service-registry.js";
import { defineService, checkpointPlanSchema, type GateProvider, type GateResult } from "@proagents/contracts";
import { definePlugin } from "@proagents/workspace";

const gateDef = (id: string) => defineService<GateProvider>({ id: `gate:${id}`, contractVersion: "1.0.0" });

function runnerWith(gates: Record<string, GateProvider>, events = new KernelEventBus()) {
  const services = new ServiceRegistry();
  for (const [id, provider] of Object.entries(gates)) {
    const plugin = definePlugin({
      manifest: { id: `gate-${id}`, name: id, version: "0.3.0", capabilities: ["gate"], dependencies: [], permissions: [], compatibility: {} },
      activate(ctx) {
        ctx.services.register(gateDef(id), provider, `gate-${id}`);
      },
    });
    plugin.activate({
      pluginId: `gate-${id}`,
      config: {} as never,
      logger: {} as never,
      services,
      events,
      permissions: {} as never,
      pluginOptions: () => ({}),
    });
  }
  return new CheckpointRunner({ services, events, projectRoot: "/tmp/x" });
}

const okGate: GateProvider = {
  name: "ok",
  contractVersion: "1.0.0",
  health: async () => ({ status: "healthy", message: "ok" }),
  evaluate: async (ctx): Promise<GateResult> => ({
    gateId: ctx.gate.id,
    status: "passed",
    findings: [],
    durationMs: 1,
  }),
};

function planOf(checkpoints: Parameters<typeof checkpointPlanSchema.parse>[0] extends never ? never : any) {
  return checkpointPlanSchema.parse({ version: 1, title: "t", checkpoints }) as import("@proagents/contracts").CheckpointPlan;
}

describe("orderCheckpoints", () => {
  it("orders a DAG breadth-first with deterministic ties", () => {
    const plan = planOf([
      { id: "CP-004", title: "d", dependencies: ["CP-002", "CP-003"], gates: [{ id: "g", kind: "behavior" }] },
      { id: "CP-002", title: "b", dependencies: ["CP-001"], gates: [{ id: "g", kind: "behavior" }] },
      { id: "CP-003", title: "c", dependencies: ["CP-001"], gates: [{ id: "g", kind: "behavior" }] },
      { id: "CP-001", title: "a", gates: [{ id: "g", kind: "behavior" }] },
    ]);
    expect(orderCheckpoints(plan).map((c) => c.id)).toEqual(["CP-001", "CP-002", "CP-003", "CP-004"]);
  });

  it("rejects cycles and unknown dependencies", () => {
    const cyclic = planOf([
      { id: "CP-001", title: "a", dependencies: ["CP-002"], gates: [{ id: "g", kind: "behavior" }] },
      { id: "CP-002", title: "b", dependencies: ["CP-001"], gates: [{ id: "g", kind: "behavior" }] },
    ]);
    expect(() => orderCheckpoints(cyclic)).toThrowError(/cycle/);
    const orphan = planOf([{ id: "CP-001", title: "a", dependencies: ["CP-099"], gates: [{ id: "g", kind: "behavior" }] }]);
    expect(() => orderCheckpoints(orphan)).toThrowError(/unknown checkpoint/);
  });
});

describe("CheckpointRunner (attempt ≠ completion)", () => {
  it("passes a checkpoint only when every gate passes", async () => {
    const runner = runnerWith({ behavior: okGate, adversarial: okGate });
    const plan = planOf([{ id: "CP-001", title: "work", gates: [{ id: "g1", kind: "behavior" }, { id: "g2", kind: "adversarial" }] }]);
    const result = await runner.runCheckpoint(plan.checkpoints[0]!);
    expect(result.status).toBe("passed");
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.every((e) => e.status === "passed")).toBe(true);
  });

  it("fails when any gate fails — a pass elsewhere cannot compensate", async () => {
    const failing: GateProvider = { ...okGate, evaluate: async (ctx) => ({ gateId: ctx.gate.id, status: "failed", findings: [{ severity: "blocker", location: "x", issue: "broken" }], durationMs: 1 }) };
    const runner = runnerWith({ behavior: okGate, adversarial: failing });
    const plan = planOf([{ id: "CP-001", title: "work", gates: [{ id: "g1", kind: "behavior" }, { id: "g2", kind: "adversarial", policy: { blocking: true, maxRetries: 0 } }] }]);
    const result = await runner.runCheckpoint(plan.checkpoints[0]!);
    expect(result.status).toBe("failed");
    expect(result.failedGateId).toBe("g2");
    expect(result.evidence.some((e) => e.status === "failed")).toBe(true);
  });

  it("retries a failing gate up to its budget then fails", async () => {
    let calls = 0;
    const flaky: GateProvider = {
      ...okGate,
      evaluate: async (ctx) => {
        calls += 1;
        return { gateId: ctx.gate.id, status: calls < 3 ? "failed" : "passed", findings: calls < 3 ? [{ severity: "major", location: "x", issue: "not yet" }] : [], durationMs: 1 };
      },
    };
    const runner = runnerWith({ behavior: flaky });
    const plan = planOf([{ id: "CP-001", title: "work", gates: [{ id: "g", kind: "behavior", policy: { blocking: true, maxRetries: 2 } }] }]);
    const result = await runner.runCheckpoint(plan.checkpoints[0]!);
    expect(result.status).toBe("passed");
    expect(calls).toBe(3);
  });

  it("runPlan stops at the first failed checkpoint (fail-closed plan)", async () => {
    const failing: GateProvider = { ...okGate, evaluate: async (ctx) => ({ gateId: ctx.gate.id, status: "failed", findings: [{ severity: "blocker", location: "x", issue: "nope" }], durationMs: 1 }) };
    const runner = runnerWith({ behavior: okGate, adversarial: failing });
    const plan = planOf([
      { id: "CP-001", title: "ok", gates: [{ id: "g", kind: "behavior" }] },
      { id: "CP-002", title: "bad", dependencies: ["CP-001"], gates: [{ id: "g", kind: "adversarial", policy: { blocking: true, maxRetries: 0 } }] },
      { id: "CP-003", title: "never", dependencies: ["CP-002"], gates: [{ id: "g", kind: "behavior" }] },
    ]);
    const results = await runner.runPlan(plan);
    expect(results.map((r) => r.status)).toEqual(["passed", "failed"]);
  });

  it("fails a checkpoint whose gate has no registered provider (fail-closed)", async () => {
    const runner = runnerWith({ behavior: okGate });
    const plan = planOf([{ id: "CP-001", title: "work", gates: [{ id: "g", kind: "visual" }] }]);
    const result = await runner.runCheckpoint(plan.checkpoints[0]!);
    expect(result.status).toBe("failed");
    expect(result.failedGateId).toBe("g");
  });

  it("runs acceptance-criterion commands as evidence", async () => {
    const executed: string[] = [];
    const runner = runnerWith({ behavior: okGate });
    (runner as unknown as { options: { execCommand?: (c: string) => Promise<{ exitCode: number }> } }).options.execCommand = async (command) => {
      executed.push(command);
      return { exitCode: command === "fail-cmd" ? 1 : 0 };
    };
    const plan = planOf([
      {
        id: "CP-001", title: "work", gates: [{ id: "g", kind: "behavior" }],
        acceptanceCriteria: [{ id: "ac1", description: "tests pass", command: "pnpm test" }],
      },
    ]);
    const result = await runner.runCheckpoint(plan.checkpoints[0]!);
    expect(executed).toEqual(["pnpm test"]);
    expect(result.status).toBe("passed");

    const badPlan = planOf([
      {
        id: "CP-002", title: "work", gates: [{ id: "g", kind: "behavior" }],
        acceptanceCriteria: [{ id: "ac1", description: "must fail", command: "fail-cmd" }],
      },
    ]);
    const bad = await runner.runCheckpoint(badPlan.checkpoints[0]!);
    expect(bad.status).toBe("failed");
  });
});
