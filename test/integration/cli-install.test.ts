/**
 * CLI end-to-end: `paw install` (spec section 152).
 *
 * Spawns the REAL built CLI binary in a scratch project and verifies the
 * agent bootstrap contract from the outside:
 *
 *   - the six stages run and render (resolve → … → paw)
 *   - `--json` is machine-readable (what an external agent parses)
 *   - a re-run is idempotent and preserves existing instructions
 *
 * Requires `pnpm build` first (same precondition as the docs ↔ code pact).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);
const repoRoot = path.resolve(__dirname, "../..");
const CLI_BIN = path.join(repoRoot, "packages/cli/dist/index.js");

let scratch: string;
let project: string;

beforeAll(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "paw-cli-install-"));
  project = path.join(scratch, "target");
  mkdirSync(project, { recursive: true });
  writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: "bootstrap-fixture", scripts: { test: "echo tested" } }),
    "utf8"
  );
  writeFileSync(
    path.join(project, "README.md"),
    "# Bootstrap fixture\n\nA local-first browser application with AI research features.\n",
    "utf8"
  );
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function paw(args: readonly string[], cwd: string) {
  return run(process.execPath, [CLI_BIN, ...args], { cwd, timeout: 60_000 });
}

describe("paw install (CLI e2e, spec section 152)", () => {
  it("installs every layer into a foreign repository and reports the six stages", async () => {
    const result = await paw(["install"], project);

    for (const stage of ["resolve", "acc", "shield", "proagents", "reposell", "paw"]) {
      expect(result.stdout).toContain(stage);
    }
    expect(result.stdout).toContain("Workspace ready.");

    // Every layer the contract promises is on disk.
    for (const file of [
      ".acc/config/config.yaml",
      ".reposhield/policy.yaml",
      ".proagents/config.yaml",
      ".reposell/distribution.yaml",
      ".paw/workspace.yaml",
      "AGENTS.md",
      ".proagents/crew/COMMENTS.md",
    ]) {
      expect(existsSync(path.join(project, file))).toBe(true);
    }
    // Source files untouched.
    const pkg = JSON.parse(readFileSync(path.join(project, "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("bootstrap-fixture");
  }, 60_000);

  it("reports the questionnaire and does not claim readiness on an empty repository", async () => {
    const empty = path.join(scratch, "empty");
    mkdirSync(empty, { recursive: true });

    const result = await paw(["install"], empty);
    expect(result.stdout).toContain("paw init");
    // The word "ready" must NOT appear: the layers are scaffolded but the
    // project's identity is still unknown.
    expect(result.stdout).not.toContain("Workspace ready.");
    expect(result.stdout).toContain("project intent is still unknown");
  }, 60_000);

  it("--json reports the plan an external agent can parse", async () => {
    const result = await paw(["install", "--json"], project);

    const parsed = JSON.parse(result.stdout) as {
      command: string;
      intent: { productType: string; domains: readonly string[] };
      layout: { configDir: string; config: string };
      basis: string;
      layout: { configDir: string; config: string; acc: string; shield: string; proagents: string; reposell: string };
      stages: { stage: string; status: string; created: string[] }[];
      verification: { checks: { id: string; command: string }[] };
    };
    expect(parsed.command).toBe("init"); // `install` is an alias; the canonical command name is init
    expect(parsed.layout.configDir).toBe(".paw");
    expect(parsed.basis).toBe("code-and-readme");
    expect(parsed.intent.productType).toBe("browser-application");
    expect(parsed.intent.domains).toContain("local-first");
    expect(parsed.stages.map((p) => p.stage)).toEqual([
      "resolve", "acc", "shield", "proagents", "reposell", "paw",
    ]);
    expect(parsed.verification.checks.some((c) => c.id === "test")).toBe(true);
    // Each stage reports the files it created, so an external agent can relay
    // the result without re-reading the filesystem.
    for (const stage of parsed.stages) expect(Array.isArray(stage.created)).toBe(true);
  }, 60_000);

  it("is idempotent — a re-run preserves existing instructions", async () => {
    const agentsMd = readFileSync(path.join(project, "AGENTS.md"), "utf8");
    const result = await paw(["install"], project);

    expect(result.stdout).toContain("preserved");
    expect(readFileSync(path.join(project, "AGENTS.md"), "utf8")).toBe(agentsMd);
  }, 60_000);

  it("init with a source file starts the workspace from the project's own words (spec 152)", async () => {
    const fileDriven = path.join(scratch, "file-driven");
    mkdirSync(fileDriven, { recursive: true });
    writeFileSync(
      path.join(fileDriven, "package.json"),
      JSON.stringify({ name: "file-driven", scripts: { test: "echo ok" } }),
      "utf8"
    );
    writeFileSync(
      path.join(fileDriven, "BRIEF.md"),
      "# Brief\n\nA local-first browser application with AI research and a knowledge graph.\n",
      "utf8"
    );

    const result = await paw(["init", "BRIEF.md", "--json"], fileDriven);
    const initOut = JSON.parse(result.stdout) as { intent: { productType: string; domains: readonly string[] } };
    expect(initOut.intent.productType).toBe("browser-application");
    expect(initOut.intent.domains).toContain("local-first");

    // The persisted project block round-trips through the config loader.
    const show = await paw(["config", "show", "--json"], fileDriven);
    const config = JSON.parse(show.stdout) as { config: { project?: { productType: string; derivedFrom: string[] } } };
    expect(config.config.project?.productType).toBe("browser-application");
    expect(config.config.project?.derivedFrom).toContain("BRIEF.md");

    // A missing source file is a structured error, not a crash.
    await expect(paw(["init", "nope.md"], fileDriven)).rejects.toMatchObject({
      stderr: expect.stringContaining("INTENT_SOURCE_UNREADABLE"),
    });
  }, 60_000);

  it("install with a source file reports the intent source in the resolve stage", async () => {
    const fileInstall = path.join(scratch, "file-install");
    mkdirSync(fileInstall, { recursive: true });
    writeFileSync(
      path.join(fileInstall, "package.json"),
      JSON.stringify({ name: "file-install" }),
      "utf8"
    );
    writeFileSync(path.join(fileInstall, "BRIEF.md"), "# Brief\n\nAn API backend service with payments.\n", "utf8");

    const result = await paw(["install", "BRIEF.md", "--json"], fileInstall);
    const parsed = JSON.parse(result.stdout) as {
      from?: string;
      intent: { productType: string };
      stages: { stage: string; notes: readonly string[] }[];
    };
    expect(parsed.from).toBe("BRIEF.md");
    expect(parsed.intent.productType).toBe("api");
    const resolve = parsed.stages.find((p) => p.stage === "resolve");
    expect(resolve?.notes.join(" ")).toContain("intent source: BRIEF.md");
    // The brief's identity reaches the LAYERS, not just the report.
    expect(existsSync(path.join(fileInstall, ".proagents", "crew", "api-crew", "manifest.json"))).toBe(true);
  }, 60_000);

  it("--answers (bare flag spelling) takes precedence over positional args and applies the intent end-to-end", async () => {
    const answered = path.join(scratch, "answers");
    mkdirSync(answered, { recursive: true });

    // `--answers "a" "b" "c" "d" "e"` — the first answer must NEVER be
    // misparsed as an intent source file, and the declared protection mode
    // must reach BOTH the layer file and the workspace config.
    const result = await paw(
      ["init", "--answers", "cli tool", "parses logs", "TypeScript", "open source", "strict"],
      answered
    );
    expect(result.stdout).toContain("Workspace ready.");
    expect(existsSync(path.join(answered, ".paw", "workspace.yaml"))).toBe(true);
    expect(readFileSync(path.join(answered, ".paw", "workspace.yaml"), "utf8")).toContain("productType: cli");
    expect(readFileSync(path.join(answered, ".reposhield", "policy.yaml"), "utf8")).toContain("mode: strict");
    expect(existsSync(path.join(answered, ".proagents", "crew", "cli-crew", "manifest.json"))).toBe(true);
  }, 60_000);

  it("AGENTS.md carries the agent-facing bootstrap vocabulary", async () => {
    const agentsMd = readFileSync(path.join(project, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("# Agent Notes");
    expect(agentsMd).toContain("ProAgents Workspace");
    expect(agentsMd).toContain("paw status");
    expect(agentsMd).toContain("paw verify");
    expect(agentsMd).toContain("paw lifecycle show");
  }, 60_000);
});
