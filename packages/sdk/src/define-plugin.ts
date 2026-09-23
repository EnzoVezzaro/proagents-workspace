/**
 * `definePlugin` — the authoring surface for ProAgents Workspace plugins.
 *
 * A plugin bundles a manifest (validated against pluginManifestSchema) with an
 * activate/deactivate pair. Capabilities are registered through the plugin
 * context's service registry; cross-cutting behavior subscribes to typed
 * events. Plugins never import each other (spec section 7).
 */
import type { DevelopmentLifecycle, PluginManifest, ProviderHealth, WorkspaceConfig } from "@proagents/contracts";
import type { KernelEventBus, Logger, PluginContext, ServiceRegistry } from "@proagents/kernel";
import type { PermissionFramework } from "@proagents/kernel";

export interface PluginAuthorContext extends PluginContext {
  readonly events: KernelEventBus;
  readonly services: ServiceRegistry;
  readonly permissions: PermissionFramework;
  readonly logger: Logger;
  readonly config: WorkspaceConfig;
}

export interface PluginDefinition {
  readonly manifest: PluginManifest;
  activate(context: PluginAuthorContext): Promise<void> | void;
  deactivate?(context: PluginAuthorContext): Promise<void> | void;
  health?(): Promise<ProviderHealth>;
  /**
   * Lifecycle definition contribution (spec sections 16/146): a plugin with
   * the `lifecycle` capability returns the definitions it contributes — pure
   * DATA resolved by the host when building the lifecycle library. The
   * engine keeps sole authority over execution; contributions cannot inject
   * behavior.
   */
  definitions?(): readonly DevelopmentLifecycle[];
}

export function definePlugin(definition: PluginDefinition): {
  manifest: PluginManifest;
  activate(context: PluginContext): Promise<void> | void;
  deactivate?(context: PluginContext): Promise<void> | void;
  health?(): Promise<ProviderHealth>;
  definitions?(): readonly DevelopmentLifecycle[];
} {
  return definition;
}
