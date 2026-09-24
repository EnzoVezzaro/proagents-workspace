#!/usr/bin/env node
/**
 * `paw` — the ProAgents Workspace CLI.
 *
 * Convention-first product model (spec section 148): the CLI is a lightweight
 * developer tool around an existing repository. The golden path is
 *
 *   paw init → paw status → paw verify → <your agent>
 *
 * with zero cloud dependencies, zero mandatory configuration, and lazy
 * capability activation — simple commands never boot plugins, runtimes, or
 * remote services (spec sections 37–38). Commands that DO need capabilities
 * boot a WorkspaceClient with the bundled plugin catalog (catalog semantics:
 * only config-referenced plugins activate).
 *
 * Interface rules (cli-vocabulary standard, spec sections 97–99):
 *   - every important command supports --json (deterministic output)
 *   - workspace commands support --headless
 *   - errors are structured: code, message, provider, recoverable, suggestions
 */
import { WorkspaceClient, WorkspaceError, type WorkspaceClientOptions } from "@proagents/workspace";
import { defineService, type ContextProvider, type ShellProvider } from "@proagents/contracts";
import { accContextPlugin } from "@proagents/plugin-context-acc";
import { bundledPlugins } from "./plugins.js";
import {
  detectProject,
  discoverEnvironment,
  detectedAgents,
  inferVerification,
  initWorkspace,
  isInitialized,
  loadConfig,
  pawDirFor,
  workspaceStatus,
  runResearch,
  answerQuestion,
  deriveQuestions,
  hasResearch,
  researchModelPath,
  researchContextService,
  type DiscoveredIntegration,
  type ResearchModel,
} from "./conventions.js";

const shellService = defineService<ShellProvider>({ id: "shell", contractVersion: "1.0.0" });

/**
 * CLI version. In the repo build this falls back to the package version; the
 * npm publish pipeline compiles the bundle with `--define`, so the published
 * binary reports the exact released version (stability contract: the version
 * string is what users and scripts compare).
 */
declare const __PAW_CLI_VERSION__: string | undefined;
const CLI_VERSION = typeof __PAW_CLI_VERSION__ !== "undefined" ? __PAW_CLI_VERSION__ : "0.2.0";
const WORKSPACE_API_VERSION = "1.0.0";

interface ParsedArgs {
  command: string | undefined;
  args: string[];
  flags: Record<string, string | boolean>;
  json: boolean;
  headless: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (const token of argv) {
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        flags[body] = true;
      }
    } else {
      args.push(token);
    }
  }
  const [command, ...rest] = args;
  return {
    command,
    args: rest,
    flags,
    json: flags["json"] === true,
    headless: flags["headless"] === true,
  };
}

/**
 * Load the effective configuration with the documented precedence (spec
 * section 35): built-in defaults → global user config → project config
 * (`.paw/workspace.yaml`) → environment → CLI flags. Project detection
 * contributes verification commands when the project file did not list any
 * (spec sections 17–18: infer locally before asking the developer).
 */
async function effectiveConfig(projectRoot: string, parsed: ParsedArgs): Promise<{ config: unknown; sources: readonly string[] }> {
  const loaded = await loadConfig(projectRoot);
  const config = { ...loaded.config } as Record<string, unknown>;
  const sources = loaded.sources.map((s) => s.layer);

  // Layer: environment (env still wins over project config for runtime and
  // plugin selection).
  if (process.env.PAW_RUNTIME !== undefined) {
    config["runtime"] = { provider: process.env.PAW_RUNTIME };
    sources.push("environment (PAW_RUNTIME)");
  }
  const envPlugins = (process.env.PAW_PLUGINS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (envPlugins.length > 0) {
    config["plugins"] = envPlugins.map((id) => (id === "filesystem" ? { id, options: { root: projectRoot } } : { id }));
    config["tools"] = envPlugins;
    config["permissions"] = {
      ...(config["permissions"] as Record<string, unknown> | undefined),
      filesystem: { read: [projectRoot], write: [projectRoot] },
    };
    sources.push("environment (PAW_PLUGINS)");
  }
  // Layer: CLI flags.
  const runtimeFlag = parsed.flags["runtime"];
  if (typeof runtimeFlag === "string") {
    config["runtime"] = { provider: runtimeFlag };
    sources.push("--runtime flag");
  }
  const repoFlag = parsed.flags["repo"];
  if (typeof repoFlag === "string") {
    config["repository"] = { provider: "git", repository: repoFlag };
    sources.push("--repo flag");
  }

  // Inferred verification: only when configuration did not specify commands.
  const configuredCommands = (config["verification"] as { commands?: string[] } | undefined)?.commands ?? [];
  if (configuredCommands.length === 0 && isInitialized(projectRoot)) {
    const plan = await inferVerification(projectRoot);
    if (plan.checks.length > 0) {
      config["verification"] = { commands: plan.checks.map((c) => c.command) };
      sources.push("detected project scripts");
    }
  }
  return { config, sources };
}

function clientOptions(parsed: ParsedArgs, config: unknown): WorkspaceClientOptions {
  return {
    config,
    plugins: bundledPlugins(),
    // The bundled set is a catalog: only config-referenced plugins activate,
    // so a plain config reports an empty set instead of booting both runtimes
    // into a service conflict.
    catalog: true,
    // --headless fails closed on approvals (spec section 97).
    approvalFlow: parsed.headless
      ? undefined
      : {
          confirm: async (request) => {
            process.stderr.write(
              `Approval required: ${request.operation} on ${request.target} (plugin: ${request.pluginId}). [y/N] `
            );
            // Interactive prompt that also terminates when stdin ends or
            // errors (piped/EOF) — an unanswered prompt DENIES, it never hangs.
            let buf = "";
            let settled = false;
            const answer = await new Promise<string>((resolve) => {
              const finish = (value: string) => {
                if (settled) return;
                settled = true;
                process.stdin.removeListener("data", onData);
                process.stdin.removeListener("end", onEnd);
                process.stdin.removeListener("error", onError);
                resolve(value);
              };
              const onData = (chunk: Buffer) => {
                buf += chunk.toString("utf8");
                if (buf.includes("\n")) finish(buf.trim());
              };
              const onEnd = () => finish(buf.trim());
              const onError = () => finish("");
              process.stdin.on("data", onData);
              process.stdin.on("end", onEnd);
              process.stdin.on("error", onError);
            });
            return answer.toLowerCase() === "y" ? ("approved" as const) : ("denied" as const);
          },
        },
  };
}

// ---------------------------------------------------------------------------
// Renderers (human output; --json paths print the same data as JSON)
// ---------------------------------------------------------------------------

function printCheck(label: string, ok: boolean, detail?: string): void {
  const mark = ok ? "✓" : "○";
  process.stdout.write(`${mark} ${label}${detail !== undefined ? ` — ${detail}` : ""}\n`);
}

function renderProject(project: Awaited<ReturnType<typeof detectProject>>): void {
  if (project.languages.length > 0) printCheck(`${project.languages.join(", ")} project`, true, project.packageManager ?? undefined);
  else printCheck("project", false, "no recognized project manifest — the workspace still works on plain files");
  if (project.monorepo) printCheck("monorepo", true);
}

function renderAgents(agents: readonly DiscoveredIntegration[]): void {
  const found = detectedAgents(agents);
  if (found.length === 0) {
    process.stdout.write("○ No coding agents detected — install one (codex, claude, opencode, gemini, dsh) or keep using this workspace for verification only.\n");
    return;
  }
  for (const agent of found) {
    printCheck(agent.name, true, `tier: ${agent.tier}${agent.command !== undefined ? ` — launch: ${agent.command}` : ""}`);
  }
}

function renderVerification(plan: Awaited<ReturnType<typeof inferVerification>>): void {
  if (plan.checks.length === 0) {
    process.stdout.write("○ No verification detected — add scripts (lint/typecheck/test/build) to package.json or commands to .paw/workspace.yaml.\n");
    return;
  }
  for (const check of plan.checks) printCheck(check.id, true, check.command);
}

function renderStatus(projectRoot: string, parsed: ParsedArgs): Promise<number> {
  return (async () => {
    const status = await workspaceStatus(projectRoot);
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return 0;
    }
    process.stdout.write(`Workspace\n  ${status.projectRoot}\n`);
    process.stdout.write(`  ${status.initialized ? "✓ initialized (.paw/)" : "○ not initialized — run `paw init`"}\n`);
    process.stdout.write("\nRepository\n");
    if (status.git.repository) process.stdout.write(`  ✓ git (branch: ${status.git.branch ?? "?"}${status.git.dirty ? ", dirty" : ""})\n`);
    else process.stdout.write("  ○ not a git repository — the workspace works without git\n");
    process.stdout.write("\nProject\n");
    renderProject(status.project);
    process.stdout.write("\nAgents\n");
    renderAgents(status.agents);
    process.stdout.write("\nVerification\n");
    renderVerification(status.verification);
    if (parsed.flags["verbose"] === true) {
      process.stdout.write("\nConfiguration\n");
      for (const source of status.configSources) {
        process.stdout.write(`  · ${source.layer}${source.file !== undefined ? ` (${source.file})` : ""}\n`);
      }
    }
    return 0;
  })();
}

async function runVerify(projectRoot: string, parsed: ParsedArgs): Promise<number> {
  const { config, sources } = await effectiveConfig(projectRoot, parsed);
  const commands =
    (config as { verification?: { commands?: string[] } }).verification?.commands ?? [];
  if (commands.length === 0) {
    const payload = { command: "verify", ok: true, results: [], message: "no verification commands detected or configured" };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return 0;
  }
  const client = new WorkspaceClient(clientOptions(parsed, config));
  try {
    const ws = await client.start();
    const shell = await client.service(shellService);
    if (!parsed.json) {
      process.stdout.write("Verification\n");
      for (const source of sources) process.stdout.write(`  · config: ${source}\n`);
    }
    const results: { check: string; command: string; exitCode: number; durationMs: number }[] = [];
    for (const command of commands) {
      if (!parsed.json) process.stdout.write(`  → ${command}\n`);
      const result = await shell.exec({ command, cwd: projectRoot, timeoutMs: 600_000 });
      results.push({ check: command, command, exitCode: result.exitCode, durationMs: result.durationMs });
    }
    const ok = results.every((r) => r.exitCode === 0);
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ command: "verify", ok, results, workspace: ws.id }, null, 2)}\n`);
    } else {
      for (const r of results) printCheck(r.check, r.exitCode === 0, `${r.exitCode} in ${r.durationMs}ms`);
      process.stdout.write(`\nResult: ${ok ? "PASS" : "FAIL"}\n`);
    }
    return ok ? 0 : 1;
  } finally {
    await client.stop();
  }
}

/**
 * Resolve context providers for research from the CLI's own plugin catalog
 * (spec 149). The SDK never imports concrete plugins (spec 50); the host
 * wires its catalog into the research options. ACC is OPTIONAL: when it is
 * not installed/activated, research degrades to repository facts and says so.
 */
async function resolveContextProviders(parsed: ParsedArgs): Promise<readonly { id: string; provider: ContextProvider }[]> {
  const providers: { id: string; provider: ContextProvider }[] = [];
  const wanted = typeof parsed.flags["context"] === "string"
    ? parsed.flags["context"].split(",").map((s) => s.trim()).filter(Boolean)
    : (process.env.PAW_RESEARCH_CONTEXT ?? "acc").split(",").map((s) => s.trim()).filter(Boolean);
  if (!wanted.includes("acc")) return providers;
  try {
    const { WorkspaceClient: Client } = await import("@proagents/workspace");
    const client = new Client({
      config: {
        approval: { mode: "autonomous" },
        tools: ["filesystem"],
        plugins: [{ id: "filesystem", options: { root: process.cwd() } }],
        context: { providers: ["acc"] },
        permissions: { filesystem: { read: [process.cwd()], write: [] } },
      },
      plugins: [accContextPlugin],
      catalog: true,
    });
    try {
      const provider = await client.service(researchContextService);
      providers.push({ id: "acc", provider });
    } catch {
      // ACC unavailable → honest degradation (research continues without it).
    } finally {
      await client.stop();
    }
  } catch {
    // Boot failure → honest degradation.
  }
  return providers;
}

function usage(): string {
  return [
    "paw — the convention-first workspace for AI coding agents",
    "",
    "Usage: paw <command> [args] [--json] [--headless]",
    "",
    "Commands:",
    "  init          Make the current repository Workspace-aware (.paw/)",
    "  status        Where am I, what is here, what is possible",
    "  research      Discover product/environment facts (ACC-aware), ask what's missing",
    "  doctor        Health of the workspace and its providers",
    "  verify        Run detected/configured verification (lint, test, build)",
    "  diff          Git working-tree diff (requires git)",
    "  agent list    Detected coding agents and their integration tier",
    "  checkpoint    List/run checkpoint plans with quality gates (spec 150)",
    "  config show   Effective configuration and where each layer came from",
    "  plugin list   Registered plugins and their capabilities",
    "  service list  Registered capability services",
    "",
    "Isolated workspaces (optional, progressive):",
    "  paw workspace create [--runtime docker|e2b] [--repo <ref>]",
    "",
    "Global flags: --json (machine-readable), --headless (fail closed on approvals)",
    "",
    "No runtime or cloud account is required. The terminal is the interface.",
  ].join("\n");
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();

  // `paw --version` (documented in docs/getting-started.md): never boots the
  // kernel — reads the CLI package version injected at build time, so a
  // bundled/published binary reports the version it was built from.
  if (parsed.flags["version"] === true || parsed.command === "version") {
    const payload = {
      version: CLI_VERSION,
      workspaceApi: WORKSPACE_API_VERSION,
      node: process.version,
    };
    if (parsed.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else process.stdout.write(`paw ${payload.version} (workspace API ${payload.workspaceApi}, node ${payload.node})\n`);
    return 0;
  }

  if (parsed.command === undefined || parsed.command === "help" || parsed.flags["help"] === true) {
    if (parsed.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            commands: [
              "init", "status", "research", "doctor", "verify", "diff", "agent list", "checkpoint",
              "config show", "plugin list", "service list", "workspace create",
            ],
          },
          null,
          2
        )}\n`
      );
    } else {
      process.stdout.write(`${usage()}\n`);
    }
    return 0;
  }

  // Bare `paw` (Level 0): explain what is available WITHOUT initializing.
  // Zero configuration required; nothing is written to the repository.
  if (parsed.command === "bare") {
    const status = await workspaceStatus(projectRoot);
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return 0;
    }
    renderProject(status.project);
    renderAgents(status.agents);
    if (!status.initialized) {
      process.stdout.write("\nThis repository is not Workspace-aware yet. Run `paw init` (creates .paw/ only — source code is untouched).\n");
    }
    return 0;
  }

  try {
    switch (parsed.command) {
      case "init": {
        const result = await initWorkspace(projectRoot);
        if (parsed.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return 0;
        }
        renderProject(result.project);
        for (const agent of result.agents) printCheck(agent.name, true, `tier: ${agent.tier}`);
        if (result.agents.length === 0) process.stdout.write("○ No coding agents detected\n");
        process.stdout.write("\nProAgents Workspace initialized.\n");
        process.stdout.write("\nCreated:\n");
        for (const file of result.created) process.stdout.write(`  ${file}\n`);
        process.stdout.write("\nNo runtime required.\nNo cloud account required.\n");
        process.stdout.write("\nRun:\n  paw doctor\n  paw verify\n");
        const agents = detectedAgents(await discoverEnvironment(projectRoot));
        if (agents.length > 0) {
          process.stdout.write(`  ${agents[0]!.command ?? agents[0]!.id}   # your existing agent keeps working\n`);
        }
        return 0;
      }

      case "status":
        return await renderStatus(projectRoot, parsed);

      case "doctor": {
        const status = await workspaceStatus(projectRoot);
        const { config } = await effectiveConfig(projectRoot, parsed);
        let doctor: Awaited<ReturnType<WorkspaceClient["doctor"]>> = [];
        if (isInitialized(projectRoot)) {
          const client = new WorkspaceClient(clientOptions(parsed, config));
          try {
            doctor = await client.doctor();
          } finally {
            await client.stop();
          }
        }
        if (parsed.json) {
          process.stdout.write(`${JSON.stringify({ command: "doctor", status, doctor }, null, 2)}\n`);
          return 0;
        }
        process.stdout.write("ProAgents Workspace Doctor\n\n");
        process.stdout.write("Workspace\n");
        printCheck(status.initialized ? "initialized" : "not initialized", status.initialized, status.initialized ? pawDirFor(projectRoot) : "run `paw init`");
        process.stdout.write("\nRepository\n");
        printCheck("git repository", status.git.repository, status.git.branch);
        process.stdout.write("\nProject\n");
        renderProject(status.project);
        process.stdout.write("\nAgents\n");
        renderAgents(status.agents);
        process.stdout.write("\nVerification\n");
        renderVerification(status.verification);
        if (doctor.length > 0) {
          process.stdout.write("\nProviders\n");
          for (const entry of doctor) {
            process.stdout.write(`  ${entry.pluginId.padEnd(16)} ${entry.health.status.padEnd(12)} ${entry.health.message}\n`);
          }
        }
        process.stdout.write("\n");
        const optional = status.agents.filter((a) => !a.detected && (a.kind === "context-framework" || a.kind === "runtime"));
        if (optional.length > 0) {
          process.stdout.write("Optional\n");
          for (const item of optional.slice(0, 6)) printCheck(item.name, false, "not installed — optional");
        }
        process.stdout.write("\nEverything required is ready.\n");
        return 0;
      }

      case "verify":
        return await runVerify(projectRoot, parsed);

      case "diff": {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const runGit = promisify(execFile);
        try {
          const { stdout } = await runGit("git", ["diff"], { cwd: projectRoot, maxBuffer: 16 * 1024 * 1024 });
          process.stdout.write(stdout);
          return 0;
        } catch (error) {
          const err = error as { code?: number; stderr?: string };
          if (err.code === 1 && err.stderr === undefined) {
            return 1; // git diff exit 1 = differences found with --exit-code only
          }
          throw new WorkspaceError({
            code: "GIT_COMMAND_FAILED",
            message: err.stderr?.trim() || "git diff failed — is this a git repository?",
            provider: "git",
            recoverable: true,
            suggestions: ["Run `git init` to create a repository, or use `paw status` for a non-git workspace"],
          });
        }
      }

      case "research": {
        // Integration point with the ACC/ProAgents ecosystems (spec 149):
        // context providers first, then product questions, then artifacts.
        // Agent-level professional requirements are handed to ProAgents via
        // `.paw/proagents/requirements.json` — PAW never invents skills/rules.
        if (!isInitialized(projectRoot)) {
          throw new WorkspaceError({
            code: "PROJECT_NOT_INITIALIZED",
            message: "Research runs on an initialized Workspace.",
            recoverable: true,
            suggestions: ["Run `paw init` first"],
          });
        }
        // Subcommand: `paw research answer <question-id> <answer>` — applies
        // one answer to the persisted model (interview loop, resumable).
        if (parsed.args[0] === "answer") {
          const questionId = parsed.args[1];
          const answer = parsed.args.slice(2).join(" ");
          if (questionId === undefined || answer.length === 0) {
            process.stderr.write("usage: paw research answer <question-id> <answer> [--json]\n");
            return 2;
          }
          if (!hasResearch(projectRoot)) {
            throw new WorkspaceError({
              code: "PROJECT_NOT_INITIALIZED",
              message: "No research model found — run `paw research` first.",
              recoverable: true,
              suggestions: ["Run `paw research`"],
            });
          }
          const { readFile } = await import("node:fs/promises");
          const model = JSON.parse(await readFile(researchModelPath(projectRoot), "utf8")) as ResearchModel;
          const updated = answerQuestion(model, questionId, answer);
          const { writeFile: wf } = await import("node:fs/promises");
          await wf(researchModelPath(projectRoot), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
          const remaining = deriveQuestions(updated);
          if (parsed.json) {
            process.stdout.write(`${JSON.stringify({ command: "research answer", answered: questionId, remaining: remaining.length, model: updated }, null, 2)}\n`);
          } else {
            process.stdout.write(`✓ ${questionId} answered.\n`);
            process.stdout.write(remaining.length === 0 ? "Research complete — no open questions.\n" : `${remaining.length} question(s) remaining:\n`);
            for (const q of remaining) process.stdout.write(`  · ${q.question}\n`);
          }
          return 0;
        }
        if (parsed.args[0] === "status") {
          if (!hasResearch(projectRoot)) {
            process.stdout.write(`${JSON.stringify({ command: "research status", exists: false }, null, 2)}\n`);
            return 0;
          }
          const { readFile } = await import("node:fs/promises");
          const model = JSON.parse(await readFile(researchModelPath(projectRoot), "utf8")) as ResearchModel;
          process.stdout.write(`${JSON.stringify({ command: "research status", exists: true, open: deriveQuestions(model).length, model }, null, 2)}\n`);
          return 0;
        }
        const contextProviders = await resolveContextProviders(parsed);
        const result = await runResearch(projectRoot, { contextProviders });
        if (parsed.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return 0;
        }
        process.stdout.write("Workspace Research\n\nDetected\n");
        for (const fact of result.model.facts) {
          process.stdout.write(`  ${fact.key}: ${fact.value} (${fact.source}${fact.origin !== undefined ? `: ${fact.origin}` : ""})\n`);
        }
        if (result.contexts.note !== undefined) process.stdout.write(`  ${result.contexts.note}\n`);
        process.stdout.write("\nOpen questions\n");
        if (result.model.questions.length === 0) {
          process.stdout.write("  (none — the environment answered everything it could)\n");
        } else {
          for (const q of result.model.questions) {
            process.stdout.write(`  · ${q.question}\n      why: ${q.why}\n`);
          }
        }
        process.stdout.write("\nArtifacts\n");        
        for (const file of result.artifacts) process.stdout.write(`  ${file}\n`);
        process.stdout.write("\nAgent requirements were handed to ProAgents (.paw/proagents/requirements.json).\n");
        return 0;
      }

      case "agent": {
        const sub = parsed.args[0] ?? "list";
        if (sub !== "list") {
          process.stderr.write("usage: paw agent list [--json]\n");
          return 2;
        }
        const agents = detectedAgents(await discoverEnvironment(projectRoot));
        if (parsed.json) {
          process.stdout.write(`${JSON.stringify({ command: "agent list", agents }, null, 2)}\n`);
          return 0;
        }
        if (agents.length === 0) {
          process.stdout.write("No coding agents detected. Install one: codex, claude, opencode, gemini, dsh.\n");
          return 0;
        }
        for (const agent of agents) {
          process.stdout.write(`${agent.name.padEnd(20)} tier: ${agent.tier}${agent.command !== undefined ? `  launch: ${agent.command}` : ""}\n`);
        }
        return 0;
      }

      case "config": {
        if (parsed.args[0] !== "show") {
          process.stderr.write("usage: paw config show [--json]\n");
          return 2;
        }
        const { config, sources } = await effectiveConfig(projectRoot, parsed);
        process.stdout.write(`${JSON.stringify({ config, sources }, null, 2)}\n`);
        return 0;
      }

      case "plugin": {
        if (parsed.args[0] !== "list") {
          process.stderr.write("usage: paw plugin list [--json]\n");
          return 2;
        }
        const { config } = await effectiveConfig(projectRoot, parsed);
        const client = new WorkspaceClient(clientOptions(parsed, config));
        try {
          const plugins = await client.pluginList();
          if (parsed.json) {
            process.stdout.write(`${JSON.stringify({ command: "plugin list", plugins }, null, 2)}\n`);
          } else {
            for (const p of plugins) {
              process.stdout.write(`${p.id.padEnd(20)} v${p.version.padEnd(8)} ${p.capabilities.join(", ")}\n`);
            }
          }
          return 0;
        } finally {
          await client.stop();
        }
      }

      case "service": {
        if (parsed.args[0] !== "list") {
          process.stderr.write("usage: paw service list [--json]\n");
          return 2;
        }
        const { config } = await effectiveConfig(projectRoot, parsed);
        const client = new WorkspaceClient(clientOptions(parsed, config));
        try {
          const services = await client.serviceList();
          if (parsed.json) {
            process.stdout.write(`${JSON.stringify({ command: "service list", services }, null, 2)}\n`);
          } else {
            for (const s of services) {
              process.stdout.write(`${s.id.padEnd(20)} contract ${s.contractVersion.padEnd(8)} by ${s.pluginId}\n`);
            }
          }
          return 0;
        } finally {
          await client.stop();
        }
      }

      case "checkpoint": {
        // Checkpoint + Gate execution (spec section 150): attempt ≠ completion.
        const { runCheckpointsCommand } = await import("./checkpoints.js");
        const { config } = await effectiveConfig(projectRoot, parsed);
        return await runCheckpointsCommand(parsed.args[0] ?? "list", {
          projectRoot,
          parsed,
          clientOptions: (cfg: unknown) => clientOptions(parsed, cfg),
          config,
        });
      }

      case "workspace": {
        const sub = parsed.args[0];
        if (sub !== "create") {
          process.stderr.write("usage: paw workspace create [--runtime docker|e2b] [--repo <ref>] [--headless]\n");
          return 2;
        }
        // Progressive capability (spec sections 6/23): isolated runtimes are
        // opt-in infrastructure. V1 resolves the declaration and reports the
        // honest security model instead of pretending isolation exists.
        const runtime = typeof parsed.flags["runtime"] === "string" ? parsed.flags["runtime"] : "docker";
        const payload = {
          command: "workspace create",
          runtime,
          repo: typeof parsed.flags["repo"] === "string" ? parsed.flags["repo"] : undefined,
          isolation: runtime === "local" ? "host-level (NOT a sandbox)" : "provider-defined container isolation",
          note: "Isolated runtime provisioning arrives with the runtime milestones; this command reports the requested target honestly.",
        };
        if (parsed.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        else process.stdout.write(`Runtime: ${payload.runtime}\nIsolation: ${payload.isolation}\n${payload.note}\n`);
        return 0;
      }

      default: {
        const payload = {
          code: "COMMAND_NOT_FOUND" as const,
          message: `Unknown command: ${parsed.command}. Run 'paw help'.`,
          recoverable: true,
          suggestions: ["Run `paw help` to list commands"],
        };
        process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
        return 2;
      }
    }
  } catch (error) {
    if (error instanceof WorkspaceError) {
      process.stderr.write(`${JSON.stringify(error.toJSON(), null, 2)}\n`);
      return error.recoverable ? 1 : 2;
    }
    process.stderr.write(
      `${JSON.stringify(
        {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
          suggestions: ["Run `paw doctor` to inspect provider health"],
        },
        null,
        2
      )}\n`
    );
    return 2;
  }
}

// Interrupts exit with the conventional 130 status and never leave the
// workspace mid-shutdown waiting on input.
process.on("SIGINT", () => {
  process.stderr.write("\ninterrupted\n");
  process.exit(130);
});

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(2);
  });
