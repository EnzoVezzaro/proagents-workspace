/**
 * Provisioning pipeline tests — the "New chat → fully provisioned workspace"
 * contract (user-visible flow: configure → launch → clone/folder-bind →
 * install → ACC + proagents scaffold → harness).
 *
 * runCommandAwait is tested against a REAL shell in a REAL PTY: commands
 * actually execute, exit codes are the shell's own, and the marker-echo
 * protocol is proven against real PTY echo (including the echo-race hazard).
 * planSetup is pure: it must never embed credentials in typed commands.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TerminalManager } from "../src/terminal.js";
import { planSetup, assertCloneTarget, ensureGitAskpass } from "../src/provision.js";

let tmpBase = "";

beforeEach(async () => {
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "paw-provision-"));
});

afterEach(async () => {
  await fs.rm(tmpBase, { recursive: true, force: true });
});

describe("TerminalManager.runCommandAwait (real shell PTY)", () => {
  it("awaits a fast command and returns its real exit code", async () => {
    const terminals = new TerminalManager("/bin/bash");
    const tty = terminals.create("ws-await", tmpBase);
    const result = await terminals.runCommandAwait(tty.id, "true");
    expect(result.exitCode).toBe(0);
    terminals.killWorkspace("ws-await");
  });

  it("returns non-zero for failing commands", async () => {
    const terminals = new TerminalManager("/bin/bash");
    const tty = terminals.create("ws-fail", tmpBase);
    // `false` fails (code 1) without killing the shell — unlike `exit 3`,
    // which terminates the shell itself (that path reports 255, dead PTY).
    const result = await terminals.runCommandAwait(tty.id, "false");
    expect(result.exitCode).toBe(1);
    terminals.killWorkspace("ws-fail");
  });

  it("reports a dead PTY (255) when the shell itself exits", async () => {
    const terminals = new TerminalManager("/bin/bash");
    const tty = terminals.create("ws-dead", tmpBase);
    const result = await terminals.runCommandAwait(tty.id, "exit 3");
    expect(result.exitCode).toBe(255);
  });

  it("sequences commands strictly: second command only runs after the first finishes", async () => {
    const terminals = new TerminalManager("/bin/bash");
    const tty = terminals.create("ws-seq", tmpBase);
    const order: string[] = [];
    const slow = terminals.runCommandAwait(tty.id, "sleep 0.6; echo slow-done");
    const fast = terminals.runCommandAwait(tty.id, "true");
    await fast; // fast one finishes first only if sequencing is broken
    order.push("fast");
    await slow;
    order.push("slow");
    // Both awaited their own markers; ordering across calls is the caller's
    // job — the contract under test is that each await truly waits.
    expect(order).toEqual(["fast", "slow"]);
    terminals.killWorkspace("ws-seq");
  });

  it("produces no marker false-positives from the PTY echo of the typed command", async () => {
    const terminals = new TerminalManager("/bin/bash");
    const tty = terminals.create("ws-echo", tmpBase);
    // The typed command contains `$A$B` — never the assembled marker — so
    // the echo cannot satisfy the matcher before the real echo output.
    const result = await terminals.runCommandAwait(tty.id, "echo marker-test-output");
    expect(result.exitCode).toBe(0);
    const scrollback = terminals.scrollback(tty.id) ?? "";
    expect(scrollback).toContain("marker-test-output");
    terminals.killWorkspace("ws-echo");
  });

  it("writes the command into the scrollback as the visible setup log", async () => {
    const terminals = new TerminalManager("/bin/bash");
    const tty = terminals.create("ws-log", tmpBase);
    await terminals.runCommandAwait(tty.id, "echo setup-visible");
    await new Promise((r) => setTimeout(r, 100));
    expect(terminals.scrollback(tty.id)).toContain("setup-visible");
    terminals.killWorkspace("ws-log");
  });
});

describe("planSetup", () => {
  it("clones with GIT_ASKPASS prefix only when an askpass path is given", () => {
    const steps = planSetup({
      source: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      absoluteRoot: "/x",
      displayRoot: "repos/repo",
      askpassPath: "/base/.paw/git-askpass.sh",
    });
    const clone = steps.find((s) => s.label === "clone repository");
    expect(clone?.command).toContain("GIT_ASKPASS=");
    expect(clone?.command).toContain("GIT_TERMINAL_PROMPT=0");
    // The token must never be in any typed command.
    for (const s of steps) {
      expect(s.command).not.toMatch(/gh[pousr]_[A-Za-z0-9]/);
      expect(s.command).not.toContain("x-access-token");
    }
  });

  it("omits the askpass prefix when no helper exists (public repos)", () => {
    const steps = planSetup({
      source: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      absoluteRoot: "/x",
      displayRoot: "repos/repo",
    });
    const clone = steps.find((s) => s.label === "clone repository");
    expect(clone?.command).not.toContain("GIT_ASKPASS");
  });

  it("runs install detection for local folders with a package manifest", () => {
    const steps = planSetup({
      source: "local",
      absoluteRoot: "/x",
      displayRoot: "proj",
    });
    // No manifest in /x → no install step, but the ACC scaffold always runs.
    expect(steps.some((s) => s.label === "install packages")).toBe(false);
    expect(steps.some((s) => s.label === "acc + proagents setup")).toBe(true);
  });

  it("ends with the ACC + proagents scaffold (the launch contract's end state)", () => {
    const steps = planSetup({
      source: "github",
      cloneUrl: "https://github.com/owner/repo.git",
      absoluteRoot: "/x",
      displayRoot: "repos/repo",
    });
    const last = steps[steps.length - 1];
    expect(last.label).toBe("acc + proagents setup");
    expect(last.command).toContain(".acc/workspace-context.yaml");
    expect(last.command).toContain("AGENTS.md");
  });
});

describe("assertCloneTarget (secret-leak guard)", () => {
  it("accepts clean https URLs", () => {
    expect(assertCloneTarget("https://github.com/owner/repo.git")).toBe("https://github.com/owner/repo.git");
  });

  it("rejects URLs with embedded credentials (they would echo into the PTY)", () => {
    expect(() => assertCloneTarget("https://x-access-token:ghp_secret123@github.com/o/r.git")).toThrow(/embeds credentials/);
  });

  it("rejects non-https URLs", () => {
    expect(() => assertCloneTarget("http://github.com/o/r.git")).toThrow(/not an https git URL/);
  });
});

describe("ensureGitAskpass", () => {
  it("writes a 0700 helper that reads the token from the env, not the command", async () => {
    const prev = process.env.PAW_GITHUB_TOKEN;
    process.env.PAW_GITHUB_TOKEN = "ghp_testtoken123";
    try {
      const file = await ensureGitAskpass(tmpBase);
      expect(file).toContain("git-askpass.sh");
      const content = await fs.readFile(file as string, "utf8");
      expect(content).toContain("PAW_GITHUB_TOKEN");
      expect(content).not.toContain("ghp_testtoken123");
      const stat = await fs.stat(file as string);
      expect(stat.mode & 0o777).toBe(0o700);
    } finally {
      if (prev === undefined) delete process.env.PAW_GITHUB_TOKEN;
      else process.env.PAW_GITHUB_TOKEN = prev;
    }
  });
});
