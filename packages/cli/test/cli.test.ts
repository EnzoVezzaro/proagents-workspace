/**
 * End-to-end smoke tests for the `paw` CLI.
 *
 * Runs the built binary (dist/index.js) as a child process, so the full
 * boundary is exercised: arg parsing → config → kernel boot → plugin
 * activation → structured output.
 */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const BIN = path.resolve(__dirname, "../dist/index.js");

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function paw(args: string[], env: Record<string, string> = {}): Promise<RunResult> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], {
      timeout: 60_000,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

describe("paw CLI (e2e)", () => {
  it("help lists the fixed command vocabulary", async () => {
    const r = await paw(["help"]);
    expect(r.code).toBe(0);
    for (const command of ["doctor", "plugin list", "service list", "config show", "verify"]) {
      expect(r.stdout).toContain(command);
    }
  });

  it("help --json is deterministic JSON", async () => {
    const r = await paw(["help", "--json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { commands: string[] };
    expect(parsed.commands).toContain("doctor");
  });

  it("plugin list --json shows only config-referenced plugins", async () => {
    const r = await paw(["plugin", "list", "--json"], { PAW_PLUGINS: "filesystem,shell" });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { plugins: { id: string; capabilities: string[] }[] };
    const ids = parsed.plugins.map((p) => p.id).sort();
    // runtime.provider: "local" now correctly selects the runtime-local
    // plugin (config provider values match the manifest `provider` field).
    expect(ids).toEqual(["filesystem", "runtime-local", "shell"]);
    const caps = parsed.plugins.flatMap((p) => p.capabilities);
    expect(caps).toContain("filesystem");
    expect(caps).toContain("shell");
  });

  it("service list --json reports contract versions and owning plugin", async () => {
    const r = await paw(["service", "list", "--json"], { PAW_PLUGINS: "filesystem,shell" });
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

  it("doctor --json reports health entries per activated plugin", async () => {
    const r = await paw(["doctor", "--json"], { PAW_PLUGINS: "filesystem,shell" });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      entries: { pluginId: string; health: { status: string; message: string } }[];
    };
    const ids = parsed.entries.map((e) => e.pluginId).sort();
    expect(ids).toEqual(["filesystem", "runtime-local", "shell"]);
    for (const entry of parsed.entries) {
      expect(["healthy", "degraded", "unavailable"]).toContain(entry.health.status);
      expect(entry.health.message.length).toBeGreaterThan(0);
    }
  });

  it("config show --json returns the effective configuration", async () => {
    const r = await paw(["config", "show", "--json"], { PAW_RUNTIME: "local", PAW_APPROVAL: "guarded" });
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { runtime: { provider: string }; approval: { mode: string } };
    expect(parsed.runtime.provider).toBe("local");
    expect(parsed.approval.mode).toBe("guarded");
  });

  it("verify with no configured commands succeeds and says so", async () => {
    const r = await paw(["verify", "--json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout) as { ok: boolean; results: unknown[]; message?: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toEqual([]);
  });

  it("unknown commands fail with a structured, actionable error", async () => {
    const r = await paw(["frobnicate"]);
    expect(r.code).toBe(2);
    const parsed = JSON.parse(r.stderr) as { code: string; message: string };
    expect(parsed.code).toBe("COMMAND_NOT_FOUND");
    expect(parsed.message).toContain("frobnicate");
  });
});
