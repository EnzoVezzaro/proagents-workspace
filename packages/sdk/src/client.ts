/**
 * WorkspaceClient — the programmatic API. The CLI and SDK call the same
 * services; the client is that shared implementation surface (spec section 64).
 */
import {
  WorkspaceError,
  workspaceConfigSchema,
  type ProviderHealth,
  type WorkspaceConfig,
} from "@proagents/contracts";
import {
  Workspace,
  type ApprovalFlow,
  type CommandDefinition,
  type DoctorEntry,
  type ServiceRegistry,
} from "@proagents/kernel";
import type { PluginDefinition } from "./define-plugin.js";

export interface WorkspaceClientOptions {
  config: unknown;
  plugins?: readonly PluginDefinition[];
  /**
   * Treat the provided plugins as a CATALOG: they activate only when the
   * workspace configuration references them (by id or capability). Use this
   * for bundled plugin sets, e.g. the CLI's. Default is explicit activation.
   */
  catalog?: boolean;
  approvalFlow?: ApprovalFlow;
  logSink?: (record: import("@proagents/contracts").LogRecord) => void;
}

export class WorkspaceClient {
  private workspace: Workspace | null = null;
  private readonly options: WorkspaceClientOptions;

  constructor(options: WorkspaceClientOptions) {
    this.options = options;
  }

  /** Boot the workspace: validate config, activate plugins in dependency order. */
  async start(): Promise<Workspace> {
    if (this.workspace) return this.workspace;
    const workspace = await Workspace.create(
      {
        config: this.options.config,
        approvalFlow: this.options.approvalFlow,
        logSink: this.options.logSink,
      },
      (this.options.plugins ?? []).map((definition) => ({
        source: definition.manifest.id,
        load: () => definition,
        ...(this.options.catalog === true ? { implicit: true } : {}),
      }))
    );
    await workspace.initialize();
    this.workspace = workspace;
    return workspace;
  }

  async stop(): Promise<void> {
    if (!this.workspace) return;
    await this.workspace.shutdown();
    this.workspace = null;
  }

  /** `paw doctor` equivalent: aggregated provider health. */
  async doctor(): Promise<DoctorEntry[]> {
    const ws = await this.start();
    return ws.doctor();
  }

  /** `paw plugin list` equivalent. */
  async pluginList(): Promise<readonly { id: string; version: string; capabilities: readonly string[] }[]> {
    const ws = await this.start();
    return ws.pluginIds.map((id) => {
      const manifest = this.options.plugins?.find((p) => p.manifest.id === id)?.manifest;
      return {
        id,
        version: manifest?.version ?? "unknown",
        capabilities: manifest?.capabilities ?? [],
      };
    });
  }

  /** `paw service list` equivalent. */
  async serviceList(): Promise<ReturnType<ServiceRegistry["list"]>> {
    const ws = await this.start();
    return ws.services.list();
  }

  /** Access a capability through the service registry (the sanctioned way). */
  async service<T>(definition: import("@proagents/contracts").ServiceDefinition<T>): Promise<T> {
    const ws = await this.start();
    return ws.services.get(definition);
  }

  /** Typed event bus access for integrations. */
  async events(): Promise<Workspace["events"]> {
    const ws = await this.start();
    return ws.events;
  }

  /** Effective, validated configuration. */
  async effectiveConfig(): Promise<WorkspaceConfig> {
    const ws = await this.start();
    return ws.config;
  }

  /** Validate a raw configuration object without booting a workspace. */
  static validateConfig(config: unknown): { ok: boolean; issues?: readonly string[]; config?: WorkspaceConfig } {
    const parsed = workspaceConfigSchema.safeParse(config);
    if (parsed.success) return { ok: true, config: parsed.data };
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
}

export { WorkspaceError };
export type { ProviderHealth, CommandDefinition };
