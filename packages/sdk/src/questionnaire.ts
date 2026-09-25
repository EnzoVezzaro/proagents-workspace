/**
 * The project questionnaire (spec section 152, resolve stage).
 *
 * When a repository cannot describe itself — no code, no README — the
 * workspace does not guess. The installer asks. The questions live here as
 * DATA (plugin-first: adding a question is adding an entry, never a
 * conditional), the answers are pure functions into a `ProjectIntent`, and
 * the CLI owns the actual prompting (SDK stays TTY-free and testable).
 *
 * Two consumers, one contract:
 *   - interactive (TTY): `paw init` asks the questions in order.
 *   - headless (agents, CI): the questions are REPORTED verbatim with the
 *     exact `paw init --answers <a> <b> <c> <d> <e>` invocation that applies
 *     them — the loop closes without a TTY.
 *
 * Every intent produced from answers names its provenance:
 * `derivedFrom: ["questionnaire (n/5 answered)"]` — an answer is the
 * project's own words, so it is honest evidence.
 */

export interface QuestionnaireItem {
  /** Stable id (machine-readable; `--answers` maps positionally to ids). */
  readonly id: string;
  /** The question exactly as asked/reported. */
  readonly prompt: string;
  /** Accepted answers — free text is always allowed; these are hints. */
  readonly hint?: string;
}

/** The five questions, in the order they are asked. */
export const QUESTIONNAIRE: readonly QuestionnaireItem[] = [
  {
    id: "product",
    prompt: "What is this project? (web app / CLI tool / API / library / desktop app / something else)",
  },
  { id: "purpose", prompt: "What does it do, in one sentence?" },
  {
    id: "technologies",
    prompt: "Which technologies/languages do you plan to use?",
    hint: "e.g. TypeScript, React, Python",
  },
  {
    id: "distribution",
    prompt: "How will it be distributed? (open source / npm package / commercial / internal)",
    hint: "drives the reposell layer",
  },
  {
    id: "protection",
    prompt: "How strict should protection be? (off / audit / warn / guarded / strict)",
    hint: "default: guarded — destructive git operations are refused",
  },
];

/** The prompts only (what gets asked/reported). */
export function questionsFor(): readonly string[] {
  return QUESTIONNAIRE.map((q) => q.prompt);
}

/** The question ids, in order — the positional contract of `--answers`. */
export function questionIds(): readonly string[] {
  return QUESTIONNAIRE.map((q) => q.id);
}

const GUARD_MODES = new Set(["off", "audit", "warn", "guarded", "strict"]);

const KNOWN_TECH = new Set([
  "typescript", "javascript", "python", "rust", "golang", "react", "vue", "svelte",
  "nextjs", "vite", "electron", "postgres", "sqlite", "redis", "docker", "kubernetes",
]);

function words(text: string): readonly string[] {
  return text.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 0);
}

/** Product-type synonyms → the canonical productType vocabulary. */
function productTypeFrom(answer: string): string {
  const w = words(answer);
  const has = (...terms: readonly string[]): boolean => w.some((word) => terms.some((t) => word === t || word.startsWith(t)));
  if (has("cli", "command", "terminal", "console")) return "cli";
  if (has("api", "service", "backend", "server", "endpoint")) return "api";
  if (has("library", "package", "sdk", "module")) return "library";
  if (has("plugin")) return "plugin";
  if (has("desktop", "electron", "tauri")) return "desktop-application";
  if (has("mobile", "ios", "android")) return "mobile-application";
  if (has("web", "browser", "site", "app", "frontend")) return "browser-application";
  // Free text: keep the user's words, kebab-cased, rather than a lie.
  const cleaned = answer.trim().toLowerCase().replace(/\s+/g, "-");
  return cleaned.length > 0 ? cleaned : "application";
}

/** Distribution intent words → reposell mode (`paid` only on clear evidence). */
function distributionModeFrom(answer: string): string {
  const w = words(answer);
  const has = (...terms: readonly string[]): boolean => w.some((word) => terms.some((t) => word.startsWith(t)));
  return has("paid", "commercial", "sell", "license", "enterprise") ? "paid" : "free";
}

export interface QuestionnaireOutcome {
  /** The intent the answers describe (provenance: `questionnaire (n/5)`). */
  readonly intent: import("./conventions.js").ProjectIntent;
  /** Enforcement posture for the shield layer; `guarded` unless stated. */
  readonly protectionMode: string;
  /** Distribution posture for the reposell layer; `free` unless stated. */
  readonly distributionMode: string;
  /** How many of the five questions were actually answered. */
  readonly answered: number;
}

/**
 * Map positional questionnaire answers (aligned with `QUESTIONNAIRE`) onto
 * the intent + layer decisions. PURE — no I/O; the CLI collects the strings.
 *
 * Fewer answers than questions is fine (partial loops are resumable);
 * missing positions fall back to the honest defaults instead of guesses.
 */
export function answersToOutcome(answers: readonly string[]): QuestionnaireOutcome {
  const byId = new Map<string, string>();
  QUESTIONNAIRE.forEach((q, i) => {
    const answer = answers[i];
    if (typeof answer === "string" && answer.trim().length > 0) byId.set(q.id, answer.trim());
  });

  const purpose = byId.get("purpose") ?? "";
  const technologies = byId.get("technologies") ?? "";
  const distribution = byId.get("distribution") ?? "";
  const protection = byId.get("protection") ?? "";

  const domains = new Set<string>();
  if (/\bai\b|\bllm\b|\bagent/i.test(`${purpose} ${technologies}`)) domains.add("ai");
  if (/\bmonitor|observab|telemetr/i.test(purpose)) domains.add("monitoring");
  if (/\bpayments?|billing|checkout/i.test(`${purpose} ${distribution}`)) domains.add("payments");
  if (/\be-?commerce|storefront|shop/i.test(`${purpose} ${distribution}`)) domains.add("e-commerce");
  if (/\bsearch/i.test(purpose)) domains.add("search");

  const frameworks: string[] = [];
  for (const w of words(technologies)) {
    const term = w === "next.js" ? "nextjs" : w === "go" ? "golang" : w;
    if (KNOWN_TECH.has(term) && !frameworks.includes(term)) frameworks.push(term);
  }

  const answered = byId.size;
  return {
    intent: {
      productType: productTypeFrom(byId.get("product") ?? ""),
      domains: [...domains],
      frameworks,
      skills: [],
      derivedFrom: answered > 0 ? [`questionnaire (${answered}/${QUESTIONNAIRE.length} answered)`] : [],
    },
    protectionMode: GUARD_MODES.has(protection.toLowerCase()) ? protection.toLowerCase() : "guarded",
    distributionMode: distributionModeFrom(distribution),
    answered,
  };
}
