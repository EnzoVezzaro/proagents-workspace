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

  it("AGENTS.md carries the agent-facing bootstrap vocabulary", async () => {
    const agentsMd = readFileSync(path.join(project, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("# Agent Notes");
    expect(agentsMd).toContain("ProAgents Workspace");
    expect(agentsMd).toContain("paw status");
    expect(agentsMd).toContain("paw verify");
    expect(agentsMd).toContain("paw lifecycle show");
  }, 60_000);
});
