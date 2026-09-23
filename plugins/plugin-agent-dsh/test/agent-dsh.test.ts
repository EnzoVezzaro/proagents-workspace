/**
 * Contract tests for the DSH agent adapter.
 *
 * A fake `dsh` shell script stands in for the real engine: it emits the
 * documented NDJSON event stream (session → tool_call → tool_result →
 * final) so the spawn/parse/map path is exercised end to end without any
 * model or network. The real engine was verified separately (dsh
 * 0.1.5-rc.2 boots headless; MISSING_CREDENTIAL surfaces verbatim).
 */
import { describe, expect, it, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDsh, dshAgentPlugin } from "../src/index.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const d of tmpDirs.splice(0)) await fs.rm(d, { recursive: true, force: true });
});

async function makeFakeDsh(script: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-fake-"));
  tmpDirs.push(dir);
  const bin = path.join(dir, "dsh");
  await fs.writeFile(bin, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return bin;
}

describe("runDsh (real spawn + NDJSON parse path)", () => {
  it("collects the final text and maps the event stream", async () => {
    const bin = await makeFakeDsh(`
      echo '{"type":"session","sessionId":"session-abc"}'
      echo '{"type":"tool_call","name":"edit","args":{"path":"x.ts"}}'
      echo '{"type":"tool_result","name":"edit","ok":true}'
      echo '{"type":"final","text":"DONE-42","reason":"completed"}'
      exit 0
    `);
    const events: { type: string }[] = [];
    const result = await runDsh(bin, {
      task: "test",
      sessionId: "dsh-test",
      onEvent: (ev) => events.push(ev),
    });
    expect(result.exitCode).toBe(0);
    expect(result.finalText).toBe("DONE-42");
    expect(events.map((e) => e.type)).toEqual(["session", "tool_call", "tool_result", "final"]);
  });

  it("buffers partial NDJSON lines across chunk boundaries", async () => {
    const bin = await makeFakeDsh(`
      printf '{"type":"text","te'
      printf 'xt":"partial"}\\n'
      echo '{"type":"final","text":"SPLIT-OK"}'
      exit 0
    `);
    const events: { type: string }[] = [];
    const result = await runDsh(bin, { task: "t", sessionId: "s", onEvent: (ev) => events.push(ev) });
    expect(result.exitCode).toBe(0);
    expect(result.finalText).toBe("SPLIT-OK");
    expect(events).toHaveLength(2);
  });

  it("surfaces stderr verbatim and the exit code on harness failure", async () => {
    const bin = await makeFakeDsh(`
      echo "dsh: MISSING_CREDENTIAL: no API key" >&2
      exit 1
    `);
    const result = await runDsh(bin, { task: "t", sessionId: "s", onEvent: () => undefined });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MISSING_CREDENTIAL");
    expect(result.finalText).toBe("");
  });

  it("keeps a non-JSON stdout line as a diagnostic instead of crashing", async () => {
    const bin = await makeFakeDsh(`
      echo "some stray warning"
      echo '{"type":"final","text":"STILL-OK"}'
      exit 0
    `);
    const result = await runDsh(bin, { task: "t", sessionId: "s", onEvent: () => undefined });
    expect(result.exitCode).toBe(0);
    expect(result.finalText).toBe("STILL-OK");
    expect(result.stderr).toContain("some stray warning");
  });

  it("rejects with AGENT_PROVIDER_UNAVAILABLE when the binary cannot spawn", async () => {
    await expect(
      runDsh("/nonexistent/dsh-binary", { task: "t", sessionId: "s", onEvent: () => undefined }),
    ).rejects.toMatchObject({ code: "AGENT_PROVIDER_UNAVAILABLE" });
  });

  it("falls back to plain mode for engines without --json (pre-0.1.7)", async () => {
    // Published dsh 0.1.5-rc.2 rejects the flag; the adapter must degrade
    // honestly: retry plain, stdout becomes the final answer, diagnostic kept.
    const bin = await makeFakeDsh(`
      for arg in "$@"; do
        if [ "$arg" = "--json" ]; then echo "dsh: unknown option '--json'" >&2; exit 1; fi
      done
      echo "PLAIN-ANSWER"
    `);
    const events: { type: string }[] = [];
    const result = await runDsh(bin, { task: "t", sessionId: "s", onEvent: (ev) => events.push(ev) });
    expect(result.finalText).toBe("PLAIN-ANSWER");
    expect(result.stderr).toContain("engine lacks --json");
    expect(result.exitCode).toBe(0);
  });
});

describe("plugin shape", () => {
  it("exposes the manifest and registers the agent service on activation", async () => {
    const plugin = dshAgentPlugin({ id: "agent-dsh", bin: "dsh" });
    const manifest = (plugin as unknown as { manifest: { id: string; provider: string; capabilities: string[] } }).manifest;
    expect(manifest.id).toBe("agent-dsh");
    expect(manifest.provider).toBe("dsh");
    expect(manifest.capabilities).toContain("agent");

    const registered: { defId: string }[] = [];
    (plugin as unknown as { activate: (ctx: unknown) => Promise<void> }).activate({
      events: { emit: async () => undefined },
      permissions: { require: () => undefined },
      services: {
        register: (def: { id: string }) => {
          registered.push({ defId: def.id });
        },
      },
    });
    expect(registered).toEqual([{ defId: "agent" }]);
  });
});
