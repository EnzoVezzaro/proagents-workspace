/**
 * End-to-end smoke tests for the `paw` CLI.
 *
 * Runs the built binary (dist/index.js) as a child process, so the full
 * boundary is exercised: arg parsing → convention layer → (lazily) kernel
 * boot → plugin activation → structured output.
 *
 * The convention-first golden path (spec sections 3/63/71) is tested against
 * real temporary fixture repositories.
 */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const run = promisify(execFile);
const BIN = path.resolve(__dirname, "../dist/index.js");

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function paw(args: string[], options: { env?: Record<string, string>; cwd?: string } = {}): Promise<RunResult> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], {
      timeout: 60_000,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

async function fixture(scripts: Record<string, string> = { test: "echo tested" }): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "paw-cli-"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture", scripts }), "utf8");
  return root;
}

describe("paw CLI (e2e)", () => {
  it("help lists the convention-first command vocabulary", async () => {
    const r = await paw(["help"]);
    expect(r.code).toBe(0);
    for (const command of ["init", "status", "doctor", "verify", "diff", "agent list"]) {
      expect(r.stdout).toContain(command);
    }
  });

  it("help --json is deterministic JSON", async () => {
    const r = await paw(["help", "--json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { commands: string[] };
    expect(parsed.commands).toContain("init");
    expect(parsed.commands).toContain("verify");
  });

  it("help states that no runtime or account is required", async () => {
    const r = await paw(["help"]);
    expect(r.stdout).toContain("No runtime or cloud account is required");
  });

  it("plugin list --json shows only config-referenced plugins", async () => {
    const root = await fixture();
    const r = await paw(["plugin", "list", "--json"], { cwd: root, env: { PAW_PLUGINS: "filesystem,shell" } });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { plugins: { id: string; capabilities: string[] }[] };
    const ids = parsed.plugins.map((p) => p.id).sort();
    // runtime.provider is ABSENT in a zero-config workspace — only the
    // config-referenced tool plugins activate.
    expect(ids).toEqual(["filesystem", "shell"]);
  });

  it("service list --json reports contract versions and owning plugin", async () => {
    const root = await fixture();
    const r = await paw(["service", "list", "--json"], { cwd: root, env: { PAW_PLUGINS: "filesystem,shell" } });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      services: { id: string; contractVersion: string; pluginId: string }[];
    };
    const ids = parsed.services.map((s) => s.id);
    expect(ids).toContain("filesystem");
    expect(ids).toContain("shell");
    for (const service of parsed.services) {
      expect(service.contractVersion).toBe("1.0.0");
    }
  });

  it("config show --json reports the effective configuration and its sources", async () => {
    const root = await fixture();
    const r = await paw(["config", "show", "--json"], { cwd: root });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { config: { approval: { mode: string } }; sources: string[] };
    expect(parsed.config.approval.mode).toBe("guarded");
    expect(parsed.sources).toContain("built-in defaults");
  });
});

describe("paw init golden path (e2e, spec 3/63/71)", () => {
  it("init → status → verify works in a fresh fixture without git, agents, or cloud", async () => {
    const root = await fixture({ test: "echo tested" });

    // 1. init — the staged bootstrapper; `target` carries the detection.
    const init = await paw(["init", "--json"], { cwd: root });
    expect(init.code).toBe(0);
    const initOut = JSON.parse(init.stdout) as { created: string[]; target: { runtime?: string }; stages: { stage: string }[] };
    expect(initOut.target.runtime).toBe("node");
    expect(initOut.created.some((f) => f === path.join(".paw", "workspace.yaml"))).toBe(true);
    expect(existsSync(path.join(root, ".paw", "workspace.yaml"))).toBe(true);
    // The six stages ran — init IS the bootstrapper now.
    expect(initOut.stages.map((s) => s.stage)).toEqual(["resolve", "acc", "shield", "proagents", "reposell", "paw"]);

    // 2. status — answers where/what without throwing.
    const status = await paw(["status", "--json"], { cwd: root });
    expect(status.code).toBe(0);
    const statusOut = JSON.parse(status.stdout) as { initialized: boolean; git: { repository: boolean }; config: { version: number } | null };
    expect(statusOut.initialized).toBe(true);
    expect(statusOut.git.repository).toBe(false); // no git in fixture — honest fact
    expect(statusOut.config?.version).toBe(1);

    // 3. verify — runs the detected check through the real kernel.
    const verify = await paw(["verify", "--json"], { cwd: root });
    expect(verify.code).toBe(0);
    const verifyOut = JSON.parse(verify.stdout) as { ok: boolean; results: { command: string; exitCode: number }[] };
    expect(verifyOut.ok).toBe(true);
    expect(verifyOut.results[0]?.command).toContain("test");
  });

  it("init is safe to run twice", async () => {
    const root = await fixture();
    expect((await paw(["init"], { cwd: root })).code).toBe(0);
    const again = await paw(["init", "--json"], { cwd: root });
    expect(again.code).toBe(0);
    const out = JSON.parse(again.stdout) as { created: string[] };
    expect(out.created.some((f) => f.includes("workspace.yaml"))).toBe(false);
  });

  it("status on an uninitialized repository degrades honestly (Level 0)", async () => {
    const root = await fixture();
    const r = await paw(["status", "--json"], { cwd: root });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { initialized: boolean };
    expect(parsed.initialized).toBe(false);
  });

  it("doctor marks optional components as optional, not failed", async () => {
    const root = await fixture();
    await paw(["init"], { cwd: root });
    const r = await paw(["doctor"], { cwd: root });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Everything required is ready");
    expect(r.stdout).toContain("Optional");
  });

  it("desktop is retired — the command no longer exists", async () => {
    const r = await paw(["desktop", "--json"]);
    expect(r.code).toBe(2);
    const parsed = JSON.parse(r.stderr) as { code: string };
    expect(parsed.code).toBe("COMMAND_NOT_FOUND");
  });
});

describe("paw verify (e2e)", () => {
  it("fails honestly when a check fails", async () => {
    const root = await fixture({ test: "exit 1" });
    await paw(["init"], { cwd: root });
    const r = await paw(["verify", "--json"], { cwd: root });
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout) as { ok: boolean; results: { exitCode: number }[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.results[0]?.exitCode).toBe(1);
  });

  it("with no detected checks succeeds and says so", async () => {
    const root = await fixture({});
    await paw(["init"], { cwd: root });
    const r = await paw(["verify", "--json"], { cwd: root });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { ok: boolean; results: unknown[]; message?: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toEqual([]);
  });

  it("runs ONLY the selected check, not the whole suite", async () => {
    // A selection that silently ran everything was a real defect: the
    // documented `paw verify test` executed every configured check.
    const root = await fixture({ lint: "echo lint", test: "echo test" });
    await paw(["init"], { cwd: root });
    const r = await paw(["verify", "test", "--json"], { cwd: root });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { check: string; results: { command: string }[] };
    expect(parsed.check).toBe("test");
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]?.command).toContain("test");
  });

  it("omitting the target still runs every configured check", async () => {
    const root = await fixture({ lint: "echo lint", test: "echo test" });
    await paw(["init"], { cwd: root });
    const r = await paw(["verify", "--json"], { cwd: root });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { check?: string; results: unknown[] };
    expect(parsed.check).toBeUndefined();
    expect(parsed.results.length).toBeGreaterThan(1);
  });

  it("an unknown verify target is an actionable error, never a full run", async () => {
    const root = await fixture({ test: "echo test" });
    await paw(["init"], { cwd: root });
    const r = await paw(["verify", "tset", "--json"], { cwd: root });
    expect(r.code).toBe(2);
    const parsed = JSON.parse(r.stdout) as { code: string; message: string };
    expect(parsed.code).toBe("COMMAND_NOT_FOUND");
    expect(parsed.message).toContain("tset");
  });

  it("a stage nothing is configured for reports a fact, not a failure", async () => {
    const root = await fixture({ lint: "echo lint" });
    await paw(["init"], { cwd: root });
    const r = await paw(["verify", "build", "--json"], { cwd: root });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { ok: boolean; results: unknown[]; available: string[] };
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toEqual([]);
    expect(parsed.available).toHaveLength(1);
  });
});

describe("paw errors (e2e)", () => {
  it("unknown commands fail with a structured, actionable error", async () => {
    const r = await paw(["frobnicate"]);
    expect(r.code).toBe(2);
    const parsed = JSON.parse(r.stderr) as { code: string; message: string };
    expect(parsed.code).toBe("COMMAND_NOT_FOUND");
    expect(parsed.message).toContain("frobnicate");
  });

  it("agent list is valid even with zero agents", async () => {
    const root = await fixture();
    const r = await paw(["agent", "list", "--json"], { cwd: root });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { agents: unknown[] };
    expect(Array.isArray(parsed.agents)).toBe(true);
  });

  it("research refuses uninitialized repos with an actionable error", async () => {
    const root = await fixture();
    const r = await paw(["research", "--json"], { cwd: root });
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stderr) as { code: string; suggestions: string[] };
    expect(parsed.code).toBe("PROJECT_NOT_INITIALIZED");
    expect(parsed.suggestions.join(" ")).toContain("paw init");
  });

  it("research → answer → status closes the interview loop (spec 149)", async () => {
    const root = await fixture({ test: "echo ok" });
    await paw(["init"], { cwd: root });

    const research = await paw(["research", "--json"], { cwd: root });
    expect(research.code).toBe(0);
    const out = JSON.parse(research.stdout) as {
      model: { questions: { id: string }[]; proagents: { requirements: { verification: string[] } } };
      artifacts: string[];
    };
    expect(out.model.questions.map((q) => q.id)).toContain("product-goal");
    expect(out.model.proagents.requirements.verification).toEqual(["npm run test"]);
    expect(out.artifacts).toContain(path.join(".paw", "proagents", "requirements.json"));

    const answer = await paw(["research", "answer", "product-goal", "A tool that ships faster", "--json"], { cwd: root });
    expect(answer.code).toBe(0);
    const answered = JSON.parse(answer.stdout) as { remaining: number };
    expect(answered.remaining).toBe(2);

    const status = await paw(["research", "status"], { cwd: root });
    expect(status.code).toBe(0);
    const rs = JSON.parse(status.stdout) as { exists: boolean; open: number };
    expect(rs.exists).toBe(true);
    expect(rs.open).toBe(2);
  });

  it("research answer without a model fails honestly", async () => {
    const root = await fixture();
    await paw(["init"], { cwd: root });
    const r = await paw(["research", "answer", "product-goal", "x"], { cwd: root });
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stderr) as { code: string };
    expect(parsed.code).toBe("PROJECT_NOT_INITIALIZED");
  });

  it("checkpoint list and run execute the plan through gates (spec 150)", async () => {
    const root = await fixture({ test: "echo ok" });
    await paw(["init"], { cwd: root });
    const plan = {
      version: 1,
      title: "Ship the widget",
      checkpoints: [
        {
          id: "CP-001",
          title: "Widget logic works",
          gates: [
            { id: "tests", kind: "behavior", config: { command: "npm test" } },
            { id: "review", kind: "human" },
          ],
          acceptanceCriteria: [{ id: "ac1", description: "build passes", command: "echo built" }],
        },
        {
          id: "CP-002",
          title: "Second checkpoint",
          dependencies: ["CP-001"],
          gates: [{ id: "tests", kind: "behavior", config: { command: "exit 1" } }],
        },
      ],
    };
    await writeFile(path.join(root, ".paw", "checkpoints.json"), JSON.stringify(plan), "utf8");

    const list = await paw(["checkpoint", "list"], { cwd: root });
    expect(list.code).toBe(0);
    expect(list.stdout).toContain("CP-001");
    expect(list.stdout).toContain("after CP-001");

    // CP-001 passes (behavior gate + autonomous-free human gate is blocking:
    // guarded mode prompts → stdin EOF denies). Run only CP-001 with an
    // answering 'y' is not possible non-interactively, so expect honest
    // failure reporting for CP-002's failing gate via --checkpoint + headless
    // denial semantics for the human gate is covered in unit tests. Here:
    const run1 = await paw(["checkpoint", "run", "--checkpoint", "CP-001", "--json", "--headless"], { cwd: root });
    expect(run1.code).toBe(1); // headless human gate fails closed
    const parsed = JSON.parse(run1.stdout) as { results: { checkpointId: string; status: string; evidence: { gateId: string; status: string; note?: string }[] }[] };
    const cp1 = parsed.results[0]!;
    expect(cp1.checkpointId).toBe("CP-001");
    expect(cp1.evidence.find((e) => e.gateId === "tests")?.status).toBe("passed");
    expect(cp1.evidence.find((e) => e.gateId === "review")?.status).toBe("failed");
  });

  it("checkpoint run reports a failing behavior gate with findings", async () => {
    const root = await fixture();
    await paw(["init"], { cwd: root });
    const plan = {
      version: 1,
      title: "Failing plan",
      checkpoints: [{ id: "CP-001", title: "will fail", gates: [{ id: "always", kind: "behavior", config: { command: "exit 3" }, policy: { blocking: true, maxRetries: 0 } }] }],
    };
    await writeFile(path.join(root, ".paw", "checkpoints.json"), JSON.stringify(plan), "utf8");
    const r = await paw(["checkpoint", "run", "--json"], { cwd: root });
    expect(r.code).toBe(1);
    const parsed = JSON.parse(r.stdout) as { ok: boolean; results: { status: string; failedGateId?: string }[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.results[0]!.failedGateId).toBe("always");
  });
});
