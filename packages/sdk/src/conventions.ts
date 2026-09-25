/**
 * Convention layer (convention-first product model, spec section 148).
 *
 * "Everything that can be inferred locally should be inferred locally before
 * asking the developer to configure it." This module reads the developer's
 * EXISTING project files (package.json, pyproject.toml, Cargo.toml, …) and
 * the EXISTING environment (PATH binaries, well-known config files) to build
 * the workspace picture without any mandatory configuration. The kernel stays
 * free of this logic (spec section 139): detection is product knowledge, not
 * provider business logic, and nothing here hard-codes a provider into the
 * kernel — agents are discovered from declared descriptors (spec 146).
 */
import { existsSync } from "node:fs";
import { access, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import {
  WORKSPACE_CONFIG_VERSION,
  WorkspaceError,
  workspaceConfigSchema,
  type WorkspaceConfig,
} from "@proagents/contracts";
import { parseSimpleYaml } from "./simple-yaml.js";

// ---------------------------------------------------------------------------
// Workspace conventions (spec section 13): metadata separated from source
// ---------------------------------------------------------------------------

/** The `.paw/` convention directory inside an initialized repository. */
export const PAW_DIR = ".paw";
/** The workspace configuration file inside `.paw/`. */
export const CONFIG_FILE = "workspace.yaml";
/** Directory where per-workspace session logs live (spec section 143). */
export const SESSIONS_DIR = "sessions";

export function pawDirFor(projectRoot: string): string {
  return path.join(projectRoot, PAW_DIR);
}

export function configPathFor(projectRoot: string): string {
  return path.join(projectRoot, PAW_DIR, CONFIG_FILE);
}

export function isInitialized(projectRoot: string): boolean {
  return existsSync(configPathFor(projectRoot));
}

// ---------------------------------------------------------------------------
// Local project detection (spec sections 16/19) — read existing config first
// ---------------------------------------------------------------------------

export interface DetectedProject {
  /** Primary detected language(s), e.g. ["typescript"] or ["python"]. */
  readonly languages: readonly string[];
  /** Primary runtime identity, e.g. "node", "python", "rust", "go". */
  readonly runtime?: string;
  /** Package manager, e.g. "pnpm", "npm", "yarn", "bun", "cargo", "pip". */
  readonly packageManager?: string;
  /** Framework hints from the project manifest, e.g. ["nextjs"]. */
  readonly frameworks: readonly string[];
  /** Monorepo signal (workspaces field, pnpm-workspace.yaml, …). */
  readonly monorepo: boolean;
  /** The manifest files the detection was based on. */
  readonly evidence: readonly string[];
}

interface PkgJson {
  packageManager?: string;
  workspaces?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null; // malformed user files are not our error to raise
  }
}

export async function detectProject(projectRoot: string): Promise<DetectedProject> {
  const evidence: string[] = [];
  const languages: string[] = [];
  const frameworks: string[] = [];
  let runtime: string | undefined;
  let packageManager: string | undefined;
  let monorepo = false;

  const pkgPath = path.join(projectRoot, "package.json");
  const pkg = await readJson(pkgPath);
  if (pkg !== null) {
    evidence.push("package.json");
    languages.push("javascript");
    runtime = "node";
    const deps = { ...(pkg.dependencies as PkgJson["dependencies"]), ...(pkg.devDependencies as PkgJson["devDependencies"]) };
    // TypeScript: tsconfig.json is the strongest signal.
    if (existsSync(path.join(projectRoot, "tsconfig.json"))) {
      languages.push("typescript");
      evidence.push("tsconfig.json");
    }
    for (const fw of ["next", "react", "vue", "svelte", "astro", "vite", "express"]) {
      if (deps?.[fw] !== undefined) frameworks.push(fw === "next" ? "nextjs" : fw);
    }
    if (pkg.workspaces !== undefined || existsSync(path.join(projectRoot, "pnpm-workspace.yaml"))) {
      monorepo = true;
      if (existsSync(path.join(projectRoot, "pnpm-workspace.yaml"))) evidence.push("pnpm-workspace.yaml");
    }
    // Package manager: explicit field first, then lockfiles (spec 16: prefer
    // reading existing project configuration over inventing new).
    const pm = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : undefined;
    if (pm !== undefined && pm.length > 0) {
      packageManager = pm;
    } else if (existsSync(path.join(projectRoot, "pnpm-lock.yaml"))) {
      packageManager = "pnpm";
      evidence.push("pnpm-lock.yaml");
    } else if (existsSync(path.join(projectRoot, "yarn.lock"))) {
      packageManager = "yarn";
      evidence.push("yarn.lock");
    } else if (existsSync(path.join(projectRoot, "bun.lockb")) || existsSync(path.join(projectRoot, "bun.lock"))) {
      packageManager = "bun";
      evidence.push("bun.lock");
    } else if (existsSync(path.join(projectRoot, "package-lock.json"))) {
      packageManager = "npm";
      evidence.push("package-lock.json");
    }
  }

  if (existsSync(path.join(projectRoot, "pyproject.toml"))) {
    evidence.push("pyproject.toml");
    languages.push("python");
    runtime = runtime ?? "python";
    packageManager = packageManager ?? "pip";
  } else if (existsSync(path.join(projectRoot, "requirements.txt"))) {
    evidence.push("requirements.txt");
    languages.push("python");
    runtime = runtime ?? "python";
    packageManager = packageManager ?? "pip";
  }
  if (existsSync(path.join(projectRoot, "Cargo.toml"))) {
    evidence.push("Cargo.toml");
    languages.push("rust");
    runtime = "rust";
    packageManager = "cargo";
  }
  if (existsSync(path.join(projectRoot, "go.mod"))) {
    evidence.push("go.mod");
    languages.push("go");
    runtime = "go";
  }
  if (existsSync(path.join(projectRoot, "Gemfile"))) {
    evidence.push("Gemfile");
    languages.push("ruby");
    runtime = runtime ?? "ruby";
  }
  if (existsSync(path.join(projectRoot, "composer.json"))) {
    evidence.push("composer.json");
    languages.push("php");
    runtime = runtime ?? "php";
  }
  if (existsSync(path.join(projectRoot, "pom.xml")) || existsSync(path.join(projectRoot, "build.gradle"))) {
    evidence.push(existsSync(path.join(projectRoot, "pom.xml")) ? "pom.xml" : "build.gradle");
    languages.push("java");
    runtime = runtime ?? "java";
  }

  return { languages, runtime, packageManager, frameworks, monorepo, evidence };
}

// ---------------------------------------------------------------------------
// Verification inference (spec section 18) — project conventions first
// ---------------------------------------------------------------------------

export interface VerificationPlan {
  /** Checks in execution order (lint → typecheck → test → build). */
  readonly checks: readonly { readonly id: string; readonly command: string; readonly source: "detected" | "configured" }[];
}

/** Standard script names and the check ids they map to. */
const SCRIPT_CHECKS: readonly { id: string; scripts: readonly string[] }[] = [
  { id: "lint", scripts: ["lint"] },
  { id: "typecheck", scripts: ["typecheck", "tsc", "type-check", "check"] },
  { id: "test", scripts: ["test"] },
  { id: "build", scripts: ["build"] },
];

/** Fallback commands when no manifest script exists (still convention-based). */
const FALLBACK_CHECKS: readonly { id: string; files: readonly string[]; command: string }[] = [
  { id: "test", files: ["vitest.config.ts", "vitest.config.js"], command: "npx vitest run --passWithNoTests" },
];

export async function inferVerification(projectRoot: string): Promise<VerificationPlan> {
  const checks: { id: string; command: string; source: "detected" | "configured" }[] = [];
  const pkg = await readJson(path.join(projectRoot, "package.json"));
  const scripts = (pkg?.scripts as PkgJson["scripts"]) ?? {};
  const pkgManager = (await detectProject(projectRoot)).packageManager;
  // The runner fallback is `npm run` (ships with Node) — `npx <script>` is
  // NOT a script runner and fails when no binary of that name exists.
  const runner = pkgManager !== undefined && ["pnpm", "npm", "yarn", "bun"].includes(pkgManager) ? pkgManager : "npm run";

  for (const check of SCRIPT_CHECKS) {
    const script = check.scripts.find((s) => typeof scripts[s] === "string");
    if (script === undefined) continue;
    // Canonical invocation per package manager (yarn classic: no `run`).
    const command = runner === "yarn" ? `yarn ${script}` : `${runner} ${script}`;
    checks.push({ id: check.id, command, source: "detected" });
  }
  if (checks.length === 0) {
    for (const fallback of FALLBACK_CHECKS) {
      if (fallback.files.some((f) => existsSync(path.join(projectRoot, f)))) {
        checks.push({ id: fallback.id, command: fallback.command, source: "detected" });
      }
    }
  }
  return { checks };
}

// ---------------------------------------------------------------------------
// Project intent inference (spec sections 148/152) — the file-driven init
// ---------------------------------------------------------------------------

/**
 * The project intent, as inferred from the project's own words. Every claim
 * names the file it came from (provenance is part of the contract).
 */
export interface ProjectIntent {
  /** Inferred product shape, e.g. "browser-application", "cli", "api". */
  readonly productType: string;
  /** Capability domains the source describes, e.g. ["ai", "research"]. */
  readonly domains: readonly string[];
  /** Declared (deps) + source-derived frameworks/technologies. */
  readonly frameworks: readonly string[];
  /** Professional focus areas the source suggests (ProAgents persona hints). */
  readonly skills: readonly string[];
  /** Where the inference came from — every claim is traceable. */
  readonly derivedFrom: readonly string[];
}

export interface InferIntentOptions {
  /** The text to infer from (already read by the caller). */
  readonly text: string;
  /** Source names to record in `derivedFrom` (the evidence trail). */
  readonly derivedFrom: readonly string[];
  /** Frameworks already detected from manifests (deps win over prose). */
  readonly knownFrameworks?: readonly string[];
}

/** Technology dictionary: term → match pattern. */
const TECH: readonly { term: string; pattern: RegExp }[] = [
  { term: "react", pattern: /\breact\b/i },
  { term: "vue", pattern: /\bvue\b/i },
  { term: "svelte", pattern: /\bsvelte\b/i },
  { term: "vite", pattern: /\bvite\b/i },
  { term: "nextjs", pattern: /\bnext\.?js\b/i },
  { term: "astro", pattern: /\bastro\b/i },
  { term: "angular", pattern: /\bangular\b/i },
  { term: "express", pattern: /\bexpress\b/i },
  { term: "fastify", pattern: /\bfastify\b/i },
  { term: "electron", pattern: /\belectron\b/i },
  { term: "tauri", pattern: /\btauri\b/i },
  { term: "typescript", pattern: /\btypescript\b/i },
  { term: "python", pattern: /\bpython\b/i },
  { term: "rust", pattern: /\brust\b/i },
  { term: "golang", pattern: /\bgolang\b|\bgo (?:module|runtime|project|code)\b/i },
  { term: "postgres", pattern: /\bpostgres(?:ql)?\b/i },
  { term: "sqlite", pattern: /\bsqlite\b/i },
  { term: "redis", pattern: /\bredis\b/i },
  { term: "docker", pattern: /\bdocker\b/i },
  { term: "kubernetes", pattern: /\bkubernetes\b|\bk8s\b/i },
  { term: "graphql", pattern: /\bgraphql\b/i },
];

const DOMAIN_PATTERNS: readonly { domain: string; pattern: RegExp }[] = [
  { domain: "ai", pattern: /\b(ai|llm|gpt|openai|anthropic|language model)\b/i },
  { domain: "multi-agent", pattern: /\b(multi-?agent|agent pipeline|agent swarm)\b/i },
  { domain: "research", pattern: /\bresearch\b/i },
  { domain: "knowledge-graph", pattern: /\b(knowledge[ -]graph|ontolog)/i },
  { domain: "rag", pattern: /\b(rag|retrieval[ -]augmented)\b/i },
  { domain: "embeddings", pattern: /\bembedding/i },
  { domain: "search", pattern: /\bsearch\b/i },
  { domain: "pdf", pattern: /\bpdf\b/i },
  { domain: "monitoring", pattern: /\b(monitoring|observab|telemetry)\b/i },
  { domain: "local-first", pattern: /\blocal-?first\b/i },
  { domain: "realtime", pattern: /\b(real-?time|websocket)\b/i },
  { domain: "auth", pattern: /\b(oauth|sso|authentication)\b/i },
  { domain: "payments", pattern: /\bpayments?\b|\bbilling\b|\bcheckout\b/i },
  { domain: "e-commerce", pattern: /\b(e-?commerce|storefront)\b/i },
  { domain: "data-pipeline", pattern: /\b(etl|pipeline|ingestion|ingest)\b/i },
  { domain: "browser", pattern: /\bbrowser\b/i },
];

const SKILL_PATTERNS: readonly { skill: string; pattern: RegExp }[] = [
  { skill: "security-engineer", pattern: /\b(security|threat[ -]model|owasp)\b/i },
  { skill: "qa-engineer", pattern: /\b(test automation|testing|quality assurance)\b/i },
  { skill: "technical-writer", pattern: /\b(documentation|docs)\b/i },
  { skill: "devops-engineer", pattern: /\b(devops|ci[/-]cd|infrastructure as code)\b/i },
  { skill: "sre", pattern: /\b(reliability|slos?|error budget|incident response)\b/i },
];

/**
 * Infer project intent from text (PURE — no I/O; callers read the source
 * and own the error paths). Inference is ADDITIVE evidence: manifest-derived
 * frameworks win, the text fills what manifests cannot say (product shape,
 * domains, professional focus).
 */
export function inferIntentFromText(options: InferIntentOptions): ProjectIntent {
  const { text, derivedFrom } = options;
  const frameworks = new Set<string>(options.knownFrameworks ?? []);
  for (const { term, pattern } of TECH) {
    if (pattern.test(text)) frameworks.add(term);
  }

  // Product shape: strongest signal wins. README-derived frameworks make the
  // desktop branch live even without a manifest dependency; prose like
  // "browser application" implies the shape without naming a stack.
  let productType = "application";
  if (frameworks.has("electron") || frameworks.has("tauri")) productType = "desktop-application";
  else if (frameworks.has("react") || frameworks.has("vue") || frameworks.has("svelte") || frameworks.has("vite") || frameworks.has("nextjs") || frameworks.has("astro") || /\bbrowser[ -]?(?:based[ -]?)?(?:application|app)\b/i.test(text))
    productType = "browser-application";
  else if (/\b(command[ -]line|cli tool|terminal ui)\b/i.test(text)) productType = "cli";
  else if (/\b(api|rest api|http server|backend service)\b/i.test(text)) productType = "api";

  return {
    productType,
    domains: DOMAIN_PATTERNS.filter((d) => d.pattern.test(text)).map((d) => d.domain),
    frameworks: [...frameworks],
    skills: SKILL_PATTERNS.filter((s) => s.pattern.test(text)).map((s) => s.skill),
    derivedFrom,
  };
}

const README_CANDIDATES = ["README.md", "readme.md", "Readme.md", "README"] as const;

/**
 * Read the project's README, whatever case convention it uses. Unreadable
 * user files are not our error to raise: a read failure yields null.
 */
export async function findReadmeText(projectRoot: string): Promise<{ file: string; text: string } | null> {
  for (const name of README_CANDIDATES) {
    const file = path.join(projectRoot, name);
    if (existsSync(file)) {
      try {
        return { file: name, text: await readFile(file, "utf8") };
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Environment discovery (spec sections 11/12): capability-based detection
// ---------------------------------------------------------------------------

/** Detection kinds — an integration is more than "an API key page". */
export type IntegrationKind = "provider" | "agent-framework" | "context-framework" | "tool-protocol" | "runtime";

/** Honest integration tier (spec section 12): detect → environment → process → native. */
export type IntegrationTier = "detect" | "environment" | "process" | "native";

export interface DiscoveredIntegration {
  readonly id: string;
  readonly name: string;
  readonly kind: IntegrationKind;
  /** How deeply the workspace can integrate (reported honestly, never inflated). */
  readonly tier: IntegrationTier;
  /** `true` when the binary/config was actually found in this environment. */
  readonly detected: boolean;
  /**
   * WHAT the detection is evidence of. A config directory proves the tool
   * ran here once; a PATH binary proves it can be launched right now. Both
   * count as detected, but they are not the same promise, so the report
   * distinguishes them instead of presenting a flat yes/no.
   */
  readonly detectedVia?: "binary" | "config";
  /** What was found (PATH entry, config file list, profiles…). */
  readonly detail?: string;
  /** The command that launches the integration, when it declares one. */
  readonly command?: string;
}

function which(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("which", [binary], (error, stdout) => resolve(error === null ? stdout.trim() : null));
  });
}

/**
 * Integration declarations (spec section 11): DATA, not conditionals. The
 * core discovers them; adding an integration is adding an entry (or, for
 * external packages, a plugin — the kernel never grows a provider table).
 */
const INTEGRATIONS: readonly (DiscoveredIntegration & { readonly probe?: { readonly bin?: string; readonly files?: readonly { dir: "project" | "home"; path: string }[] } })[] = [
  // ---- coding agents (agent frameworks) ----
  { id: "codex", name: "Codex CLI", kind: "agent-framework", tier: "process", detected: false, probe: { bin: "codex", files: [{ dir: "home", path: ".codex" }] }, command: "codex" },
  { id: "claude", name: "Claude Code", kind: "agent-framework", tier: "process", detected: false, probe: { bin: "claude", files: [{ dir: "home", path: ".claude" }] }, command: "claude" },
  { id: "opencode", name: "OpenCode", kind: "agent-framework", tier: "process", detected: false, probe: { bin: "opencode", files: [{ dir: "home", path: ".config/opencode" }] }, command: "opencode" },
  { id: "gemini", name: "Gemini CLI", kind: "agent-framework", tier: "process", detected: false, probe: { bin: "gemini" }, command: "gemini" },
  { id: "dsh", name: "DeepSeek Harness", kind: "agent-framework", tier: "process", detected: false, probe: { bin: "dsh" }, command: "dsh" },
  { id: "aider", name: "Aider", kind: "agent-framework", tier: "detect", detected: false, probe: { bin: "aider" } },
  { id: "copilot", name: "GitHub Copilot CLI", kind: "agent-framework", tier: "process", detected: false, probe: { bin: "copilot" }, command: "copilot" },
  { id: "cursor", name: "Cursor Agent", kind: "agent-framework", tier: "process", detected: false, probe: { bin: "cursor-agent", files: [{ dir: "home", path: ".cursor" }] }, command: "cursor-agent" },
  // ---- context systems ----
  { id: "acc", name: "ACC", kind: "context-framework", tier: "environment", detected: false, probe: { bin: "acc", files: [{ dir: "project", path: ".acc" }] }, command: "acc" },
  { id: "agents-md", name: "AGENTS.md", kind: "context-framework", tier: "environment", detected: false, probe: { files: [{ dir: "project", path: "AGENTS.md" }] } },
  { id: "claude-md", name: "CLAUDE.md", kind: "context-framework", tier: "environment", detected: false, probe: { files: [{ dir: "project", path: "CLAUDE.md" }] } },
  { id: "cursor-rules", name: "Cursor rules", kind: "context-framework", tier: "environment", detected: false, probe: { files: [{ dir: "project", path: ".cursorrules" }, { dir: "project", path: ".cursor/rules" }] } },
  { id: "mcp", name: "MCP", kind: "tool-protocol", tier: "environment", detected: false, probe: { files: [{ dir: "project", path: ".mcp.json" }] } },
  // ---- runtimes & tooling ----
  { id: "git", name: "Git", kind: "runtime", tier: "environment", detected: false, probe: { bin: "git" }, command: "git" },
  { id: "node", name: "Node.js", kind: "runtime", tier: "environment", detected: false, probe: { bin: "node" } },
  { id: "python", name: "Python", kind: "runtime", tier: "environment", detected: false, probe: { bin: "python3" } },
  { id: "rust", name: "Rust (cargo)", kind: "runtime", tier: "environment", detected: false, probe: { bin: "cargo" } },
  { id: "go", name: "Go", kind: "runtime", tier: "environment", detected: false, probe: { bin: "go" } },
  { id: "docker", name: "Docker", kind: "runtime", tier: "environment", detected: false, probe: { bin: "docker" } },
];

export async function discoverEnvironment(projectRoot: string): Promise<DiscoveredIntegration[]> {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const found: DiscoveredIntegration[] = [];
  for (const integration of INTEGRATIONS) {
    let detected = false;
    let detectedVia: "binary" | "config" | undefined;
    let detail: string | undefined;
    const probe = integration.probe;
    if (probe?.bin !== undefined) {
      const binPath = await which(probe.bin);
      if (binPath !== null) {
        detected = true;
        detectedVia = "binary";
        detail = binPath;
      }
    }
    if (!detected && probe?.files !== undefined && probe.files.length > 0) {
      const present: string[] = [];
      for (const file of probe.files) {
        const base = file.dir === "home" ? home : projectRoot;
        if (base.length > 0 && existsSync(path.join(base, file.path))) present.push(file.dir === "home" ? `~/${file.path}` : file.path);
      }
      if (present.length > 0) {
        detected = true;
        detectedVia = "config";
        detail = present.join(", ");
      }
    }
    found.push({
      id: integration.id,
      name: integration.name,
      kind: integration.kind,
      tier: integration.tier,
      detected,
      ...(detectedVia !== undefined ? { detectedVia } : {}),
      ...(detail !== undefined ? { detail } : {}),
      ...(integration.command !== undefined ? { command: integration.command } : {}),
    });
  }
  return found;
}

/** Only the detected coding-agent integrations (what `paw agent list` shows). */
export function detectedAgents(integrations: readonly DiscoveredIntegration[]): DiscoveredIntegration[] {
  return integrations.filter((i) => i.kind === "agent-framework" && i.detected);
}

// ---------------------------------------------------------------------------
// Configuration: precedence, loading, and minimal init (spec sections 34/35)
// ---------------------------------------------------------------------------

/**
 * Configuration precedence (spec section 35):
 *   built-in defaults → global user config → project config → workspace
 *   profile → environment → CLI flags. The first three are implemented here;
 *   the latter three are applied by the CLI flag layer on top of this result.
 */
export function defaultConfig(): WorkspaceConfig {
  // `runtime` intentionally ABSENT: the host machine is the default runtime
  // (spec section 22 — local runtime is the default, nothing to declare).
  // `git` is NOT in the default tool set: the zero-config workspace offers
  // filesystem + shell; git operations shell out to the developer's git and
  // the guarded repository capability activates when configuration or an
  // isolated workspace asks for it.
  return {
    version: WORKSPACE_CONFIG_VERSION,
    approval: { mode: "guarded" },
    tools: ["filesystem", "shell"],
    plugins: [{ id: "filesystem" }, { id: "shell" }],
  } as WorkspaceConfig;
}

export interface LoadedConfig {
  readonly config: WorkspaceConfig;
  /** Where each contributing layer came from (for honest `paw status`). */
  readonly sources: readonly { readonly layer: string; readonly file?: string }[];
}

/**
 * Load the effective configuration for a project root without booting a
 * workspace. Missing project config is NOT an error — zero configuration is
 * a supported state (Level 0). Invalid configuration IS a structured error.
 */
export async function loadConfig(projectRoot: string): Promise<LoadedConfig> {
  const sources: { layer: string; file?: string }[] = [{ layer: "built-in defaults" }];
  let merged: Record<string, unknown> = { ...defaultConfig() as unknown as Record<string, unknown> };

  // Layer 2: global user config.
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const globalPath = home.length > 0 ? path.join(home, ".paw", "config.yaml") : undefined;
  if (globalPath !== undefined && existsSync(globalPath)) {
    const parsed = await parseSimpleYaml(await readFile(globalPath, "utf8"));
    merged = { ...merged, ...parsed };
    sources.push({ layer: "global user config", file: globalPath });
  }

  // Layer 3: project config (`.paw/workspace.yaml`).
  const projectPath = configPathFor(projectRoot);
  if (existsSync(projectPath)) {
    const parsed = await parseSimpleYaml(await readFile(projectPath, "utf8"));
    merged = { ...merged, ...parsed };
    sources.push({ layer: "project config", file: projectPath });
  }

  const validated = workspaceConfigSchema.safeParse(merged);
  if (!validated.success) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: `Invalid workspace configuration: ${validated.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
      recoverable: true,
      suggestions: ["Fix the errors in .paw/workspace.yaml and retry"],
      details: { issues: validated.error.issues },
    });
  }
  return { config: validated.data, sources };
}

/**
 * `paw init` (spec sections 3/17): make the repository Workspace-aware.
 * Creates ONLY workspace metadata — never touches source files, never
 * rewrites package.json, never changes git state (spec section 44).
 *
 * File-driven (spec sections 148/152): pass `from: "README.md"` (any text
 * file relative to the project root) and the inferred project intent is
 * persisted into the generated `.paw/workspace.yaml` as the `project:`
 * block — the workspace starts from the project's own description.
 */
export interface InitResult {
  readonly projectRoot: string;
  readonly created: readonly string[];
  readonly project: DetectedProject;
  readonly verification: VerificationPlan;
  readonly agents: readonly DiscoveredIntegration[];
  /** Present only for a file-driven init (`from`). */
  readonly intent?: ProjectIntent;
}

export async function initWorkspace(
  projectRoot: string,
  options: {
    readonly from?: string;
    /** A pre-resolved intent to write through instead of re-deriving one. */
    readonly intent?: ProjectIntent;
    /**
     * Cross-cutting layers to wire into a freshly created config (spec
     * section 152, stage 5). The staged installer passes the providers it
     * already wrote policy files for, so `.paw/workspace.yaml` is the one
     * artifact that references every layer. Ignored when the config already
     * exists — the installer never edits a config it did not create.
     */
    readonly protection?: { readonly provider: string; readonly mode?: string };
    readonly distribution?: { readonly provider: string };
  } = {}
): Promise<InitResult> {
  const project = await detectProject(projectRoot);
  const verification = await inferVerification(projectRoot);
  const env = await discoverEnvironment(projectRoot);
  const agents = detectedAgents(env);
  const pawDir = pawDirFor(projectRoot);
  const created: string[] = [];

  // File-driven intent: read the source the caller pointed at, infer, and
  // carry the result into the config. An UNREADABLE file is a structured
  // error — silently omitting it would make the config lie about what it
  // understood. Manifest evidence is included so provenance is complete.
  // A pre-resolved `intent` (the staged installer, which has already read
  // the evidence) takes precedence and is written through unchanged.
  let intent: ProjectIntent | undefined = options.intent;
  if (intent === undefined && options.from !== undefined) {
    const resolved = path.resolve(projectRoot, options.from);
    let text: string | null = null;
    try {
      text = await readFile(resolved, "utf8");
    } catch {
      text = null;
    }
    if (text === null) {
      throw new WorkspaceError({
        code: "INTENT_SOURCE_UNREADABLE",
        message: `Cannot read the intent source file: ${options.from}`,
        recoverable: true,
        suggestions: ["Pass a path to an existing text file, e.g. `paw init README.md`"],
        details: { file: resolved },
      });
    }
    const relative = path.relative(projectRoot, resolved) || path.basename(resolved);
    intent = inferIntentFromText({
      text,
      derivedFrom: [relative, ...project.evidence],
      knownFrameworks: project.frameworks,
    });
  }

  await mkdir(pawDir, { recursive: true });
  for (const dir of [SESSIONS_DIR, "artifacts"]) {
    const target = path.join(pawDir, dir);
    if (!existsSync(target)) {
      await mkdir(target, { recursive: true });
      created.push(path.join(PAW_DIR, dir));
    }
  }

  // Minimal configuration (spec section 34): generate ONLY what cannot be
  // safely inferred. Existing config is never overwritten.
  const configPath = configPathFor(projectRoot);
  if (!existsSync(configPath)) {
    const lines: string[] = [
      "# ProAgents Workspace configuration (spec section 148).",
      "# Minimal by design — everything not listed here is inferred locally.",
      "version: 1",
      "",
    ];
    if (verification.checks.length > 0) {
      lines.push("verification:", "  commands:");
      for (const check of verification.checks) lines.push(`    - ${check.command}`);
      lines.push("");
    }
    // The cross-cutting layers the staged installer already wrote policy
    // files for. Naming the providers here is what makes `.paw/` the
    // integration point: without these lines the repo-shield and reposell
    // files would be inert documents nobody reads.
    if (options.protection !== undefined) {
      lines.push(
        "# Protection (spec section 152, stage 2) — policy lives in .reposhield.yaml;",
        "# this block activates it. `mode` is also the mode recorded there.",
        "protection:",
        `  provider: ${options.protection.provider}`,
        `  mode: ${options.protection.mode ?? "guarded"}`,
        "",
      );
    }
    if (options.distribution !== undefined) {
      lines.push(
        "# Distribution (spec section 152, stage 4) — consumed from reposell,",
        "# never re-implemented by the workspace.",
        "distribution:",
        `  provider: ${options.distribution.provider}`,
        "",
      );
    }
    if (intent !== undefined) {
      lines.push(
        "# Project intent (spec section 152) — inferred from the project's own",
        "# words by a file-driven init; informational only, edit freely.",
        "project:",
        `  productType: ${intent.productType}`
      );
      if (intent.domains.length > 0) {
        lines.push("  domains:");
        for (const domain of intent.domains) lines.push(`    - ${domain}`);
      }
      if (intent.skills.length > 0) {
        lines.push("  skills:");
        for (const skill of intent.skills) lines.push(`    - ${skill}`);
      }
      lines.push("  derivedFrom:");
      for (const source of intent.derivedFrom) lines.push(`    - ${source}`);
      lines.push("");
    }
    await writeFile(configPath, lines.join("\n"), "utf8");
    created.push(path.join(PAW_DIR, CONFIG_FILE));
  }

  // Convention file for AGENTS (spec section 6): the agent discovers the
  // workspace naturally through the filesystem, no proprietary API needed.
  const agentsMd = path.join(projectRoot, "AGENTS.md");
  if (!existsSync(agentsMd)) {
    // Mirror of the AGENTS.md template from spec section 152 (the reviewed
    // contract copy). The published npm bundle is one self-contained file, so
    // the generator is inline here; the tests pin the shape.
    const summary = [
      "# Agent Notes",
      "",
      "This repository is a ProAgents Workspace (`.paw/`).",
      "",
      `- Languages: ${project.languages.join(", ") || "unknown"}`,
      project.packageManager !== undefined ? `- Package manager: ${project.packageManager}` : undefined,
      project.frameworks.length > 0 ? `- Frameworks: ${project.frameworks.join(", ")}` : undefined,
      intent !== undefined ? `- Product type: ${intent.productType}` : undefined,
      intent !== undefined && intent.domains.length > 0 ? `- Domains: ${intent.domains.join(", ")}` : undefined,
      verification.checks.length > 0 ? `- Verification: ${verification.checks.map((c) => c.command).join(" → ")}` : undefined,
      "",
      "## Working here",
      "",
      "- Run `paw status` for the workspace picture (what is here, what is possible).",
      "- Run `paw verify` to execute the verification checks above.",
      "- Run `paw lifecycle show` to see the phases this workspace runs.",
      "",
      "`.paw/` is workspace metadata; application code is never modified by workspace commands.",
      "",
    ].filter((line) => line !== undefined);
    await writeFile(agentsMd, summary.join("\n"), "utf8");
    created.push("AGENTS.md");
  }

  return {
    projectRoot,
    created,
    project,
    verification,
    agents,
    ...(intent !== undefined ? { intent } : {}),
  };
}

// ---------------------------------------------------------------------------
// Status (spec section 41): where am I / what is here / what is possible
// ---------------------------------------------------------------------------

export interface GitStatus {
  readonly repository: boolean;
  readonly branch?: string;
  readonly dirty?: boolean;
}

export interface WorkspaceStatus {
  readonly projectRoot: string;
  readonly initialized: boolean;
  readonly git: GitStatus;
  readonly project: DetectedProject;
  readonly verification: VerificationPlan;
  readonly agents: readonly DiscoveredIntegration[];
  readonly configSources: readonly { readonly layer: string; readonly file?: string }[];
  readonly config: WorkspaceConfig | null;
}

async function canWrite(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function git(args: readonly string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", [...args], { cwd, timeout: 5_000 }, (error, stdout) => resolve(error === null ? stdout.trim() : null));
  });
}

async function gitStatusFrom(root: string): Promise<GitStatus> {
  // `--is-inside-work-tree` is the honest repository probe: a FRESH `git
  // init` (unborn branch, no commits) is a repository, but `rev-parse HEAD`
  // fails there — the branch probe must tolerate that.
  const inside = await git(["rev-parse", "--is-inside-work-tree"], root);
  if (inside !== "true") return { repository: false };
  const branch =
    (await git(["symbolic-ref", "--short", "HEAD"], root)) ??
    (await git(["rev-parse", "--abbrev-ref", "HEAD"], root)) ??
    undefined;
  const porcelain = await git(["status", "--porcelain"], root);
  return {
    repository: true,
    ...(branch !== undefined && branch.length > 0 ? { branch } : {}),
    dirty: porcelain !== null && porcelain.length > 0,
  };
}

/**
 * `paw status` (spec section 41). Never throws for missing pieces — absence
 * of git/agents/config is a reported fact, not a failure (graceful
 * degradation, spec section 63). Only an invalid configuration throws.
 */
export async function workspaceStatus(projectRoot: string): Promise<WorkspaceStatus> {
  const [project, verification, integrations, git, config] = await Promise.all([
    detectProject(projectRoot),
    inferVerification(projectRoot),
    discoverEnvironment(projectRoot),
    gitStatusFrom(projectRoot),
    loadConfig(projectRoot).then(
      (loaded) => ({ config: loaded.config as WorkspaceConfig | null, sources: loaded.sources }),
      () => ({ config: null, sources: [{ layer: "invalid" }] })
    ),
  ]);
  return {
    projectRoot,
    initialized: isInitialized(projectRoot),
    git,
    project,
    verification,
    agents: integrations,
    configSources: sourcesOf(config.sources),
    config: config.config,
  };
}

function sourcesOf(sources: readonly { layer: string; file?: string }[]): { layer: string; file?: string }[] {
  return [...sources];
}

/** Guard used by commands that require an initialized workspace. */
export function requireInitialized(projectRoot: string): void {
  if (!isInitialized(projectRoot)) {
    throw new WorkspaceError({
      code: "PROJECT_NOT_INITIALIZED",
      message: "This repository has not been initialized as a Workspace.",
      recoverable: true,
      suggestions: ["Run `paw init`"],
    });
  }
}

export { canWrite };
