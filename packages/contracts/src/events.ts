/**
 * Typed event bus contract (spec section 7).
 *
 * Events are the major extension point: providers integrate through events,
 * never by importing each other (architecture standard).
 */
import type { WorkspaceErrorShape } from "./errors.js";

/** Event payload shapes, keyed by event name (spec section 7). */
export interface WorkspaceEventMap {
  // workspace lifecycle
  "workspace/creating": { workspaceId: string };
  "workspace/created": { workspaceId: string };
  "workspace/initializing": { workspaceId: string };
  "workspace/ready": { workspaceId: string };
  "workspace/starting": { workspaceId: string };
  "workspace/started": { workspaceId: string };
  "workspace/stopping": { workspaceId: string };
  "workspace/stopped": { workspaceId: string };
  "workspace/destroyed": { workspaceId: string };
  "workspace/error": { workspaceId: string; error: WorkspaceErrorShape };

  // multi-workspace isolation (spec section 141): named child workspaces
  "workspace/mounted": { workspaceId: string };
  "workspace/unmounted": { workspaceId: string };

  // repository
  "repository/connecting": { provider: string; repository: string };
  "repository/cloning": { provider: string; repository: string };
  "repository/cloned": { provider: string; repository: string; commit?: string };
  "repository/changed": { provider: string; repository: string };

  // agent
  "agent/starting": { provider: string };
  "agent/started": { provider: string; sessionId: string };
  "agent/stopping": { provider: string; sessionId: string };
  "agent/stopped": { provider: string; sessionId: string };

  // harness lifecycle — normalized harness-side events emitted by harness
  // adapters (capability: harness). Distinct from agent/* (the Workspace
  // agent session): session/* is the CODING HARNESS session the adapter
  // attached to (OpenCode/Codex/Claude Code). `model/before` is awaited;
  // subscribers (e.g. Repo Shield) may reject to veto a model generation
  // before it executes inside the host harness (spec sections 101–102).
  "session/starting": { harness: string; provider: string; sessionId?: string };
  "session/started": { harness: string; provider: string; sessionId: string };
  "session/stopping": { harness: string; provider: string; sessionId: string; reason?: string };
  "session/stopped": { harness: string; provider: string; sessionId: string; reason?: string };
  "model/before": { harness: string; provider: string; sessionId: string; promptLength: number };
  "model/after": { harness: string; provider: string; sessionId: string; ok: boolean; durationMs: number };
  "model/error": { harness: string; provider: string; sessionId: string; error: WorkspaceErrorShape };
  // context compaction — observational for now; prompts are never copied
  // into events (spec section 100).
  "compaction/planned": { harness: string; provider: string; sessionId: string; tokensBefore: number; tokensAfter: number };
  "compaction/started": { harness: string; provider: string; sessionId: string };
  "compaction/completed": { harness: string; provider: string; sessionId: string; tokensDropped: number };

  // commands & tools — `before` events are awaited; subscribers may reject
  "command/before": { command: string; args: readonly string[]; cwd?: string };
  "command/after": { command: string; args: readonly string[]; exitCode: number; durationMs: number };
  "tool/before": { tool: string; operation: string; inputs?: Readonly<Record<string, unknown>> };
  "tool/after": { tool: string; operation: string; ok: boolean; durationMs: number };

  // context
  "context/indexing": { provider: string };
  "context/indexed": { provider: string };

  // filesystem — `before-write` is awaited; subscribers (e.g. protection) may reject
  "filesystem/before-write": { path: string; size?: number };
  "filesystem/after-write": { path: string; size: number };

  // runtime
  "runtime/health": { provider: string; healthy: boolean };
  "runtime/error": { provider: string; error: WorkspaceErrorShape };

  // verification
  "verification/started": { commands: readonly string[] };
  "verification/completed": { ok: boolean; durationMs: number };

  // development lifecycle (spec sections 6/16) — per-stage progress of a
  // workspace's configured lifecycle; `attempt` counts retries from 1.
  "lifecycle/stage-started": {
    lifecycleId: string;
    stageId: string;
    stageType: string;
    attempt: number;
    agentProfileIds: readonly string[];
    toolIds: readonly string[];
  };
  "lifecycle/stage-completed": {
    lifecycleId: string;
    stageId: string;
    ok: boolean;
    durationMs: number;
    attempt: number;
  };
  "lifecycle/completed": {
    lifecycleId: string;
    ok: boolean;
    durationMs: number;
    failedStageId?: string;
  };

  // protection (Repo Shield layer)
  "protection/intervened": { operation: string; target: string; action: "allowed" | "blocked" | "requires-approval" };

  // checkpoints + gates (spec section 150, Helix-inspired)
  "checkpoint/started": { checkpointId: string; title: string };
  "checkpoint/gate-started": { checkpointId: string; gateId: string; gateKind: string };
  "checkpoint/gate-completed": {
    checkpointId: string;
    gateId: string;
    gateKind: string;
    status: "passed" | "failed" | "skipped";
    findings: readonly { severity: "blocker" | "major" | "minor" | "note"; location: string; issue: string; suggestion?: string }[];
    durationMs: number;
  };
  "checkpoint/completed": { checkpointId: string; evidence: readonly { gateId: string; status: "passed" | "failed" | "skipped" }[] };
  "checkpoint/failed": { checkpointId: string; reason: string; gateId?: string };

  // canonical lifecycle phases (spec section 151)
  "lifecycle/phase-started": { phase: string; title: string; index: number; total: number };
  "lifecycle/phase-skipped": { phase: string; reason: string };
  "lifecycle/phase-completed": { phase: string; durationMs: number; summary?: string };
  "lifecycle/flow-completed": { flow: string; passed: number; skipped: number };
}

export type WorkspaceEventName = keyof WorkspaceEventMap;
export type WorkspaceEvent<K extends WorkspaceEventName = WorkspaceEventName> = {
  readonly name: K;
  readonly payload: WorkspaceEventMap[K];
  readonly timestamp: string;
};

export interface EventSubscription {
  readonly id: string;
  unsubscribe(): void;
}

/**
 * The kernel-owned event bus. Handlers are awaited in registration order;
 * a handler that throws turns the emit into a rejection so that
 * before-execution subscribers (protection, permissions) can veto operations
 * (spec sections 101–102).
 */
export interface EventBus {
  on<K extends WorkspaceEventName>(
    event: K,
    handler: (payload: WorkspaceEventMap[K]) => void | Promise<void>,
    options?: { once?: boolean }
  ): EventSubscription;
  off<K extends WorkspaceEventName>(event: K, handler: (payload: WorkspaceEventMap[K]) => void | Promise<void>): void;
  emit<K extends WorkspaceEventName>(event: K, payload: WorkspaceEventMap[K]): Promise<void>;
}
