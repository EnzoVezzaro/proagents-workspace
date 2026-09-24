/**
 * LifecycleRunner — executes a workspace's configured development lifecycle
 * (spec sections 6 and 16).
 *
 * A lifecycle is a declarative list of stages (contracts `DevelopmentLifecycle`);
 * this runner walks them in order, emitting the typed `lifecycle/*` events so
 * any interface built on these events stays a pure
 * projection over the kernel event bus — it holds no state of its own.
 *
 * WHAT A STAGE DOES: the runner is deliberately NOT an agent orchestrator —
 * per spec section 139 (kernel purity) it never spawns agents or runs tools
 * itself. A stage is executed through ONE injected `StageExecutor`, so the
 * harness/product layer (e.g. the UI server's agent roster) decides whether a
 * stage means "type a task into the crew's terminal", "run vitest", or
 * "invoke an MCP tool". The kernel provides sequencing, policies, and events.
 *
 * Failure semantics (declarative, per stage):
 *   - required: false + failure  → skip, continue with later stages
 *   - onFailure: "stop"          → run ends failed, later stages don't run
 *   - onFailure: "retry"         → up to `maxRetries` re-executions
 *   - onFailure: "continue"      → record failure, keep going
 *   - parallel: true is ADVISORY in this milestone: stages still execute in
 *     declaration order; the flag is honored by emitting started/completed
 *     without barrier semantics. Honest reporting over fake concurrency.
 */
import type {
  DevelopmentLifecycle,
  LifecycleStage,
} from "@proagents/contracts";
import { WorkspaceError } from "@proagents/contracts";
import type { EventBus } from "@proagents/contracts";

/** The kernel-visible outcome of one stage execution attempt. */
export interface StageResult {
  readonly ok: boolean;
  readonly durationMs: number;
  /** Optional structured detail the executor wants surfaced (test counts…). */
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * The single integration point for stage execution. Implemented by the
 * product layer; receives the stage plus the resolved per-workspace context.
 */
export type StageExecutor = (
  stage: LifecycleStage,
  context: { readonly workspaceId: string; readonly attempt: number }
) => Promise<StageResult>;

export interface LifecycleRunResult {
  readonly lifecycleId: string;
  readonly ok: boolean;
  readonly durationMs: number;
  /** Stages that were executed (skipped stages are absent). */
  readonly stages: readonly {
    readonly stageId: string;
    readonly ok: boolean;
    readonly attempts: number;
    readonly durationMs: number;
  }[];
  readonly failedStageId?: string;
}

export class LifecycleRunner {
  constructor(private readonly events: EventBus) {}

  /**
   * Execute a lifecycle for a workspace. Sequential by default; `parallel`
   * stages are advisory in this milestone (documented, not hidden).
   */
  async run(
    lifecycle: DevelopmentLifecycle,
    executor: StageExecutor,
    context: { readonly workspaceId: string }
  ): Promise<LifecycleRunResult> {
    const startedAt = Date.now();
    const executed: LifecycleRunResult["stages"][number][] = [];
    let failedStageId: string | undefined;

    for (const stage of lifecycle.stages) {
      const maxAttempts = stage.policy.onFailure === "retry" ? 1 + stage.policy.maxRetries : 1;
      let attempt = 0;
      let lastResult: StageResult | undefined;

      while (attempt < maxAttempts) {
        attempt += 1;
        await this.events.emit("lifecycle/stage-started", {
          lifecycleId: lifecycle.id,
          stageId: stage.id,
          stageType: stage.type,
          attempt,
          agentProfileIds: stage.agents.map((a) => a.profileId),
          toolIds: stage.tools.map((t) => t.id),
        });
        lastResult = await executor(stage, { workspaceId: context.workspaceId, attempt });
        await this.events.emit("lifecycle/stage-completed", {
          lifecycleId: lifecycle.id,
          stageId: stage.id,
          ok: lastResult.ok,
          durationMs: lastResult.durationMs,
          attempt,
        });
        if (lastResult.ok) break;
        if (stage.policy.onFailure !== "retry") break;
      }

      const ok = lastResult?.ok ?? false;
      executed.push({
        stageId: stage.id,
        ok,
        attempts: attempt,
        durationMs: lastResult?.durationMs ?? 0,
      });

      if (!ok) {
        // Only REQUIRED stage failures fail the run: an optional stage that
        // fails is recorded honestly (ok: false in the stage list) but the
        // run continues. `onFailure: continue` records + continues even for
        // required stages — the policy is explicit about tolerating it.
        if (stage.policy.required === false) {
          continue;
        }
        failedStageId = stage.id;
        if (stage.policy.onFailure === "continue") {
          continue; // explicitly continue past failure
        }
        // "stop" (default) or exhausted retries → the run fails here.
        break;
      }
    }

    const durationMs = Date.now() - startedAt;
    const ok = failedStageId === undefined;
    await this.events.emit("lifecycle/completed", {
      lifecycleId: lifecycle.id,
      ok,
      durationMs,
      ...(failedStageId !== undefined ? { failedStageId } : {}),
    });

    return {
      lifecycleId: lifecycle.id,
      ok,
      durationMs,
      stages: executed,
      ...(failedStageId !== undefined ? { failedStageId } : {}),
    };
  }
}

/** Resolve a workspace's lifecycle from config (ref → definitions, or inline). */
export function resolveLifecycle(
  config: import("@proagents/contracts").WorkspaceConfig,
  workspaceId: string
): DevelopmentLifecycle | undefined {
  const entry = config.workspaces?.[workspaceId];
  if (entry?.lifecycle?.inline !== undefined) return entry.lifecycle.inline;
  const ref = entry?.lifecycle?.ref ?? config.lifecycle?.default;
  if (ref === undefined) return undefined;
  const found = config.lifecycle?.definitions.find((d) => d.id === ref);
  if (found === undefined) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: `Workspace "${workspaceId}" references unknown lifecycle "${ref}".`,
      recoverable: true,
      suggestions: ["Define it under lifecycle.definitions in workspace.yaml"],
    });
  }
  return found;
}
