/**
 * Plugin discovery, validation and dependency resolution.
 *
 * A plugin is anything that exposes a `createPlugin(): WorkspacePlugin` plus a
 * manifest satisfying pluginManifestSchema (spec section 59). The kernel:
 *   1. discovers candidates (config-declared plugins + explicit registrations)
 *   2. validates manifests (Zod, spec section 119)
 *   3. checks compatibility ranges against the workspace API
 *   4. topologically sorts by declared dependencies (cycle → error)
 *   5. activates in dependency order, then requests permissions
 */
import {
  pluginManifestSchema,
  WorkspaceError,
  type PluginManifest,
  type WorkspaceConfig,
} from "@proagents/contracts";
import { satisfiesRange } from "./semver.js";

/** The plugin-facing surface. Implemented by concrete plugins. */
export interface WorkspacePlugin {
  readonly manifest: PluginManifest;
  /** Called once, in dependency order. Register services here. */
  activate(context: PluginContext): Promise<void> | void;
  /** Called in reverse order on shutdown, with the activation context. */
  deactivate?(context: PluginContext): Promise<void> | void;
  /** Optional health contribution for `paw doctor`. */
  health?(): Promise<import("@proagents/contracts").ProviderHealth>;
}

/** What the kernel hands to a plugin at activation. */
export interface PluginContext {
  readonly pluginId: string;
  readonly config: WorkspaceConfig;
  /** Plugin-scoped structured logger (secrets redacted, spec section 100). */
  readonly logger: import("./logger.js").Logger;
  /** Register capability implementations. */
  readonly services: import("./service-registry.js").ServiceRegistry;
  /** Typed event bus — the sanctioned integration point (spec section 7). */
  readonly events: import("./event-bus.js").KernelEventBus;
  /** Request permissions; granted only if the configuration allows them. */
  readonly permissions: import("./permissions.js").PermissionFramework;
  /** Plugin-specific configuration section from workspace.yaml. */
  pluginOptions(): Record<string, unknown>;
  /**
   * Sandbox policy mode of the workspace scope this plugin instance runs in
   * (spec section 142). For the parent workspace this comes from
   * `WorkspaceOptions.sandbox`; for named scopes, from the workspace entry.
   * Undefined = no policy declared (no veto is applied).
   */
  readonly sandbox?: import("@proagents/contracts").SandboxMode;
  /**
   * Absolute filesystem root of the named workspace scope this plugin
   * instance runs in (spec section 141). Undefined outside a named scope.
   */
  readonly workspaceRoot?: string;
}

export interface DiscoveredPlugin {
  readonly source: string;
  readonly load: () => Promise<WorkspacePlugin> | WorkspacePlugin;
  /**
   * Implicit candidates (bundled plugins) activate only when the workspace
   * configuration references them — by plugin id or by capability need.
   * Explicit registrations always activate.
   */
  readonly implicit?: boolean;
}

const WORKSPACE_API_VERSION = "1.0.0";

export class PluginLoader {
  private readonly candidates = new Map<string, DiscoveredPlugin>();

  /** Register a plugin candidate. Implicit candidates activate only when config-referenced. */
  add(source: string, load: () => Promise<WorkspacePlugin> | WorkspacePlugin, options?: { implicit?: boolean }): void {
    this.candidates.set(source, { source, load, ...(options?.implicit ? { implicit: true } : {}) });
  }

  /** Discover plugins declared in workspace.yaml (`plugins:` section). */
  discoverFromConfig(config: WorkspaceConfig): void {
    for (const declared of config.plugins ?? []) {
      if (this.candidates.has(declared.id)) continue;
      this.candidates.set(declared.id, {
        source: declared.id,
        load: () => {
          throw new WorkspaceError({
            code: "PLUGIN_LOAD_FAILED",
            message: `Plugin "${declared.id}" is declared in workspace.yaml but no module was registered for it.`,
            recoverable: true,
            suggestions: [
              "Register the plugin module with the SDK before loading the workspace",
              "Remove the plugin from workspace.yaml",
            ],
          });
        },
      });
    }
  }

  /**
   * Resolve the full activation plan. Deterministic: dependency order,
   * tie-broken by plugin id.
   */
  async resolve(config: WorkspaceConfig): Promise<WorkspacePlugin[]> {
    this.discoverFromConfig(config);
    const loaded = new Map<string, WorkspacePlugin>();

    for (const candidate of this.candidates.values()) {
      let plugin: WorkspacePlugin;
      try {
        plugin = await candidate.load();
      } catch (error) {
        // A faulty bundled (implicit) plugin must not break the workspace
        // (spec section 61); explicitly declared plugins still fail loudly.
        if (candidate.implicit === true) continue;
        if (error instanceof WorkspaceError) throw error;
        throw new WorkspaceError({
          code: "PLUGIN_LOAD_FAILED",
          message: `Plugin "${candidate.source}" failed to load: ${error instanceof Error ? error.message : String(error)}`,
          recoverable: false,
          suggestions: ["Check the plugin installation", "Run `paw doctor` for details"],
        });
      }
      // Validate the manifest before referencing it (spec section 119).
      let manifest: PluginManifest;
      try {
        manifest = pluginManifestSchema.parse(plugin.manifest);
      } catch (error) {
        if (candidate.implicit === true) continue;
        throw new WorkspaceError({
          code: "PLUGIN_MANIFEST_INVALID",
          message: `Plugin "${candidate.source}" has an invalid manifest: ${error instanceof Error ? error.message : String(error)}`,
          recoverable: false,
          suggestions: ["Fix the plugin manifest to satisfy pluginManifestSchema", "Update the plugin to a version this workspace supports"],
        });
      }
      if (candidate.implicit === true && !this.referencedByConfig(manifest, config)) {
        continue; // bundled plugin not referenced by this workspace configuration
      }
      loaded.set(manifest.id, { ...plugin, manifest });
    }

    // Compatibility check against the workspace API (spec section 120).
    for (const plugin of loaded.values()) {
      const requiredApi = plugin.manifest.compatibility["workspaceApi"];
      if (requiredApi !== undefined && !satisfiesRange(WORKSPACE_API_VERSION, requiredApi)) {
        throw new WorkspaceError({
          code: "PLUGIN_INCOMPATIBLE",
          message: `Plugin "${plugin.manifest.id}" requires workspace API ${requiredApi}, but this kernel provides ${WORKSPACE_API_VERSION}.`,
          recoverable: false,
          suggestions: ["Upgrade the plugin", "Upgrade the workspace kernel"],
          details: { plugin: plugin.manifest.id, requiredApi, workspaceApi: WORKSPACE_API_VERSION },
        });
      }
    }

    // Dependency check (spec section 59).
    const declaredIds = new Set(loaded.keys());
    for (const plugin of loaded.values()) {
      for (const dependency of plugin.manifest.dependencies) {
        if (!declaredIds.has(dependency)) {
          throw new WorkspaceError({
            code: "PLUGIN_DEPENDENCY_MISSING",
            message: `Plugin "${plugin.manifest.id}" depends on "${dependency}", which is not present.`,
            recoverable: false,
            suggestions: [`Add the "${dependency}" plugin to workspace.yaml`],
          });
        }
      }
    }

    // Topological sort (Kahn) with cycle detection; deterministic tie-break.
    const ids = [...loaded.keys()].sort();
    const inDegree = new Map<string, number>(ids.map((id) => [id, 0]));
    const dependents = new Map<string, string[]>();
    for (const plugin of loaded.values()) {
      for (const dependency of plugin.manifest.dependencies) {
        inDegree.set(plugin.manifest.id, (inDegree.get(plugin.manifest.id) ?? 0) + 1);
        dependents.set(dependency, [...(dependents.get(dependency) ?? []), plugin.manifest.id]);
      }
    }
    const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0);
    const order: string[] = [];
    while (queue.length > 0) {
      queue.sort();
      const id = queue.shift() as string;
      order.push(id);
      for (const dependent of dependents.get(id) ?? []) {
        const next = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, next);
        if (next === 0) queue.push(dependent);
      }
    }
    if (order.length !== loaded.size) {
      const cycle = ids.filter((id) => !order.includes(id));
      throw new WorkspaceError({
        code: "PLUGIN_DEPENDENCY_CYCLE",
        message: `Plugin dependency cycle detected involving: ${cycle.join(", ")}.`,
        recoverable: false,
        suggestions: ["Remove the cyclic dependency from one of the plugin manifests"],
        details: { cycle },
      });
    }

    return order.map((id) => loaded.get(id) as WorkspacePlugin);
  }

  /**
   * Does the configuration reference this plugin? Provider values in
   * workspace.yaml (e.g. `runtime.provider: "local"`) are compared against
   * the declarative `provider` on the manifest (falling back to the plugin
   * id), so plugin ids and provider vocabulary both work — the kernel never
   * maps provider names itself (spec section 139).
   */
  private referencedByConfig(manifest: PluginManifest, config: WorkspaceConfig): boolean {
    const provider = manifest.provider ?? manifest.id;
    if ((config.plugins ?? []).some((p) => p.id === manifest.id)) return true;
    // Runtime is optional (convention-first, spec section 148): a local
    // workspace declares no runtime — the host machine is the runtime.
    if (config.runtime?.provider === manifest.id || config.runtime?.provider === provider) return true;
    if (config.repository?.provider === manifest.id || config.repository?.provider === provider) return true;
    if (config.agent?.provider === manifest.id || config.agent?.provider === provider) return true;
    if ((config.context?.providers ?? []).some((p) => p === manifest.id || p === provider)) return true;
    if (config.protection?.provider === manifest.id || config.protection?.provider === provider) return true;
    if (config.distribution?.provider === manifest.id || config.distribution?.provider === provider) return true;
    // Tools select capability plugins: e.g. tools: [shell, filesystem].
    // Tools match CAPABILITY ids, not provider vocabulary — the config's
    // `tools: [git]` is a capability hint, and the git plugin declares
    // capability `repository`.
    const tools = new Set(config.tools ?? []);
    if (manifest.capabilities.some((c) => tools.has(c))) return true;
    return false;
  }
}
