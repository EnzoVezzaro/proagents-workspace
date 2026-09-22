#!/usr/bin/env node
/**
 * `paw` — the ProAgents Workspace CLI.
 *
 * The CLI is thin: it parses flags, boots a WorkspaceClient with the bundled
 * plugins, and renders command results. All behavior lives in the kernel and
 * plugins — CLI and SDK call the same services (spec section 64).
 *
 * Interface rules (cli-vocabulary standard, spec sections 97–99):
 *   - every important command supports --json (deterministic output)
 *   - workspace commands support --headless
 *   - errors are structured: code, message, provider, recoverable, suggestions
 */
import { WorkspaceClient, WorkspaceError, type WorkspaceClientOptions } from "@proagents/workspace";
import { defineService, type ShellProvider } from "@proagents/contracts";
import { bundledPlugins } from "./plugins.js";

const shellService = defineService<ShellProvider>({ id: "shell", contractVersion: "1.0.0" });

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

function loadConfig(): unknown {
  // V1: environment-driven configuration; workspace.yaml file loading lands
  // with the runtime milestones. Shape matches docs/configuration.md.
  return {
    runtime: { provider: process.env.PAW_RUNTIME ?? "local" },
    repository: process.env.PAW_REPOSITORY
      ? { provider: "git", repository: process.env.PAW_REPOSITORY }
      : undefined,
    approval: { mode: process.env.PAW_APPROVAL ?? "guarded" },
    tools: ["filesystem", "shell", "git"],
    plugins: (process.env.PAW_PLUGINS ?? "").split(",").filter(Boolean).map((id) => ({ id })),
  };
}

function clientOptions(parsed: ParsedArgs): WorkspaceClientOptions {
  return {
    config: loadConfig(),
    plugins: bundledPlugins(),
    // The bundled set is a catalog: only config-referenced plugins activate,
    // so `paw doctor` on a plain config reports an empty set instead of
    // booting both runtimes into a service conflict.
    catalog: true,
    // --headless fails closed on approvals (spec section 97).
    approvalFlow: parsed.headless
      ? undefined
      : {
          confirm: async (request) => {
            process.stderr.write(
              `Approval required: ${request.operation} on ${request.target} (plugin: ${request.pluginId}). [y/N] `
            );
            const answer = await new Promise<string>((resolve) => {
              let buf = "";
              const onData = (chunk: Buffer) => {
                buf += chunk.toString("utf8");
                if (buf.includes("\n")) {
                  process.stdin.removeListener("data", onData);
                  resolve(buf.trim());
                }
              };
              process.stdin.on("data", onData);
            });
            return answer.toLowerCase() === "y" ? ("approved" as const) : ("denied" as const);
          },
        },
  };
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.command === undefined || parsed.command === "help" || parsed.flags["help"] === true) {
    const text = [
      "paw — the programmable workspace for AI agents",
      "",
      "Usage: paw <command> [args] [--json] [--headless]",
      "",
      "Commands:",
      "  doctor        Health of every plugin and provider",
      "  plugin list   Registered plugins and their capabilities",
      "  service list  Registered capability services",
      "  config show   Effective workspace configuration",
      "  verify        Run the configured verification commands",
      "",
      "Global flags: --json (machine-readable), --headless (fail closed on approvals)",
    ].join("\n");
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ commands: ["doctor", "plugin list", "service list", "config show", "verify"] }, null, 2)}\n`);
    } else {
      process.stdout.write(`${text}\n`);
    }
    return 0;
  }

  const client = new WorkspaceClient(clientOptions(parsed));

  try {
    switch (parsed.command) {
      case "doctor": {
        const report = await client.doctor();
        if (parsed.json) {
          process.stdout.write(`${JSON.stringify({ command: "doctor", entries: report }, null, 2)}\n`);
        } else {
          for (const entry of report) {
            process.stdout.write(`${entry.pluginId.padEnd(20)} ${entry.health.status.padEnd(12)} ${entry.health.message}\n`);
          }
          if (report.length === 0) process.stdout.write("No plugins report health.\n");
        }
        const unhealthy = report.filter((r) => r.health.status === "unavailable").length;
        return unhealthy > 0 ? 1 : 0;
      }

      case "plugin": {
        if (parsed.args[0] !== "list") {
          process.stderr.write("usage: paw plugin list [--json]\n");
          return 2;
        }
        const plugins = await client.pluginList();
        if (parsed.json) {
          process.stdout.write(`${JSON.stringify({ command: "plugin list", plugins }, null, 2)}\n`);
        } else {
          for (const p of plugins) {
            process.stdout.write(`${p.id.padEnd(20)} v${p.version.padEnd(8)} ${p.capabilities.join(", ")}\n`);
          }
        }
        return 0;
      }

      case "service": {
        if (parsed.args[0] !== "list") {
          process.stderr.write("usage: paw service list [--json]\n");
          return 2;
        }
        const services = await client.serviceList();
        if (parsed.json) {
          process.stdout.write(`${JSON.stringify({ command: "service list", services }, null, 2)}\n`);
        } else {
          for (const s of services) {
            process.stdout.write(`${s.id.padEnd(20)} contract ${s.contractVersion.padEnd(8)} by ${s.pluginId}\n`);
          }
        }
        return 0;
      }

      case "config": {
        if (parsed.args[0] !== "show") {
          process.stderr.write("usage: paw config show [--json]\n");
          return 2;
        }
        const config = await client.effectiveConfig();
        process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
        return 0;
      }

      case "verify": {
        // Verification runs the configured commands through the verification
        // capability once a runtime plugin is active; guarded by approval.
        const ws = await client.start();
        const config = ws.config;
        const commands = config.verification?.commands ?? [];
        if (commands.length === 0) {
          process.stdout.write(
            `${JSON.stringify({ command: "verify", ok: true, results: [], message: "no verification commands configured" }, null, 2)}\n`
          );
          return 0;
        }
        const shell = await client.service(shellService);
        const results: { command: string; exitCode: number; durationMs: number }[] = [];
        for (const command of commands) {
          const result = await shell.exec({ command, timeoutMs: 600_000 });
          results.push({ command, exitCode: result.exitCode, durationMs: result.durationMs });
        }
        const ok = results.every((r) => r.exitCode === 0);
        process.stdout.write(`${JSON.stringify({ command: "verify", ok, results }, null, 2)}\n`);
        return ok ? 0 : 1;
      }

      default: {
        const payload = {
          code: "CONFIG_INVALID",
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
  } finally {
    await client.stop();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(2);
  });
