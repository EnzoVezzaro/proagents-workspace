/**
 * The staged bootstrap path (spec section 152).
 *
 * A workspace is not one folder — it is five layers that depend on each
 * other, installed in a fixed order because each one consumes the previous:
 *
 *   0. RESOLVE   the project: code + README, else README, else code, else ask
 *   1. ACC       .acc/config/          — WHAT the repository knows (knowledge)
 *   2. SHIELD    .reposhield/          — what must never happen (rules)
 *   3. PROAGENTS .proagents/           — WHO operates (profiles + crew + config)
 *   4. REPOSELL  .reposell/            — licensing + distribution
 *   5. PAW       .paw/                 — WHERE the agent works (ties 1-4 together)
 *
 * The order is the dependency graph, not a preference: the ProAgents profiles
 * and crew are derived from the ACC expertise map, the crew is wired to ACC
 * context, and the PAW config is the only artifact that references all four
 * layers. `.paw/` is therefore written LAST, not first — an install that
 * wrote the workspace config before the layers it configures would describe
 * a system that does not exist yet.
 *
 * Every stage is idempotent and non-destructive: it creates what is missing
 * and never overwrites an existing file. A user who hand-tuned a layer keeps
 * their tuning.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DetectedProject, ProjectIntent } from "./conventions.js";

export type StageId = "resolve" | "acc" | "shield" | "proagents" | "reposell" | "paw";

/** The order is normative — `paw install` walks it exactly. */
export const STAGE_ORDER: readonly StageId[] = ["resolve", "acc", "shield", "proagents", "reposell", "paw"];

export interface StageResult {
  readonly stage: StageId;
  /** Paths (repo-relative) this stage created. Empty on a re-run. */
  readonly created: readonly string[];
  /** One line per decision an external agent can act on. */
  readonly notes: readonly string[];
  /**
   * `completed` — the layer is in place.
   * `skipped`   — nothing to do (already present).
   * `needs-input` — cannot proceed without the user (stage 0 only).
   */
  readonly status: "completed" | "skipped" | "needs-input";
}

/** Write a file only when absent; report whether it was created. */
async function writeIfAbsent(target: string, contents: string): Promise<boolean> {
  if (existsSync(target)) return false;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
  return true;
}

// ---------------------------------------------------------------------------
// Stage 0 — RESOLVE
// ---------------------------------------------------------------------------

export interface ResolveInput {
  readonly projectRoot: string;
  readonly project: DetectedProject;
  /** README text when one was found (any of the usual names). */
  readonly readme: { readonly file: string; readonly text: string } | null;
  /** An explicit intent source the caller passed (`paw install README.md`). */
  readonly from?: string;
  readonly intent: ProjectIntent;
  /**
   * Whether `intent` is real. False for the questionnaire case: the layers
   * are still scaffolded, but no `project:` block is written, because a
   * guessed product type is worse than an absent one.
   */
  readonly hasIntent: boolean;
  /**
   * Layer posture decided AHEAD of the stages — by the evidence (defaults)
   * or by questionnaire answers (interactive/headless interview). Declared
   * here so the layers and the resolve stage report the SAME decision.
   */
  readonly layerDecisions?: {
    readonly protectionMode?: string;
    readonly distributionMode?: string;
  };
}

export interface ResolveResult extends StageResult {
  /** Which evidence the intent was actually derived from. */
  readonly basis: "code-and-readme" | "readme-only" | "code-only" | "questionnaire";
  /** Present only when the questionnaire is the answer. */
  readonly questionnaire?: readonly string[];
}

/**
 * Decide where the project's identity comes from, in the documented order:
 * code AND README → README alone → code alone → neither (ask the user).
 *
 * The questionnaire is a REPORT, not a silent default: when nothing on disk
 * can answer, the install says so and hands back the exact commands that
 * collect the answers (interactive `paw init`, or headless `--answers`).
 * Guessing a product type from an empty directory would be the most
 * dishonest thing this installer could do.
 */
export function stageResolve(input: ResolveInput): ResolveResult {
  const notes: string[] = [];
  const hasCode = input.project.languages.length > 0;
  const hasReadme = input.readme !== null;

  if (input.from !== undefined) notes.push(`intent source: ${input.from} (explicit)`);
  if (hasReadme && input.readme !== null) notes.push(`description: ${input.readme.file}`);

  if (hasCode && hasReadme) {
    notes.push(
      `basis: code + README — ${input.project.languages.join(", ")}` +
        (input.project.frameworks.length > 0 ? `, ${input.project.frameworks.join(", ")}` : "")
    );
    return { stage: "resolve", basis: "code-and-readme", created: [], notes, status: "completed" };
  }
  if (hasReadme && input.readme !== null) {
    notes.push("basis: README only — no source file detected, intent inferred from prose");
    return { stage: "resolve", basis: "readme-only", created: [], notes, status: "completed" };
  }
  if (hasCode) {
    notes.push("basis: code only — no README found, intent inferred from manifests");
    return { stage: "resolve", basis: "code-only", created: [], notes, status: "completed" };
  }

  // Neither: the repository cannot describe itself. Ask, do not guess.
  // Headless agents get the exact command that closes the loop without a TTY.
  const questionnaire = [
    "No README and no source files were found — this repository cannot describe itself.",
    "Answer the five-question interview (interactive):",
    "",
    "  paw init          # asks the questions when run in a terminal",
    "",
    "or apply answers headlessly, in the order: product, purpose, technologies,",
    "distribution, protection:",
    "",
    '  paw init --answers "web app" "a task manager" "TypeScript" "open source" "guarded"',
    "",
    "Then re-run `paw init` — the recorded intent becomes the project block.",
  ];
  notes.push("basis: NEITHER code nor README — the questionnaire is required before intent can be inferred");
  notes.push("the layers below are still scaffolded, but the project block stays empty until you answer");
  return {
    stage: "resolve",
    basis: "questionnaire",
    created: [],
    notes,
    status: "needs-input",
    questionnaire,
  };
}

// ---------------------------------------------------------------------------
// Stage 1 — ACC (the knowledge layer: WHAT the repository knows)
// ---------------------------------------------------------------------------

/**
 * Map a detected project onto the ACC professions that actually apply.
 *
 * Deliberately small and evidence-based: a project with no detected
 * language gets no analyzer claims and the generic `engineering` profile, so
 * the generated map never asserts expertise the repository does not show.
 */
export function accProfilesFor(project: DetectedProject, intent: ProjectIntent): readonly string[] {
  const langs = new Set(project.languages);
  const profiles = new Set<string>();
  if (langs.has("typescript") || langs.has("javascript")) profiles.add("nodejs-engineer");
  if (langs.has("python")) profiles.add("python-engineer");
  if (langs.has("rust")) profiles.add("rust-engineer");
  if (langs.has("go")) profiles.add("go-engineer");
  if (project.monorepo) profiles.add("architecture-reviewer");
  if (intent.productType === "api" || intent.productType === "service") profiles.add("api-engineer");
  if (profiles.size === 0) profiles.add("engineering");
  // Verification and documentation apply to every real project, so they are
  // universal rather than evidence-gated.
  profiles.add("verification-engineer");
  profiles.add("documentation-editor");
  return [...profiles].sort();
}

function analyzerFlags(project: DetectedProject): Record<string, boolean> {
  return {
    typescript: project.languages.includes("typescript"),
    javascript: project.languages.includes("javascript"),
    python: project.languages.includes("python"),
    rust: project.languages.includes("rust"),
    go: project.languages.includes("go"),
  };
}

function yamlBoolMap(flags: Record<string, boolean>, indent: string): string[] {
  return Object.entries(flags).map(([k, v]) => `${indent}${k}: ${v}`);
}

export async function stageAcc(input: ResolveInput, root: string): Promise<StageResult> {
  const created: string[] = [];
  const notes: string[] = [];

  const configRel = ".acc/config/config.yaml";
  if (!existsSync(path.join(root, configRel))) {
    const lines = [
      `# ACC control plane — generated by \`paw init\` (spec section 152).`,
      `# Stage 1 of 5: the knowledge layer. Edit freely; a re-install never overwrites this file.`,
      `#`,
      `# ACC is OPTIONAL. Without it the workspace still runs — \`paw research\` degrades to`,
      `# repository facts and says so. This file tells ACC what this repository is made of.`,
      `schema_version: 1`,
      ``,
      `# Generated from: ${input.project.evidence.join(", ") || "no manifests detected"}`,
      ``,
      `# Analyzers reflect DETECTED languages only — a false claim here would send ACC`,
      `# looking for code that does not exist.`,
      `language_analyzers:`,
      ...yamlBoolMap(analyzerFlags(input.project), "  "),
      ``,
      `ignore:`,
      `  - "node_modules/"`,
      `  - "dist/"`,
      `  - "build/"`,
      `  - "coverage/"`,
      ``,
      `# Offline and deterministic by default: the AI phase is opt-in and reads no`,
      `# secrets from this file.`,
      `ai:`,
      `  enabled: false`,
      ``,
      `ownership:`,
      `  strict: false`,
      ``,
      `context:`,
      `  default_depth: 1`,
      `  default_max_bytes: 65536`,
      ``,
      `tools:`,
      `  auto_discover: true`,
      `  plugins:`,
      `    enabled: true`,
      `    directory: ".acc/config/tools"`,
      ``,
    ];
    if (await writeIfAbsent(path.join(root, configRel), lines.join("\n"))) created.push(configRel);
  } else {
    notes.push("existing .acc/config/config.yaml preserved");
  }

  // The ACC control-plane file only. The per-profession expertise files are
  // written by stage 3 into `.proagents/profiles/` (the ProAgents namespace,
  // not ACC's) — ACC describes WHAT the repository knows; ProAgents decides
  // WHO operates and keeps its own persona contracts.
  notes.push("knowledge layer: .acc/config/config.yaml — run `acc check` to validate it");
  return { stage: "acc", created, notes, status: "completed" };
}

// ---------------------------------------------------------------------------
// Stage 2 — Repo Shield (the rules: what must never happen)
// ---------------------------------------------------------------------------

export async function stageShield(input: ResolveInput, root: string): Promise<StageResult> {
  const rel = ".reposhield/policy.yaml";
  const created: string[] = [];
  const notes: string[] = [];
  const mode = input.layerDecisions?.protectionMode ?? "guarded";

  if (await writeIfAbsent(
    path.join(root, rel),
    [
      `# Repo Shield policy — generated by \`paw init\` (spec section 152).`,
      `# Stage 2 of 5: the rules. Enforcement mode is mirrored into .paw/workspace.yaml`,
      `# in stage 5; edit BOTH or neither, or the workspace will not do what you think.`,
      ``,
      `# Precedence note: \`paw init\` never overwrites this file, so your edits win.`,
      ``,
      `provider: repo-shield`,
      ``,
      `# off | audit | warn | guarded | strict  (DISTRIBUTION.md section 7)`,
      `#   off      nothing is enforced`,
      `#   audit    violations are recorded, never blocked`,
      `#   warn     violations are recorded and surfaced, never blocked`,
      `#   guarded  violations are refused  (default)`,
      `#   strict   violations are refused, and network egress is refused outright`,
      `mode: ${mode}`,
      ``,
      `# Destructive git stays guarded by default (spec section 35). Repo Shield refuses`,
      `# these BEFORE execution; the installer never turns one of them on for you.`,
      `git_guards:`,
      `  force_push: true`,
      `  branch_delete: true`,
      `  hard_reset: true`,
      `  history_rewrite: true`,
      ``,
      `# Paths no agent writes through the filesystem capability.`,
      `protected_paths:`,
      `  - ".git"`,
      `  - ".env"`,
      `  - ".envrc"`,
      ``,
    ].join("\n")
  )) {
    created.push(rel);
  } else {
    notes.push("existing .reposhield/policy.yaml preserved");
  }

  notes.push(
    mode === "guarded"
      ? "enforcement: guarded (default) — destructive git and credential writes are refused before execution"
      : `enforcement: ${mode} — declared by the questionnaire, mirrored into .paw/workspace.yaml in stage 5`
  );
  notes.push("wired into the workspace in stage 5 (protection.provider: repo-shield)");
  notes.push(`product context: ${input.intent.productType}`);
  return { stage: "shield", created, notes, status: "completed" };
}

// ---------------------------------------------------------------------------
// Stage 3 — ProAgents (WHO operates: profiles + crew + config, wired to ACC)
// ---------------------------------------------------------------------------

/**
 * The profile text for one profession. Generated as a starting point and
 * labelled as such — a generated profile is a contract to be narrowed, not
 * a finished one.
 */
function profileBody(profile: string, input: ResolveInput): string {
  return [
    `# ${profile}`,
    ``,
    input.hasIntent
      ? `You are the ${profile} for ${input.intent.productType} work in this repository.`
      : `You are the ${profile} for this repository (the project intent is not resolved yet).`,
    `This file was generated by \`paw init\` from detected evidence — narrow it to the`,
    `real project; a generated profile is a starting point, not a finished contract.`,
    ``,
    `## Context`,
    ``,
    ...(input.hasIntent ? [`- Product type: ${input.intent.productType}`] : [`- Product type: not resolved yet — answer the interview (\`paw init\`)`]),
    ...(input.intent.domains.length > 0 ? [`- Domains: ${input.intent.domains.join(", ")}`] : []),
    ...(input.intent.frameworks.length > 0 ? [`- Technologies: ${input.intent.frameworks.join(", ")}`] : []),
    ...(input.project.languages.length > 0 ? [`- Languages: ${input.project.languages.join(", ")}`] : []),
    ``,
    `## Expertise`,
    ``,
    ...(profile === "verification-engineer"
      ? [`- Test strategy, contract suites, and honest verification`, `- Running the project's own checks and reporting failures as failures`]
      : [`- Work consistent with the repository's existing conventions`]),
    ``,
    `## Authority`,
    ``,
    `- Read the repository before changing it (\`AGENTS.md\`, then \`docs/\` when present).`,
    `- Follow the verification commands in \`.paw/workspace.yaml\`.`,
    ``,
    `## Constraints`,
    ``,
    `- MUST NOT modify application code during \`paw init\` — the installer is metadata-only.`,
    `- MUST NOT claim verification passed without running it.`,
    `- MUST escalate uncertainty about scope or permissions to the human.`,
    ``,
  ].join("\n");
}

export async function stageProagents(input: ResolveInput, root: string): Promise<StageResult> {
  const profiles = accProfilesFor(input.project, input.intent);
  const created: string[] = [];
  const notes: string[] = [];

  // 3a. profiles/ — one file per profession. These are the persona
  // contracts; the crew workers below point at them, and ACC's expertise map
  // (stage 1) is where the professions were derived from.
  for (const profile of profiles) {
    const rel = `.proagents/profiles/${profile}.md`;
    if (await writeIfAbsent(path.join(root, rel), profileBody(profile, input))) created.push(rel);
  }

  // 3b. crew/ — derived from the profile set. An unresolved intent gets a
  // neutral crew name: "unknown-crew" would put a placeholder into a
  // filename that other tools will read forever.
  const crewId = input.hasIntent ? `${input.intent.productType}-crew` : "project-crew";
  const crewRel = `.proagents/crew/${crewId}/manifest.json`;
  if (!existsSync(path.join(root, crewRel))) {
    const summary = input.hasIntent
      ? `Operate this ${input.intent.productType} project with the professions it needs.`
      : "Operate this project with the professions it needs. The project intent is not resolved yet — answer the interview (`paw init`) and re-run it.";
    const manifest = {
      id: crewId,
      name: crewId,
      version: "0.1.0",
      description: input.hasIntent
        ? `Generated by \`paw init\` for a ${input.intent.productType} project.`
        : "Generated by `paw init` with an unresolved project intent.",
      author: "paw",
      tags: ["generated", "from-init"],
      // Every worker pulls context from ACC — this is the edge that makes
      // the crew a *knowledge* team rather than a set of prompt templates.
      workers: profiles.map((profile) => ({
        id: profile,
        name: profile,
        role: profile === "verification-engineer" ? "reviewer" : "implementation",
        description: `Operates as the ${profile} profile; expertise in .proagents/profiles/${profile}.md.`,
        profile,
        permissions: {
          read: "repo",
          write: profile === "verification-engineer" ? "none" : "scoped",
          production: "none",
          secrets: "none",
          tools: ["filesystem", "shell", "git", "test runner"],
          approvalGates: [] as string[],
        },
        mcpServers: [],
        context: [{ framework: "acc", scope: "repository" }],
        instructions: `.proagents/profiles/${profile}.md`,
        receivesFrom: [] as string[],
        emits: [] as string[],
      })),
      mcpServers: [],
      handoffs: [],
      entryPoints: [profiles[0] ?? "engineering"],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      mission: summary,
      coordination: [
        "Members coordinate through named-artifact handoffs, never a shared pool.",
        "Uncertainty about permissions escalates to the human, never to a guess.",
      ],
      rules: [
        "Every member stays inside its permission model; composition never inherits trust.",
        "Force push, branch deletion, and history rewriting are forbidden.",
        "Releases and production actions require explicit human approval.",
      ],
    };
    // createdAt/updatedAt are pinned to the epoch so a re-install produces a
    // byte-identical file — the installer must be reproducible.
    if (await writeIfAbsent(path.join(root, crewRel), `${JSON.stringify(manifest, null, 2)}\n`)) {
      created.push(crewRel);
    }
  } else {
    notes.push(`existing ${crewRel} preserved`);
  }

  // 3c. config.yaml — the human-authored source of truth for the ProAgents
  // environment. Every profile listed is a .proagents/profiles/<id>.md file.
  const paRel = ".proagents/config.yaml";
  if (await writeIfAbsent(
    path.join(root, paRel),
    [
      `# ProAgents environment — WHO operates in this repository.`,
      `# Generated by \`paw init\` (spec section 152), stage 3 of 5.`,
      `# Mirrors the profiles in .proagents/profiles/ — the list below is exactly those`,
      `# files, so editing one without the other is the only way to make them disagree.`,
      `schema: proagents/v1`,
      ``,
      `project:`,
      `  name: ${path.basename(root)}`,
      `  description: ${JSON.stringify(input.hasIntent ? input.intent.productType : "not resolved yet — answer the interview (paw init)")}`,
      ``,
      `environment:`,
      `  # Professions this project needs — one line per .proagents/profiles/<id>.md`,
      `  profiles:`,
      ...profiles.map((p) => `    - ${p}`),
      `  capabilities:`,
      `    - source-control`,
      ``,
      `policies:`,
      `  filesystem:`,
      `    workspace-only: true`,
      `  network:`,
      `    # Explicit and declared, never silent (docs/security.md).`,
      `    allowed: []`,
      ``,
      `harness:`,
      `  # Compatibility, never a pin: the same environment, any agent.`,
      `  compatibility:`,
      `    - claude-code`,
      `    - codex`,
      `    - opencode`,
      `    - gemini-cli`,
      ``,
    ].join("\n")
  )) {
    created.push(paRel);
  } else {
    notes.push("existing .proagents/config.yaml preserved");
  }

  // 3d. the coordination channel every crew writes into. This is the one
  // agent-coordination file the installer creates in a target repository;
  // it belongs to the agents (append-only by contract).
  const commentsRel = ".proagents/crew/COMMENTS.md";
  if (await writeIfAbsent(
    path.join(root, commentsRel),
    [
      `# COMMENTS.md — the cross-agent coordination channel.`,
      ``,
      `Append-only. Never edit or delete another agent's entry.`,
      `Use it to hand off work, record a decision, or flag a blocker.`,
      ``,
    ].join("\n")
  )) {
    created.push(commentsRel);
  }

  notes.push(`crew: ${crewId} — ${profiles.length} worker(s), every one bound to ACC context`);
  notes.push("resolve the environment with `proagent resolve` (or let your ProAgents tool read .proagents/config.yaml)");
  return { stage: "proagents", created, notes, status: "completed" };
}

// ---------------------------------------------------------------------------
// Stage 4 — reposell (licensing + distribution)
// ---------------------------------------------------------------------------

export async function stageReposell(input: ResolveInput, root: string): Promise<StageResult> {
  const rel = ".reposell/distribution.yaml";
  const created: string[] = [];
  const notes: string[] = [];
  const isLibrary = input.hasIntent && (input.intent.productType === "library" || input.intent.productType === "plugin");
  // An explicit distribution decision (questionnaire) wins; otherwise never
  // guess a commercial model: an invented "paid" would be a licensing
  // decision the installer has no evidence to make.
  const mode = input.layerDecisions?.distributionMode ?? (isLibrary ? "paid" : "free");

  if (await writeIfAbsent(
    path.join(root, rel),
    [
      `# reposell — distribution and licensing (spec section 152).`,
      `# Generated by \`paw init\`, stage 4 of 5.`,
      ``,
      `# Workspace CONSUMES these decisions; it never makes them. Licensing, pricing,`,
      `# and entitlement stay with reposell (DISTRIBUTION.md).`,
      `distribution:`,
      `  provider: reposell`,
      `  mode: ${mode}`,
      ``,
      `licensing:`,
      `  # None is a real, supported answer — an unlicensed project is not a broken one.`,
      `  required: false`,
      `  seats: unlimited`,
      ``,
      `artifacts:`,
      `  # Published from this repository; nothing is published by the installer.`,
      `  - name: ${path.basename(root)}`,
      `    kind: ${isLibrary ? "npm" : "source"}`,
      ``,
    ].join("\n")
  )) {
    created.push(rel);
  } else {
    notes.push("existing .reposell/distribution.yaml preserved");
  }

  notes.push(`distribution: reposell (mode: ${mode}) — consumed, never re-implemented by the workspace`);
  notes.push("nothing was published — distribution is a separate, explicit step");
  return { stage: "reposell", created, notes, status: "completed" };
}

// ---------------------------------------------------------------------------
// Stage 5 — PAW (WHERE the agent works: the integration point)
// ---------------------------------------------------------------------------

/**
 * The final stage writes `.paw/` and `AGENTS.md`.
 *
 * It runs LAST on purpose. `.paw/workspace.yaml` names the protection and
 * distribution providers, so writing it first would produce a config that
 * references files which do not exist yet — a workspace that claims to be
 * protected while nothing enforces it is worse than an unconfigured one,
 * because it looks safe.
 */
export async function stagePaw(
  input: ResolveInput,
  root: string,
  init: InitWorkspaceFn
): Promise<StageResult> {
  const result = await init(root, {
    // The intent is already resolved from the evidence; pass it through
    // rather than making the config generator re-read the repository. In the
    // questionnaire case there is nothing to pass, so no `project:` block is
    // written — the config stays empty rather than asserting a guess.
    ...(input.hasIntent ? { intent: input.intent } : {}),
    protection: { provider: "repo-shield", mode: input.layerDecisions?.protectionMode ?? "guarded" },
    distribution: { provider: "reposell" },
  });
  const notes: string[] = [];
  if (result.created.length > 0) {
    notes.push(`created ${result.created.join(", ")}`);
    notes.push(`protection: repo-shield (${input.layerDecisions?.protectionMode ?? "guarded"}) — activated from .reposhield/policy.yaml`);
    notes.push("distribution: reposell — activated from .reposell/distribution.yaml");
  } else {
    notes.push("existing .paw/ preserved — protection and distribution blocks were not re-applied");
    notes.push("to wire the layers in by hand, add `protection: {provider: repo-shield, mode: guarded}` to .paw/workspace.yaml");
  }
  if (result.verification.checks.length > 0) {
    notes.push(`verification: ${result.verification.checks.map((c) => c.command).join(" → ")}`);
  } else {
    notes.push("verification: none detected — add commands to .paw/workspace.yaml");
  }
  return { stage: "paw", created: result.created, notes, status: "completed" };
}

/** The subset of `initWorkspace` that stage 5 needs; injectable for tests. */
export type InitWorkspaceFn = (
  projectRoot: string,
  options: {
    readonly from?: string;
    readonly intent?: ProjectIntent;
    readonly protection?: { readonly provider: string; readonly mode?: string };
    readonly distribution?: { readonly provider: string };
  }
) => Promise<{ readonly created: readonly string[]; readonly verification: { readonly checks: readonly { readonly command: string }[] } }>;
