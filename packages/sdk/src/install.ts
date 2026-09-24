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
 * File-driven (spec sections 148/152): pass `from: "README.md"` (any text
 * file relative to the project root) and the workspace starts from THAT
 * file — the inferred intent is persisted into `.paw/workspace.yaml` as the
 * `project:` block. This is the `@README.md` semantic contract: "Setup the
 * workspace FOR this project description."
 *
 * Like `paw init`, it never touches application code: metadata only
 * (spec sections 44/148). It is idempotent — running twice changes nothing
 * the second time (existing instructions and config are preserved, never
 * overwritten).
 */
import {
  detectProject,
  discoverEnvironment,
  findReadmeText,
  inferIntentFromText,
  initWorkspace,
  isInitialized,
  type DetectedProject,
  type ProjectIntent,
  type VerificationPlan,
} from "./conventions.js";
import { defaultFlow } from "@proagents/kernel";
import type { WorkspaceError } from "@proagents/contracts";

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
  /** The file the intent was driven from, when installed file-driven. */
  readonly from?: string;
  /** Detected coding agents — what `paw agent list` will report. */
  readonly agents: readonly { readonly id: string; readonly name: string; readonly command?: string }[];
  /** Runtime configuration layout written to the target. */
  readonly layout: { readonly configDir: ".paw"; readonly config: ".paw/workspace.yaml"; readonly agentsFile: "AGENTS.md" };
  /** The lifecycle flow the workspace will run (default, spec section 151). */
  readonly lifecycleFlow: import("@proagents/contracts").LifecycleFlow;
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
export async function installWorkspace(
  projectRoot: string,
  options: { readonly from?: string } = {}
): Promise<InstallPlan> {
  // ---- inspect -------------------------------------------------------------
  const project = await detectProject(projectRoot);
  const env = await discoverEnvironment(projectRoot);
  const agents = env.filter((i) => i.kind === "agent-framework" && i.detected);

  // ---- initialize (+ understand, when file-driven) --------------------------
  // initWorkspace owns the `from` contract: it reads the source, infers the
  // intent, and persists the `project:` block — throwing the structured
  // INTENT_SOURCE_UNREADABLE error when the file cannot be read. Its returned
  // intent is authoritative for a file-driven install.
  const alreadyInitialized = isInitialized(projectRoot);
  const init = await initWorkspace(projectRoot, options.from !== undefined ? { from: options.from } : {});
  const intent =
    options.from !== undefined && init.intent !== undefined
      ? init.intent
      : await inferProjectIntent(projectRoot, project); // README fallback

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
        ...(options.from !== undefined ? [`intent source: ${options.from} (file-driven install)`] : []),
        `product type: ${intent.productType}`,
        intent.domains.length > 0 ? `domains: ${intent.domains.join(", ")}` : "domains: none recognized",
        intent.frameworks.length > 0 ? `technologies: ${intent.frameworks.join(", ")}` : "technologies: none recognized",
        `derived from: ${intent.derivedFrom.join(", ") || "no manifests, README, or source file"}`,
      ],
    },
    {
      phase: "initialize",
      status: "completed",
      notes: alreadyInitialized
        ? ["workspace already initialized — existing configuration preserved (idempotent)"]
        : [
            "created .paw/ metadata (workspace.yaml, sessions/, artifacts/)",
            ...(options.from !== undefined ? ["project intent persisted to .paw/workspace.yaml"] : []),
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
    ...(options.from !== undefined ? { from: options.from } : {}),
    agents: agents.map((a) => ({ id: a.id, name: a.name, ...(a.command !== undefined ? { command: a.command } : {}) })),
    layout: { configDir: ".paw", config: ".paw/workspace.yaml", agentsFile: "AGENTS.md" },
    lifecycleFlow: flow,
    verification: init.verification,
    created: init.created,
    phases,
  };
}

export type { WorkspaceError };
