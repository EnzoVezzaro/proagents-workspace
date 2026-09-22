/**
 * Workspace lifecycle state machine.
 *
 * Transitions follow the documented lifecycle:
 *   creating → created → initializing → ready → starting → started
 *   → stopping → stopped → destroyed
 * Any state may transition to `error`; recovery returns to the prior state.
 */
export const LIFECYCLE_STATES = [
  "created",
  "initializing",
  "ready",
  "starting",
  "started",
  "stopping",
  "stopped",
  "destroyed",
  "error",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

const TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]> = {
  created: ["initializing", "destroyed"],
  initializing: ["ready", "error", "destroyed"],
  ready: ["starting", "stopping", "destroyed", "error"],
  starting: ["started", "error", "stopped"],
  started: ["stopping", "error"],
  stopping: ["stopped", "error"],
  stopped: ["starting", "destroyed"],
  destroyed: [],
  error: [],
};

export class LifecycleStateMachine {
  private state: LifecycleState = "created";
  private readonly listeners = new Set<(from: LifecycleState, to: LifecycleState) => void>();

  get current(): LifecycleState {
    return this.state;
  }

  can(to: LifecycleState): boolean {
    return TRANSITIONS[this.state].includes(to);
  }

  transition(to: LifecycleState): LifecycleState {
    if (!this.can(to)) {
      throw new Error(`Invalid lifecycle transition: ${this.state} → ${to}`);
    }
    const from = this.state;
    this.state = to;
    for (const listener of this.listeners) listener(from, to);
    return from;
  }

  onTransition(listener: (from: LifecycleState, to: LifecycleState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
