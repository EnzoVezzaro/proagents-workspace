/**
 * CLI end-to-end: `paw lifecycle` (spec section 151).
 *
 * Spawns the REAL built CLI binary (packages/cli/dist/index.js) in a scratch
 * directory and checks the documented behavior:
 *
 *   - `lifecycle show` prints the effective flow — canonical phases PLUS
 *     stage contributions from bundled stage plugins (threat-modeling).
 *   - `lifecycle show --json` is machine-readable with the same flow.
 *   - `lifecycle status` honestly reports that no run state exists yet.
 *
 * Requires `pnpm build` first (same precondition as the docs ↔ code pact).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);
const repoRoot = path.resolve(__dirname, "../..");
const CLI_BIN = path.join(repoRoot, "packages/cli/dist/index.js");

let scratch: string;

beforeAll(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "paw-cli-lifecycle-"));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** The canonical nine phases (kernel-owned spine, spec section 151). */
const CANONICAL_PHASES = [
  "create", "research", "initialize", "plan",
  "develop", "verify", "release", "distribute", "operate",
] as const;

describe("paw lifecycle (CLI e2e, spec section 151)", () => {
  it("show prints the effective flow: canonical phases + bundled stage contributions", async () => {
    const result = await run(process.execPath, [CLI_BIN, "lifecycle", "show"], {
      cwd: scratch,
      timeout: 30_000,
    });

    expect(result.stdout).toContain("Lifecycle:");
    for (const phase of CANONICAL_PHASES) {
      expect(result.stdout).toContain(phase);
    }
    // The bundled stage plugin contributes threat modeling after research —
    // proof that stage plugins extend the flow without kernel changes.
    expect(result.stdout).toContain("threat-model");
    expect(result.stdout).toContain("manual");
  }, 30_000);

  it("show --json reports the composed flow as structured data", async () => {
    const result = await run(process.execPath, [CLI_BIN, "lifecycle", "show", "--json"], {
      cwd: scratch,
      timeout: 30_000,
    });

    const parsed = JSON.parse(result.stdout) as {
      command: string;
      flow: { version: number; title: string; stages: { phase: string; id?: string; execution?: string }[] };
    };
    expect(parsed.command).toBe("lifecycle show");
    expect(parsed.flow.version).toBe(1);

    const phases = parsed.flow.stages.map((s) => s.phase);
    for (const phase of CANONICAL_PHASES) {
      expect(phases).toContain(phase);
    }
    // Contribution spliced after its anchor, canonical order preserved.
    const researchIdx = phases.indexOf("research");
    const threatIdx = parsed.flow.stages.findIndex((s) => s.id === "threat-model");
    expect(threatIdx).toBe(researchIdx + 1);
    expect(parsed.flow.stages.length).toBe(CANONICAL_PHASES.length + 1);
  }, 30_000);

  it("status honestly reports that no flow has run yet", async () => {
    const result = await run(process.execPath, [CLI_BIN, "lifecycle", "status", "--json"], {
      cwd: scratch,
      timeout: 30_000,
    });

    const parsed = JSON.parse(result.stdout) as { command: string; exists: boolean };
    expect(parsed.command).toBe("lifecycle status");
    expect(parsed.exists).toBe(false);
  }, 30_000);
});
