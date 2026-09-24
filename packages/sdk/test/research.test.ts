/**
 * Research engine tests (spec section 149).
 *
 * Covers: context-provider participation + honest degradation, uncertainty
 * derivation (ask only what the environment cannot answer), answer
 * application, and the artifact contract (.paw/research/* + the ProAgents
 * handoff that PAW does NOT own agent-level generation for).
 */
import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  answerQuestion,
  deriveQuestions,
  hasResearch,
  initWorkspace,
  researchContextService,
  researchModelPath,
  runResearch,
  type ResearchModel,
} from "../src/index.js";
import { definePlugin, defineService } from "../src/index.js";
import type { ContextPack, ContextProvider } from "../src/index.js";

async function scratch(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "paw-research-"));
}

const contextService = defineService<ContextProvider>({ id: "context", contractVersion: "1.0.0" });

function fakeAccContext(entries: { id: string; path: string; summary: string }[]) {
  const provider: ContextProvider = {
    name: "acc",
    contractVersion: "1.0.0",
    health: async () => ({ status: "healthy", message: "fixture context" }),
    index: async () => undefined,
    query: async () => ({ provider: "acc", entries: [] }),
    inspect: async (): Promise<ContextPack> => ({ provider: "acc", entries }),
  };
  return definePlugin({
    manifest: {
      id: "context-acc",
      provider: "acc",
      name: "ACC context (fixture)",
      version: "0.1.0",
      capabilities: ["context"],
      dependencies: [],
      permissions: [],
      compatibility: { workspaceApi: "^1.0.0" },
    },
    activate(ctx) {
      ctx.services.register(contextService, provider, "context-acc");
    },
  });
}

async function initializedProject(root: string): Promise<void> {
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "echo ok" } }), "utf8");
  await initWorkspace(root);
}

describe("research (spec 149)", () => {
  it("degrades honestly when no context provider is available", async () => {
    const root = await scratch();
    await initializedProject(root);
    const result = await runResearch(root);
    expect(result.contexts.providers).toEqual([]);
    expect(result.contexts.note).toContain("standard repository context");
    expect(hasResearch(root)).toBe(true);
  });

  it("consults a context provider through the existing contract", async () => {
    const root = await scratch();
    await initializedProject(root);
    const plugin = fakeAccContext([
      { id: "architecture", path: ".acc/architecture.md", summary: "47 declared contracts" },
      { id: "dependencies", path: ".acc/deps.json", summary: "12 dependency boundaries" },
    ]);
    const { WorkspaceClient } = await import("../src/index.js");
    const client = new WorkspaceClient({
      config: {
        approval: { mode: "autonomous" },
        tools: [],
        plugins: [{ id: "context-acc" }],
        context: { providers: ["acc"] },
      },
      plugins: [plugin],
      catalog: true,
    });
    const provider = await client.service(researchContextService);
    const result = await runResearch(root, { contextProviders: [{ id: "acc", provider }] });
    await client.stop();
    const fact = result.model.facts.find((f) => f.key === "context.architecture");
    expect(fact?.value).toContain("47 declared contracts");
    expect(fact?.source).toBe("context-provider");
    // ProAgents handoff records which context providers participated.
    expect(result.model.proagents.requirements.contextProviders).toContain("acc");
  });

  it("derives only product questions the environment cannot answer", async () => {
    const root = await scratch();
    await initializedProject(root);
    const result = await runResearch(root);
    const ids = result.model.questions.map((q) => q.id);
    expect(ids).toEqual(["product-goal", "product-audience", "product-done"]);
    // Repository facts are detected, never asked.
    expect(result.model.facts.some((f) => f.key === "repository.runtime")).toBe(true);
  });

  it("writes research artifacts and the ProAgents handoff", async () => {
    const root = await scratch();
    await initializedProject(root);
    const result = await runResearch(root);
    expect(result.artifacts).toContain(path.join(".paw", "research", "research.json"));
    expect(result.artifacts).toContain(path.join(".paw", "research", "product.md"));
    expect(result.artifacts).toContain(path.join(".paw", "proagents", "requirements.json"));
    const model = JSON.parse(await readFile(researchModelPath(root), "utf8")) as ResearchModel;
    expect(model.version).toBe(1);
    const reqs = JSON.parse(await readFile(path.join(root, ".paw", "proagents", "requirements.json"), "utf8")) as Record<string, unknown>;
    expect(reqs["verification"]).toEqual(["npm run test"]);
  });

  it("applies answers immutably and closes resolved questions", async () => {
    const root = await scratch();
    await initializedProject(root);
    const first = await runResearch(root);
    const model: ResearchModel = JSON.parse(JSON.stringify(first.model));
    const updated = answerQuestion(model, "product-goal", "A CLI for shipping faster");
    expect(updated.facts.some((f) => f.key === "product.goal" && f.source === "user")).toBe(true);
    expect(updated.questions.find((q) => q.id === "product-goal")?.answer).toBe("A CLI for shipping faster");
    expect(deriveQuestions(updated).map((q) => q.id)).not.toContain("product-goal");
    // The input model is untouched (immutable update).
    expect(model.facts.some((f) => f.key === "product.goal")).toBe(false);
  });

  it("keeps AGENTS.md ownership with the existing owner (no duplication)", async () => {
    const root = await scratch();
    await initializedProject(root);
    const owned = path.join(root, "AGENTS.md");
    const before = await readFile(owned, "utf8");
    await runResearch(root);
    expect(await readFile(owned, "utf8")).toBe(before);
    void rm; // fixture cleanup delegated to OS tmp handling
    void mkdir;
  });
});
