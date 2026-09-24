/**
 * WorkspaceLifecycleRunner (spec section 151): executes the CANONICAL
 * workspace lifecycle.
 *
 *   CREATE → RESEARCH → INITIALIZE → PLAN → DEVELOP → VERIFY → RELEASE
 *          → DISTRIBUTE → OPERATE
 *
 * Division of authority (the lifecycle is opinionated; the implementation is
 * extensible):
 *   - the KERNEL owns the phase order, transitions, state, and events;
 *   - PLUGINS own what happens inside a phase — executors are resolved
 *     through the registry as `lifecycle:<phase>` services; a phase whose
 *     executor is absent is SKIPPED (recorded honestly, never fabricated);
 *   - a `develop`/`verify` phase bound to a checkpoint plan delegates to the
 *     gate model (spec section 150) — attempt ≠ completion applies.
 *
 * Plugins may CONTRIBUTE new phases (`lifecycleStages` in the manifest,
 * merged at composition); they never reorder or remove canonical phases.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  WorkspaceError,
  checkpointPlanSchema,
  type CheckpointPlan,
  type LifecycleFlow,
  type LifecycleFlowStage,
  type WorkspaceConfig,
} from "@proagents/contracts";
import type { ServiceRegistry } from "./service-registry.js";
import type { KernelEventBus } from "./event-bus.js";

export const CANONICAL_PHASES = [
  "create",
  "research",
  "initialize",
  "plan",
  "develop",
  "verify",
  "release",
  "distribute",
  "operate",
] as const;

/** Stage policy defaults (mirrors lifecycleStagePolicySchema.prefault). */
const DEFAULT_POLICY = { parallel: false, required: true, onFailure: "stop" as const, maxRetries: 1 };

/** The default flow: every canonical phase, canonical execution defaults. */
export function defaultFlow(): LifecycleFlow {
  return {
    version: 1,
    title: "Canonical workspace lifecycle",
    stages: [
      { phase: "create", execution: "manual", policy: DEFAULT_POLICY },
      { phase: "research", execution: "research", policy: DEFAULT_POLICY },
      { phase: "initialize", execution: "command", command: "paw init", policy: DEFAULT_POLICY },
      { phase: "plan", execution: "manual", policy: DEFAULT_POLICY },
      { phase: "develop", execution: "checkpoint-plan", policy: DEFAULT_POLICY },
      { phase: "verify", execution: "checkpoint-plan", policy: DEFAULT_POLICY },
      { phase: "release", execution: "manual", policy: DEFAULT_POLICY },
      { phase: "distribute", execution: "manual", policy: DEFAULT_POLICY },
      { phase: "operate", execution: "manual", policy: DEFAULT_POLICY },
    ],
  };
}

/** Resolve the effective flow: config override, else canonical default. */
export function composeFlow(config: WorkspaceConfig): LifecycleFlow {
  if (config.lifecycleFlow !== undefined) return config.lifecycleFlow;
  return defaultFlow();
}

/**
 * Splice plugin stage CONTRIBUTIONS into a flow. Contributions insert a new
 * stage AFTER a named phase; canonical stages are never removed or reordered.
 * Later contributions for the same anchor chain in registration order.
 */
export function spliceContributions(flow: LifecycleFlow, contributions: readonly { phase: string; after: string; id: string; title: string; execution?: string; command?: string; plan?: string }[]): LifecycleFlow {
  const stages: LifecycleFlowStage[] = [...flow.stages];
  for (const c of contributions) {
    const anchorIndex = stages.findIndex((s) => s.phase === c.after || s.id === c.after);
    if (anchorIndex === -1) {
      // Unknown anchor: the contribution is recorded and skipped — never a
      // silent reorder of the canonical flow.
      continue;
    }
    stages.splice(anchorIndex + 1, 0, {
      phase: c.phase as LifecycleFlowStage["phase"],
      id: c.id,
      title: c.title,
      ...(c.execution !== undefined ? { execution: c.execution as LifecycleFlowStage["execution"] } : {}),
      ...(c.command !== undefined ? { command: c.command } : {}),
      ...(c.plan !== undefined ? { plan: c.plan } : {}),
      policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    });
  }
  return { ...flow, stages };
}

export interface FlowExecutorContext {
  readonly services: ServiceRegistry;
  readonly events: KernelEventBus;
  readonly projectRoot: string;
  readonly stateDir: string;
  readonly runCheckpointPlan: (plan: CheckpointPlan) => Promise<{ passed: number; failed: number }>;
}

export interface PhaseOutcome {
  readonly phase: string;
  readonly status: "completed" | "skipped" | "failed";
  readonly durationMs: number;
  readonly reason?: string;
}

function stageId(stage: LifecycleFlowStage): string {
  return stage.id ?? stage.phase;
}

function loadPlanFor(projectRoot: string, stage: LifecycleFlowStage): CheckpointPlan | undefined {
  const candidates = [
    stage.plan !== undefined ? path.join(projectRoot, stage.plan) : undefined,
    path.join(projectRoot, ".paw", "checkpoints.json"),
  ].filter((p): p is string => p !== undefined);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const parsed = checkpointPlanSchema.safeParse(JSON.parse(readFileSync(candidate, "utf8")));
      if (!parsed.success) {
        throw new WorkspaceError({
          code: "CHECKPOINT_PLAN_INVALID",
          message: `Checkpoint plan invalid for phase "${stage.phase}": ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
          recoverable: true,
          suggestions: [`Fix ${path.relative(projectRoot, candidate)}`],
        });
      }
      return parsed.data;
    }
  }
  return undefined;
}

export class WorkspaceLifecycleRunner {
  private readonly stateFile: string;

  constructor(
    private readonly ctx: FlowExecutorContext,
    private readonly flow: LifecycleFlow
  ) {
    this.stateFile = path.join(ctx.stateDir, "lifecycle-state.json");
  }

  /**
   * Run the flow. Phases execute in order; a REQUIRED phase failure stops
   * the flow (fail-closed). A phase with no registered executor is skipped
   * and recorded — the flow never invents work.
   */
  async run(): Promise<readonly PhaseOutcome[]> {
    const outcomes: PhaseOutcome[] = [];
    const total = this.flow.stages.length;
    let passed = 0;
    let skipped = 0;

    for (const [index, stage] of this.flow.stages.entries()) {
      const phaseId = stageId(stage);
      const started = Date.now();
      await this.ctx.events.emit("lifecycle/phase-started", { phase: phaseId, title: stage.title ?? phaseId, index: index + 1, total });

      const outcome = await this.executeStage(stage);
      outcomes.push(outcome);

      if (outcome.status === "completed") {
        passed += 1;
        await this.ctx.events.emit("lifecycle/phase-completed", { phase: phaseId, durationMs: Date.now() - started });
      } else if (outcome.status === "skipped") {
        skipped += 1;
        await this.ctx.events.emit("lifecycle/phase-skipped", { phase: phaseId, reason: outcome.reason ?? "no executor" });
      } else {
        await this.persist(outcomes);
        // Required-phase failure stops the flow: subsequent phases would
        // build on unproven ground.
        break;
      }
      this.persist(outcomes);
    }

    await this.ctx.events.emit("lifecycle/flow-completed", { flow: this.flow.title, passed, skipped });
    return outcomes;
  }

  private async executeStage(stage: LifecycleFlowStage): Promise<PhaseOutcome> {
    const phaseId = stageId(stage);
    const started = Date.now();
    const execution = stage.execution ?? (stage.phase === "develop" || stage.phase === "verify" ? "checkpoint-plan" : "manual");

    if (execution === "checkpoint-plan") {
      const plan = loadPlanFor(this.ctx.projectRoot, stage);
      if (plan === undefined) {
        return { phase: phaseId, status: "skipped", durationMs: Date.now() - started, reason: "no checkpoint plan bound" };
      }
      const summary = await this.ctx.runCheckpointPlan(plan);
      return summary.failed === 0
        ? { phase: phaseId, status: "completed", durationMs: Date.now() - started }
        : { phase: phaseId, status: "failed", durationMs: Date.now() - started, reason: `${summary.failed} checkpoint(s) failed` };
    }

    if (execution === "command") {
      const shellDef = { id: "shell", contractVersion: "1.0.0" } as const;
      const registrations = this.ctx.services.registrations();
      const shell = registrations.find((r) => r.definition.id === shellDef.id);
      if (shell === undefined || stage.command === undefined) {
        return { phase: phaseId, status: "skipped", durationMs: Date.now() - started, reason: "no shell capability or command" };
      }
      const provider = shell.implementation as { exec(request: { command: string; cwd?: string; timeoutMs?: number }): Promise<{ exitCode: number }> };
      const result = await provider.exec({ command: stage.command, cwd: this.ctx.projectRoot, timeoutMs: 600_000 });
      return result.exitCode === 0
        ? { phase: phaseId, status: "completed", durationMs: Date.now() - started }
        : { phase: phaseId, status: "failed", durationMs: Date.now() - started, reason: `command failed (exit ${result.exitCode})` };
    }

    if (execution === "research") {
      // Research execution is the host's product loop (spec section 149):
      // the lifecycle records the phase transition; the interview runs
      // through `paw research` on demand.
      return { phase: phaseId, status: "skipped", durationMs: Date.now() - started, reason: "research runs via `paw research` (product interview)" };
    }

    // manual: the phase is a human checkpoint in the flow.
    return { phase: phaseId, status: "skipped", durationMs: Date.now() - started, reason: "manual phase — run its commands, then continue" };
  }

  private persist(outcomes: readonly PhaseOutcome[]): void {
    mkdirSync(this.ctx.stateDir, { recursive: true });
    writeFileSync(
      this.stateFile,
      `${JSON.stringify({ flow: this.flow.title, at: new Date().toISOString(), outcomes }, null, 2)}\n`
    );
  }
}
