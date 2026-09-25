/**
 * Workspace self-diagnostics (spec section 153) — `paw check`.
 *
 * The framework applies its own medicine: the same regime the ACC framework
 * applies to repositories (`acc check`, the ACC0xx registry) applied to the
 * Workspace's own configuration artifacts — manifests, templates, spec
 * citations, changelog, and the target workspace's runtime state.
 *
 * Rules every diagnostic honors:
 *   - stable code (PawDiagnosticCode, a versioning contract),
 *   - evidence (what was compared, what was found),
 *   - an actionable fix suggestion.
 * Absence of optional things is a fact, not a finding; drift IS a finding.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PawDiagnosticCode, type PawDiagnosticCode as Code } from "@proagents/contracts";
import { workspaceConfigSchema } from "@proagents/contracts";

import { configPathFor } from "./conventions.js";

export interface PawDiagnostic {
  /** Stable code from PawDiagnosticCode (never reused). */
  readonly code: Code;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  /** The file the finding is about (repo-relative when possible). */
  readonly file?: string;
  /** What was compared and what was found — every claim traceable. */
  readonly evidence: string;
  /** How to fix it. */
  readonly suggestion: string;
}

export interface CheckResult {
  readonly scope: "framework" | "workspace" | "both";
  /** The version the framework checks ran against. */
  readonly version: string;
  readonly diagnostics: readonly PawDiagnostic[];
  readonly checksRun: number;
  readonly ok: boolean;
}

function repoRootFrom(start: string): string {
  let dir = path.resolve(start);
  while (true) {
    // Workspace-owned framework marker: the bootstrap contract folder.
    // NOT proagents.yaml (ProAgents' file) and NOT .acc/ (ACC's) — product
    // boundaries (spec section 2): each system checks only its own domain.
    if (existsSync(path.join(dir, "install", "manifest.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

function readIfPresent(file: string): string | null {
  try {
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
}

/** First `numbered sections` claim in an AGENTS.md-style contract. */
function sectionCountClaim(text: string): number | null {
  const m = /(\d{1,4})\s+numbered sections/.exec(text);
  return m !== null ? Number(m[1]) : null;
}

/**
 * Number of numbered spec sections in the README: every `^# ` H1 minus the
 * document title (the first H1 is `# ProAgents Workspace …`, not a section).
 */
function specSectionCount(readme: string): number {
  const h1s = readme.split("\n").filter((l) => /^# /.test(l)).length;
  return Math.max(0, h1s - 1);
}

/** Highest `section NNN` citation in the given text. */
function highestSectionCitation(text: string): number | null {
  let max: number | null = null;
  for (const m of text.matchAll(/section (\d{1,4})/gi)) {
    const n = Number(m[1]);
    if (max === null || n > max) max = n;
  }
  return max;
}

export interface CheckOptions {
  /** Framework self-checks (manifest/template/spec drift). Default true. */
  readonly framework?: boolean;
  /** Workspace checks (config validity, lifecycle state). Default true. */
  readonly workspace?: boolean;
}

/**
 * `paw check` (spec section 153): diagnose the framework's own configuration
 * drift — the self-policing analogue of `acc check`.
 */
export async function checkWorkspace(projectRoot: string, options: CheckOptions = {}): Promise<CheckResult> {
  const root = repoRootFrom(projectRoot);
  // "Framework checkout" = the walked-up root actually declares the
  // Workspace framework (install/manifest.yaml) AND is the project root
  // itself. A bare directory is its own repoRootFrom result — that must
  // NOT count. The marker is Workspace-owned: never ACC or ProAgents files.
  const isFrameworkRoot =
    existsSync(path.join(root, "install", "manifest.yaml")) && path.resolve(projectRoot) === root;
  const doFramework = options.framework !== false;
  const doWorkspace = options.workspace !== false;
  const diagnostics: PawDiagnostic[] = [];
  let checksRun = 0;

  // The released version comes from the CLI package manifest when present
  // (repo checkout), else from the bundle's injected package metadata.
  let version = "0.0.0";
  const cliPkg = readIfPresent(path.join(root, "packages", "cli", "package.json"));
  if (cliPkg !== null) {
    try {
      version = (JSON.parse(cliPkg) as { version?: string }).version ?? version;
    } catch {
      /* fallthrough — PKG_PARSE is the packer's problem, not a check */
    }
  } else {
    const npmPkg = readIfPresent(path.join(root, "package.json"));
    if (npmPkg !== null) {
      try {
        version = (JSON.parse(npmPkg) as { version?: string }).version ?? version;
      } catch {
        /* the published bundle has no package.json next to it */
      }
    }
  }

  // ---------------------------------------------------------------- framework
  if (doFramework) {
    const inRepo = isFrameworkRoot;

    if (inRepo) {
      // PAW001 — install/manifest.yaml version drift.
      checksRun++;
      const manifestPath = path.join(root, "install", "manifest.yaml");
      const manifest = readIfPresent(manifestPath);
      if (manifest === null) {
        diagnostics.push({
          code: PawDiagnosticCode.CONTRACT_FILE_MISSING,
          severity: "error",
          message: "install/manifest.yaml is missing — external agents have no machine-readable entrypoint.",
          file: "install/manifest.yaml",
          evidence: "install/manifest.yaml not found (the bootstrap contract folder is incomplete)",
          suggestion: "Restore install/manifest.yaml (see spec section 152 and git history).",
        });
      } else {
        const m = /^version:\s*(\S+)/m.exec(manifest);
        const manifestVersion = m?.[1];
        if (manifestVersion === undefined) {
          diagnostics.push({
            code: PawDiagnosticCode.CONTRACT_FILE_MISSING,
            severity: "error",
            message: "install/manifest.yaml has no version field.",
            file: "install/manifest.yaml",
            evidence: "no `version:` key found in the manifest",
            suggestion: "Add the released version to install/manifest.yaml.",
          });
        } else if (manifestVersion !== version) {
          diagnostics.push({
            code: PawDiagnosticCode.MANIFEST_VERSION_DRIFT,
            severity: "error",
            message: `install/manifest.yaml says ${manifestVersion} but the CLI is ${version}.`,
            file: "install/manifest.yaml",
            evidence: `manifest version ${manifestVersion} ≠ CLI version ${version}`,
            suggestion: "Bump install/manifest.yaml (or the packages) so the manifest carries the released version.",
          });
        }
      }

      // PAW002 — repo CLI package version drift (only meaningful in-repo).
      checksRun++;
      const rootPkg = readIfPresent(path.join(root, "package.json"));
      const cliVersion = cliPkg !== null ? (JSON.parse(cliPkg) as { version?: string }).version : undefined;
      const rootVersion = rootPkg !== null ? (JSON.parse(rootPkg) as { version?: string }).version : undefined;
      if (cliVersion !== undefined && rootVersion !== undefined && cliVersion !== rootVersion) {
        diagnostics.push({
          code: PawDiagnosticCode.PACKAGE_VERSION_DRIFT,
          severity: "error",
          message: `packages/cli is ${cliVersion} but the workspace root is ${rootVersion}.`,
          file: "packages/cli/package.json",
          evidence: `packages/cli@${cliVersion} vs root@${rootVersion}`,
          suggestion: "Bump all workspace packages together (release workflow).",
        });
      }

      // PAW003 / PAW007 — spec section-count and citation drift.
      checksRun++;
      const readme = readIfPresent(path.join(root, "README.md"));
      const agentsMd = readIfPresent(path.join(root, "AGENTS.md"));
      if (readme !== null && agentsMd !== null) {
        const actual = specSectionCount(readme);
        const claimed = sectionCountClaim(agentsMd);
        if (claimed !== null && claimed !== actual) {
          diagnostics.push({
            code: PawDiagnosticCode.SPEC_SECTION_COUNT_DRIFT,
            severity: "error",
            message: `AGENTS.md claims ${claimed} numbered sections; README.md has ${actual}.`,
            file: "AGENTS.md",
            evidence: `AGENTS.md claim ${claimed} vs ${actual} H1 sections in README.md`,
            suggestion: "Update the AGENTS.md section count (or append the missing spec section).",
          });
        } else {
          const cited = highestSectionCitation(`${agentsMd}\n${readme}`);
          if (cited !== null && cited > actual) {
            diagnostics.push({
              code: PawDiagnosticCode.SECTION_CITATION_STALE,
              severity: "warning",
              message: `A citation references spec section ${cited}, beyond the actual ${actual}.`,
              evidence: `highest citation ${cited} > ${actual} H1 sections in README.md`,
              suggestion: "Fix the stale section citation (docs must match the spec's numbering).",
            });
          }
        }
      }

      // (PAW004 — template/generator drift — moved below: it applies to
      // target workspaces, not to the framework root.)

      // PAW005 — the rest of the contract folder.
      checksRun++;
      for (const rel of ["install/AGENT.md", "install/instructions.md", "install/install.yaml", "templates/AGENTS.md"]) {
        if (!existsSync(path.join(root, ...rel.split("/")))) {
          diagnostics.push({
            code: PawDiagnosticCode.CONTRACT_FILE_MISSING,
            severity: "error",
            message: `${rel} is missing — the bootstrap contract is incomplete.`,
            file: rel,
            evidence: `${rel} not found`,
            suggestion: `Restore ${rel} (spec section 152; git history has the latest copy).`,
          });
        }
      }

      // PAW008 — changelog entry for the current version.
      checksRun++;
      const changelog = readIfPresent(path.join(root, "CHANGELOG.md"));
      if (changelog !== null && version !== "0.0.0") {
        if (!changelog.includes(`## [${version}]`)) {
          diagnostics.push({
            code: PawDiagnosticCode.CHANGELOG_ENTRY_MISSING,
            severity: "error",
            message: `CHANGELOG.md has no entry for ${version}.`,
            file: "CHANGELOG.md",
            evidence: `no "## [${version}]" heading`,
            suggestion: "Add the release entry (Keep a Changelog) before publishing.",
          });
        }
      }

    }
    // Deliberately absent: any check of ACC (.acc/) or ProAgents
    // (proagents.yaml/.lock) files. Those systems diagnose themselves
    // (`acc check`, `proagent validate --spec`); a cross-product check
    // here would couple three products' release cycles together.

    // PAW004 — template/generator drift (the two must stay in sync).
    // Runs only for a TARGET workspace whose AGENTS.md PAW actually
    // generated (marker: "This repository is a ProAgents Workspace") AND
    // that sits inside a framework checkout carrying the template. The
    // framework's own root AGENTS.md is a contract file — never compared.
    const template = readIfPresent(path.join(root, "templates", "AGENTS.md"));
    const generated = readIfPresent(path.join(projectRoot, "AGENTS.md"));
    if (template !== null && !isFrameworkRoot && generated !== null && generated.includes("This repository is a ProAgents Workspace")) {
      checksRun++;
      // Structural comparison: after stripping HTML comment BLOCKS and
      // placeholder lines, every remaining template line must appear in
      // the generated file (the generator may add values, never drop).
      const templateLines = template
        .replace(/<!--[\s\S]*?-->/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.includes("{{"));
      const missing = templateLines.filter((l) => !generated.includes(l));
      if (missing.length > 0) {
        diagnostics.push({
          code: PawDiagnosticCode.TEMPLATE_GENERATOR_DRIFT,
          severity: "warning",
          message: `The AGENTS.md template has ${missing.length} line(s) the generator does not emit.`,
          file: "templates/AGENTS.md",
          evidence: `missing from generated output: ${missing.slice(0, 3).join(" | ")}${missing.length > 3 ? " | …" : ""}`,
          suggestion: "Sync the SDK generator with the template (or vice versa) in one change.",
        });
      }
    }

    // PAW010 — doc pact drift (documented commands vs cli-reference.md).
    if (isFrameworkRoot) {
      checksRun++;
      const cliReference = readIfPresent(path.join(root, "docs", "cli-reference.md"));
      if (cliReference !== null) {
        // The documented golden-path surface (mirrors docs-code-pact PROMISED_COMMANDS).
        const promised = ["init", "install", "status", "research", "doctor", "verify", "diff", "agent list", "config show", "lifecycle", "checkpoint"];
        const missing = promised.filter((c) => !cliReference.includes(`paw ${c}`));
        if (missing.length > 0) {
          diagnostics.push({
            code: PawDiagnosticCode.DOC_PACT_DRIFT,
            severity: "error",
            message: `docs/cli-reference.md does not document: ${missing.join(", ")}.`,
            file: "docs/cli-reference.md",
            evidence: `commands absent from cli-reference.md: ${missing.join(", ")}`,
            suggestion: "Add the commands to docs/cli-reference.md (the pact test will fail otherwise).",
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------- workspace
  if (doWorkspace) {
    // PAW006 — config validity (only when the repo is initialized).
    const configPath = configPathFor(projectRoot);
    if (existsSync(configPath)) {
      checksRun++;
      const raw = await readFile(configPath, "utf8").catch(() => null);
      if (raw === null) {
        diagnostics.push({
          code: PawDiagnosticCode.CONFIG_INVALID,
          severity: "error",
          message: ".paw/workspace.yaml exists but cannot be read.",
          file: ".paw/workspace.yaml",
          evidence: "read failed",
          suggestion: "Fix file permissions, or delete and re-run `paw init`.",
        });
      } else {
        // Minimal structural sanity independent of the YAML dialect: the
        // full parse is loadConfig's job (CONFIG_INVALID there); here we
        // check the shape claims the schema version the schema expects.
        if (!/^version:\s*1\s*$/m.test(raw)) {
          diagnostics.push({
            code: PawDiagnosticCode.CONFIG_INVALID,
            severity: "warning",
            message: ".paw/workspace.yaml does not declare `version: 1`.",
            file: ".paw/workspace.yaml",
            evidence: "no `version: 1` line found",
            suggestion: "Add `version: 1` (the only supported schema version).",
          });
        }
        const parsed = workspaceConfigSchema.safeParse({ version: 1 });
        void parsed;
      }
    }

    // PAW011 — lifecycle state readability.
    const statePath = path.join(projectRoot, ".paw", "state", "lifecycle-state.json");
    if (existsSync(statePath)) {
      checksRun++;
      try {
        JSON.parse(readFileSync(statePath, "utf8"));
      } catch {
        diagnostics.push({
          code: PawDiagnosticCode.LIFECYCLE_STATE_UNREADABLE,
          severity: "warning",
          message: ".paw/state/lifecycle-state.json is not valid JSON.",
          file: ".paw/state/lifecycle-state.json",
          evidence: "JSON.parse failed",
          suggestion: "Delete the state file and re-run `paw lifecycle run`.",
        });
      }
    }
  }

  // ---------------------------------------------------------------- roll-up
  // The scope honestly reflects what RAN: framework checks need the
  // framework checkout; workspace checks need an initialized workspace.
  const frameworkRan = doFramework && isFrameworkRoot;
  const workspaceRan = doWorkspace && (existsSync(configPathFor(projectRoot)) || existsSync(path.join(projectRoot, ".paw", "state", "lifecycle-state.json")));
  if (checksRun === 0) {
    diagnostics.push({
      code: PawDiagnosticCode.NO_CHECKS_RAN,
      severity: "warning",
      message: "No checks applied — not a framework checkout and the workspace is not initialized.",
      evidence: `no framework checkout found and ${configPathFor(projectRoot)} not present`,
      suggestion: "Run `paw install` (or `paw init`) first, or run `paw check` inside the framework repository.",
    });
  }

  return {
    scope: frameworkRan && workspaceRan ? "both" : frameworkRan ? "framework" : "workspace",
    version,
    diagnostics,
    checksRun,
    ok: !diagnostics.some((d) => d.severity === "error"),
  };
}

export { PawDiagnosticCode };
