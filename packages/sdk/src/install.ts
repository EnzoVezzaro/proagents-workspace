/**
 * Agent bootstrap installer (spec section 152).
 *
 * The distribution thesis: the GitHub repository is the distribution package;
 * AGENTS.md is the universal bootstrap protocol; `npx
 * @reposell/proagents-workspace@latest install` (i.e. `paw install`) is the
 * deterministic installer; `.paw/` is the runtime configuration.
 *
 * `installWorkspace` implements the five-phase contract so an external coding
 * agent (Claude Code, Codex, Gemini, …) can bootstrap the Workspace into ANY
 * repository from one natural-language prompt, without prior PAW knowledge:
 *
 *   inspect → understand → initialize → configure → verify
 *
 * Like `paw init`, it never touches application code: metadata only
 * (spec sections 44/148). It is idempotent — running twice changes nothing
 * the second time (existing instructions and config are preserved, never
 * overwritten).
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LifecycleFlow } from "@proagents/contracts";

import {
  detectProject,
  discoverEnvironment,
  initWorkspace,
  isInitialized,
  type DetectedProject,
  type VerificationPlan,
} from "./conventions.js";
import { defaultFlow } from "@proagents/kernel";
import type { WorkspaceError } from "@proagents/contracts";

// ---------------------------------------------------------------------------
// Phase 2 — understand: README-driven project intent (the @README.md contract)
// ---------------------------------------------------------------------------

export interface ProjectIntent {
  /** Inferred product shape, e.g. "browser-application", "cli", "api". */
  readonly productType: string;
  /** Capability domains the README describes, e.g. ["ai", "research"]. */
  readonly domains: readonly string[];
  /** Declared (deps) + README-derived frameworks/technologies. */
  readonly frameworks: readonly string[];
  /** Professional focus areas the README suggests (ProAgents persona hints). */
  readonly skills: readonly string[];
  /** Where the inference came from — every claim is traceable. */
  readonly derivedFrom: readonly string[];
}

const README_CANDIDATES = ["README.md", "readme.md", "Readme.md", "README"] as const;

async function readReadme(projectRoot: string): Promise<{ file: string; text: string } | null> {
  for (const name of README_CANDIDATES) {
    const file = path.join(projectRoot, name);
    if (existsSync(file)) {
      try {
        return { file: name, text: await readFile(file, "utf8") };
      } catch {
        return null; // unreadable user file is not our error to raise
      }
    }
  }
  return null;
}

/** Technology dictionary: term → match pattern (overridden where prose lies). */
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
  { domain: "payments", pattern: /\b(payment|billing|checkout)\b/i },
  { domain: "e-commerce", pattern: /\b(e-?commerce|storefront)\b/i },
  { domain: "data-pipeline", pattern: /\b(etl|pipeline|ingestion|ingest)\b/i },
  { domain: "browser", pattern: /\bbrowser\b/i },
];

const SKILL_PATTERNS: readonly { skill: string; pattern: RegExp }[] = [
  { skill: "security-engineer", pattern: /\b(security|threat[ -]model|owasp)\b/i },
  { skill: "qa-engineer", pattern: /\b(test automation|testing|quality assurance)\b/i },
  { skill: "technical-writer", pattern: /\b(documentation|docs)\b/i },
  { skill: "devops-engineer", pattern: /\b(devops|ci[/-]cd|infrastructure as code)\b/i },
  { skill: "sre", pattern: /\b(reliability|slo|incident response)\b/i },
];

/**
 * Infer the project's intent from its README (the `@README.md` semantic
 * contract) and its existing manifests. Inference is ADDITIVE evidence —
 * detection from package.json still wins; the README fills what manifests
 * cannot say (product shape, domains, professional focus).
 */
export async function inferProjectIntent(
  projectRoot: string,
  project: DetectedProject
): Promise<ProjectIntent> {
  const readme = await readReadme(projectRoot);
  const text = readme?.text ?? "";
  const derivedFrom: string[] = [...project.evidence];
  if (readme !== null) derivedFrom.push(readme.file);

  // Frameworks: detected deps first, then README evidence (deduplicated).
  const frameworks = new Set<string>(project.frameworks);
  for (const { term, pattern } of TECH) {
    if (pattern.test(text)) frameworks.add(term);
  }

  // Product shape: strongest signal wins (README-derived frameworks make the
  // desktop branch live even without a manifest dependency; prose like
  // "browser application" implies the product type without naming a stack).
  let productType = "application";
  if (frameworks.has("electron") || frameworks.has("tauri")) productType = "desktop-application";
  else if (frameworks.has("react") || frameworks.has("vue") || frameworks.has("svelte") || frameworks.has("vite") || frameworks.has("nextjs") || frameworks.has("astro") || /\bbrowser[ -]?(?:based[ -]?)?(?:application|app)\b/i.test(text))
    productType = "browser-application";
  else if (/\b(command[ -]line|cli tool|terminal ui)\b/i.test(text)) productType = "cli";
  else if (/\b(api|rest api|http server|backend service)\b/i.test(text)) productType = "api";

  const domains = DOMAIN_PATTERNS.filter((d) => d.pattern.test(text)).map((d) => d.domain);
  const skills = SKILL_PATTERNS.filter((s) => s.pattern.test(text)).map((s) => s.skill);

  return { productType, domains, frameworks: [...frameworks], skills, derivedFrom };
}

// ---------------------------------------------------------------------------
// The five-phase contract
// ---------------------------------------------------------------------------

export interface InstallPhaseReport {
  readonly phase: "inspect" | "understand" | "initialize" | "configure" | "verify";
  /** What the phase found or did — one entry per visible decision. */
  readonly notes: readonly string[];
  readonly status: "completed" | "skipped";
}

export interface InstallPlan {
  readonly target: {
    readonly projectRoot: string;
    readonly languages: readonly string[];
    readonly runtime?: string;
    readonly packageManager?: string;
    readonly frameworks: readonly string[];
    readonly monorepo: boolean;
  };
  readonly intent: ProjectIntent;
  /** Detected coding agents — what `paw agent list` will report. */
  readonly agents: readonly { readonly id: string; readonly name: string; readonly command?: string }[];
  /** Runtime configuration layout written to the target. */
  readonly layout: { readonly configDir: ".paw"; readonly config: ".paw/workspace.yaml"; readonly agentsFile: "AGENTS.md" };
  /** The lifecycle flow the workspace will run (default, spec section 151). */
  readonly lifecycleFlow: LifecycleFlow;
  /** Verification checks that were configured or detected. */
  readonly verification: VerificationPlan;
  /** Files the install created (empty on a re-run). */
  readonly created: readonly string[];
  readonly phases: readonly InstallPhaseReport[];
}

/**
 * `paw install` (spec section 152): the deterministic bootstrap. Safe to run
 * from any external agent; idempotent; metadata-only.
 *
 * The verify phase always only REPORTS the plan — executing a foreign
 * project's checks uninvited is never the installer's decision. Hosts that
 * want one-step install+verify chain their own verification runner (the CLI
 * does exactly that behind `paw install --verify`).
 */
export async function installWorkspace(projectRoot: string): Promise<InstallPlan> {
  // ---- inspect -------------------------------------------------------------
  const project = await detectProject(projectRoot);
  const env = await discoverEnvironment(projectRoot);
  const agents = env.filter((i) => i.kind === "agent-framework" && i.detected);

  // ---- understand ----------------------------------------------------------
  const intent = await inferProjectIntent(projectRoot, project);

  // ---- initialize (metadata only, never source; idempotent) ----------------
  const alreadyInitialized = isInitialized(projectRoot);
  const init = await initWorkspace(projectRoot);

  // ---- configure (what the init generated + the lifecycle it will run) ----
  const flow = defaultFlow();
  const phases: InstallPhaseReport[] = [
    {
      phase: "inspect",
      status: "completed",
      notes: [
        `languages: ${project.languages.join(", ") || "unknown"}`,
        project.packageManager !== undefined ? `package manager: ${project.packageManager}` : "package manager: not detected",
        project.frameworks.length > 0 ? `frameworks (deps): ${project.frameworks.join(", ")}` : "frameworks (deps): none declared",
        project.monorepo ? "monorepo: yes" : "monorepo: no",
        `agents: ${agents.length > 0 ? agents.map((a) => a.id).join(", ") : "none detected"}`,
      ],
    },
    {
      phase: "understand",
      status: "completed",
      notes: [
        `product type: ${intent.productType}`,
        intent.domains.length > 0 ? `domains: ${intent.domains.join(", ")}` : "domains: none recognized",
        intent.frameworks.length > 0 ? `technologies: ${intent.frameworks.join(", ")}` : "technologies: none recognized",
        `derived from: ${intent.derivedFrom.join(", ") || "no manifests or README"}`,
      ],
    },
    {
      phase: "initialize",
      status: "completed",
      notes: alreadyInitialized
        ? ["workspace already initialized — existing configuration preserved (idempotent)"]
        : [
            "created .paw/ metadata (workspace.yaml, sessions/, artifacts/)",
            "no source file, package.json, or git state was touched (spec 44)",
          ],
    },
    {
      phase: "configure",
      status: "completed",
      notes: [
        init.created.includes("AGENTS.md")
          ? "wrote AGENTS.md (agent notes for any future coding agent)"
          : "existing AGENTS.md preserved",
        init.verification.checks.length > 0
          ? `verification: ${init.verification.checks.map((c) => c.command).join(" → ")}`
          : "verification: none detected — add commands to .paw/workspace.yaml",
        `lifecycle: ${flow.stages.length}-phase canonical flow (paw lifecycle show)`,
      ],
    },
    {
      phase: "verify",
      status: "skipped",
      notes: [
        "verification plan reported — run `paw verify` (or `paw install --verify`) to execute",
      ],
    },
  ];

  return {
    target: {
      projectRoot,
      languages: project.languages,
      ...(project.runtime !== undefined ? { runtime: project.runtime } : {}),
      ...(project.packageManager !== undefined ? { packageManager: project.packageManager } : {}),
      frameworks: project.frameworks,
      monorepo: project.monorepo,
    },
    intent,
    agents: agents.map((a) => ({ id: a.id, name: a.name, ...(a.command !== undefined ? { command: a.command } : {}) })),
    layout: { configDir: ".paw", config: ".paw/workspace.yaml", agentsFile: "AGENTS.md" },
    lifecycleFlow: flow,
    verification: init.verification,
    created: init.created,
    phases,
  };
}

export type { WorkspaceError };
