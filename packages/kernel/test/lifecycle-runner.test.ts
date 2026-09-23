/**
 * Development lifecycle (spec sections 6/16): schema validation in contracts
 * and stage sequencing/policies in the kernel LifecycleRunner. The executor
 * is a stub — the kernel under test provides sequencing, retries, events,
 * and honest failure semantics, never stage semantics.
 */
import { describe, expect, it } from "vitest";
import {
  workspaceConfigSchema,
  type DevelopmentLifecycle,
  type LifecycleStage,
} from "@proagents/contracts";
import { KernelEventBus, LifecycleRunner, resolveLifecycle } from "@proagents/kernel";

function makeStage(id: string, over: Partial<LifecycleStage> = {}): LifecycleStage {
  return {
    id,
    name: id,
    type: "test",
    agents: [],
    tools: [],
    policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    ...over,
  };
}

function makeLifecycle(stages: LifecycleStage[]): DevelopmentLifecycle {
  return { id: "test-lc", name: "Test lifecycle", stages };
}

function recordEvents(): { names: string[] } {
  const names: string[] = [];
  const bus = new KernelEventBus();
  void bus.on("lifecycle/stage-started", () => { names.push("started"); });
  void bus.on("lifecycle/stage-completed", () => { names.push("completed"); });
  void bus.on("lifecycle/completed", () => { names.push("run-done"); });
  return { names, bus };
}

describe("lifecycle config schema", () => {
  it("accepts an inline per-workspace lifecycle with defaults filled in", () => {
    const config = workspaceConfigSchema.parse({
      runtime: { provider: "local" },
      lifecycle: {
        definitions: [
          { id: "web", name: "Web", stages: [{ id: "test", name: "Test", type: "test" }] },
        ],
        default: "web",
      },
      workspaces: {
        "flight-booking": { root: "agents/flight", lifecycle: { ref: "web" } },
      },
    });
    const stage = config.lifecycle?.definitions[0]?.stages[0];
    expect(stage?.policy.onFailure).toBe("stop");
    expect(stage?.policy.required).toBe(true);
    expect(config.workspaces?.["flight-booking"]?.lifecycle?.ref).toBe("web");
  });

  it("rejects non-kebab-case stage ids and unknown stage types", () => {
    expect(() =>
      workspaceConfigSchema.parse({
        runtime: { provider: "local" },
        lifecycle: { definitions: [{ id: "x", name: "X", stages: [{ id: "Bad_Id", name: "B", type: "test" }] }] },
      }),
    ).toThrow();
    expect(() =>
      workspaceConfigSchema.parse({
        runtime: { provider: "local" },
        lifecycle: { definitions: [{ id: "x", name: "X", stages: [{ id: "ok", name: "B", type: "deploy" }] }] },
      }),
    ).toThrow();
  });
});

describe("LifecycleRunner", () => {
  it("runs stages in order and emits the typed events", async () => {
    const { names, bus } = recordEvents();
    const runner = new LifecycleRunner(bus);
    const ran: string[] = [];
    const result = await runner.run(
      makeLifecycle([makeStage("understand", { type: "understand" }), makeStage("implement", { type: "implement" })]),
      async (stage) => { ran.push(stage.id); return { ok: true, durationMs: 1 }; },
      { workspaceId: "w1" },
    );
    expect(ran).toEqual(["understand", "implement"]);
    expect(result.ok).toBe(true);
    expect(names).toEqual(["started", "completed", "started", "completed", "run-done"]);
  });

  it("stops on failure of a required stage — later stages do not run", async () => {
    const runner = new LifecycleRunner(new KernelEventBus());
    const ran: string[] = [];
    const result = await runner.run(
      makeLifecycle([makeStage("a"), makeStage("b")]),
      async (stage) => {
        ran.push(stage.id);
        return { ok: stage.id !== "a", durationMs: 1 };
      },
      { workspaceId: "w1" },
    );
    expect(ran).toEqual(["a"]);
    expect(result.ok).toBe(false);
    expect(result.failedStageId).toBe("a");
  });

  it("skips optional (required: false) failing stages and continues", async () => {
    const runner = new LifecycleRunner(new KernelEventBus());
    const ran: string[] = [];
    const result = await runner.run(
      makeLifecycle([makeStage("a", { policy: { parallel: false, required: false, onFailure: "stop", maxRetries: 1 } }), makeStage("b")]),
      async (stage) => {
        ran.push(stage.id);
        return { ok: stage.id !== "a", durationMs: 1 };
      },
      { workspaceId: "w1" },
    );
    expect(ran).toEqual(["a", "b"]);
    expect(result.ok).toBe(true); // only optional stage failed
    expect(result.stages.find((s) => s.stageId === "a")?.ok).toBe(false);
  });

  it("retries with onFailure: retry up to maxRetries and succeeds on a later attempt", async () => {
    const runner = new LifecycleRunner(new KernelEventBus());
    let calls = 0;
    const result = await runner.run(
      makeLifecycle([makeStage("flaky", { policy: { parallel: false, required: true, onFailure: "retry", maxRetries: 2 } })]),
      async () => {
        calls += 1;
        return { ok: calls >= 3, durationMs: 1 };
      },
      { workspaceId: "w1" },
    );
    expect(calls).toBe(3);
    expect(result.ok).toBe(true);
    expect(result.stages[0]?.attempts).toBe(3);
  });

  it("honors onFailure: continue — records the failure but keeps going", async () => {
    const runner = new LifecycleRunner(new KernelEventBus());
    const ran: string[] = [];
    const result = await runner.run(
      makeLifecycle([
        makeStage("a", { policy: { parallel: false, required: true, onFailure: "continue", maxRetries: 1 } }),
        makeStage("b"),
      ]),
      async (stage) => {
        ran.push(stage.id);
        return { ok: stage.id !== "a", durationMs: 1 };
      },
      { workspaceId: "w1" },
    );
    expect(ran).toEqual(["a", "b"]);
    expect(result.ok).toBe(false);
    expect(result.failedStageId).toBe("a");
  });
});

describe("resolveLifecycle", () => {
  const base = { runtime: { provider: "local" } } as const;

  it("resolves a ref from the top-level definitions", () => {
    const config = workspaceConfigSchema.parse({
      ...base,
      lifecycle: {
        definitions: [{ id: "web", name: "Web", stages: [{ id: "s", name: "S", type: "test" }] }],
        default: "web",
      },
      workspaces: { w1: { root: "x", lifecycle: { ref: "web" } } },
    });
    expect(resolveLifecycle(config, "w1")?.id).toBe("web");
  });

  it("falls back to the default lifecycle when the entry has none", () => {
    const config = workspaceConfigSchema.parse({
      ...base,
      lifecycle: {
        definitions: [{ id: "web", name: "Web", stages: [{ id: "s", name: "S", type: "test" }] }],
        default: "web",
      },
      workspaces: { w1: { root: "x" } },
    });
    expect(resolveLifecycle(config, "w1")?.id).toBe("web");
  });

  it("prefers the entry's inline lifecycle", () => {
    const config = workspaceConfigSchema.parse({
      ...base,
      lifecycle: {
        definitions: [{ id: "web", name: "Web", stages: [{ id: "s", name: "S", type: "test" }] }],
        default: "web",
      },
      workspaces: { w1: { root: "x", lifecycle: { inline: { id: "custom", name: "C", stages: [{ id: "s2", name: "S2", type: "review" }] } } } },
    });
    expect(resolveLifecycle(config, "w1")?.id).toBe("custom");
  });

  it("throws a structured error for an unknown ref (config honesty)", () => {
    const config = workspaceConfigSchema.parse({
      ...base,
      workspaces: { w1: { root: "x", lifecycle: { ref: "missing" } } },
    });
    expect(() => resolveLifecycle(config, "w1")).toThrow(/unknown lifecycle "missing"/);
  });
});
