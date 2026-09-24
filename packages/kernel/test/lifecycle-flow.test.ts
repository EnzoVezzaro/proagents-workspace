/**
 * Canonical lifecycle tests (spec section 151): composition, contribution
 * splicing, and phase execution semantics — executors resolved via the
 * registry, absent executors SKIP, required failures stop the flow.
 */
import { describe, expect, it } from "vitest";
import { composeFlow, defaultFlow, spliceContributions, WorkspaceLifecycleRunner } from "../src/lifecycle-flow.js";
import { CheckpointRunner } from "../src/checkpoint-runner.js";
import { KernelEventBus } from "../src/event-bus.js";
import { ServiceRegistry } from "../src/service-registry.js";
import type { CheckpointPlan, LifecycleFlow, WorkspaceConfig } from "@proagents/contracts";
import { defineService, type ShellProvider } from "@proagents/contracts";

describe("composeFlow", () => {
  it("returns the canonical default without config", () => {
    const flow = composeFlow({} as WorkspaceConfig);
    expect(flow.stages.map((s) => s.phase)).toEqual([
      "create", "research", "initialize", "plan", "develop", "verify", "release", "distribute", "operate",
    ]);
  });

  it("honors a config override (tiny lifecycle)", () => {
    const config = {
      lifecycleFlow: {
        version: 1 as const,
        title: "tiny",
        stages: [
          { phase: "initialize", execution: "manual", policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 } },
          { phase: "develop", execution: "checkpoint-plan", policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 } },
          { phase: "verify", execution: "checkpoint-plan", policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 } },
        ],
      },
    } as unknown as WorkspaceConfig;
    const flow = composeFlow(config);
    expect(flow.title).toBe("tiny");
    expect(flow.stages).toHaveLength(3);
  });
});

describe("spliceContributions", () => {
  it("inserts a contributed stage after its anchor without removing canonical stages", () => {
    const flow = defaultFlow();
    const spliced = spliceContributions(flow, [
      { phase: "custom", after: "research", id: "threat-model", title: "Threat model" },
    ]);
    const phases = spliced.stages.map((s) => s.id ?? s.phase);
    expect(phases).toContain("threat-model");
    expect(phases.indexOf("threat-model")).toBe(phases.indexOf("research") + 1);
    expect(phases).toContain("operate"); // canonical tail survives
  });

  it("ignores contributions with unknown anchors (no reorder)", () => {
    const flow = defaultFlow();
    const spliced = spliceContributions(flow, [
      { phase: "custom", after: "nonexistent", id: "x", title: "X" },
    ]);
    expect(spliced.stages).toHaveLength(flow.stages.length);
  });
});

describe("WorkspaceLifecycleRunner", () => {
  function makeRunner(flow: LifecycleFlow, opts?: { shell?: ShellProvider; plan?: CheckpointPlan }) {
    const services = new ServiceRegistry();
    if (opts?.shell !== undefined) {
      const shellDef = defineService<ShellProvider>({ id: "shell", contractVersion: "1.0.0" });
      services.register(shellDef, opts.shell, "shell-test");
    }
    const events = new KernelEventBus();
    const checkpointRunner = new CheckpointRunner({
      services, events, projectRoot: "/tmp/x",
      execCommand: async () => ({ exitCode: 0 }),
    });
    const runner = new WorkspaceLifecycleRunner(
      {
        services, events, projectRoot: "/tmp/x",
        stateDir: "/tmp/paw-flow-state-test",
        runCheckpointPlan: async (plan) => {
          const results = await checkpointRunner.runPlan(plan);
          return {
            passed: results.filter((r) => r.status === "passed").length,
            failed: results.filter((r) => r.status === "failed").length,
          };
        },
      },
      flow
    );
    return runner;
  }

  it("completes command phases through the shell capability", async () => {
    const executed: string[] = [];
    const flow: LifecycleFlow = {
      version: 1, title: "t",
      stages: [{ phase: "initialize", execution: "command", command: "echo init", policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 } }],
    };
    const runner = makeRunner(flow, {
      shell: { name: "s", contractVersion: "1.0.0", health: async () => ({ status: "healthy", message: "" }), exec: async (r) => { executed.push(r.command); return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 }; } },
    });
    const outcomes = await runner.run();
    expect(executed).toEqual(["echo init"]);
    expect(outcomes[0]!.status).toBe("completed");
  });

  it("skips phases with no executor and records the reason honestly", async () => {
    const flow: LifecycleFlow = {
      version: 1, title: "t",
      stages: [
        { phase: "verify", execution: "checkpoint-plan", policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 } },
      ],
    };
    const runner = makeRunner(flow); // no plan on disk → skip
    const outcomes = await runner.run();
    expect(outcomes[0]!.status).toBe("skipped");
    expect(outcomes[0]!.reason).toBeDefined();
  });

  it("fails the flow when a command phase fails (required)", async () => {
    const flow: LifecycleFlow = {
      version: 1, title: "t",
      stages: [
        { phase: "initialize", execution: "command", command: "exit 2", policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 } },
        { phase: "plan", execution: "manual", policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 } },
      ],
    };
    const runner = makeRunner(flow, {
      shell: { name: "s", contractVersion: "1.0.0", health: async () => ({ status: "healthy", message: "" }), exec: async () => ({ exitCode: 2, stdout: "", stderr: "boom", durationMs: 1 }) },
    });
    const outcomes = await runner.run();
    expect(outcomes.map((o) => o.status)).toEqual(["failed"]);
  });
});
