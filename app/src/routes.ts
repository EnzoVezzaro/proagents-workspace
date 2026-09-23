/**
 * Control-room routes: agents (hire/prompt/stop/kinds), projects (local +
 * github), and named-workspace mount/unmount/sessions. Every mutation goes
 * through the kernel (manager/providers) — routes only map structured
 * WorkspaceErrors onto honest HTTP responses.
 */
import { execFile } from "node:child_process";
import type { ServerResponse } from "node:http";
import { WorkspaceError } from "@proagents/contracts";
import type { MountedWorkspace } from "@proagents/kernel";
import { boot, snapshot, BASE_DIR } from "./context.js";
import { json, runWs, readBody } from "./http.js";
import { runWizard, suggestCrews, listProfiles, type WizardRequest } from "./wizard.js";
import { listDir, readFile, writeFile } from "./editor.js";
import { browseDir, makeDir } from "./browser.js";
import { resolveLifecycle } from "@proagents/kernel";
import { bundledPlugins } from "./plugins.js";

function which(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [binary], (error) => resolve(error === null));
  });
}

/**
 * Inspector (the right panel in the canvas mock): everything the workspace
 * knows about one hired agent, aggregated from kernel state — no new truth.
 */
export async function inspectAgent(agentId: string): Promise<unknown> {
  const state = await boot();
  const agent = state.roster.get(agentId);
  if (agent === undefined) {
    throw new WorkspaceError({
      code: "WORKSPACE_NOT_FOUND",
      message: `Agent "${agentId}" is not hired.`,
      recoverable: true,
      suggestions: ["GET /api/agents lists hired agents"],
    });
  }
  const mounted = state.manager.list().find((m) => m.workspaceId === agent.workspaceId);
  const tty = state.terminals.list(agentId)[0];
  let sessionLog: unknown[] = [];
  if (mounted !== undefined) {
    try {
      sessionLog = (await mounted.log.tail(30)) as unknown[];
    } catch {
      sessionLog = [];
    }
  }
  return {
    agent: {
      id: agent.id,
      profile: { id: agent.profileId, label: agent.profile.label, expertise: agent.profile.expertise },
      agentKind: agent.agentKind,
      status: agent.status,
      hiredAt: agent.hiredAt,
      sandbox: agent.sandbox,
      root: agent.root,
    },
    workspace:
      mounted === undefined
        ? { mounted: false, workspaceId: agent.workspaceId }
        : {
            mounted: true,
            workspaceId: mounted.workspaceId,
            root: mounted.root,
            sandbox: mounted.sandbox,
            pluginIds: mounted.pluginIds,
          },
    terminal:
      tty === undefined
        ? { live: false }
        : { live: true, id: tty.id, cwd: tty.cwd, shell: tty.shell, createdAt: tty.createdAt },
    contextFramework: "acc",
    sessionLog,
  };
}

/**
 * Desktop shell info: how to open the control room as a real desktop app
 * window (Chrome app-mode — no browser chrome, its own Dock presence, own
 * process). The server never launches processes by itself; it hands the
 * exact command to the `paw-ui` launcher script and to the UI.
 */
export function desktopInfo(): {
  app: string;
  url: string;
  window: { width: number; height: number };
  launchCommand: string;
  profileName: string;
} {
  const port = process.env.PAW_UI_PORT ?? "4600";
  const url = `http://127.0.0.1:${port}`;
  const profileName = "proagents-workspace";
  return {
    app: "ProAgents Workspace",
    url,
    window: { width: 1560, height: 980 },
    launchCommand: `bin/paw-ui # or: open -na "Google Chrome" --args --app=${url} --user-data-dir=$HOME/.proagents/desktop --window-size=1560,980`,
    profileName,
  };
}

/**
 * The lifecycle library (spec sections 6/16/146): plugin contributions
 * (definitions() hooks) + boot-time env + the built-in default. Read from
 * the EFFECTIVE config — the same merged list `resolveLifecycle` uses.
 */
export async function lifecycleCatalog(): Promise<{ lifecycles: { id: string; name: string; description?: string; stages: { id: string; name: string; type: string }[]; source: string }[] }> {
  const state = await boot();
  const definitions = state.config.lifecycle?.definitions ?? [];
  const pluginIds = new Set(bundledPlugins().flatMap((p) => p.definitions?.().map((d) => d.id) ?? []));
  return {
    lifecycles: definitions.map((d) => ({
      id: d.id,
      name: d.name,
      ...(d.description !== undefined ? { description: d.description } : {}),
      stages: d.stages.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      source: pluginIds.has(d.id) ? "plugin" : d.id === "default" ? "built-in" : "config",
    })),
  };
}

/**
 * Launchable agent kinds — DERIVED from the plugin catalog's runtime
 * descriptors (spec section 146, plugin-first). Adding a harness means
 * adding a plugin; this endpoint and the wizard pick it up with no code
 * change here. Availability probing is honest: `which` per declared command.
 */
export async function agentKinds(): Promise<{ kinds: { kind: string; bin: string; label: string; installed: boolean; adapters: readonly string[] }[] }> {
  // Both agent plugins AND harness adapter plugins (capability "harness",
  // spec §144) contribute launchable kinds through their runtime
  // descriptors; deduped by kind (codex has both an agent and a harness
  // adapter — one catalog row, adapters listed).
  const launchable = bundledPlugins().filter(
    (p) => p.manifest.runtime?.kind === "process"
      && (p.manifest.capabilities.includes("agent") || p.manifest.capabilities.includes("harness")),
  );
  const byKind = new Map<string, { kind: string; bin: string; label: string; installed: boolean; adapters: string[] }>();
  for (const p of launchable) {
    const kind = p.manifest.provider ?? p.manifest.id.replace(/^agent-/, "");
    const bin = p.manifest.runtime?.command ?? kind;
    const existing = byKind.get(kind);
    if (existing !== undefined) {
      if (!existing.adapters.includes(p.manifest.id)) existing.adapters.push(p.manifest.id);
      continue;
    }
    byKind.set(kind, {
      kind,
      bin,
      label: p.manifest.runtime?.label ?? p.manifest.name,
      installed: await which(bin),
      adapters: [p.manifest.id],
    });
  }
  return { kinds: [...byKind.values()] };
}

export async function handleAgentRoutes(
  method: string,
  action: string | undefined,
  agentId: string | undefined,
  body: unknown,
  res: ServerResponse,
): Promise<boolean> {
  const state = await boot();
  if (method === "GET" && action === undefined) {
    json(res, 200, { agents: state.roster.list() });
    return true;
  }
  if (method === "POST" && action === "hire") {
    const b = body as { profileId?: string; agentKind?: string; root?: string; sandbox?: string; task?: string; name?: string };
    if (b.profileId === undefined || b.agentKind === undefined) {
      json(res, 400, {
        error: {
          code: "CONFIG_INVALID",
          message: "Provide `profileId` and `agentKind`.",
          recoverable: true,
          suggestions: ["GET /api/profiles lists profiles", "GET /api/agents/kinds lists agent kinds"],
        },
      });
      return true;
    }
    await runWs(res, async () => {
      const hired = await state.roster.hire({
        profileId: b.profileId as string,
        agentKind: b.agentKind as string,
        ...(b.root !== undefined ? { root: b.root } : {}),
        ...(b.sandbox !== undefined ? { sandbox: b.sandbox } : {}),
        ...(b.task !== undefined ? { task: b.task } : {}),
        ...(b.name !== undefined ? { name: b.name } : {}),
      });
      return { agentId: hired.id, workspaceId: hired.workspaceId, root: hired.root, sandbox: hired.sandbox, status: hired.status };
    });
    return true;
  }
  // Run the workspace's configured development lifecycle (spec sections
  // 6/16): the kernel runner sequences stages and emits typed events; stage
  // execution is typed into the chat's REAL terminal by the roster.
  // MOVED to handleWorkspaceRoutes (has the workspace `id` in scope).

  // Recovery path: launch the harness into an already-hired agent's
  // terminal (used when provisioning failed and the user fixed things
  // manually, or any time the raw shell is wanted → harness handoff).
  if (method === "POST" && action === "launch" && agentId !== undefined) {
    const b = body as { task?: string };
    await runWs(res, async () => {
      state.roster.launchHarness(agentId as string, b.task);
      return { launched: agentId };
    });
    return true;
  }
  if (method === "POST" && action === "prompt" && agentId !== undefined) {
    const b = body as { text?: string };
    if (b.text === undefined || b.text.trim().length === 0) {
      json(res, 400, { error: { code: "CONFIG_INVALID", message: "Provide non-empty `text`.", recoverable: true, suggestions: [] } });
      return true;
    }
    await runWs(res, async () => state.roster.prompt(agentId, b.text as string));
    return true;
  }
  if (method === "POST" && action === "stop" && agentId !== undefined) {
    await runWs(res, async () => {
      await state.roster.stop(agentId);
      return { stopped: agentId };
    });
    return true;
  }
  return false;
}

export async function handleProjectRoutes(method: string, kind: string | undefined, body: unknown, res: ServerResponse): Promise<boolean> {
  const state = await boot();
  if (method === "GET" && kind === undefined) {
    json(res, 200, { projects: state.projects.list() });
    return true;
  }
  if (method === "POST" && kind === "local") {
    const b = body as { path?: string; name?: string };
    if (b.path === undefined) {
      json(res, 400, { error: { code: "CONFIG_INVALID", message: "Provide `path` (inside the base dir).", recoverable: true, suggestions: ["Place the project under PAW_UI_BASE_DIR"] } });
      return true;
    }
    await runWs(res, async () => state.projects.connectLocal({ path: b.path as string, ...(b.name !== undefined ? { name: b.name } : {}) }));
    return true;
  }
  if (method === "POST" && kind === "github") {
    const b = body as { repo?: string; branch?: string; name?: string };
    if (b.repo === undefined) {
      json(res, 400, { error: { code: "CONFIG_INVALID", message: "Provide `repo` (owner/name or https URL).", recoverable: true, suggestions: ["Set PAW_GITHUB_TOKEN for private repos"] } });
      return true;
    }
    await runWs(res, async () => state.projects.connectGithub({ repo: b.repo as string, ...(b.branch !== undefined ? { branch: b.branch } : {}), ...(b.name !== undefined ? { name: b.name } : {}) }));
    return true;
  }
  return false;
}

export async function handleWorkspaceRoutes(
  method: string,
  id: string | undefined,
  action: string | undefined,
  body: unknown,
  res: ServerResponse,
): Promise<boolean> {
  const state = await boot();
  if (method === "GET" && id === undefined) {
    const declared = state.config.workspaces ?? {};
    const mounted = new Set(state.manager.workspaceIds);
    json(res, 200, {
      declared: Object.entries(declared).map(([wid, entry]) => ({
        id: wid,
        root: entry.root,
        sandbox: entry.sandbox?.mode ?? "workspace-write",
        mounted: mounted.has(wid),
      })),
    });
    return true;
  }
  if (id !== undefined && method === "POST" && action === "mount") {
    const b = body as { sandbox?: string };
    await runWs(res, async () => {
      const m: MountedWorkspace = await state.manager.mount(
        id,
        b.sandbox !== undefined
          ? { sandbox: b.sandbox as "read-only" | "workspace-write" | "danger-full-access" }
          : undefined,
      );
      return { workspaceId: m.workspaceId, root: m.root, sandbox: m.sandbox, pluginIds: m.pluginIds };
    });
    return true;
  }
  if (id !== undefined && method === "POST" && action === "unmount") {
    await runWs(res, async () => {
      await state.manager.unmount(id);
      return { unmounted: id };
    });
    return true;
  }
  if (id !== undefined && method === "GET" && action === "sessions") {
    await runWs(res, async () => {
      const m = state.manager.list().find((w) => w.workspaceId === id);
      if (m === undefined) {
        throw new WorkspaceError({
          code: "WORKSPACE_NOT_FOUND",
          message: `Workspace "${id}" is not mounted.`,
          recoverable: true,
          suggestions: ["Mount the workspace first"],
        });
      }
      return { workspaceId: id, size: await m.log.size(), entries: await m.log.tail(50) };
    });
    return true;
  }
  // ---- Run the workspace's configured development lifecycle (spec 6/16) ----
  if (id !== undefined && method === "POST" && action === "run-lifecycle") {
    await runWs(res, async () => {
      const agent = state.roster.list().find((a) => a.workspaceId === id) ?? state.roster.list().find((a) => a.id === id);
      if (agent === undefined) {
        throw new WorkspaceError({
          code: "WORKSPACE_NOT_FOUND",
          message: `No hired agent for workspace "${String(id)}".`,
          recoverable: true,
          suggestions: ["Hire an agent (wizard) first"],
        });
      }
      const lifecycle = resolveLifecycle(state.config, agent.workspaceId);
      if (lifecycle === undefined) {
        throw new WorkspaceError({
          code: "CONFIG_INVALID",
          message: `Workspace "${String(id)}" has no lifecycle configured.`,
          recoverable: true,
          suggestions: ["Set lifecycle.default in the config or PAW_LIFECYCLE_JSON"],
        });
      }
      return state.runner.run(lifecycle, state.roster.buildStageExecutor(agent.id), {
        workspaceId: agent.workspaceId,
      });
    });
    return true;
  }

  // ---- REAL terminal (node-pty) bound to this workspace ----
  if (id !== undefined && method === "POST" && action === "terminal") {
    await runWs(res, async () => {
      const m = state.manager.list().find((w) => w.workspaceId === id);
      if (m === undefined) {
        throw new WorkspaceError({
          code: "WORKSPACE_NOT_FOUND",
          message: `Workspace "${id}" is not mounted.`,
          recoverable: true,
          suggestions: ["Mount the workspace first"],
        });
      }
      return state.terminals.create(id, m.root);
    });
    return true;
  }
  if (id !== undefined && method === "GET" && action === "terminals") {
    json(res, 200, { terminals: state.terminals.list(id) });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// terminal I/O: SSE stream + input + resize + close
// ---------------------------------------------------------------------------

export async function handleTerminalRoutes(
  method: string,
  terminalId: string | undefined,
  operation: "stream" | "input" | "resize" | "close" | undefined,
  body: unknown,
  res: ServerResponse,
): Promise<boolean> {
  if (terminalId === undefined) return false;
  const state = await boot();
  if (method === "GET" && operation === "stream") {
    state.terminals.attach(terminalId, res); // SSE; replay included
    return true;
  }
  if (method === "POST" && operation === "input") {
    const data = (body as { data?: string }).data;
    if (typeof data !== "string") {
      json(res, 400, { error: { code: "CONFIG_INVALID", message: "Provide `data`.", recoverable: true, suggestions: [] } });
      return true;
    }
    await runWs(res, async () => {
      state.terminals.write(terminalId, data);
      return { written: data.length };
    });
    return true;
  }
  if (method === "POST" && operation === "resize") {
    const cols = Number((body as { cols?: number }).cols);
    const rows = Number((body as { rows?: number }).rows);
    if (Number.isFinite(cols) && Number.isFinite(rows)) state.terminals.resize(terminalId, cols, rows);
    json(res, 200, { resized: true });
    return true;
  }
  if (method === "POST" && operation === "close") {
    state.terminals.kill(terminalId);
    json(res, 200, { closed: terminalId });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// editor (workspace file tree + open/save, containment-checked)
// ---------------------------------------------------------------------------

export async function handleEditorRoutes(
  method: string,
  id: string | undefined,
  operation: string | undefined,
  body: unknown,
  res: ServerResponse,
): Promise<boolean> {
  const state = await boot();
  const mounted = state.manager.list().find((m) => m.workspaceId === id);
  if (mounted === undefined) {
    json(res, 404, { error: { code: "WORKSPACE_NOT_FOUND", message: `Workspace "${String(id)}" is not mounted.`, recoverable: true, suggestions: ["Mount the workspace first"] } });
    return true;
  }
  const urlQueryFile = (body as { path?: string }).path ?? "";
  if (method === "GET" && operation === "tree") {
    await runWs(res, async () => ({ entries: await listDir(mounted, urlQueryFile) }));
    return true;
  }
  if (method === "GET" && operation === "file") {
    await runWs(res, async () => readFile(mounted, urlQueryFile));
    return true;
  }
  if (method === "POST" && operation === "file") {
    const content = (body as { content?: string }).content;
    if (content === undefined || urlQueryFile === "") {
      json(res, 400, { error: { code: "CONFIG_INVALID", message: "Provide `path` and `content`.", recoverable: true, suggestions: [] } });
      return true;
    }
    await runWs(res, async () => writeFile(mounted, urlQueryFile, content));
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// folder browser (server-side "select folder" — browsers have no native
// directory picker; the desktop feel comes from browsing the REAL filesystem
// rooted at the base dir, containment-checked)
// ---------------------------------------------------------------------------

export async function handleBrowseRoutes(
  method: string,
  operation: "browse" | "mkdir" | undefined,
  relPath: string,
  body: unknown,
  res: ServerResponse,
): Promise<boolean> {
  if (method === "GET" && operation === "browse") {
    await runWs(res, async () => browseDir(relPath));
    return true;
  }
  if (method === "POST" && operation === "mkdir") {
    const b = body as { name?: string; path?: string };
    // The picker POSTs the target dir in the body; query param is a fallback.
    const parent = (b.path ?? relPath ?? "").replace(/\/+$/, "");
    const name = b.name;
    if (name === undefined || name.trim().length === 0 || /[\\/]|^\.\.$/.test(name.trim())) {
      json(res, 400, {
        error: {
          code: "CONFIG_INVALID",
          message: "Provide a single-path-segment `name` for the new folder.",
          recoverable: true,
          suggestions: ["Use a plain folder name, e.g. my-project"],
        },
      });
      return true;
    }
    await runWs(res, async () => makeDir(parent === "" ? name.trim() : `${parent}/${name.trim()}`));
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// wizard (steps 1–7: project → crew → context → sandbox → launch)
// ---------------------------------------------------------------------------

export async function handleWizardRoutes(
  method: string,
  resource: string | undefined,
  body: unknown,
  res: ServerResponse,
): Promise<boolean> {
  if (method === "GET" && resource === "crews") {
    json(res, 200, { crews: suggestCrews() });
    return true;
  }
  if (method === "GET" && resource === "profiles") {
    json(res, 200, { profiles: listProfiles() });
    return true;
  }
  if (method === "POST" && resource === "launch") {
    const state = await boot();
    await runWs(res, async () => runWizard(state, body as WizardRequest));
    return true;
  }
  return false;
}

export { readBody };
export { snapshot, BASE_DIR };
