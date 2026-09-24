/**
 * Agent bootstrap installer tests (spec section 152).
 *
 * The install contract, pinned: five phases (inspect → understand →
 * initialize → configure → verify), metadata-only writes, idempotency,
 * README-driven intent inference, and preservation of existing
 * instructions. These tests ARE the executable form of install.yaml.
 */
import { describe, expect, it, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  installWorkspace,
  inferProjectIntent,
  detectProject,
  configPathFor,
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

describe("installWorkspace — the five-phase contract (spec 152)", () => {
  it("runs all five phases on a plain node project and reports evidence", async () => {
    const root = await scratch();
    await nodeProject(root);
    await writeFile(
      path.join(root, "README.md"),
      "# Fixture\n\nA local-first browser application with AI research features and monitoring.\n",
      "utf8"
    );

    const plan = await installWorkspace(root);

    expect(plan.phases.map((p) => p.phase)).toEqual([
      "inspect", "understand", "initialize", "configure", "verify",
    ]);
    expect(plan.layout).toEqual({
      configDir: ".paw", config: ".paw/workspace.yaml", agentsFile: "AGENTS.md",
    });
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
    // Verify phase reports the plan, never executes it.
    const verify = plan.phases.find((p) => p.phase === "verify");
    expect(verify?.status).toBe("skipped");
    expect(plan.verification.checks.some((c) => c.id === "test")).toBe(true);
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
    expect(first.phases.find((p) => p.phase === "configure")?.notes.join(" ")).toContain("preserved");
    const yaml = await readFile(configPathFor(root), "utf8");

    const second = await installWorkspace(root);
    expect(second.created).not.toContain("AGENTS.md");
    expect(second.phases.find((p) => p.phase === "initialize")?.notes.join(" ")).toContain("idempotent");
    expect(second.phases.find((p) => p.phase === "configure")?.notes.join(" ")).toContain("preserved");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("NEVER overwrite me");
    expect(await readFile(configPathFor(root), "utf8")).toBe(yaml);
  });

  it("degrades honestly on a bare directory with no README and no manifests", async () => {
    const root = await scratch();
    const plan = await installWorkspace(root);

    expect(plan.target.languages).toEqual([]);
    expect(plan.intent.productType).toBe("application");
    expect(plan.intent.domains).toEqual([]);
    expect(plan.intent.derivedFrom).toEqual([]);
    // Still installs — an empty workspace is a valid workspace.
    expect(plan.phases.every((p) => p.status === "completed" || p.status === "skipped")).toBe(true);
    expect(existsSync(configPathFor(root))).toBe(true);
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
