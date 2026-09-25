/**
 * Agent bootstrap installer (spec section 152).
 *
 * The distribution thesis: the GitHub repository is the distribution package;
 * AGENTS.md is the universal bootstrap protocol; `npx
 * @reposell/proagents-workspace@latest install` (i.e. `paw install`) is the
 * deterministic installer.
 *
 * `paw init` (the same code path as the npx entrypoint) runs the six-stage
 * bootstrap in the one order that makes sense, because each stage consumes
 * the previous one:
 *
 *   resolve → acc → shield → proagents → reposell → paw
 *
 * RESOLVE decides where identity comes from (code + README, else README,
 * else code, else ask). ACC writes the knowledge layer. SHIELD writes the
 * rules. PROAGENTS writes the profiles and crew, derived from ACC. REPOSELL
 * writes licensing and distribution. PAW writes `.paw/` LAST, because
 * `.paw/workspace.yaml` is the artifact that names the protection and
 * distribution providers — writing it first would produce a config that
 * points at files which do not exist yet.
 *
 * File-driven (spec sections 148/152): pass `from: "README.md"` (any text
 * file relative to the project root) and the workspace starts from THAT
 * file. The inferred intent is persisted into `.paw/workspace.yaml` as the
 * `project:` block. Pass `answers` (five strings, the questionnaire
 * contract) when the repository cannot describe itself — an empty directory
 * installs honestly from the interview instead of guessing.
 *
 * Like `paw init`, it never touches application code: metadata only
 * (spec sections 44/148). It is idempotent — running twice changes nothing
 * the second time (every stage creates only what is missing and never
 * overwrites an existing file).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  detectProject,
  discoverEnvironment,
  findReadmeText,
  inferIntentFromText,
  inferVerification,
  initWorkspace,
  isInitialized,
  type DetectedProject,
  type ProjectIntent,
  type VerificationPlan,
} from "./conventions.js";
import { answersToOutcome } from "./questionnaire.js";
import {
  stageAcc,
  stageProagents,
  stagePaw,
  stageReposell,
  stageResolve,
  stageShield,
  STAGE_ORDER,
  type ResolveInput,
  type StageId,
  type StageResult,
} from "./stages.js";
import { defaultFlow } from "@proagents/kernel";
import { WorkspaceError } from "@proagents/contracts";

/**
 * Infer the project's intent from its README (the default `@README.md`
 * contract) plus its existing manifests. Convenience wrapper over the pure
 * `inferIntentFromText`; file-driven callers go through `installWorkspace` /
 * `initWorkspace` with an explicit `from` source instead.
 */
export async function inferProjectIntent(
  projectRoot: string,
  project: DetectedProject
): Promise<ProjectIntent> {
  const readme = await findReadmeText(projectRoot);
  return inferIntentFromText({
    text: readme?.text ?? "",
    derivedFrom: [...project.evidence, ...(readme !== null ? [readme.file] : [])],
    knownFrameworks: project.frameworks,
  });
}

// ---------------------------------------------------------------------------
// The six-stage contract
// ---------------------------------------------------------------------------

export interface InstallStageReport extends StageResult {
  readonly stage: StageId;
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
  /** The file the intent was driven from, when installed file-driven. */
  readonly from?: string;
  /**
   * Where the project's identity came from. `questionnaire` means the
   * repository could not describe itself and `paw research` must be run
   * before the intent is real.
   */
  readonly basis: "code-and-readme" | "readme-only" | "code-only" | "questionnaire";
  /** Present only when the questionnaire is the answer; the agent can act on it. */
  readonly questionnaire?: readonly string[];
  /** Detected coding agents — what `paw agent list` will report. */
  readonly agents: readonly { readonly id: string; readonly name: string; readonly command?: string }[];
  /** Runtime configuration layout written to the target. */
  readonly layout: {
    readonly configDir: ".paw";
    readonly config: ".paw/workspace.yaml";
    readonly agentsFile: "AGENTS.md";
    readonly acc: ".acc";
    readonly shield: ".reposhield";
    readonly proagents: ".proagents";
    readonly reposell: ".reposell";
  };
  /** The lifecycle flow the workspace will run (default, spec section 151). */
  readonly lifecycleFlow: import("@proagents/contracts").LifecycleFlow;
  /** Verification checks that were configured or detected. */
  readonly verification: VerificationPlan;
  /** Files the install created (empty on a re-run). */
  readonly created: readonly string[];
  /** The stages, in the order they ran. */
  readonly stages: readonly InstallStageReport[];
  /** True when a previous install was already present (idempotent re-run). */
  readonly alreadyInitialized: boolean;
}

const EMPTY_INTENT: ProjectIntent = {
  productType: "unknown",
  domains: [],
  skills: [],
  frameworks: [],
  derivedFrom: [],
  summary: "",
} as ProjectIntent;

/**
 * `paw init` (spec section 152): the deterministic bootstrap — `paw install`
 * is an alias for the same machine. Safe to run from any external agent;
 * idempotent; metadata-only.
 *
 * Verification is only ever REPORTED here — executing a foreign project's
 * checks uninvited is never the installer's decision. Hosts that want
 * one-step install+verify chain their own verification runner (the CLI does
 * exactly that behind `paw install --verify`).
 */
export async function installWorkspace(
  projectRoot: string,
  options: { readonly from?: string; readonly answers?: readonly string[] } = {}
): Promise<InstallPlan> {
  const project = await detectProject(projectRoot);
  const env = await discoverEnvironment(projectRoot);
  const agents = env.filter((i) => i.kind === "agent-framework" && i.detected);
  const readme = await findReadmeText(projectRoot);
  const alreadyInitialized = isInitialized(projectRoot);

  // ---- resolve identity BEFORE any stage writes, so every stage sees it ---
  // An explicit `from` is authoritative: the caller named the source. An
  // UNREADABLE explicit source is a structured error (see initWorkspace's
  // INTENT_SOURCE_UNREADABLE) — silently falling back to the README would
  // ignore the caller's instruction without saying so.
  let intent: ProjectIntent;
  let hasIntent = true;
  // Layer postures decided ahead of the stages: questionnaire answers when
  // the interview ran, evidence-based defaults otherwise.
  let layerDecisions: { protectionMode: string; distributionMode: string } | undefined;
  if (options.answers !== undefined) {
    if (options.answers.length === 0) {
      throw new WorkspaceError({
        code: "QUESTIONNAIRE_EMPTY",
        message: "--answers was passed without any answers.",
        recoverable: true,
        suggestions: [
          "Answer all five questions, e.g.: paw init --answers \"web app\" \"a task manager\" \"TypeScript\" \"open source\" \"guarded\"",
          "Or run `paw init` in a terminal to be asked interactively",
        ],
      });
    }
    const outcome = answersToOutcome(options.answers);
    if (outcome.answered === 0) {
      throw new WorkspaceError({
        code: "QUESTIONNAIRE_EMPTY",
        message: "All five --answers entries were blank.",
        recoverable: true,
        suggestions: ["Pass at least the first answer (what the project is), e.g. `paw init --answers \"cli tool\"`"]
      });
    }
    intent = outcome.intent;
    // Answers are the project's own words — real evidence, regardless of
    // what is on disk.
    hasIntent = true;
    layerDecisions = { protectionMode: outcome.protectionMode, distributionMode: outcome.distributionMode };
  } else if (options.from !== undefined) {
    intent = await readIntentFrom(projectRoot, options.from, project);
  } else {
    intent = await inferProjectIntent(projectRoot, project);
    // No evidence at all: the repository cannot describe itself.
    hasIntent = project.languages.length > 0 || readme !== null;
  }

  const input: ResolveInput = {
    projectRoot,
    project,
    readme,
    ...(options.from !== undefined ? { from: options.from } : {}),
    intent: hasIntent ? intent : EMPTY_INTENT,
    hasIntent,
    ...(layerDecisions !== undefined ? { layerDecisions } : {}),
  };

  // ---- the six stages, in dependency order -------------------------------
  const stages: StageResult[] = [];
  stages.push(stageResolve(input));
  stages.push(await stageAcc(input, projectRoot));
  stages.push(await stageShield(input, projectRoot));
  stages.push(await stageProagents(input, projectRoot));
  stages.push(await stageReposell(input, projectRoot));
  stages.push(await stagePaw(input, projectRoot, initWorkspace));

  // The order is normative; assert it rather than trusting the array literal
  // to stay in sync with STAGE_ORDER.
  const order = stages.map((s) => s.stage);
  if (order.join(",") !== STAGE_ORDER.join(",")) {
    throw new Error(`install stage order drifted: ${order.join(" → ")}`);
  }

  const resolve = stages[0] as StageResult & {
    basis: InstallPlan["basis"];
    questionnaire?: readonly string[];
  };
  const created = stages.flatMap((s) => s.created);
  const verification = await inferVerification(projectRoot);

  // Environment facts belong to the resolve stage — that is the stage that
  // looked. Fold them in so there is exactly one place an agent has to read
  // to learn what the repository is.
  const environment = [
    `languages: ${project.languages.join(", ") || "unknown"}`,
    project.packageManager !== undefined
      ? `package manager: ${project.packageManager}`
      : "package manager: not detected",
    project.frameworks.length > 0
      ? `frameworks (deps): ${project.frameworks.join(", ")}`
      : "frameworks (deps): none declared",
    project.monorepo ? "monorepo: yes" : "monorepo: no",
    `agents: ${agents.length > 0 ? agents.map((a) => a.id).join(", ") : "none detected"}`,
    `already initialized: ${alreadyInitialized ? "yes — re-run, nothing overwritten" : "no"}`,
  ];
  const intentNotes = hasIntent
    ? [
        `product type: ${intent.productType}`,
        intent.domains.length > 0 ? `domains: ${intent.domains.join(", ")}` : "domains: none recognized",
        intent.frameworks.length > 0
          ? `technologies: ${intent.frameworks.join(", ")}`
          : "technologies: none recognized",
        `derived from: ${intent.derivedFrom.join(", ") || "no manifests, README, or source file"}`,
      ]
    : [];
  stages[0] = { ...resolve, notes: [...resolve.notes, ...environment, ...intentNotes] };

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
    ...(options.from !== undefined ? { from: options.from } : {}),
    basis: resolve.basis,
    ...(resolve.questionnaire !== undefined ? { questionnaire: resolve.questionnaire } : {}),
    agents: agents.map((a) => ({ id: a.id, name: a.name, ...(a.command !== undefined ? { command: a.command } : {}) })),
    layout: {
      configDir: ".paw",
      config: ".paw/workspace.yaml",
      agentsFile: "AGENTS.md",
      acc: ".acc",
      shield: ".reposhield",
      proagents: ".proagents",
      reposell: ".reposell",
    },
    lifecycleFlow: defaultFlow(),
    verification,
    created,
    stages,
    alreadyInitialized,
  };
}

/**
 * Read an explicit intent source and infer from it.
 *
 * An explicit `from` is the caller naming the source, so an unreadable file
 * is a structured error, never a silent fallback to the README — ignoring an
 * explicit instruction without saying so is exactly the kind of quiet
 * dishonesty this installer must not have.
 */
async function readIntentFrom(
  projectRoot: string,
  from: string,
  project: DetectedProject
): Promise<ProjectIntent> {
  const resolved = path.resolve(projectRoot, from);
  let text: string | null = null;
  try {
    text = await readFile(resolved, "utf8");
  } catch {
    text = null;
  }
  if (text === null) {
    throw new WorkspaceError({
      code: "INTENT_SOURCE_UNREADABLE",
      message: `Cannot read the intent source file: ${from}`,
      recoverable: true,
      suggestions: ["Pass a path to an existing text file, e.g. `paw init README.md`"],
      details: { file: resolved },
    });
  }
  const relative = path.relative(projectRoot, resolved) || path.basename(resolved);
  return inferIntentFromText({
    text,
    derivedFrom: [relative, ...project.evidence],
    knownFrameworks: project.frameworks,
  });
}

export type { WorkspaceError };
export { STAGE_ORDER } from "./stages.js";
export type { StageId, StageResult } from "./stages.js";

