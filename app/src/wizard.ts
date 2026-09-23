/**
 * Launch wizard (PROAGENTS-WORKSPACE-UI.md §30–31; the 7-step flow):
 *   1 project → 2 suggested profiles/crews → 3 selected agents →
 *   4 context framework (ACC default) → 5 built profiles/crew →
 *   6 project setup with the context framework → 7 environment/sandbox
 *   (settings, env vars) → a launched, isolated environment the crew works
 *   in and the user can open editor-style.
 *
 * The wizard is a CONFIG assembler: every step lands in declarative state
 * (workspace entries + sandbox modes + env plumbing), and the actual launch
 * goes through the same kernel paths as manual hiring — no side door.
 */import { WorkspaceError } from "@proagents/contracts";
import type { BootState } from "./context.js";
import type { ConnectedProject } from "./projects.js";
import type { HiredAgent } from "./agents.js";
import { AGENT_PROFILES, type AgentProfile } from "./profiles.js";
import { planSetup, assertCloneTarget, ensureGitAskpass } from "./provision.js";
import { assertSingleLine } from "./terminal.js";

export interface WizardCrewMember {
  readonly profileId: string;
  readonly agentKind: string;
  /** Optional role name shown in the crew roster (defaults to the profile label). */
  readonly role?: string;
  /** Optional per-member first task. */
  readonly task?: string;
}

export interface WizardRequest {
  /** Step 1 — project: an already-connected project id, OR a local path, OR a GitHub repo. */
  readonly project?: { id?: string; localPath?: string; github?: { repo: string; branch?: string } };
  /** Step 2/3/5 — crew: selected profiles with their agent kinds. */
  readonly crew?: readonly WizardCrewMember[];
  /** Step 4 — context framework: only ACC exists today; the field is explicit so the UI shows the choice. */
  readonly contextFramework?: "acc";
  /** Development lifecycle this chat runs (a `lifecycle.definitions` id). */
  readonly lifecycleRef?: string;
  /** Step 7 — environment: sandbox mode + env vars for the workspace. */
  readonly sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  readonly env?: Readonly<Record<string, string>>;
  /** Optional wizard-level name for the environment. */
  readonly name?: string;
}

export interface WizardResult {
  readonly environmentId: string;
  readonly project: ConnectedProject;
  readonly contextFramework: "acc";
  readonly sandbox: string;
  /** Env var NAMES only — values are never returned (secret-handling rule). */
  readonly envVarNames: readonly string[];
  readonly crew: readonly {
    readonly agentId: string;
    readonly profileId: string;
    readonly label: string;
    readonly agentKind: string;
    readonly status: string;
  }[];
  /** Real commands typed into the workspace terminal (the setup log lives there). */
  readonly setupCommands: readonly string[];
  /** The workspace terminal the user should watch. */
  readonly terminalId: string;
  /**
   * Honest provisioning outcome. `ok: false` means the workspace did NOT
   * reach the fully-provisioned state (ACC + proagents + deps); the agents
   * stay 'hired' with a raw shell — fix in the terminal, then launch the
   * harness (POST /api/agents/:id/launch).
   */
  readonly provisioning: {
    readonly ok: boolean;
    readonly failedStep?: string;
    readonly exitCode?: number;
  };
  /** The development lifecycle this chat runs (spec sections 6/16). */
  readonly lifecycleRef: string;
}

/** Suggested crews for step 2 — small curated compositions per project shape. */
export const CREW_TEMPLATES: readonly {
  id: string;
  label: string;
  description: string;
  members: readonly WizardCrewMember[];
}[] = [
  {
    id: "solo",
    label: "Solo engineer",
    description: "One generalist agent owns the task end to end.",
    members: [{ profileId: "generalist", agentKind: "dsh" }],
  },
  {
    id: "build-and-verify",
    label: "Build & Verify",
    description: "An implementer plus a QA engineer — code lands, tests follow.",
    members: [
      { profileId: "nodejs-engineer", agentKind: "dsh", role: "implementer" },
      { profileId: "verification-engineer", agentKind: "dsh", role: "verifier" },
    ],
  },
  {
    id: "review-gate",
    label: "Build, Verify & Secure",
    description: "Implementer + QA + security reviewer for risk-sensitive work.",
    members: [
      { profileId: "nodejs-engineer", agentKind: "dsh", role: "implementer" },
      { profileId: "verification-engineer", agentKind: "dsh", role: "verifier" },
      { profileId: "security-reviewer", agentKind: "dsh", role: "security" },
    ],
  },
];

export function suggestCrews(): typeof CREW_TEMPLATES {
  return CREW_TEMPLATES;
}

export function listProfiles(): readonly AgentProfile[] {
  return AGENT_PROFILES;
}

/**
 * Run the wizard: resolve/build the project, then hire each crew member into
 * the SAME project root (the shared isolated environment), applying the
 * sandbox mode to every member. Env var NAMES are validated; values are
 * passed to the child processes through the process environment only.
 */
export async function runWizard(state: BootState, request: WizardRequest): Promise<WizardResult> {
  // Step 1 — project.
  let project: ConnectedProject;
  if (request.project?.id !== undefined) {
    const existing = state.projects.get(request.project.id);
    if (existing === undefined) {
      throw new WorkspaceError({
        code: "WORKSPACE_NOT_FOUND",
        message: `Project "${request.project.id}" is not connected.`,
        recoverable: true,
        suggestions: ["GET /api/projects lists connected projects", "Connect the project first"],
      });
    }
    project = existing;
  } else if (request.project?.localPath !== undefined) {
    project = await state.projects.connectLocal({ path: request.project.localPath });
  } else if (request.project?.github !== undefined) {
    project = await state.projects.connectGithub({ repo: request.project.github.repo, ...(request.project.github.branch !== undefined ? { branch: request.project.github.branch } : {}) });
  } else {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: "The wizard needs a project: pass project.id, project.localPath, or project.github.repo.",
      recoverable: true,
      suggestions: ["GET /api/projects for connected projects"],
    });
  }

  // Step 4 — context framework: ACC is the default and only wired framework;
  // being explicit keeps the wizard honest about what was chosen.
  const contextFramework = request.contextFramework ?? "acc";

  // Steps 2/3/5 — crew (default: one solo DSH engineer). All members use
  // deferred launch: provisioning commands must run in the raw shell before
  // the harness owns the terminal.
  const crew = request.crew ?? CREW_TEMPLATES[0]?.members ?? [];
  if (crew.length === 0) {
    throw new WorkspaceError({
      code: "CONFIG_INVALID",
      message: "The wizard needs at least one crew member.",
      recoverable: true,
      suggestions: ["Pass crew: [{profileId, agentKind}]", "GET /api/wizard/crews for templates"],
    });
  }

  // Step 7 — environment. Env var names must be sane; values stay in the
  // process env of the server (they reach the workspace terminal children).
  const envNames = Object.keys(request.env ?? {});
  for (const name of envNames) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      throw new WorkspaceError({
        code: "CONFIG_INVALID",
        message: `Invalid env var name "${name}".`,
        recoverable: true,
        suggestions: ["Use UPPER_SNAKE_CASE names"],
      });
    }
  }

  const sandbox = request.sandbox ?? "workspace-write";
  const envLabel = request.name !== undefined && request.name.trim().length > 0
    ? request.name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 30)
    : project.id;

  // Steps 6+launch — hire each member INTO the project root with deferred
  // harness launch so the terminal still runs the raw shell.
  const members: WizardResult["crew"][number][] = [];
  let index = 0;
  for (const member of crew) {
    index += 1;
    const hired: HiredAgent = await state.roster.hire({
      profileId: member.profileId,
      agentKind: member.agentKind,
      root: project.absoluteRoot,
      sandbox,
      name: `${envLabel}-${member.role ?? member.profileId}-${index}`,
      deferLaunch: true,
      ...(request.lifecycleRef !== undefined ? { lifecycleRef: request.lifecycleRef } : {}),
    });
    members.push({
      agentId: hired.id,
      profileId: hired.profileId,
      label: member.role ?? hired.profile.label,
      agentKind: hired.agentKind,
      status: hired.status,
    });
  }

  // Materialize + provision through the PRIMARY member's REAL terminal:
  // clone (github, visible in the terminal) → install packages → ACC +
  // proagents setup. The terminal scrollback IS the setup log.
  const primary = members[0];
  if (primary === undefined) {
    throw new WorkspaceError({
      code: "WORKSPACE_INVALID_STATE",
      message: "No crew member was hired; nothing to provision.",
      recoverable: false,
      suggestions: [],
    });
  }
  const tty = state.terminals.list(primary.agentId)[0];
  if (tty === undefined) {
    throw new WorkspaceError({
      code: "WORKSPACE_INVALID_STATE",
      message: `No terminal attached to ${primary.agentId}; cannot run setup commands.`,
      recoverable: false,
      suggestions: ["Open the workspace terminal first"],
    });
  }
  // Provisioning runs as REAL, SEQUENCED commands in the primary's terminal:
  // every step is awaited on its true exit code (clone → install → scaffold),
  // so a slow clone can never interleave with the next step and the harness
  // only launches into a FULLY provisioned workspace. On failure the shell is
  // left open (the scrollback shows why) and the agents stay 'hired' — the UI
  // exposes Launch harness + POST /api/agents/:id/launch to retry or finish.
  const cloneUrl = project.source === "github" && project.repo !== undefined
    ? assertCloneTarget(`https://github.com/${project.repo}.git`)
    : undefined;
  const askpass = await ensureGitAskpass(state.baseDir);
  const steps = planSetup({
    source: project.source,
    ...(cloneUrl !== undefined ? { cloneUrl } : {}),
    absoluteRoot: project.absoluteRoot,
    displayRoot: project.root,
    ...(askpass !== null ? { askpassPath: askpass } : {}),
  });
  const failures: { label: string; exitCode: number }[] = [];
  for (const step of steps) {
    const { exitCode } = await state.terminals.runCommandAwait(tty.id, assertSingleLine(step.command));
    if (exitCode !== 0) {
      failures.push({ label: step.label, exitCode });
      break; // the scrollback shows the error; keep the shell for recovery
    }
  }

  // Harness launch ONLY into a fully provisioned workspace (the launch
  // contract: end with ACC + proagents fully set up). A failed step keeps
  // the raw shell — recovery: fix in the terminal, then Launch harness.
  let launched = false;
  if (failures.length === 0) {
    const firstTask = crew[0]?.task;
    for (const m of members) {
      state.roster.launchHarness(m.agentId, m === primary ? firstTask : undefined);
    }
    launched = true;
  }

  return {
    environmentId: `${envLabel}-${members.length}-crew`,
    project,
    contextFramework,
    sandbox,
    envVarNames: envNames,
    crew: members.map((m) => ({
      ...m,
      status: failures.length > 0 ? "hired (provisioning failed — launch manually)" : launched ? "working" : m.status,
    })),
    setupCommands: steps.map((s) => s.command),
    terminalId: tty.id,
    provisioning: {
      ok: failures.length === 0,
      ...(failures[0] !== undefined ? { failedStep: failures[0].label, exitCode: failures[0].exitCode } : {}),
    },
    /** The lifecycle this chat will run (spec sections 6/16). */
    lifecycleRef: request.lifecycleRef ?? "default",
  };
}
