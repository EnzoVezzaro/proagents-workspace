/**
 * Docs ↔ code pact test (documentation standard: "docs must never contradict
 * code").
 *
 * History: docs/agent-environment.md described the shipped `paw` CLI as
 * "Specification only … not yet implemented" while packages/cli shipped the
 * convention-first surface — the exact drift this pact now prevents. If this
 * test fails, the DOCUMENTATION is wrong (or the product was deliberately
 * un-shipped, in which case update both sides of the pact in one change).
 *
 * Checks:
 *   1. No doc ever claims the paw CLI is unimplemented/spec-only.
 *   2. The commands documented in docs/cli-reference.md actually exist in
 *      the CLI's help — the doc vocabulary matches the binary (bidirectional:
 *      help commands a doc omits are reported too).
 */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const run = promisify(execFile);
const repoRoot = path.resolve(__dirname, "../..");
const CLI_BIN = path.join(repoRoot, "packages/cli/dist/index.js");

/** Every docs page + the root spec — the surface the pact guards. */
function docFiles(): string[] {
  const docsDir = path.join(repoRoot, "docs");
  const pages: string[] = [];
  for (const entry of readdirSync(docsDir)) {
    if (entry.endsWith(".md") && statSync(path.join(docsDir, entry)).isFile()) {
      pages.push(path.join(docsDir, entry));
    }
  }
  pages.push(path.join(repoRoot, "README.md"));
  return pages;
}

/**
 * Drift patterns that would re-introduce the "paw is not real" claim.
 * Deliberately narrow: they must catch the historical phrasing without
 * flagging legitimate future prose like "the e2b runtime is not implemented".
 */
const FORBIDDEN = [
  /[Pp][Aa][Ww][^\n]{0,80}(not yet implemented|specification only|spec-only)/,
  /(not yet implemented|specification only|spec-only)[^\n]{0,80}[Pp][Aa][Ww]/,
];

/** The golden-path commands docs/cli-reference.md promises (spec sections 50/148). */
const PROMISED_COMMANDS = [
  "init", "status", "research", "doctor", "verify", "diff",
  "agent list", "config show",
] as const;

describe("docs ↔ code pact: the paw CLI is real", () => {
  it("no documentation page claims the paw CLI is unimplemented", () => {
    const offenders: string[] = [];
    for (const file of docFiles()) {
      const content = readFileSync(file, "utf8");
      if (FORBIDDEN.some((pattern) => pattern.test(content))) {
        offenders.push(path.relative(repoRoot, file));
      }
    }
    expect(
      offenders,
      `These docs contradict the shipped CLI (packages/cli): ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("the CLI binary exists (the pact guards a shipped product, not a plan)", () => {
    expect(
      existsSync(CLI_BIN),
      "packages/cli/dist/index.js missing — run `pnpm build` before the pact can hold"
    ).toBe(true);
  });

  it("commands documented in cli-reference.md match the actual CLI help", async () => {
    const help = await run(process.execPath, [CLI_BIN, "help", "--json"], { timeout: 30_000 });
    const parsed = JSON.parse(help.stdout) as { commands: readonly string[] };
    const implemented = new Set(parsed.commands);

    const missing = PROMISED_COMMANDS.filter((command) => !implemented.has(command));
    expect(
      missing,
      `docs/cli-reference.md documents commands the CLI does not implement: ${missing.join(", ")}`
    ).toEqual([]);

    // Bidirectional: every implemented command should appear in
    // cli-reference.md as `paw <command>` (in a fence or inline), so the doc
    // cannot silently lag the binary. Multi-word subcommands ("agent list")
    // match on their full form.
    const cliReference = readFileSync(path.join(repoRoot, "docs/cli-reference.md"), "utf8");
    const undocumented = [...implemented].filter((command) => !cliReference.includes(`paw ${command}`));
    expect(
      undocumented,
      `the CLI implements commands docs/cli-reference.md never mentions: ${undocumented.join(", ")}`
    ).toEqual([]);
  });
});
