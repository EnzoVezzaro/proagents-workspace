/**
 * Workspace self-diagnostics tests (spec section 153) — `paw check`.
 *
 * The checker must catch real drift: each test injects a specific defect
 * into a fixture checkout (or workspace) and asserts the exact PAW0xx code,
 * severity, and evidence come back. The framework policing itself, pinned.
 */
import { describe, expect, it, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkWorkspace, PawDiagnosticCode } from "../src/index.js";

const scratches: string[] = [];

afterAll(() => {
  for (const dir of scratches) rm(dir, { recursive: true, force: true });
});

async function scratch(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "paw-check-"));
  scratches.push(dir);
  return dir;
}

/** A minimal but complete framework checkout fixture. */
async function frameworkFixture(root: string, version = "0.5.0"): Promise<void> {
  await mkdir(path.join(root, "packages", "cli"), { recursive: true });
  await mkdir(path.join(root, "install"), { recursive: true });
  await mkdir(path.join(root, "templates"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(
    path.join(root, "packages", "cli", "package.json"),
    JSON.stringify({ name: "proagents-workspace", version, bin: { paw: "dist/index.js" } }),
    "utf8"
  );
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "proagents-workspace", version }),
    "utf8"
  );
  await writeFile(
    path.join(root, "install", "manifest.yaml"),
    `name: proagents-workspace\nversion: ${version}\n`,
    "utf8"
  );
  for (const rel of ["install/AGENT.md", "install/instructions.md", "install/install.yaml"]) {
    await writeFile(path.join(root, ...rel.split("/")), `# ${rel}\n`, "utf8");
  }
  await writeFile(
    path.join(root, "templates", "AGENTS.md"),
    "# Agent Notes\n\nThis repository is a ProAgents Workspace (`.paw/`).\n\n- Languages: {{languages}}\n",
    "utf8"
  );
  // One title + N sections.
  await writeFile(
    path.join(root, "README.md"),
    "# Fixture Spec\n\n# Alpha\n\n# Beta\n\n# Gamma\n",
    "utf8"
  );
  await writeFile(
    path.join(root, "AGENTS.md"),
    "The canonical product specification (3 numbered sections).\n",
    "utf8"
  );
  await writeFile(
    path.join(root, "docs", "cli-reference.md"),
    ["paw init", "paw install", "paw status", "paw research", "paw doctor", "paw verify", "paw diff", "paw agent list", "paw config show", "paw lifecycle", "paw checkpoint"].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, "CHANGELOG.md"),
    `## [${version}] - 2026-09-24\n\n- something\n`,
    "utf8"
  );
  await writeFile(path.join(root, "proagents.yaml"), "schema: proagents/v1\n", "utf8");
}

describe("checkWorkspace — the PAW0xx registry (spec 153)", () => {
  it("passes a healthy framework checkout with zero findings", async () => {
    const root = await scratch();
    await frameworkFixture(root);
    const result = await checkWorkspace(root);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.checksRun).toBeGreaterThanOrEqual(6);
    expect(result.version).toBe("0.5.0");
  });

  it("PAW001: catches install/manifest.yaml version drift", async () => {
    const root = await scratch();
    await frameworkFixture(root, "0.5.0");
    await writeFile(path.join(root, "install", "manifest.yaml"), "version: 0.4.0\n", "utf8");
    const result = await checkWorkspace(root);
    const d = result.diagnostics.find((x) => x.code === PawDiagnosticCode.MANIFEST_VERSION_DRIFT);
    expect(d?.severity).toBe("error");
    expect(d?.evidence).toContain("0.4.0");
    expect(d?.evidence).toContain("0.5.0");
    expect(result.ok).toBe(false);
  });

  it("PAW003: catches an AGENTS.md section-count claim below the actual spec length", async () => {
    const root = await scratch();
    await frameworkFixture(root);
    await writeFile(
      path.join(root, "AGENTS.md"),
      "The canonical product specification (2 numbered sections).\n",
      "utf8"
    );
    const result = await checkWorkspace(root);
    const d = result.diagnostics.find((x) => x.code === PawDiagnosticCode.SPEC_SECTION_COUNT_DRIFT);
    expect(d?.severity).toBe("error");
    expect(d?.message).toContain("2 numbered sections");
    expect(d?.message).toContain("3");
  });

  it("PAW005: catches a missing bootstrap contract file", async () => {
    const root = await scratch();
    await frameworkFixture(root);
    await rm(path.join(root, "install", "AGENT.md"));
    const result = await checkWorkspace(root);
    const d = result.diagnostics.find((x) => x.code === PawDiagnosticCode.CONTRACT_FILE_MISSING);
    expect(d?.severity).toBe("error");
    expect(d?.file).toBe("install/AGENT.md");
    expect(result.ok).toBe(false);
  });

  it("PAW008: catches a missing CHANGELOG entry for the current version", async () => {
    const root = await scratch();
    // Fixture pins 0.5.0 everywhere EXCEPT the changelog (which carries an
    // older entry only) — the version/changelog mismatch is the defect.
    await frameworkFixture(root, "0.5.0");
    await writeFile(path.join(root, "CHANGELOG.md"), "## [0.4.0] - 2026-09-24\n\n- old\n", "utf8");
    const result = await checkWorkspace(root);
    const d = result.diagnostics.find((x) => x.code === PawDiagnosticCode.CHANGELOG_ENTRY_MISSING);
    expect(d?.severity).toBe("error");
    expect(d?.evidence).toContain('no "## [0.5.0]" heading');
  });

  it("PAW010: catches commands missing from docs/cli-reference.md", async () => {
    const root = await scratch();
    await frameworkFixture(root);
    await writeFile(
      path.join(root, "docs", "cli-reference.md"),
      ["paw init", "paw status"].join("\n"),
      "utf8"
    );
    const result = await checkWorkspace(root);
    const d = result.diagnostics.find((x) => x.code === PawDiagnosticCode.DOC_PACT_DRIFT);
    expect(d?.severity).toBe("error");
    expect(d?.evidence).toContain("install");
  });

  it("PAW004: compares the generated AGENTS.md against the template in a TARGET workspace", async () => {
    const root = await scratch();
    await frameworkFixture(root);
    // The target workspace lives INSIDE the framework tree (a nested repo),
    // so repoRootFrom finds templates/ while projectRoot ≠ framework root.
    const target = path.join(root, "nested", "target");
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, "AGENTS.md"),
      // Carries the PAW-generated marker but DROPS the "# Agent Notes"
      // template line — exactly the drift PAW004 exists to catch.
      "This repository is a ProAgents Workspace (`.paw/`).\n\nStale generated content the generator no longer emits.\n",
      "utf8"
    );
    const result = await checkWorkspace(target);
    const d = result.diagnostics.find((x) => x.code === PawDiagnosticCode.TEMPLATE_GENERATOR_DRIFT);
    expect(d?.severity).toBe("warning");
    // The evidence names the template line that the generated file lacks.
    expect(d?.evidence).toContain("# Agent Notes");
  });

  it("PAW012: reports NO_CHECKS_RAN outside a framework and an uninitialized workspace", async () => {
    const root = await scratch();
    const result = await checkWorkspace(root);
    const d = result.diagnostics.find((x) => x.code === PawDiagnosticCode.NO_CHECKS_RAN);
    expect(d?.severity).toBe("warning");
    expect(result.ok).toBe(true); // a warning, not a failure
  });

  it("every diagnostic carries code, severity, message, evidence, and a suggestion", async () => {
    const root = await scratch();
    await frameworkFixture(root, "0.5.0");
    await writeFile(path.join(root, "install", "manifest.yaml"), "version: 0.1.0\n", "utf8");
    const result = await checkWorkspace(root);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    for (const d of result.diagnostics) {
      expect(d.code).toMatch(/^PAW\d{3}$/);
      expect(["error", "warning", "info"]).toContain(d.severity);
      expect(d.message.length).toBeGreaterThan(0);
      expect(d.evidence.length).toBeGreaterThan(0);
      expect(d.suggestion.length).toBeGreaterThan(0);
    }
  });

  it("diagnostic codes are unique — a versioning contract", () => {
    const values = Object.values(PawDiagnosticCode);
    expect(new Set(values).size).toBe(values.length);
    for (const code of values) expect(code).toMatch(/^PAW\d{3}$/);
  });
});
