/**
 * WorkspaceManager (spec section 141 — multi-workspace isolation).
 *
 * Mounts N named workspaces from the `workspaces:` map in workspace.yaml,
 * each as an isolated scope: its own scoped service registry, its own
 * sandbox policy, its own session log, and its own plugin activation. One
 * shared event bus keeps protection (repo-shield) covering all workspaces;
 * payloads carry `workspaceId` where the contract defines it.
 *
 * DSH contrast (honest reporting): DSH's workspace registry is UX grouping;
 * isolation here comes from scoped service resolution + the sandbox policy.
 * The sandbox is same-world confinement — honestly reported, not a VM.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  sandboxPolicySchema,
  WorkspaceError,
  type SandboxMode,
  type WorkspaceConfig,
  type WorkspaceEntry,
} from "@proagents/contracts";
import { Workspace, type DiscoveredFactory } from "./workspace.js";
import { ScopedServiceRegistry, ShadowingServiceRegistry } from "./scoped-registry.js";
import { SessionLog } from "./session-log.js";
import type { Logger } from "./logger.js";
import type { WorkspacePlugin } from "./plugin-loader.js";

export interface MountedWorkspace {
  readonly workspaceId: string;
  readonly entry: WorkspaceEntry;
  /** Absolute root the workspace is confined to. */
  readonly root: string;
  readonly sandbox: SandboxMode;
  /** Scoped registry view — get() falls through to the root registry. */
  readonly services: ShadowingServiceRegistry;
  readonly log: SessionLog;
  /** Plugin ids activated INTO this workspace scope. */
  readonly pluginIds: readonly string[];
}

export interface WorkspaceManagerOptions {
  /** The parent (pre-validated) workspace configuration. */
  config: WorkspaceConfig;
  /** Same factories the parent workspace was booted with. */
  factories: readonly DiscoveredFactory[];
  /** Absolute base directory that relative workspace `root`s resolve against. */
  baseDir: string;
  /** Where per-workspace session logs live. */
  sessionsRoot: string;
  /** Parent workspace logger; child loggers bind workspaceId. */
  logger: Logger;
  /**
   * Permission framework for scope activation — typically the parent
   * framework extended with the named workspace's declared filesystem root.
   */
  permissions: import("./permissions.js").PermissionFramework;
}

export class WorkspaceManager {
  private readonly mounted = new Map<string, MountedWorkspace>();
  private readonly scopes: ScopedServiceRegistry;

  constructor(
    private readonly workspace: Workspace,
    private readonly options: WorkspaceManagerOptions
  ) {
    this.scopes = new ScopedServiceRegistry(workspace.services);
  }

  /** Snapshot of mounted workspaces, sorted by id (for `paw workspace list`). */
  list(): readonly MountedWorkspace[] {
    return [...this.mounted.values()].sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
  }

  get workspaceIds(): readonly string[] {
    return this.list().map((w) => w.workspaceId);
  }

  get isRootReady(): boolean {
    return this.workspace.lifecycle.current === "ready";
  }

  /**
   * Mount one named workspace: validate its entry, confine its root, resolve
   * its sandbox mode, create its session log, and activate its plugins into
   * its scope. Different names can mount simultaneously (Promise.all is safe;
   * each scope and log is independent).
   */
  async mount(workspaceId: string, overrides?: { sandbox?: SandboxMode; root?: string }): Promise<MountedWorkspace> {
    const config = this.options.config;
    const entry: WorkspaceEntry | undefined = config.workspaces?.[workspaceId];
    if (entry === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Workspace "${workspaceId}" is not declared under \`workspaces:\` in workspace.yaml.`,
        recoverable: true,
        suggestions: [
          "Add the workspace under `workspaces:` in workspace.yaml",
          "Run `paw config show --json` to inspect the effective configuration",
        ],
      });
    }

    // Sandbox mode: override > entry > default. `workspace-write` is the
    // backward-compatible default; `read-only` is recommended for unattended
    // multi-workspace runs (spec section 142).
    const sandbox = sandboxPolicySchema.parse({
      mode: overrides?.sandbox ?? entry.sandbox?.mode ?? "workspace-write",
    }).mode;
    const rootDir = pathResolve(this.options.baseDir, overrides?.root ?? entry.root);
    await assertRealProjectRoot(rootDir, workspaceId);

    if (this.mounted.has(workspaceId) || this.scopes.hasScope(workspaceId)) {
      throw new WorkspaceError({
        code: "WORKSPACE_ALREADY_MOUNTED",
        message: `Workspace "${workspaceId}" is already mounted.`,
        recoverable: true,
        suggestions: ["Unmount the workspace first", "Choose a different workspace name"],
      });
    }

    // Scope created BEFORE activation so plugins activating into the scope
    // register into it (Cordis `isolate` parity).
    const scope = this.scopes.scope(workspaceId);
    const log = await SessionLog.open(workspaceId, this.options.sessionsRoot);
    const logger = this.options.logger.child({ workspaceId });

    const activated: string[] = [];
    const activatedPlugins: WorkspacePlugin[] = [];
    for (const factory of this.options.factories) {
      const plugin = await factory.load();
      if (!this.relevantToWorkspace(plugin.manifest, entry)) continue;
      // Scope-activated plugins get their manifest permissions granted too
      // (same intersection with config as the parent boot — spec §59).
      // MERGE semantics: a plugin already activated at the parent (e.g. the
      // filesystem plugin with its refined root) must keep its existing
      // grants — grantPlugin() would REPLACE them and break the parent.
      this.options.permissions.refinePlugin(plugin.manifest.id, plugin.manifest.permissions);
      const context = {
        pluginId: plugin.manifest.id,
        config: this.options.config,
        logger,
        // Plugins see the scoped view; a second registration of the same
        // capability collides per scope, never globally.
        services: scope as unknown as Parameters<WorkspacePlugin["activate"]>[0]["services"],
        events: this.workspace.events,
        permissions: this.options.permissions,
        pluginOptions: () =>
          entry.plugins?.find((p) => p.id === plugin.manifest.id)?.options ?? {},
        sandbox,
        workspaceRoot: rootDir,
      };
      await plugin.activate(context);
      activated.push(plugin.manifest.id);
      activatedPlugins.push(plugin);
    }

    await this.workspace.events.emit("workspace/mounted", { workspaceId });
    const mounted: MountedWorkspace = {
      workspaceId,
      entry,
      root: rootDir,
      sandbox,
      services: scope,
      log,
      pluginIds: activated,
    };
    this.mounted.set(workspaceId, mounted);
    logger.info("workspace/mounted", { provider: "workspace-manager" });
    return mounted;
  }

  /**
   * Unmount: deactivate the plugins activated into this scope (reverse
   * order), dispose the scope, emit `workspace/unmounted`. The parent
   * workspace keeps running.
   */
  async unmount(workspaceId: string): Promise<void> {
    const mounted = this.mounted.get(workspaceId);
    if (!mounted) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Workspace "${workspaceId}" is not mounted.`,
        recoverable: true,
        suggestions: ["List mounted workspaces with `paw workspace list --json`"],
      });
    }
    this.mounted.delete(workspaceId);
    for (const pluginId of [...mounted.pluginIds].reverse()) {
      const factory = this.options.factories.find((f) => f.source === pluginId);
      if (factory === undefined) continue;
      try {
        const plugin = await factory.load();
        await plugin.deactivate?.({
          pluginId,
          config: this.options.config,
          logger: this.options.logger.child({ workspaceId }),
          services: mounted.services as unknown as Parameters<WorkspacePlugin["activate"]>[0]["services"],
          events: this.workspace.events,
          permissions: this.options.permissions,
          pluginOptions: () =>
            mounted.entry.plugins?.find((p) => p.id === pluginId)?.options ?? {},
          sandbox: mounted.sandbox,
          workspaceRoot: mounted.root,
        });
      } catch (error) {
        this.options.logger.warn("workspace/scope-plugin-deactivate-failed", {
          workspaceId,
          provider: pluginId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.scopes.disposeScope(workspaceId);
    await this.workspace.events.emit("workspace/unmounted", { workspaceId });
    this.options.logger.info("workspace/unmounted", { provider: "workspace-manager", workspaceId });
  }

  /** Aggregate health across the parent workspace and all mounted scopes. */
  async doctor(): Promise<import("./health.js").DoctorEntry[]> {
    const parent = await this.workspace.doctor();
    return [
      ...parent,
      ...this.list().map((m) => ({
        pluginId: `workspace:${m.workspaceId}`,
        health: {
          status: "healthy" as const,
          message: `mounted, sandbox=${m.sandbox}, root=${m.root}`,
        },
      })),
    ];
  }

  /**
   * Which factories are relevant to a named workspace? The workspace entry's
   * `plugins:` selections first; without them, plugin-level selections from
   * the top-level config apply as for the parent (config-referenced check).
   */
  private relevantToWorkspace(
    manifest: import("@proagents/contracts").PluginManifest,
    entry: WorkspaceEntry
  ): boolean {
    const selections = entry.plugins;
    if (selections !== undefined) {
      const provider = manifest.provider ?? manifest.id;
      return selections.some((p) => p.id === manifest.id || p.id === provider);
    }
    // No per-workspace selection: inherit the parent's tool-based reference
    // check by matching capability ids against the top-level tools list.
    const tools = new Set(this.options.config.tools ?? []);
    if (tools.size === 0) return true; // no restriction — activate all factories into the scope
    return manifest.capabilities.some((c) => tools.has(c));
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pathResolve(base: string, root: string): string {
  return path.isAbsolute(root) ? root : path.resolve(base, root);
}

/**
 * Honest boundary check: the workspace root must be an existing directory.
 * A missing marker set is allowed (new projects) but the directory itself
 * must exist — this is an existence check, not a security boundary; the
 * sandbox policy and path grants remain the enforcement layer.
 */
async function assertRealProjectRoot(dir: string, workspaceId: string): Promise<void> {
  const stat = await fs.stat(dir).catch(() => undefined);
  if (stat?.isDirectory() !== true) {
    throw new WorkspaceError({
      code: "WORKSPACE_INVALID_STATE",
      message: `Workspace "${workspaceId}" root ${dir} does not exist or is not a directory.`,
      recoverable: true,
      suggestions: ["Create the directory", "Fix the `root` in the workspace entry"],
    });
  }
}
