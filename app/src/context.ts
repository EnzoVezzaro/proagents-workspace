/**
 * Kernel-boot context for the control-room server.
 *
 * Owns the idempotent boot: WorkspaceClient (real kernel), the bundled plugin
 * catalog, the WorkspaceManager (multi-workspace mounts), the agent roster and
 * the project registry. Subscribes to every typed kernel event name once and
 * mirrors them into the SSE feed (§143 projection; spec §145: the UI is a
 * projection over kernel events — never the source of truth).
 */
import path from "node:path";
import {
  WorkspaceError,
  defineService,
  type AgentProvider,
  type FilesystemProvider,
  type RepositoryProvider,
  type ShellProvider,
  type WorkspaceEventName,
  type WorkspaceConfig,
} from "@proagents/contracts";
import { WorkspaceClient, type PluginDefinition } from "@proagents/workspace";
import { WorkspaceManager, LifecycleRunner, type MountedWorkspace } from "@proagents/kernel";
import { bundledPlugins } from "./plugins.js";
import { AgentRoster, type HiredAgent } from "./agents.js";
import { ProjectRegistry, type ConnectedProject } from "./projects.js";
import { TerminalManager } from "./terminal.js";

export const PORT = Number(process.env.PAW_UI_PORT ?? 4600);
export const HOST = process.env.PAW_UI_HOST ?? "127.0.0.1";
export const BASE_DIR = process.env.PAW_UI_BASE_DIR ?? process.cwd();
export const SESSIONS_ROOT = process.env.PAW_UI_SESSIONS_ROOT ?? path.join(BASE_DIR, ".paw", "sessions");
export const MAX_FEED = 500;

/**
 * Lifecycle definitions contributed by PLUGINS (spec §146): every bundled
 * plugin with a `definitions()` hook contributes named lifecycles. This is
 * plugin-first — adding a lifecycle plugin extends the library with no code
 * change here. Plugin contributions are merged AFTER config-file
 * definitions; config wins on id collision (explicit configuration beats
 * bundled defaults).
 */
function pluginLifecycles(): import("@proagents/contracts").DevelopmentLifecycle[] {
  return bundledPlugins().flatMap((p) => p.definitions?.() ?? []);
}

export const shellService = defineService<ShellProvider>({ id: "shell", contractVersion: "1.0.0" });
export const filesystemService = defineService<FilesystemProvider>({ id: "filesystem", contractVersion: "1.0.0" });
export const gitService = defineService<RepositoryProvider>({ id: "repository", contractVersion: "1.0.0" });
export const agentService = defineService<AgentProvider>({ id: "agent", contractVersion: "1.0.0" });

/**
 * The default development lifecycle (spec sections 6/16) — Understand → Plan
 * → Implement → Test → Review → Ship, with per-stage agents/tools/policies.
 * Workspaces override it via their config entry (`lifecycle.ref` / inline) or
 * `PAW_LIFECYCLE_JSON` supplies extra named definitions at boot.
 */
const DEFAULT_LIFECYCLE = {
  id: "default",
  name: "Default development lifecycle",
  description: "Understand → Plan → Implement → Test → Review → Ship.",
  stages: [
    {
      id: "understand", name: "Understand", type: "understand",
      agents: [{ profileId: "generalist", role: "explorer" }],
      tools: [{ id: "repo-context", type: "search" }],
      policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    },
    {
      id: "plan", name: "Plan", type: "plan",
      agents: [{ profileId: "spec-editor", role: "planner" }],
      tools: [{ id: "repo-context", type: "search" }],
      policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    },
    {
      id: "implement", name: "Implement", type: "implement",
      agents: [{ profileId: "nodejs-engineer", role: "implementer" }],
      tools: [{ id: "terminal", type: "terminal" }, { id: "files", type: "filesystem" }, { id: "git", type: "git" }],
      policy: { parallel: false, required: true, onFailure: "stop", maxRetries: 1 },
    },
    {
      id: "test", name: "Test", type: "test",
      agents: [{ profileId: "verification-engineer", role: "tester" }],
      tools: [{ id: "terminal", type: "terminal" }, { id: "vitest", type: "vitest" }],
      policy: { parallel: false, required: false, onFailure: "continue", maxRetries: 1 },
    },
    {
      id: "review", name: "Review", type: "review",
      agents: [{ profileId: "security-reviewer", role: "reviewer" }],
      tools: [{ id: "git-diff", type: "git" }],
      policy: { parallel: false, required: false, onFailure: "continue", maxRetries: 1 },
    },
    {
      id: "ship", name: "Ship", type: "ship",
      agents: [],
      tools: [{ id: "git", type: "git" }, { id: "build", type: "terminal", config: { command: "pnpm build" } }],
      policy: { parallel: false, required: false, onFailure: "stop", maxRetries: 1 },
    },
  ],
} as const;

/** Extra lifecycle definitions from PAW_LIFECYCLE_JSON (boot-time, validated). */
function extraLifecycles(): unknown[] {
  const raw = process.env.PAW_LIFECYCLE_JSON;
  if (raw === undefined || raw.trim().length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return []; // invalid JSON is ignored here; Zod validates what lands in config
  }
}

export interface FeedItem {
  readonly seq: number;
  readonly name: string;
  readonly at: string;
  readonly payload: unknown;
}

export interface BootState {
  readonly client: WorkspaceClient;
  readonly manager: WorkspaceManager;
  readonly runner: LifecycleRunner;
  readonly roster: AgentRoster;
  readonly projects: ProjectRegistry;
  readonly terminals: TerminalManager;
  readonly config: WorkspaceConfig;
  /** The UI base dir (workspace roots are resolved against it). */
  readonly baseDir: string;
}

const feed: FeedItem[] = [];
export const sseClients = new Set<import("node:http").ServerResponse>();
let bootPromise: Promise<BootState> | null = null;
let seq = 0;

export function feedSnapshot(): { events: readonly FeedItem[]; seq: number } {
  return { events: feed.slice(-100), seq };
}

function appendFeed(name: string, payload: unknown): void {
  seq += 1;
  const item: FeedItem = { seq, name, at: new Date().toISOString(), payload };
  feed.push(item);
  if (feed.length > MAX_FEED) feed.splice(0, feed.length - MAX_FEED);
  broadcast(item);
}

function broadcast(item: FeedItem): void {
  const frame = `event: kernel\ndata: ${JSON.stringify(item)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(frame);
    } catch {
      sseClients.delete(res); // disconnected client — prune, keep broadcasting
    }
  }
}

/** UI approval flow: deny with a structured, recoverable error the UI renders. */
function browserApprovalFlow(): {
  confirm: (request: { operation: string; target: string; pluginId: string }) => Promise<"approved" | "denied">;
} {
  return {
    confirm: async (request) => {
      throw new WorkspaceError({
        code: "APPROVAL_REQUIRED",
        message: `Approval required for ${request.operation} on ${request.target} (plugin: ${request.pluginId}). Deny is the UI default in this milestone.`,
        recoverable: true,
        suggestions: ["Run the operation through `paw` for interactive confirmation"],
      });
    },
  };
}

/** Env-driven config; mirrors the CLI's shape and adds the named workspaces. */
function uiConfig(): unknown {
  const fsRoot = process.env.PAW_UI_FS_ROOT ?? BASE_DIR;
  const selected = (process.env.PAW_PLUGINS ?? "").split(",").filter(Boolean);
  const workspacesEnv = process.env.PAW_WORKSPACES ?? "";
  const workspaces: Record<string, { root: string; sandbox?: { mode: string } }> = {};
  for (const pair of workspacesEnv.split(",").filter(Boolean)) {
    const [name, root, mode] = pair.split("=").map((p) => p.trim());
    if (name === undefined || root === undefined || root.length === 0) continue;
    workspaces[name] = {
      root,
      ...(mode !== undefined ? { sandbox: { mode } } : {}),
    };
  }
  return {
    runtime: { provider: process.env.PAW_RUNTIME ?? "local" },
    repository: process.env.PAW_REPOSITORY
      ? { provider: "git", repository: process.env.PAW_REPOSITORY }
      : undefined,
    approval: { mode: process.env.PAW_APPROVAL ?? "guarded" },
    permissions: {
      filesystem: { read: [fsRoot], write: [fsRoot] },
    },
    tools: ["filesystem", "shell", "git"],
    plugins: selected.map((id) => (id === "filesystem" ? { id, options: { root: fsRoot } } : { id })),
    approvalFlow: "browser",
    // The lifecycle library (spec sections 6/16/146): plugin contributions
    // + boot-time env (PAW_LIFECYCLE_JSON) + the built-in default. Every
    // source is data; none is hard-coded engine behavior.
    lifecycle: {
      definitions: [
        ...pluginLifecycles(),
        ...extraLifecycles(),
        DEFAULT_LIFECYCLE,
      ],
      default: DEFAULT_LIFECYCLE.id,
    },
    ...(Object.keys(workspaces).length > 0 ? { workspaces } : {}),
  };
}

const KERNEL_EVENT_NAMES: readonly WorkspaceEventName[] = [
  "workspace/ready", "workspace/error", "workspace/mounted", "workspace/unmounted",
  "lifecycle/stage-started", "lifecycle/stage-completed", "lifecycle/completed",
  "repository/connecting", "repository/cloning", "repository/cloned", "repository/changed",
  "agent/starting", "agent/started", "agent/stopping", "agent/stopped",
  "session/starting", "session/started", "session/stopping", "session/stopped",
  "model/before", "model/after", "model/error",
  "compaction/planned", "compaction/started", "compaction/completed",
  "command/before", "command/after",
  "tool/before", "tool/after",
  "context/indexing", "context/indexed",
  "filesystem/before-write", "filesystem/after-write",
  "runtime/health", "runtime/error",
  "verification/started", "verification/completed",
  "protection/intervened",
];

/** Idempotent boot. Resolves with the shared state; retries after a failure. */
export function boot(): Promise<BootState> {
  if (bootPromise !== null) return bootPromise;
  bootPromise = doBoot();
  bootPromise.catch(() => {
    bootPromise = null; // allow retry after a failed boot
  });
  return bootPromise;
}

async function doBoot(): Promise<BootState> {
  const plugins = bundledPlugins();
  const wsClient = new WorkspaceClient({
    config: uiConfig(),
    plugins,
    catalog: true,
    approvalFlow: browserApprovalFlow(),
    logSink: (record) => {
      // The parent workspace's structured log mirrors into the feed (§143):
      // the UI shows what the kernel logs, redacted by the logger already.
      appendFeed("log", {
        message: record.message,
        operation: record.operation,
        severity: record.severity,
        provider: record.provider,
      });
    },
  });
  const workspace = await wsClient.start();
  const config = workspace.config;

  // Manager BEFORE roster: the roster drives the manager.
  const manager = new WorkspaceManager(workspace, {
    config,
    factories: plugins.map((definition: PluginDefinition) => ({
      source: definition.manifest.id,
      load: () => definition,
    })),
    baseDir: BASE_DIR,
    sessionsRoot: SESSIONS_ROOT,
    logger: workspace.logger,
    permissions: workspace.permissions,
  });

  // The lifecycle engine: sequencing + policies + typed events live in the
  // kernel; stage EXECUTION is the product layer's job (spec §139).
  const runner = new LifecycleRunner(workspace.events);

  const projects = new ProjectRegistry({
    baseDir: BASE_DIR,
    getRepository: async () => {
      try {
        return (await wsClient.service(gitService)) ?? undefined;
      } catch {
        return undefined;
      }
    },
  });

  // REAL terminals: one PTY per workspace, streamed to the UI over SSE.
  const terminals = new TerminalManager(process.env.PAW_UI_SHELL);

  const roster = new AgentRoster(manager, {
    config,
    baseDir: BASE_DIR,
    sessionsRoot: SESSIONS_ROOT,
    // REAL terminals: the harness runs inside the workspace's own PTY.
    terminals,
  });

  // Subscribe to every kernel event name once, feeding SSE + the ring buffer.
  for (const name of KERNEL_EVENT_NAMES) {
    workspace.events.on(name, (payload) => {
      appendFeed(name, payload);
    });
  }

  return { client: wsClient, manager, runner, roster, projects, terminals, config, baseDir: BASE_DIR };
}

/** Aggregate doctor + mounted workspaces snapshot for /api/health. */
export async function snapshot(): Promise<{
  status: string;
  config: WorkspaceConfig | null;
  doctor: Awaited<ReturnType<WorkspaceManager["doctor"]>>;
  workspaces: readonly { workspaceId: string; root: string; sandbox: string; pluginIds: readonly string[] }[];
}> {
  const state = await boot();
  const doctor = await state.manager.doctor();
  const workspaces = state.manager.list().map((m: MountedWorkspace) => ({
    workspaceId: m.workspaceId,
    root: m.root,
    sandbox: m.sandbox,
    pluginIds: m.pluginIds,
  }));
  return {
    status: state.manager.isRootReady ? "ready" : "degraded",
    config: state.config,
    doctor,
    workspaces,
  };
}

export type { HiredAgent, ConnectedProject };
