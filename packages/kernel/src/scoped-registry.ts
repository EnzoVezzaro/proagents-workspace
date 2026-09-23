/**
 * Scoped service registry (spec section 141 — multi-workspace isolation).
 *
 * The default `ServiceRegistry` is flat: one capability, one implementation.
 * Named workspaces need the SAME capability instantiated independently per
 * workspace (each with its own filesystem root, runtime handle, agent
 * session). A `ScopedServiceRegistry` holds a root registry plus named
 * scopes; a scope shadows the root for the ids it registers, and unmounting
 * a workspace disposes exactly its scope's registrations.
 *
 * This is the Workspace counterpart of Cordis' `ctx.isolate(name, label)`
 * (DeepSeek Harness): scoped service resolution over a plugin tree.
 */
import { WorkspaceError } from "@proagents/contracts";
import { ServiceRegistry } from "./service-registry.js";

/**
 * A registry whose lookups fall through to a parent when the id is not
 * registered locally. `register` always writes into THIS scope, so two
 * workspaces can each register the same capability id independently
 * (SERVICE_ALREADY_REGISTERED is decided per scope, never globally).
 */
export class ShadowingServiceRegistry extends ServiceRegistry {
  constructor(private readonly parent: ServiceRegistry) {
    super();
  }

  override has(definition: import("@proagents/contracts").ServiceDefinition<unknown>): boolean {
    return super.has(definition) || this.parent.has(definition);
  }

  override get<T>(definition: import("@proagents/contracts").ServiceDefinition<T>): T {
    if (super.has(definition)) return super.get(definition);
    return this.parent.get(definition);
  }
}

export class ScopedServiceRegistry {
  private readonly scopes = new Map<string, ShadowingServiceRegistry>();

  constructor(private readonly root: ServiceRegistry = new ServiceRegistry()) {}

  get rootRegistry(): ServiceRegistry {
    return this.root;
  }

  /** All mounted scope names (workspace ids), sorted for determinism. */
  scopeNames(): readonly string[] {
    return [...this.scopes.keys()].sort();
  }

  /** Does the named scope exist? */
  hasScope(name: string): boolean {
    return this.scopes.has(name);
  }

  /**
   * Create (or return the existing) scope. The scope registers into itself
   * and reads through to the root for anything it did not register.
   */
  scope(name: string): ShadowingServiceRegistry {
    const existing = this.scopes.get(name);
    if (existing) return existing;
    const scope = new ShadowingServiceRegistry(this.root);
    this.scopes.set(name, scope);
    return scope;
  }

  /**
   * Dispose a scope: every registration the workspace made is reclaimed.
   * The root registry is untouched. Unknown names are a programming error.
   */
  disposeScope(name: string): void {
    if (!this.scopes.has(name)) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Cannot dispose service scope "${name}" — no such scope.`,
        recoverable: false,
        suggestions: ["Check `workspaces:` keys in workspace.yaml", "List mounted workspaces first"],
      });
    }
    this.scopes.delete(name);
  }
}
