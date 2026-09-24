/**
 * Workspace research (spec section 149): the integration point between the
 * product-level Workspace and the ACC / ProAgents ecosystems.
 *
 * Workspace does NOT reinvent context or interviewing:
 *   - Context facts come from CONTEXT PROVIDERS through the existing
 *     `ContextProvider.inspect()` contract (ACC is one implementation);
 *     when none is available the research degrades honestly to repository
 *     facts (spec section 149: "Workspace will continue using standard
 *     repository context").
 *   - Agent-level professional requirements are NOT invented here — they are
 *     handed to ProAgents through a machine-readable requirements artifact
 *     (`.paw/proagents/requirements.json`), because ProAgents already owns
 *     progressive interviewing for WHO the agent is (its interview derives
 *     questions from answers; PAW must not build a competing engine).
 *
 * Product questions (what are we building / for whom / what is done) belong
 * to Workspace; agent questions (role, skills, permissions) belong to
 * ProAgents. The two converge on the research model written to `.paw/research/`.
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineService, type ContextProvider, type ContextPack } from "@proagents/contracts";
import { pawDirFor, detectProject, discoverEnvironment, inferVerification, type DetectedProject, type DiscoveredIntegration, type VerificationPlan } from "./conventions.js";

/** Service definition for research participation (resolved via the registry). */
export const researchContextService = defineService<ContextProvider>({
  id: "context",
  contractVersion: "1.0.0",
});

// ---------------------------------------------------------------------------
// Research model (machine-readable: `.paw/research/research.json`)
// ---------------------------------------------------------------------------

/** Where a fact came from — research never invents provenance. */
export type FactSource = "context-provider" | "repository" | "environment" | "user";

export interface ResearchFact {
  readonly key: string;
  readonly value: string;
  readonly source: FactSource;
  /** Provider/origin detail, e.g. "acc" or "package.json". */
  readonly origin?: string;
}

/** One open uncertainty with the highest-value question that resolves it. */
export interface ResearchQuestion {
  readonly id: string;
  readonly question: string;
  readonly why: string;
  /** Facts whose absence or conflict motivates this question. */
  readonly resolves: readonly string[];
  readonly answer?: string;
}

export interface ResearchModel {
  readonly version: 1;
  readonly product: {
    readonly goal?: string;
    readonly audience?: string;
    readonly definitionOfDone?: string;
  };
  readonly facts: readonly ResearchFact[];
  readonly questions: readonly ResearchQuestion[];
  /** ProAgents handoff: agent-level requirements for the OTHER system to own. */
  readonly proagents: {
    readonly artifact: string;
    readonly requirements: {
      readonly environment: Record<string, string>;
      readonly verification: readonly string[];
      readonly contextProviders: readonly string[];
      readonly detectedAgents: readonly string[];
    };
  };
}

// ---------------------------------------------------------------------------
// Uncertainty detection (spec 149): ask only what the environment cannot answer
// ---------------------------------------------------------------------------

/**
 * Derive open questions from the research model. Rules:
 *   - a fact already present (from ANY source) never becomes a question;
 *   - user-answered facts are final;
 *   - questions are ordered by value: goal → audience → done (product
 *     questions only — agent questions are ProAgents' job).
 */
export function deriveQuestions(model: ResearchModel): ResearchQuestion[] {
  const has = (key: string): boolean => model.facts.some((f) => f.key === key && f.source !== "user" ? true : f.source === "user");
  const factValue = (key: string): string | undefined => model.facts.find((f) => f.key === key)?.value;
  const open: ResearchQuestion[] = [];
  if (factValue("product.goal") === undefined) {
    open.push({
      id: "product-goal",
      question: "What are we building — in one sentence?",
      why: "The product goal anchors verification, lifecycle choice, and agent requirements.",
      resolves: ["product.goal"],
    });
  }
  if (factValue("product.audience") === undefined) {
    open.push({
      id: "product-audience",
      question: "Who is it for?",
      why: "The audience determines platforms, UX checks, and real-world verification.",
      resolves: ["product.audience"],
    });
  }
  if (factValue("product.done") === undefined) {
    open.push({
      id: "product-done",
      question: "What does \"done\" mean for the next milestone?",
      why: "A definition of done makes verification meaningful instead of ritual.",
      resolves: ["product.done"],
    });
  }
  void has;
  return open;
}

/** Apply a user answer to the model (returns a NEW model — immutable updates). */
export function answerQuestion(model: ResearchModel, questionId: string, answer: string): ResearchModel {
  const question = model.questions.find((q) => q.id === questionId);
  if (question === undefined) {
    return model;
  }
  const factKey = question.resolves[0] ?? `answer.${question.id}`;
  const fact: ResearchFact = { key: factKey, value: answer, source: "user", origin: "interview" };
  return {
    ...model,
    facts: [...model.facts.filter((f) => f.key !== factKey), fact],
    questions: model.questions.map((q) => (q.id === questionId ? { ...q, answer } : q)),
  };
}

// ---------------------------------------------------------------------------
// Research execution: context providers first, repository facts second
// ---------------------------------------------------------------------------

export interface ResearchContexts {
  /** What context providers reported (empty when none are available). */
  readonly providers: readonly { readonly id: string; readonly pack: ContextPack }[];
  /** Honest degradation note when no provider participated. */
  readonly note?: string;
}

/**
 * Research options. Context providers are supplied by the HOST (CLI/UI) from
 * its own plugin catalog — the SDK never imports concrete plugins (dependency
 * direction, spec section 50: plugins → SDK, never SDK → plugins).
 */
export interface ResearchOptions {
  /**
   * Context providers to consult during research (e.g. ACC). Each must
   * implement the existing `ContextProvider` contract; implementations are
   * resolved through the registry by the host, honoring plugin-first rules
   * (spec sections 139/146).
   */
  readonly contextProviders?: readonly { readonly id: string; readonly provider: ContextProvider }[];
}

export async function gatherContexts(projectRoot: string, options: ResearchOptions = {}): Promise<ResearchContexts> {
  void projectRoot; // reserved for provider-scoped inspection
  const providers: { id: string; pack: ContextPack }[] = [];
  for (const { id, provider } of options.contextProviders ?? []) {
    try {
      providers.push({ id, pack: await provider.inspect() });
    } catch {
      // A failing context provider degrades research honestly (spec 63):
      // it is reported as absent, never fabricated.
    }
  }
  if (providers.length === 0) {
    return {
      providers: [],
      note: "No context provider available. Workspace will continue using standard repository context.",
    };
  }
  return { providers };
}

function contextFacts(contexts: ResearchContexts): ResearchFact[] {
  const facts: ResearchFact[] = [];
  for (const { id, pack } of contexts.providers) {
    for (const entry of pack.entries.slice(0, 12)) {
      facts.push({
        key: `context.${entry.id}`,
        value: entry.summary,
        source: "context-provider",
        origin: pack.provider || id,
      });
    }
  }
  return facts;
}

export interface ResearchResult {
  readonly projectRoot: string;
  readonly model: ResearchModel;
  readonly contexts: ResearchContexts;
  readonly project: DetectedProject;
  readonly verification: VerificationPlan;
  readonly agents: readonly DiscoveredIntegration[];
  /** Files written under `.paw/` (relative paths). */
  readonly artifacts: readonly string[];
}

/**
 * Run the discovery pass of research (spec 149): context providers →
 * repository → environment, build the research model, derive the remaining
 * questions, and write the artifacts. The interview loop is separate
 * (`answerQuestion` + re-render) so hosts can drive it interactively,
 * headlessly, or through any future interface — same model either way.
 */
export async function runResearch(projectRoot: string, options: ResearchOptions = {}): Promise<ResearchResult> {
  const project = await detectProject(projectRoot);
  const verification = await inferVerification(projectRoot);
  const environment = await discoverEnvironment(projectRoot);
  const contexts = await gatherContexts(projectRoot, options);

  const facts: ResearchFact[] = [];
  facts.push(...contextFacts(contexts));
  if (project.languages.length > 0) {
    facts.push({ key: "repository.languages", value: project.languages.join(", "), source: "repository", origin: "project manifest" });
  }
  if (project.runtime !== undefined) {
    facts.push({ key: "repository.runtime", value: project.runtime, source: "repository", origin: "project manifest" });
  }
  if (project.packageManager !== undefined) {
    facts.push({ key: "repository.packageManager", value: project.packageManager, source: "repository", origin: "project manifest" });
  }
  if (project.frameworks.length > 0) {
    facts.push({ key: "repository.frameworks", value: project.frameworks.join(", "), source: "repository", origin: "project manifest" });
  }
  for (const check of verification.checks) {
    facts.push({ key: `verification.${check.id}`, value: check.command, source: "repository", origin: "project scripts" });
  }
  const detectedAgents = environment.filter((i) => i.kind === "agent-framework" && i.detected);
  if (detectedAgents.length > 0) {
    facts.push({ key: "environment.agents", value: detectedAgents.map((a) => a.id).join(", "), source: "environment", origin: "PATH probe" });
  }

  const preliminary: ResearchModel = {
    version: 1,
    product: {},
    facts,
    questions: [],
    proagents: {
      artifact: ".paw/proagents/requirements.json",
      requirements: {
        environment: Object.fromEntries(
          Object.entries({
            languages: project.languages.join(", "),
            runtime: project.runtime,
            packageManager: project.packageManager,
            frameworks: project.frameworks.join(", "),
            monorepo: project.monorepo ? "true" : undefined,
          }).filter(([, v]) => v !== undefined && v !== "")
        ) as Record<string, string>,
        verification: verification.checks.map((c) => c.command),
        contextProviders: contexts.providers.map((p) => p.pack.provider),
        detectedAgents: detectedAgents.map((a) => a.id),
      },
    },
  };
  // Questions derive from the gathered facts only — never invented.
  const model: ResearchModel = { ...preliminary, questions: deriveQuestions(preliminary) };

  // ---- artifacts (spec 149): machine model + human-readable projections.
  const researchDir = path.join(pawDirFor(projectRoot), "research");
  await mkdir(researchDir, { recursive: true });
  const artifacts: string[] = [];

  const researchJson = path.join(researchDir, "research.json");
  await writeFile(researchJson, `${JSON.stringify(model, null, 2)}\n`, "utf8");
  artifacts.push(path.relative(projectRoot, researchJson));

  const productMd = [
    "# Product Research",
    "",
    `Generated by \`paw research\` — workspace-owned product/environment discovery.`,
    "",
    "## Detected facts",
    "",
    ...(facts.length === 0 ? ["(nothing detected)"] : facts.map((f) => `- **${f.key}**: ${f.value} _(${f.source}${f.origin !== undefined ? `: ${f.origin}` : ""})_`)),
    "",
    "## Open questions",
    "",
    ...(model.questions.length === 0
      ? ["(none — the environment answered everything it could)"]
      : model.questions.map((q) => `1. ${q.question}\n   _Why: ${q.why}_`)),
    "",
    contextFacts(contexts).length === 0 && contexts.note !== undefined ? `> ${contexts.note}` : "",
    "",
  ].filter((line) => line !== "");
  await writeFile(path.join(researchDir, "product.md"), productMd.join("\n"), "utf8");
  artifacts.push(path.relative(projectRoot, path.join(researchDir, "product.md")));

  const decisionsMd = path.join(researchDir, "decisions.md");
  if (!existsSync(decisionsMd)) {
    await writeFile(
      decisionsMd,
      ["# Decisions", "", "Recorded as the interview resolves open questions. Append-only.", ""].join("\n"),
      "utf8"
    );
    artifacts.push(path.relative(projectRoot, decisionsMd));
  }

  // ProAgents handoff (spec 149): agent-level requirements for ProAgents to
  // own. PAW does not generate skills/rules/profiles — it hands over facts.
  const proagentsDir = path.join(pawDirFor(projectRoot), "proagents");
  await mkdir(proagentsDir, { recursive: true });
  const reqPath = path.join(proagentsDir, "requirements.json");
  await writeFile(reqPath, `${JSON.stringify({ version: 1, ...model.proagents.requirements }, null, 2)}\n`, "utf8");
  artifacts.push(path.relative(projectRoot, reqPath));

  return { projectRoot, model, contexts, project, verification, agents: environment, artifacts };
}

/** Read a previously written research model, when present. */
export function researchModelPath(projectRoot: string): string {
  return path.join(pawDirFor(projectRoot), "research", "research.json");
}

export function hasResearch(projectRoot: string): boolean {
  return existsSync(researchModelPath(projectRoot));
}
