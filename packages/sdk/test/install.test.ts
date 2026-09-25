/**
 * Agent bootstrap installer tests (spec section 152).
 *
 * The install contract, pinned: the six stages in dependency order (resolve →
 * acc → shield → proagents → reposell → paw), the four documented identity
 * bases, metadata-only writes, idempotency, and preservation of existing
 * configuration. These tests ARE the executable form of install.yaml.
 */
import { describe, expect, it, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  installWorkspace,
  inferProjectIntent,
  inferIntentFromText,
  initWorkspace,
  detectProject,
  configPathFor,
  loadConfig,
  WorkspaceError,
  type InstallPlan,
} from "../src/index.js";

const scratches: string[] = [];

afterAll(() => {
  for (const dir of scratches) rm(dir, { recursive: true, force: true });
});

async function scratch(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "paw-install-"));
  scratches.push(dir);
  return dir;
}

async function nodeProject(root: string, scripts: Record<string, string> = { test: "echo tested" }): Promise<void> {
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", scripts }), "utf8");
  await writeFile(path.join(root, "tsconfig.json"), "{}", "utf8");
  await writeFile(path.join(root, "pnpm-lock.yaml"), "", "utf8");
}

describe("installWorkspace — the six-stage contract (spec 152)", () => {
  it("runs the six stages in dependency order on a plain node project and reports evidence", async () => {
    const root = await scratch();
    await nodeProject(root);
    await writeFile(
      path.join(root, "README.md"),
      "# Fixture\n\nA local-first browser application with AI research features and monitoring.\n",
      "utf8"
    );

    const plan = await installWorkspace(root);

    expect(plan.stages.map((s) => s.stage)).toEqual([
      "resolve", "acc", "shield", "proagents", "reposell", "paw",
    ]);
    expect(plan.layout).toEqual({
      configDir: ".paw",
      config: ".paw/workspace.yaml",
      agentsFile: "AGENTS.md",
      acc: ".acc",
      shield: ".reposhield",
      proagents: ".proagents",
      reposell: ".reposell",
    });
    // Code AND a README are both present, so identity comes from both.
    expect(plan.basis).toBe("code-and-readme");
    // Intent derived from the README — the @README.md contract, traceably.
    expect(plan.intent.productType).toBe("browser-application");
    expect(plan.intent.domains).toContain("local-first");
    expect(plan.intent.domains).toContain("ai");
    expect(plan.intent.derivedFrom).toContain("README.md");
    // Metadata written, package.json untouched.
    expect(existsSync(configPathFor(root))).toBe(true);
    expect(plan.created).toContain("AGENTS.md");
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("fixture");
    expect(plan.verification.checks.some((c) => c.id === "test")).toBe(true);

    // Every layer the stages claim to write is actually on disk —
    // one directory per layer, exactly the documented layout.
    for (const file of [
      ".acc/config/config.yaml",
      ".reposhield/policy.yaml",
      ".proagents/config.yaml",
      ".reposell/distribution.yaml",
      ".paw/workspace.yaml",
      "AGENTS.md",
    ]) {
      expect(existsSync(path.join(root, file))).toBe(true);
    }
    // The crew exists and every worker is bound to ACC context.
    const crewDir = path.join(root, ".proagents", "crew", "browser-application-crew");
    const manifest = JSON.parse(
      await readFile(path.join(crewDir, "manifest.json"), "utf8")
    ) as { workers: { id: string; context: { framework: string }[]; instructions: string }[] };
    expect(manifest.workers.length).toBeGreaterThan(0);
    for (const worker of manifest.workers) {
      expect(worker.context.map((c) => c.framework)).toContain("acc");
      // The crew points at the ProAgents profiles layer, and those files exist.
      expect(worker.instructions).toMatch(/^\.proagents\/profiles\//);
      expect(existsSync(path.join(root, worker.instructions))).toBe(true);
    }
    // The coordination channel lives in the ProAgents namespace, never .agents/.
    expect(existsSync(path.join(root, ".proagents", "crew", "COMMENTS.md"))).toBe(true);
    expect(existsSync(path.join(root, ".agents"))).toBe(false);
  });

  it("writes .paw LAST so the config never names a layer that does not exist yet", async () => {
    const root = await scratch();
    await nodeProject(root);
    await writeFile(path.join(root, "README.md"), "# Fixture\n\nAn API backend service.\n", "utf8");

    const plan = await installWorkspace(root);
    const order = plan.stages.map((s) => s.stage);
    expect(order.indexOf("paw")).toBe(order.length - 1);
    // The config names the protection and distribution providers the earlier
    // stages wrote policy files for.
    const yaml = await readFile(configPathFor(root), "utf8");
    expect(yaml).toContain("protection:");
    expect(yaml).toContain("provider: repo-shield");
    expect(yaml).toContain("distribution:");
    expect(yaml).toContain("provider: reposell");
    // And it round-trips through the schema.
    const { config } = await loadConfig(root);
    expect(config.protection?.provider).toBe("repo-shield");
    expect(config.protection?.mode).toBe("guarded");
    expect(config.distribution?.provider).toBe("reposell");
  });

  it("derives the crew from the ACC expertise map — the stages are connected, not parallel", async () => {
    const root = await scratch();
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "fixture", dependencies: { express: "^4.0.0" } }),
      "utf8"
    );
    await writeFile(path.join(root, "README.md"), "# Shop\n\nA REST API backend service.\n", "utf8");

    const plan = await installWorkspace(root);
    const accStage = plan.stages.find((s) => s.stage === "acc");
    const proagentsStage = plan.stages.find((s) => s.stage === "proagents");
    // An API project gets an api-engineer; the crew must contain that same id.
    expect(accStage?.created.some((f) => f.endsWith("config.yaml"))).toBe(true);
    expect(proagentsStage?.created.some((f) => f.endsWith("profiles/api-engineer.md"))).toBe(true);
    const crew = proagentsStage?.created.find((f) => f.endsWith("manifest.json"));
    expect(crew).toBeDefined();
    const manifest = JSON.parse(await readFile(path.join(root, crew!), "utf8")) as {
      workers: { id: string }[];
    };
    expect(manifest.workers.map((w) => w.id)).toContain("api-engineer");
  });

  it("is idempotent — a second install preserves existing instructions and config", async () => {
    const root = await scratch();
    await nodeProject(root);
    await writeFile(
      path.join(root, "AGENTS.md"),
      "# Custom agent instructions — NEVER overwrite me\n",
      "utf8"
    );

    const first = await installWorkspace(root);
    // Pre-existing instructions are PRESERVED, not replaced: the installer
    // must not report creating AGENTS.md here.
    expect(first.created).not.toContain("AGENTS.md");
    const yaml = await readFile(configPathFor(root), "utf8");

    const second = await installWorkspace(root);
    // A second run creates NOTHING at all — the whole pipeline is idempotent,
    // not just the .paw half.
    expect(second.created).toEqual([]);
    expect(second.alreadyInitialized).toBe(true);
    expect(second.stages.find((s) => s.stage === "paw")?.notes.join(" ")).toContain("preserved");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("NEVER overwrite me");
    expect(await readFile(configPathFor(root), "utf8")).toBe(yaml);
  });

  it("never overwrites a hand-edited layer file", async () => {
    const root = await scratch();
    await nodeProject(root);
    await mkdir(path.join(root, ".reposhield"), { recursive: true });
    await mkdir(path.join(root, ".proagents"), { recursive: true });
    await writeFile(path.join(root, ".reposhield", "policy.yaml"), "mode: strict  # hand-edited\n", "utf8");
    await writeFile(path.join(root, ".proagents", "config.yaml"), "# hand-edited environment\n", "utf8");

    const plan = await installWorkspace(root);
    expect(plan.created).not.toContain(".reposhield/policy.yaml");
    expect(plan.created).not.toContain(".proagents/config.yaml");
    expect(await readFile(path.join(root, ".reposhield", "policy.yaml"), "utf8")).toBe("mode: strict  # hand-edited\n");
    expect(await readFile(path.join(root, ".proagents", "config.yaml"), "utf8")).toBe("# hand-edited environment\n");
  });

  it("asks a questionnaire when there is neither code nor README, and does not guess", async () => {
    const root = await scratch();
    const plan = await installWorkspace(root);

    expect(plan.target.languages).toEqual([]);
    expect(plan.basis).toBe("questionnaire");
    // The resolve stage says it needs input and hands back the exact command.
    const resolve = plan.stages.find((s) => s.stage === "resolve");
    expect(resolve?.status).toBe("needs-input");
    expect(plan.questionnaire?.join(" ")).toContain("paw init");
    expect(plan.questionnaire?.join(" ")).toContain("--answers");

    // The layers are still scaffolded — an empty workspace is a valid
    // workspace — but NO project block is written, because a guessed product
    // type is worse than an absent one.
    expect(existsSync(configPathFor(root))).toBe(true);
    const yaml = await readFile(configPathFor(root), "utf8");
    expect(yaml).not.toContain("project:");
    expect(yaml).not.toContain("unknown");
    // The crew gets a neutral name rather than "unknown-crew".
    expect(existsSync(path.join(root, ".proagents", "crew", "project-crew", "manifest.json"))).toBe(true);
  });

  it("uses README alone when there is no code", async () => {
    const root = await scratch();
    await writeFile(
      path.join(root, "README.md"),
      "# Docs only\n\nA command-line tool for parsing CSV files.\n",
      "utf8"
    );
    const plan = await installWorkspace(root);
    expect(plan.basis).toBe("readme-only");
    expect(plan.intent.productType).toBe("cli");
    expect(plan.questionnaire).toBeUndefined();
  });

  it("uses code alone when there is no README", async () => {
    const root = await scratch();
    await writeFile(path.join(root, "Cargo.toml"), '[package]\nname = "x"\n', "utf8");
    await writeFile(path.join(root, "src"), "fn main() {}", "utf8").catch(async () => {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src", "main.rs"), "fn main() {}", "utf8");
    });
    const plan = await installWorkspace(root);
    expect(plan.basis).toBe("code-only");
    expect(plan.questionnaire).toBeUndefined();
  });

  it("reports detected coding agents in the inspect phase", async () => {
    const root = await scratch();
    await nodeProject(root);
    const plan = await installWorkspace(root);
    // Agent detection is environment-dependent; the shape is the contract.
    expect(Array.isArray(plan.agents)).toBe(true);
    for (const agent of plan.agents) {
      expect(typeof agent.id).toBe("string");
      expect(typeof agent.name).toBe("string");
    }
  });
});

describe("file-driven init/install — the @README.md contract (spec 152)", () => {
  it("paw init <file> infers intent, persists the project block, and the config loads back", async () => {
    const root = await scratch();
    await nodeProject(root);
    await writeFile(
      path.join(root, "NOTES.md"),
      "# Notes\n\nA local-first browser application with AI research and a knowledge graph.\n",
      "utf8"
    );

    const result = await initWorkspace(root, { from: "NOTES.md" });
    expect(result.intent).toBeDefined();
    expect(result.intent?.productType).toBe("browser-application");
    expect(result.intent?.domains).toEqual(
      expect.arrayContaining(["ai", "research", "knowledge-graph", "local-first"])
    );
    // Provenance is complete: the source file PLUS manifest evidence.
    expect(result.intent?.derivedFrom).toEqual(["NOTES.md", "package.json", "tsconfig.json", "pnpm-lock.yaml"]);

    // The generated config carries the project block and loads cleanly —
    // the minimal YAML parser must round-trip exactly what we generate.
    const yaml = await readFile(configPathFor(root), "utf8");
    expect(yaml).toContain("project:");
    expect(yaml).toContain("productType: browser-application");
    const { config } = await loadConfig(root);
    expect(config.project?.productType).toBe("browser-application");
    expect(config.project?.domains).toContain("ai");
    expect(config.project?.derivedFrom).toContain("NOTES.md");
  });

  it("throws the structured INTENT_SOURCE_UNREADABLE error for a missing source", async () => {
    const root = await scratch();
    await nodeProject(root);
    try {
      await initWorkspace(root, { from: "nope/missing.md" });
      expect.unreachable("init with a missing source must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceError);
      const shaped = (error as WorkspaceError).toJSON();
      expect(shaped.code).toBe("INTENT_SOURCE_UNREADABLE");
      expect(shaped.recoverable).toBe(true);
      expect(shaped.suggestions.join(" ")).toContain("paw init README.md");
    }
    // Nothing was initialized by the failed run.
    expect(require("node:fs").existsSync(configPathFor(root))).toBe(false);
  });

  it("installWorkspace({ from }) drives every stage from the file and reports the source", async () => {
    const root = await scratch();
    await nodeProject(root);
    await writeFile(path.join(root, "BRIEF.md"), "# Brief\n\nAn API backend service with payments and monitoring.\n", "utf8");

    const plan = await installWorkspace(root, { from: "BRIEF.md" });
    expect(plan.from).toBe("BRIEF.md");
    expect(plan.intent.productType).toBe("api");
    expect(plan.intent.domains).toEqual(expect.arrayContaining(["payments", "monitoring"]));
    // The explicit source is reported in the resolve stage.
    const resolve = plan.stages.find((s) => s.stage === "resolve");
    expect(resolve?.notes.join(" ")).toContain("intent source: BRIEF.md");
    // The intent from the brief reaches the LAYERS, not just the plan: an
    // api-crew exists because the brief said API.
    expect(existsSync(path.join(root, ".proagents", "crew", "api-crew", "manifest.json"))).toBe(true);
    // And it is persisted into the config.
    const yaml = await readFile(configPathFor(root), "utf8");
    expect(yaml).toContain("productType: api");
  });

  it("throws INTENT_SOURCE_UNREADABLE from install for a missing explicit source", async () => {
    const root = await scratch();
    await nodeProject(root);
    try {
      await installWorkspace(root, { from: "nope/missing.md" });
      expect.unreachable("install with a missing source must throw");
    } catch (error) {
      const shaped = (error as WorkspaceError).toJSON();
      expect(shaped.code).toBe("INTENT_SOURCE_UNREADABLE");
      expect(shaped.recoverable).toBe(true);
    }
    // An explicit-but-unreadable source must NOT silently fall back to the
    // README — ignoring an explicit instruction is a correctness bug.
    expect(existsSync(configPathFor(root))).toBe(false);
  });

  it("inferIntentFromText is pure — same input, same intent, no I/O", () => {
    const a = inferIntentFromText({ text: "a browser app with embeddings and SLOs", derivedFrom: ["README.md"] });
    const b = inferIntentFromText({ text: "a browser app with embeddings and SLOs", derivedFrom: ["README.md"] });
    expect(a).toEqual(b);
    expect(a.productType).toBe("browser-application");
    expect(a.domains).toContain("embeddings");
    expect(a.skills).toContain("sre");
    // Known frameworks are respected, never duplicated.
    const c = inferIntentFromText({ text: "built with react", derivedFrom: [], knownFrameworks: ["react"] });
    expect(c.frameworks.filter((f) => f === "react")).toHaveLength(1);
  });
});

describe("inferProjectIntent — README inference table", () => {
  it("prefers manifest evidence and never downgrades product type from prose", async () => {
    const root = await scratch();
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "fx", devDependencies: { next: "15" } }),
      "utf8"
    );
    const project = await detectProject(root);
    const intent = await inferProjectIntent(root, project);
    // README says nothing; the manifest says nextjs → browser-application.
    expect(intent.productType).toBe("browser-application");
    expect(intent.frameworks).toContain("nextjs");
  });

  it("maps README prose to domains and skills", async () => {
    const root = await scratch();
    await writeFile(
      path.join(root, "README.md"),
      [
        "# Platform",
        "",
        "Threat modeling, OWASP reviews, RAG retrieval, embeddings, knowledge graph,",
        "test automation and CI/CD pipelines, SLOs and incident response.",
      ].join("\n"),
      "utf8"
    );
    const project = await detectProject(root);
    const intent = await inferProjectIntent(root, project);
    expect(intent.domains).toEqual(
      expect.arrayContaining(["rag", "embeddings", "knowledge-graph"])
    );
    expect(intent.skills).toEqual(
      expect.arrayContaining(["security-engineer", "qa-engineer", "devops-engineer", "sre"])
    );
  });
});
