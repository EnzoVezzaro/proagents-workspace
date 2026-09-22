/**
 * The kernel event bus (spec section 7).
 *
 * Handlers run in registration order and are awaited. A throwing handler
 * turns `emit` into a rejection — this is what lets protection and permission
 * subscribers veto operations BEFORE they execute (spec sections 101–102),
 * instead of logging after the fact.
 */
import type {
  EventSubscription,
  EventBus,
  WorkspaceEventMap,
  WorkspaceEventName,
} from "@proagents/contracts";

type Handler<K extends WorkspaceEventName> = (
  payload: WorkspaceEventMap[K]
) => void | Promise<void>;

interface Registration {
  handler: Handler<WorkspaceEventName>;
  once: boolean;
}

export class KernelEventBus implements EventBus {
  private readonly handlers = new Map<WorkspaceEventName, Registration[]>();
  private nextId = 0;

  on<K extends WorkspaceEventName>(
    event: K,
    handler: Handler<K>,
    options?: { once?: boolean }
  ): EventSubscription {
    const list = this.handlers.get(event) ?? [];
    const registration: Registration = {
      handler: handler as Handler<WorkspaceEventName>,
      once: options?.once ?? false,
    };
    list.push(registration);
    this.handlers.set(event, list);
    const id = `sub_${event}_${this.nextId++}`;
    return {
      id,
      unsubscribe: () => this.off(event, handler),
    };
  }

  off<K extends WorkspaceEventName>(event: K, handler: Handler<K>): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const index = list.findIndex((r) => r.handler === (handler as Handler<WorkspaceEventName>));
    if (index >= 0) list.splice(index, 1);
  }

  async emit<K extends WorkspaceEventName>(
    event: K,
    payload: WorkspaceEventMap[K]
  ): Promise<void> {
    const list = this.handlers.get(event);
    if (!list) return;
    // Snapshot: handlers registered during dispatch do not run for this emit.
    const snapshot = [...list];
    for (const registration of snapshot) {
      if (registration.once) {
        const idx = list.indexOf(registration);
        if (idx >= 0) list.splice(idx, 1);
      }
      await registration.handler(payload);
    }
  }

  listenerCount(event: WorkspaceEventName): number {
    return this.handlers.get(event)?.length ?? 0;
  }
}
