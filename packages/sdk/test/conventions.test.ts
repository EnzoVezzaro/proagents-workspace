/**
 * Convention-layer tests (spec sections 3, 16–18, 34–35, 63).
 *
 * The golden path is tested against REAL temporary directories: fresh
 * "repository" → `paw init` semantics → detection → minimal config → status.
 * Degradation (no git, no agents, no config) is asserted as honest facts,
 * never thrown errors.
 */
import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  configPathFor,
  detectProject,
  defaultConfig,
  discoverEnvironment,
  initWorkspace,
  isInitialized,
  loadConfig,
  inferVerification,
  pawDirFor,
  parseSimpleYaml,
  requireInitialized,
  workspaceStatus,
  WorkspaceError,
} from "../src/index.js";

const run = promisify(execFile);

async function scratch(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "paw-conventions-"));
}

async function nodeProject(root: string, scripts: Record<string, string> = { test: "echo tested" }): Promise<void> {
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", scripts }), "utf8");
  await writeFile(path.join(root, "tsconfig.json"), "{}", "utf8");
  await writeFile(path.join(root, "pnpm-lock.yaml"), "", "utf8");
}

describe("workspace conventions (spec 13)", () => {
  it("reports NOT initialized for a fresh repository", async () => {
    const root = await scratch();
    expect(isInitialized(root)).toBe(false);
    expect(() => requireInitialized(root)).toThrowError(/not been initialized/);
  });

  it("requireInitialized throws PROJECT_NOT_INITIALIZED with an actionable suggestion", async () => {
    const root = await scratch();
    expect(() => requireInitialized(root)).toThrowError(WorkspaceError);
    try {
      requireInitialized(root);
    } catch (error) {
      const shaped = (error as WorkspaceError).toJSON();
      expect(shaped.code).toBe("PROJECT_NOT_INITIALIZED");
      expect(shaped.suggestions.join(" ")).toContain("paw init");
    }
  });
});

describe("project detection (spec 16)", () => {
  it("detects a TypeScript/pnpm project from existing files", async () => {
    const root = await scratch();
    await nodeProject(root);
    const project = await detectProject(root);
    expect(project.languages).toContain("typescript");
    expect(project.runtime).toBe("node");
    expect(project.packageManager).toBe("pnpm");
    expect(project.evidence).toContain("package.json");
  });

  it("detects python, rust and go without a package.json", async () => {
    const py = await scratch();
    await writeFile(path.join(py, "pyproject.toml"), "[project]\nname='x'\n", "utf8");
    expect((await detectProject(py)).runtime).toBe("python");

    const rs = await scratch();
    await writeFile(path.join(rs, "Cargo.toml"), "[package]\nname='x'\n", "utf8");
    const rust = await detectProject(rs);
    expect(rust.runtime).toBe("rust");
    expect(rust.packageManager).toBe("cargo");

    const go = await scratch();
    await writeFile(path.join(go, "go.mod"), "module x\n", "utf8");
    expect((await detectProject(go)).runtime).toBe("go");
  });

  it("reports an unknown project honestly instead of failing", async () => {
    const root = await scratch();
    const project = await detectProject(root);
    expect(project.languages).toEqual([]);
    expect(project.evidence).toEqual([]);
  });

  it("marks pnpm monorepos", async () => {
    const root = await scratch();
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "x" }), "utf8");
    await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n", "utf8");
    expect((await detectProject(root)).monorepo).toBe(true);
  });
});

describe("verification inference (spec 18)", () => {
  it("maps package scripts to checks in order", async () => {
    const root = await scratch();
    await nodeProject(root, { lint: "true", typecheck: "true", test: "true", build: "true" });
    const plan = await inferVerification(root);
    expect(plan.checks.map((c) => c.id)).toEqual(["lint", "typecheck", "test", "build"]);
    for (const check of plan.checks) expect(check.command).toMatch(/^pnpm /);
  });

  it("produces no checks for a project without scripts", async () => {
    const root = await scratch();
    expect((await inferVerification(root)).checks).toEqual([]);
  });
});

describe("environment discovery (spec 11/12)", () => {
  it("reports git as a detected runtime in a git repository", async () => {
    const root = await scratch();
    await run("git", ["init", "-q"], { cwd: root });
    const integrations = await discoverEnvironment(root);
    const git = integrations.find((i) => i.id === "git");
    expect(git?.detected).toBe(true);
    expect(git?.kind).toBe("runtime");
  });

  it("reports agent integrations with an honest tier", async () => {
    const root = await scratch();
    const integrations = await discoverEnvironment(root);
    const codex = integrations.find((i) => i.id === "codex");
    expect(codex?.kind).toBe("agent-framework");
    expect(codex?.tier).toBe("process");
    // Detected or not is environment-dependent; the field must be a boolean.
    expect(typeof codex?.detected).toBe("boolean");
  });
});

describe("paw init (spec 3/17)", () => {
  it("creates ONLY workspace metadata and leaves source untouched", async () => {
    const root = await scratch();
    await nodeProject(root);
    const source = path.join(root, "src");
    await mkdir(source);
    await writeFile(path.join(source, "index.ts"), "export const x = 1;\n", "utf8");

    const result = await initWorkspace(root);
    expect(isInitialized(root)).toBe(true);
    expect(result.created).toContain(path.join(".paw", "workspace.yaml"));
    expect(result.created.some((f) => f.startsWith(".paw") && !f.includes("workspace.yaml"))).toBe(true);

    // Source untouched (spec 44).
    expect(await readFile(path.join(source, "index.ts"), "utf8")).toBe("export const x = 1;\n");
    // package.json untouched.
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as Record<string, unknown>;
    expect(pkg["name"]).toBe("fixture");
  });

  it("is idempotent — a second init does not duplicate or overwrite", async () => {
    const root = await scratch();
    await nodeProject(root);
    await initWorkspace(root);
    const first = await readFile(configPathFor(root), "utf8");
    const result = await initWorkspace(root);
    expect(result.created).not.toContain(path.join(".paw", "workspace.yaml"));
    expect(await readFile(configPathFor(root), "utf8")).toBe(first);
  });

  it("generates a minimal config with detected verification", async () => {
    const root = await scratch();
    await nodeProject(root, { test: "echo tested" });
    await initWorkspace(root);
    const yaml = await readFile(configPathFor(root), "utf8");
    expect(yaml).toContain("version: 1");
    expect(yaml).toContain("verification:");
    expect(yaml).toContain("- pnpm test");
  });

  it("works in an empty non-git directory (graceful degradation)", async () => {
    const root = await scratch();
    const result = await initWorkspace(root);
    expect(result.project.languages).toEqual([]);
    // Agent detection is environment-dependent (the dev machine may have
    // agents installed): assert the shape, not emptiness (spec 63 honesty).
    for (const agent of result.agents) {
      expect(agent.kind).toBe("agent-framework");
      expect(typeof agent.detected).toBe("boolean");
    }
    expect(isInitialized(root)).toBe(true);
  });
});

describe("configuration precedence (spec 35)", () => {
  it("returns built-in defaults for a fresh project without booting anything", async () => {
    const root = await scratch();
    const loaded = await loadConfig(root);
    expect(loaded.config.approval?.mode).toBe("guarded");
    expect(loaded.config.runtime).toBeUndefined();
    expect(loaded.sources[0]?.layer).toBe("built-in defaults");
  });

  it("project config overrides defaults", async () => {
    const root = await scratch();
    await mkdir(pawDirFor(root), { recursive: true });
    await writeFile(configPathFor(root), "version: 1\napproval:\n  mode: manual\n", "utf8");
    const loaded = await loadConfig(root);
    expect(loaded.config.approval?.mode).toBe("manual");
    expect(loaded.sources.some((s) => s.layer === "project config")).toBe(true);
  });

  it("throws a structured CONFIG_INVALID for an invalid project config", async () => {
    const root = await scratch();
    await mkdir(pawDirFor(root), { recursive: true });
    await writeFile(configPathFor(root), "approval:\n  mode: yolo\n", "utf8");
    await expect(loadConfig(root)).rejects.toThrowError(WorkspaceError);
  });

  it("defaultConfig never declares a runtime (local is the default)", () => {
    expect(defaultConfig().runtime).toBeUndefined();
  });
});

describe("status (spec 41)", () => {
  it("answers the status questions for a real project", async () => {
    const root = await scratch();
    await run("git", ["init", "-q"], { cwd: root });
    await nodeProject(root);
    const status = await workspaceStatus(root);
    expect(status.git.repository).toBe(true);
    // Fresh `git init` has an unborn branch: still a repository, and the
    // status must not throw or misreport it.
    expect(typeof status.git.branch === "string" || status.git.branch === undefined).toBe(true);
    expect(status.initialized).toBe(false);
    expect(status.project.runtime).toBe("node");
  });

  it("degrades gracefully without git (no throw)", async () => {
    const root = await scratch();
    const status = await workspaceStatus(root);
    expect(status.git.repository).toBe(false);
    expect(status.initialized).toBe(false);
  });
});

describe("minimal YAML parser", () => {
  it("parses the convention config shape", () => {
    const parsed = parseSimpleYaml(
      [
        "# comment",
        "version: 1",
        "verification:",
        "  commands:",
        "    - pnpm lint",
        "    - pnpm test",
        "approval:",
        "  mode: guarded",
      ].join("\n")
    );
    expect(parsed["version"]).toBe(1);
    expect(parsed["verification"]).toEqual({ commands: ["pnpm lint", "pnpm test"] });
    expect(parsed["approval"]).toEqual({ mode: "guarded" });
  });

  it("fails honestly on unsupported syntax", () => {
    expect(() => parseSimpleYaml("key: {a: 1}")).toThrowError(WorkspaceError); // inline flow
    expect(() => parseSimpleYaml("list:\n  - a: 1\n")).toThrowError(WorkspaceError); // list of maps
  });
});
