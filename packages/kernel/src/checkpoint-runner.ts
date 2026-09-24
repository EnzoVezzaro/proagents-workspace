/**
 * CheckpointRunner (spec section 150, Helix-inspired): executes checkpoint
 * plans with gate-based completion. The core product rule is normative:
 *
 *   ATTEMPT ≠ COMPLETION — only gates complete a checkpoint.
 *
 * Kernel purity (spec section 139): the runner owns DAG ordering, status
 * transitions, evidence accumulation, and typed events. Gate EXECUTION is
 * delegated to `GateProvider` plugins resolved through the service registry —
 * the kernel never hard-codes behavior/visual/adversarial/human logic, and it
 * never branches on gate kinds. A gate that fails with its retry budget
 * exhausted fails the checkpoint; a passed checkpoint carries EVIDENCE.
 */
import {
  WorkspaceError,
  type Checkpoint,
  type CheckpointPlan,
  type GateEvidence,
  type GateProvider,
  type GateRef,
  type GateResult,
  type GateStatus,
} from "@proagents/contracts";
import type { ServiceRegistry } from "./service-registry.js";
import type { KernelEventBus } from "./event-bus.js";
import type { StructuredLogger } from "./logger.js";

export interface CheckpointRunnerOptions {
  readonly services: ServiceRegistry;
  readonly events: KernelEventBus;
  readonly logger?: StructuredLogger;
  /** Project root gates evaluate against. */
  readonly projectRoot: string;
  /** Hook the host provides to execute acceptance-criterion commands. */
  readonly execCommand?: (command: string) => Promise<{ exitCode: number }>;
}

export interface CheckpointRunResult {
  readonly checkpointId: string;
  readonly status: "passed" | "failed";
  readonly evidence: readonly GateEvidence[];
  /** Cumulative gate attempts (retries included). */
  readonly attempts: number;
  readonly durationMs: number;
  readonly failedGateId?: string;
}

/** Topologically order the plan's checkpoints (Kahn, deterministic ties). */
export function orderCheckpoints(plan: CheckpointPlan): Checkpoint[] {
  const byId = new Map(plan.checkpoints.map((c) => [c.id, c]));
  for (const c of plan.checkpoints) {
    for (const dep of c.dependencies) {
      if (!byId.has(dep)) {
        throw new WorkspaceError({
          code: "CHECKPOINT_PLAN_INVALID",
          message: `Checkpoint "${c.id}" depends on unknown checkpoint "${dep}".`,
          recoverable: false,
          suggestions: ["Fix the dependencies in the checkpoint plan"],
        });
      }
    }
  }
  const remaining = [...plan.checkpoints].sort((a, b) => a.id.localeCompare(b.id));
  const done = new Set<string>();
  const ordered: Checkpoint[] = [];
  while (remaining.length > 0) {
    const ready = remaining.filter((c) => c.dependencies.every((d) => done.has(d)));
    if (ready.length === 0) {
      throw new WorkspaceError({
        code: "CHECKPOINT_PLAN_INVALID",
        message: `Checkpoint dependency cycle involving: ${remaining.map((c) => c.id).join(", ")}.`,
        recoverable: false,
        suggestions: ["Break the cycle in the checkpoint plan"],
      });
    }
    for (const c of ready) {
      ordered.push(c);
      done.add(c.id);
    }
    for (const c of ready) remaining.splice(remaining.indexOf(c), 1);
  }
  return ordered;
}

export class CheckpointRunner {
  private readonly evidenceByCheckpoint = new Map<string, GateEvidence[]>();

  constructor(private readonly options: CheckpointRunnerOptions) {}

  private gateServiceFor(gate: GateRef): GateProvider | undefined {
    // Gates resolve through the registry by provider id, falling back to the
    // gate KIND. Capability id "gate" plus per-provider ids registered by
    // plugins; the runner never maps kinds to implementations itself.
    const registrations = this.options.services.registrations();
    const wanted = gate.provider ?? gate.id;
    const match = registrations.find(
      (r) => (r.definition as { id: string }).id === `gate:${wanted}` || (r.definition as { id: string }).id === `gate:${gate.kind}`
    );
    return match ? (match.implementation as GateProvider) : undefined;
  }

  /**
   * Run ONE checkpoint: its gates in declaration order (retrying per policy),
   * then acceptance-criterion commands. Emits typed events; accumulates
   * evidence. Throws nothing — failures are returned as status "failed"
   * (the CALLER decides what an failed checkpoint means for the run).
   */
  async runCheckpoint(checkpoint: Checkpoint): Promise<CheckpointRunResult> {
    const started = Date.now();
    await this.options.events.emit("checkpoint/started", { checkpointId: checkpoint.id, title: checkpoint.title });

    const evidence: GateEvidence[] = [...(this.evidenceByCheckpoint.get(checkpoint.id) ?? [])];
    let attempts = 0;
    let failedGateId: string | undefined;

    for (const gate of checkpoint.gates) {
      const provider = this.gateServiceFor(gate);
      if (provider === undefined) {
        await this.options.events.emit("checkpoint/failed", {
          checkpointId: checkpoint.id,
          reason: `no gate provider registered for "${gate.provider ?? gate.kind}"`,
          gateId: gate.id,
        });
        return {
          checkpointId: checkpoint.id, status: "failed", evidence, attempts,
          durationMs: Date.now() - started, failedGateId: gate.id,
        };
      }

      const maxAttempts = 1 + (gate.policy.maxRetries ?? 1);
      let verdict: GateStatus | undefined;
      while (attempts < maxAttempts * checkpoint.gates.length) {
        attempts += 1;
        await this.options.events.emit("checkpoint/gate-started", {
          checkpointId: checkpoint.id, gateId: gate.id, gateKind: gate.kind,
        });
        const startedGate = Date.now();
        // A gate that THROWS has not produced evidence — the checkpoint can
        // never pass on a crash. Convert to an honest failed result
        // (fail-closed): APPROVAL_REQUIRED surfaces as awaiting-approval.
        const result = await provider
          .evaluate({ checkpoint, gate, projectRoot: this.options.projectRoot, priorEvidence: evidence })
          .catch((error: unknown) => {
            const isApproval = error instanceof WorkspaceError && error.code === "APPROVAL_REQUIRED";
            const outcome: GateResult = {
              gateId: gate.id,
              status: "failed",
              findings: [{
                severity: "blocker",
                location: isApproval ? "approval" : "gate",
                issue: isApproval
                  ? "checkpoint requires human approval"
                  : `gate crashed: ${error instanceof Error ? error.message : String(error)}`,
              }],
              durationMs: Date.now() - startedGate,
              note: isApproval
                ? "awaiting-approval: re-run interactively to approve this checkpoint"
                : "fail-closed: a crashed gate has no evidence, so it cannot pass",
            };
            return outcome;
          });
        const gateEvidence: GateEvidence = {
          gateId: gate.id,
          gateKind: gate.kind,
          status: result.status,
          findings: [...result.findings],
          durationMs: result.durationMs,
          at: new Date().toISOString(),
          ...(result.note !== undefined ? { note: result.note } : {}),
        };
        evidence.push(gateEvidence);
        await this.options.events.emit("checkpoint/gate-completed", {
          checkpointId: checkpoint.id,
          gateId: gate.id,
          gateKind: gate.kind,
          status: result.status,
          findings: result.findings,
          durationMs: result.durationMs,
        });
        if (result.status === "passed" || result.status === "skipped") {
          verdict = result.status;
          break;
        }
        if (result.status === "failed" && attempts >= maxAttempts) {
          verdict = "failed";
          failedGateId = gate.id;
          break;
        }
        void startedGate;
      }
      if (verdict === "failed") break;
    }

    if (verdictOf(evidence, checkpoint.gates) !== "passed") {
      const reason = failedGateId !== undefined ? `gate "${failedGateId}" failed` : "gates did not pass";
      await this.options.events.emit("checkpoint/failed", { checkpointId: checkpoint.id, reason, gateId: failedGateId });
      return { checkpointId: checkpoint.id, status: "failed", evidence, attempts, durationMs: Date.now() - started, failedGateId };
    }

    // Acceptance criteria: commands produce evidence (exit 0 = satisfied).
    for (const criterion of checkpoint.acceptanceCriteria) {
      if (criterion.command === undefined) continue;
      const exec = this.options.execCommand;
      if (exec === undefined) {
        await this.options.events.emit("checkpoint/failed", {
          checkpointId: checkpoint.id,
          reason: `acceptance criterion "${criterion.id}" needs a command executor, and none is configured`,
        });
        return { checkpointId: checkpoint.id, status: "failed", evidence, attempts, durationMs: Date.now() - started };
      }
      const outcome = await exec(criterion.command);
      if (outcome.exitCode !== 0) {
        evidence.push({
          gateId: `criterion:${criterion.id}`,
          gateKind: "behavior",
          status: "failed",
          findings: [{ severity: "blocker", location: criterion.id, issue: `criterion failed: ${criterion.description}` }],
          durationMs: 0,
          at: new Date().toISOString(),
        });
        await this.options.events.emit("checkpoint/failed", {
          checkpointId: checkpoint.id,
          reason: `acceptance criterion "${criterion.id}" failed (exit ${outcome.exitCode})`,
        });
        return { checkpointId: checkpoint.id, status: "failed", evidence, attempts, durationMs: Date.now() - started };
      }
    }

    this.evidenceByCheckpoint.set(checkpoint.id, evidence);
    await this.options.events.emit("checkpoint/completed", {
      checkpointId: checkpoint.id,
      evidence: evidence.map((e) => ({ gateId: e.gateId, status: e.status })),
    });
    return { checkpointId: checkpoint.id, status: "passed", evidence, attempts, durationMs: Date.now() - started };
  }

  /**
   * Run the whole plan in dependency order. A FAILED checkpoint stops the
   * plan (fail-closed): subsequent work would rest on unproven ground
   * (attempt ≠ completion applies to the plan, not just checkpoints).
   */
  async runPlan(plan: CheckpointPlan): Promise<readonly CheckpointRunResult[]> {
    const ordered = orderCheckpoints(plan);
    const results: CheckpointRunResult[] = [];
    for (const checkpoint of ordered) {
      const result = await this.runCheckpoint(checkpoint);
      results.push(result);
      if (result.status === "failed") break;
    }
    return results;
  }

  /** Evidence recorded so far (for `paw checkpoint status` and projections). */
  evidenceFor(checkpointId: string): readonly GateEvidence[] {
    return this.evidenceByCheckpoint.get(checkpointId) ?? [];
  }

  reset(): void {
    this.evidenceByCheckpoint.clear();
  }
}

/** A checkpoint passes only when EVERY declared gate passed (skip = explicit). */
function verdictOf(evidence: readonly GateEvidence[], gates: readonly GateRef[]): GateStatus {
  for (const gate of gates) {
    const last = [...evidence].reverse().find((e) => e.gateId === gate.id);
    if (last === undefined) return "failed";
    if (last.status === "failed") return "failed";
  }
  return "passed";
}
