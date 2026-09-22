/**
 * The Workspace — kernel orchestration of plugin activation, lifecycle,
 * permissions and events. This is the object the SDK hands to the CLI.
 */
import {
  workspaceConfigSchema,
  WorkspaceError,
  type WorkspaceConfig,
} from "@proagents/contracts";
import { KernelEventBus } from "./event-bus.js";
import { ServiceRegistry } from "./service-registry.js";
import { PermissionFramework, type ApprovalFlow } from "./permissions.js";
import { PluginLoader, type PluginContext, type WorkspacePlugin } from "./plugin-loader.js";
import { LifecycleStateMachine } from "./lifecycle.js";
import { StructuredLogger, type Logger } from "./logger.js";
import { aggregateHealth, type DoctorEntry } from "./health.js";
import { satisfiesRange } from "./semver.js";

const WORKSPACE_API_VERSION = "1.0.0";

export interface WorkspaceOptions {
  /** Pre-validated config object, or raw YAML/JSON-compatible object to validate. */
  config: unknown;
  /** Sink for structured log records. */
  logSink?: (record: import("@proagents/contracts").LogRecord) => void;
  /** Approval flow for guarded/manual modes; defaults to fail-closed headless. */
  approvalFlow?: ApprovalFlow;
}

export interface PluginRuntime {
  readonly pluginId: string;
  readonly events: KernelEventBus;
  readonly services: ServiceRegistry;
  readonly permissions: PermissionFramework;
  readonly logger: Logger;
  readonly config: WorkspaceConfig;
}

export class Workspace {
  readonly events = new KernelEventBus();
  readonly services = new ServiceRegistry();
  readonly lifecycle = new LifecycleStateMachine();
  readonly config: WorkspaceConfig;
  readonly permissions: PermissionFramework;
  readonly logger: Logger;

  private readonly loader = new PluginLoader();
  private readonly plugins: WorkspacePlugin[] = [];
  private readonly contexts = new Map<string, PluginContext>();
  private readonly logSink?: (record: import("@proagents/contracts").LogRecord) => void;

  private constructor(
    config: WorkspaceConfig,
    logSink?: (record: import("@proagents/contracts").LogRecord) => void
  ) {
    this.config = config;
    this.logSink = logSink;
    this.logger = new StructuredLogger(logSink ? [logSink] : [], {}, "info");
    this.permissions = new PermissionFramework(config);
  }

  /** Create a workspace from a raw config object (Zod-validated at the boundary). */
  static async create(options: WorkspaceOptions, plugins: DiscoveredFactory[]): Promise<Workspace> {
    const parsed = workspaceConfigSchema.safeParse(options.config);
    if (!parsed.success) {
      throw new WorkspaceError({
        code: "CONFIG_INVALID",
        message: `Invalid workspace configuration: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
        recoverable: true,
        suggestions: ["Fix the errors in workspace.yaml and retry"],
        details: { issues: parsed.error.issues },
      });
    }
    const workspace = new Workspace(parsed.data, options.logSink);
    // The declared `workspaceApi` range must be satisfiable by this kernel
    // before anything else runs (spec section 120).
    if (parsed.data.workspaceApi !== undefined && !satisfiesRange(WORKSPACE_API_VERSION, parsed.data.workspaceApi)) {
      throw new WorkspaceError({
        code: "CONFIG_VERSION_UNSUPPORTED",
        message: `workspace.yaml declares workspaceApi "${parsed.data.workspaceApi}", but this kernel provides ${WORKSPACE_API_VERSION}.`,
        recoverable: false,
        suggestions: ["Regenerate the workspace with a matching paw version", "Bump workspaceApi in workspace.yaml"],
        details: { declared: parsed.data.workspaceApi, supported: WORKSPACE_API_VERSION },
      });
    }
    if (options.approvalFlow) {
      (workspace as unknown as { permissions: PermissionFramework }).permissions =
        new PermissionFramework(parsed.data, options.approvalFlow);
    }
    for (const factory of plugins) {
      workspace.loader.add(factory.source, factory.load, { implicit: factory.implicit === true });
    }
    return workspace;
  }

  /** Activate all plugins in dependency order. */
  async initialize(): Promise<void> {
    this.lifecycle.transition("initializing");
    try {
      await this.events.emit("workspace/initializing", { workspaceId: this.id });
      const plan = await this.loader.resolve(this.config);
      for (const plugin of plan) await this.activate(plugin);
      this.lifecycle.transition("ready");
      await this.events.emit("workspace/ready", { workspaceId: this.id });
    } catch (error) {
      await this.fail(error);
    }
  }

  /**
   * Unwind a partially-started workspace (spec section 60): deactivate the
   * plugins that did activate (reverse order), emit `workspace/error`, move to
   * the `error` state, then rethrow the original failure.
   */
  private async fail(error: unknown): Promise<never> {
    for (const plugin of [...this.plugins].reverse()) {
      try {
        await plugin.deactivate?.(this.contexts.get(plugin.manifest.id) as PluginContext);
      } catch {
        // teardown must never mask the original failure
      }
    }
    const shape: import("@proagents/contracts").WorkspaceErrorShape =
      error instanceof WorkspaceError
        ? error.toJSON()
        : {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : String(error),
            recoverable: false,
            suggestions: ["Check the workspace logs for the underlying cause"],
          };
    try {
      await this.events.emit("workspace/error", { workspaceId: this.id, error: shape });
    } catch {
      // a throwing error-subscriber must not mask the original failure
    }
    try {
      if (this.lifecycle.can("error")) this.lifecycle.transition("error");
    } catch {
      // already in a terminal state
    }
    throw error;
  }

  private async activate(plugin: WorkspacePlugin): Promise<void> {
    const pluginId = plugin.manifest.id;
    const logger = this.logger.child({ provider: pluginId });
    const context: PluginContext = {
      pluginId,
      config: this.config,
      logger,
      services: this.services,
      events: this.events,
      permissions: this.permissions,
      pluginOptions: () => {
        const declared = (this.config.plugins ?? []).find((p) => p.id === pluginId);
        return declared?.options ?? {};
      },
    };
    this.logger.debug("plugin/activating", { provider: pluginId });
    // Grant the manifest's declared permissions BEFORE activation so plugins
    // can refine their effective request during activate() — e.g. a
    // filesystem plugin computes its scope from plugin options. Grants stay
    // intersected with configuration, so a plugin can never self-grant
    // beyond what workspace.yaml allows (spec section 59).
    this.permissions.grantPlugin(pluginId, plugin.manifest.permissions);
    await plugin.activate(context);
    this.plugins.push(plugin);
    this.contexts.set(pluginId, context);
    this.logger.info("plugin/activated", { provider: pluginId });
  }

  async shutdown(): Promise<void> {
    const state = this.lifecycle.current;
    // Idempotent teardown: never double-deactivate, never transition out of a
    // terminal state. A workspace that errored during initialize() was already
    // unwound by fail().
    if (state === "destroyed" || state === "stopped" || state === "error" || state === "created") return;
    try {
      if (this.lifecycle.can("stopping")) this.lifecycle.transition("stopping");
    } catch {
      // tolerate unexpected transitions during teardown
    }
    try {
      await this.events.emit("workspace/stopping", { workspaceId: this.id });
    } catch {
      // a throwing stopping-subscriber must not prevent teardown
    }
    for (const plugin of [...this.plugins].reverse()) {
      try {
        await plugin.deactivate?.(this.contexts.get(plugin.manifest.id) as PluginContext);
      } catch (error) {
        this.logger.warn("plugin/deactivate-failed", {
          provider: plugin.manifest.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    try {
      if (this.lifecycle.can("stopped")) this.lifecycle.transition("stopped");
    } catch {
      // tolerate unexpected transitions during teardown
    }
    try {
      await this.events.emit("workspace/stopped", { workspaceId: this.id });
    } catch {
      // a throwing stopped-subscriber must not prevent teardown
    }
  }

  async doctor(): Promise<DoctorEntry[]> {
    return aggregateHealth(this.plugins, this.services);
  }

  get id(): string {
    // Deterministic local id; a remote runtime provider replaces this.
    return "ws_local_default";
  }

  get pluginIds(): readonly string[] {
    return this.plugins.map((p) => p.manifest.id);
  }
}

/** A plugin registration handed to Workspace.create(). */
export interface DiscoveredFactory {
  readonly source: string;
  readonly load: () => Promise<WorkspacePlugin> | WorkspacePlugin;
  /**
   * Catalog plugins (e.g. the CLI's bundled set) activate only when the
   * workspace configuration references them; explicit registrations always
   * activate.
   */
  readonly implicit?: boolean;
}
