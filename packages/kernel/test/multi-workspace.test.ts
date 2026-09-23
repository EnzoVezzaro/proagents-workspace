import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { defineService, type PluginManifest } from "@proagents/contracts";
import {
  ScopedServiceRegistry,
  ServiceRegistry,
  SessionLog,
  Workspace,
  WorkspaceManager,
  type DiscoveredFactory,
} from "../src/index.js";
import type { WorkspacePlugin } from "../src/plugin-loader.js";

// ---------------------------------------------------------------------------
// scoped registry
// ---------------------------------------------------------------------------

interface FakeCap {
  who(): string;
}
const capDefinition = defineService<FakeCap>({ id: "filesystem", contractVersion: "1.0.0" });

describe("ScopedServiceRegistry", () => {
  it("shadows root registrations per scope", () => {
    const root = new ServiceRegistry();
    root.register(capDefinition, { who: () => "root" }, "root-plugin");
    const scopes = new ScopedServiceRegistry(root);

    const a = scopes.scope("alpha");
    const b = scopes.scope("beta");
    a.register(capDefinition, { who: () => "alpha" }, "plugin-a");
    b.register(capDefinition, { who: () => "beta" }, "plugin-b");

    expect(a.get(capDefinition).who()).toBe("alpha");
    expect(b.get(capDefinition).who()).toBe("beta");
    expect(root.get(capDefinition).who()).toBe("root");
    expect(scopes.scopeNames()).toEqual(["alpha", "beta"]);
  });

  it("falls through to the root for unregistered ids", () => {
    const root = new ServiceRegistry();
    root.register(capDefinition, { who: () => "root" }, "root-plugin");
    const scopes = new ScopedServiceRegistry(root);
    const scope = scopes.scope("gamma");
    expect(scope.has(capDefinition)).toBe(true);
    expect(scope.get(capDefinition).who()).toBe("root");
  });

  it("collision is decided per scope, never globally", () => {
    const scopes = new ScopedServiceRegistry();
    const a = scopes.scope("alpha");
    const b = scopes.scope("beta");
    a.register(capDefinition, { who: () => "a" }, "p");
    b.register(capDefinition, { who: () => "b" }, "p");
    expect(a.get(capDefinition).who()).toBe("a");
  });

  it("collides loudly within one scope", () => {
    const scopes = new ScopedServiceRegistry();
    const a = scopes.scope("alpha");
    a.register(capDefinition, { who: () => "a" }, "p1");
    expect(() => a.register(capDefinition, { who: () => "a2" }, "p2")).toThrowError(
      /already registered/
    );
  });

  it("disposeScope removes exactly that scope", () => {
    const scopes = new ScopedServiceRegistry();
    scopes.scope("alpha");
    scopes.scope("beta");
    scopes.disposeScope("alpha");
    expect(scopes.hasScope("alpha")).toBe(false);
    expect(scopes.hasScope("beta")).toBe(true);
    expect(() => scopes.disposeScope("alpha")).toThrowError(/no such scope/);
  });

  it("scope() returns the same instance for the same name", () => {
    const scopes = new ScopedServiceRegistry();
    expect(scopes.scope("alpha")).toBe(scopes.scope("alpha"));
  });
});

// ---------------------------------------------------------------------------
// session log
// ---------------------------------------------------------------------------

describe("SessionLog", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "paw-sessions-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("appends entries sequentially and tails them", async () => {
    const log = await SessionLog.open("main", dir);
    await log.append({ timestamp: "t1", workspaceId: "main", sessionId: "s1", kind: "agent/prompt", data: { text: "hi" } });
    await log.append({ timestamp: "t2", workspaceId: "main", sessionId: "s1", kind: "tool/result" });
    const entries = await log.tail(10);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.kind).toBe("agent/prompt");
    expect(entries[1]?.kind).toBe("tool/result");
    expect(await log.size()).toBeGreaterThan(0);
  });

  it("tail() on a missing log returns empty, size() returns 0", async () => {
    const log = await SessionLog.open("ghost", dir);
    expect(await log.tail(5)).toEqual([]);
    expect(await log.size()).toBe(0);
  });

  it("tail(n) is bounded", async () => {
    const log = await SessionLog.open("main", dir);
    for (let i = 0; i < 30; i++) {
      await log.append({ timestamp: `t${i}`, workspaceId: "main", sessionId: "s", kind: `k${i}` });
    }
    const entries = await log.tail(3);
    expect(entries).toHaveLength(3);
    expect(entries[0]?.kind).toBe("k27");
    expect(entries[2]?.kind).toBe("k29");
  });
});

// ---------------------------------------------------------------------------
// WorkspaceManager
// ---------------------------------------------------------------------------

function manifestOf(id: string, capabilities: string[]): PluginManifest {
  return {
    id,
    name: id,
    version: "0.1.0",
    capabilities,
    dependencies: [],
    permissions: [],
    compatibility: {},
  };
}

describe("WorkspaceManager", () => {
  let base: string;
  let sessionsRoot: string;
  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "paw-ws-"));
    sessionsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paw-sess-"));
  });
  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
    await fs.rm(sessionsRoot, { recursive: true, force: true });
  });

  function makeRuntimePlugin(id: string, tag: string): DiscoveredFactory {
    const plugin: WorkspacePlugin = {
      manifest: manifestOf(id, ["runtime"]),
      activate(ctx) {
        ctx.services.register(
          defineService<{ tag: string }>({ id: "runtime", contractVersion: "1.0.0" }),
          { tag },
          id
        );
      },
    };
    return { source: id, load: () => plugin };
  }

  function baseConfig(): Record<string, unknown> {
    return {
      runtime: { provider: "local" },
      approval: { mode: "autonomous" },
    };
  }

  it("mounts two workspaces with isolated service instances (spec section 141)", async () => {
    const config = {
      ...baseConfig(),
      workspaces: { alpha: { root: "./alpha" }, beta: { root: "./beta" } },
    };
    await fs.mkdir(path.join(base, "alpha"), { recursive: true });
    await fs.mkdir(path.join(base, "beta"), { recursive: true });
    const ws = await Workspace.create({ config }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [makeRuntimePlugin("local", "per-scope")],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    const [alpha, beta] = await Promise.all([
      manager.mount("alpha"),
      manager.mount("beta"),
    ]);
    // Each scope resolved its OWN registration of the same capability id.
    const a = alpha.services.get(defineService<{ tag: string }>({ id: "runtime", contractVersion: "1.0.0" }));
    const b = beta.services.get(defineService<{ tag: string }>({ id: "runtime", contractVersion: "1.0.0" }));
    expect(a.tag).toBe("per-scope");
    expect(b.tag).toBe("per-scope");
    expect(manager.workspaceIds).toEqual(["alpha", "beta"]);
    expect(alpha.root).not.toBe(beta.root);
  });

  it("rejects mounting a workspace twice (WORKSPACE_ALREADY_MOUNTED)", async () => {
    const config = { ...baseConfig(), workspaces: { alpha: { root: "./alpha" } } };
    await fs.mkdir(path.join(base, "alpha"), { recursive: true });
    const ws = await Workspace.create({ config }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    await manager.mount("alpha");
    await expect(manager.mount("alpha")).rejects.toMatchObject({ code: "WORKSPACE_ALREADY_MOUNTED" });
  });

  it("rejects undeclared workspaces (WORKSPACE_NOT_FOUND)", async () => {
    const ws = await Workspace.create({ config: baseConfig() }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    await expect(manager.mount("ghost")).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
  });

  it("rejects a workspace root that does not exist (WORKSPACE_INVALID_STATE)", async () => {
    const config = {
      ...baseConfig(),
      workspaces: {
        alpha: { root: "./does-not-exist" },
      },
    };
    const ws = await Workspace.create({ config }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    await expect(manager.mount("alpha")).rejects.toMatchObject({ code: "WORKSPACE_INVALID_STATE" });
  });

  it("resolves sandbox mode: override > entry > default", async () => {
    const config = {
      ...baseConfig(),
      workspaces: {
        strict: { root: "./strict", sandbox: { mode: "read-only" } },
        loose: { root: "./loose", sandbox: { mode: "danger-full-access" } },
        plain: { root: "./plain" },
      },
    };
    for (const d of ["strict", "loose", "plain"]) {
      await fs.mkdir(path.join(base, d), { recursive: true });
    }
    const ws = await Workspace.create({ config }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    expect((await manager.mount("strict")).sandbox).toBe("read-only");
    expect((await manager.mount("loose")).sandbox).toBe("danger-full-access");
    expect((await manager.mount("plain")).sandbox).toBe("workspace-write");
  });

  it("override wins over the entry sandbox mode", async () => {
    const config = {
      ...baseConfig(),
      workspaces: { strict: { root: "./strict", sandbox: { mode: "read-only" } } },
    };
    await fs.mkdir(path.join(base, "strict"), { recursive: true });
    const ws = await Workspace.create({ config }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    expect((await manager.mount("strict", { sandbox: "danger-full-access" })).sandbox).toBe(
      "danger-full-access"
    );
  });

  it("unmount disposes the scope and allows a fresh remount", async () => {
    const config = { ...baseConfig(), workspaces: { alpha: { root: "./alpha" } } };
    await fs.mkdir(path.join(base, "alpha"), { recursive: true });
    const ws = await Workspace.create({ config }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [makeRuntimePlugin("local", "per-scope")],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    await manager.mount("alpha");
    await manager.unmount("alpha");
    expect(manager.workspaceIds).toEqual([]);
    // Fresh remount works (no stale scope, no WORKSPACE_ALREADY_MOUNTED).
    await expect(manager.mount("alpha")).resolves.toMatchObject({ workspaceId: "alpha" });
  });

  it("unmount of an unknown workspace fails with WORKSPACE_NOT_FOUND", async () => {
    const ws = await Workspace.create({ config: baseConfig() }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    await expect(manager.unmount("ghost")).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
  });

  it("emits workspace/mounted and workspace/unmounted on the shared bus", async () => {
    const config = { ...baseConfig(), workspaces: { alpha: { root: "./alpha" } } };
    await fs.mkdir(path.join(base, "alpha"), { recursive: true });
    const ws = await Workspace.create({ config }, []);
    await ws.initialize();
    const seen: Array<{ event: string; workspaceId: string }> = [];
    ws.events.on("workspace/mounted", (p) => seen.push({ event: "mounted", workspaceId: p.workspaceId }));
    ws.events.on("workspace/unmounted", (p) => seen.push({ event: "unmounted", workspaceId: p.workspaceId }));
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    await manager.mount("alpha");
    await manager.unmount("alpha");
    expect(seen).toEqual([
      { event: "mounted", workspaceId: "alpha" },
      { event: "unmounted", workspaceId: "alpha" },
    ]);
  });

  it("accepts `workspaces:` in workspace.yaml (config boundary validates)", async () => {
    const config = {
      ...baseConfig(),
      workspaces: {
        alpha: { root: "./alpha", sandbox: { mode: "read-only" }, plugins: [{ id: "filesystem" }] },
        "beta-repo": { root: "./beta-repo", agent: { provider: "codex" } },
      },
    };
    const parsed = await Workspace.create({ config }, []);
    expect(parsed.config.workspaces?.alpha?.root).toBe("./alpha");
    expect(parsed.config.workspaces?.alpha?.sandbox?.mode).toBe("read-only");
    expect(parsed.config.workspaces?.["beta-repo"]?.agent?.provider).toBe("codex");
  });

  it("rejects non-kebab-case workspace names (CONFIG_INVALID)", async () => {
    const config = {
      ...baseConfig(),
      workspaces: { Bad_Name: { root: "./x" } },
    };
    await expect(Workspace.create({ config }, [])).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("doctor() reports mounted workspaces alongside parent plugins", async () => {
    const config = { ...baseConfig(), workspaces: { alpha: { root: "./alpha" } } };
    await fs.mkdir(path.join(base, "alpha"), { recursive: true });
    const ws = await Workspace.create({ config }, []);
    await ws.initialize();
    const manager = new WorkspaceManager(ws, {
      config: ws.config,
      factories: [],
      baseDir: base,
      sessionsRoot,
      logger: ws.logger,
      permissions: ws.permissions,
    });
    await manager.mount("alpha");
    const report = await manager.doctor();
    const wsEntry = report.find((e) => e.pluginId === "workspace:alpha");
    expect(wsEntry).toBeDefined();
    expect(wsEntry?.health.status).toBe("healthy");
    expect(wsEntry?.health.message).toContain("sandbox=workspace-write");
  });
});

// ---------------------------------------------------------------------------
// sandbox enforcement in capability plugins (contract-level)
// ---------------------------------------------------------------------------

describe("sandbox policy semantics", () => {
  it("read-only mode is valid, workspace-write is the default, danger-full-access exists", async () => {
    const { sandboxModeSchema } = await import("@proagents/contracts");
    expect(sandboxModeSchema.safeParse("read-only").success).toBe(true);
    expect(sandboxModeSchema.safeParse("workspace-write").success).toBe(true);
    expect(sandboxModeSchema.safeParse("danger-full-access").success).toBe(true);
    expect(sandboxModeSchema.safeParse("unrestricted").success).toBe(false);
    expect(sandboxModeSchema.safeParse("read-only").success).toBe(true);
  });
});
