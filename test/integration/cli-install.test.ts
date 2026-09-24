/**
 * CLI end-to-end: `paw install` (spec section 152).
 *
 * Spawns the REAL built CLI binary in a scratch project and verifies the
 * agent bootstrap contract from the outside:
 *
 *   - the five phases run and render (inspect → … → verify)
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
  it("installs into a foreign repository and reports the five phases", async () => {
    const result = await paw(["install"], project);

    expect(result.stdout).toContain("inspect");
    expect(result.stdout).toContain("understand");
    expect(result.stdout).toContain("initialize");
    expect(result.stdout).toContain("configure");
    expect(result.stdout).toContain("verify");
    expect(result.stdout).toContain("Workspace ready.");

    // The runtime configuration landed, source files untouched.
    expect(existsSync(path.join(project, ".paw", "workspace.yaml"))).toBe(true);
    expect(existsSync(path.join(project, "AGENTS.md"))).toBe(true);
    const pkg = JSON.parse(readFileSync(path.join(project, "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("bootstrap-fixture");
  }, 60_000);

  it("--json reports the plan an external agent can parse", async () => {
    const result = await paw(["install", "--json"], project);

    const parsed = JSON.parse(result.stdout) as {
      command: string;
      intent: { productType: string; domains: readonly string[] };
      layout: { configDir: string; config: string };
      phases: { phase: string; status: string }[];
      verification: { checks: { id: string; command: string }[] };
    };
    expect(parsed.command).toBe("install");
    expect(parsed.layout.configDir).toBe(".paw");
    expect(parsed.intent.productType).toBe("browser-application");
    expect(parsed.intent.domains).toContain("local-first");
    expect(parsed.phases.map((p) => p.phase)).toEqual([
      "inspect", "understand", "initialize", "configure", "verify",
    ]);
    expect(parsed.verification.checks.some((c) => c.id === "test")).toBe(true);
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

    const result = await paw(["init", "BRIEF.md"], fileDriven);
    expect(result.stdout).toContain("Intent from BRIEF.md: browser-application");
    expect(result.stdout).toContain("local-first");

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

  it("install with a source file reports the intent source in the five phases", async () => {
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
      phases: { phase: string; notes: readonly string[] }[];
    };
    expect(parsed.from).toBe("BRIEF.md");
    expect(parsed.intent.productType).toBe("api");
    const understand = parsed.phases.find((p) => p.phase === "understand");
    expect(understand?.notes.join(" ")).toContain("intent source: BRIEF.md");
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
