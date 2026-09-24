/**
 * Canonical lifecycle CLI support (spec section 151).
 *
 * `paw lifecycle show` composes the effective flow — canonical default (or
 * the config's `lifecycleFlow` override) PLUS stage contributions from
 * activated `stage` plugins — so the developer sees exactly what the
 * workspace will run, in order, before running it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { WorkspaceClient, WorkspaceError, type WorkspaceClientOptions, type WorkspaceConfig, type LifecycleFlow } from "@proagents/workspace";
import { WorkspaceLifecycleRunner, composeFlow } from "@proagents/workspace";

import { bundledStageContributions } from "./plugins.js";

export function effectiveFlow(config: WorkspaceConfig): LifecycleFlow {
  const base = composeFlow(config);
  const spliced = spliceContributions(base, bundledStageContributions());
  return spliced;
}

function spliceContributions(flow: LifecycleFlow, contributions: readonly { phase: string; after: string; id: string; title: string }[]): LifecycleFlow {
  const stages = [...flow.stages];
  for (const c of contributions) {
    const anchorIndex = stages.findIndex((s) => s.phase === c.after || s.id === c.after);
    if (anchorIndex === -1) continue;
    stages.splice(anchorIndex + 1, 0, {
      phase: c.phase as LifecycleFlow["stages"][number]["phase"],
      id: c.id,
      title: c.title,
      policy: { parallel: false, required: true, onFailure: "stop" as const, maxRetries: 1 },
    });
  }
  return { ...flow, stages };
}

export async function runLifecycleCommand(
  sub: string,
  options: { projectRoot: string; parsed: { json: boolean; flags: Record<string, string | boolean> }; clientOptions: (config: unknown) => WorkspaceClientOptions; config: unknown }
): Promise<number> {
  const { projectRoot, parsed, clientOptions } = options;
  const config = options.config as WorkspaceConfig;
  const flow = effectiveFlow(config);

  if (sub === "show" || sub === undefined) {
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ command: "lifecycle show", flow }, null, 2)}\n`);
      return 0;
    }
    process.stdout.write(`Lifecycle: ${flow.title} (${flow.stages.length} phases)\n\n`);
    for (const [i, stage] of flow.stages.entries()) {
      const execution = stage.execution ?? (stage.phase === "develop" || stage.phase === "verify" ? "checkpoint-plan" : "manual");
      process.stdout.write(`  ${i + 1}. ${(stage.id ?? stage.phase).padEnd(18)} ${stage.phase.padEnd(10)} ${execution}\n`);
    }
    process.stdout.write("\nExecutors are plugins — phases without a registered executor are skipped and reported honestly.\n");
    return 0;
  }

  if (sub === "status") {
    const statePath = path.join(projectRoot, ".paw", "state", "lifecycle-state.json");
    if (!existsSync(statePath)) {
      process.stdout.write(`${JSON.stringify({ command: "lifecycle status", exists: false, statePath: ".paw/state/lifecycle-state.json" }, null, 2)}\n`);
      return 0;
    }
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    process.stdout.write(`${JSON.stringify({ command: "lifecycle status", exists: true, ...state }, null, 2)}\n`);
    return 0;
  }

  if (sub === "run") {
    const client = new WorkspaceClient(clientOptions(config));
    try {
      const ws = await client.start();
      const { CheckpointRunner } = await import("@proagents/workspace");
      const checkpointRunner = new CheckpointRunner({
        services: ws.services,
        events: ws.events,
        projectRoot,
        execCommand: async (command) => {
          const workspace = await import("@proagents/workspace");
          const shell = workspace.defineService<import("@proagents/workspace").ShellProvider>({ id: "shell", contractVersion: "1.0.0" });
          const provider = await client.service(shell);
          const result = await provider.exec({ command, cwd: projectRoot, timeoutMs: 600_000 });
          return { exitCode: result.exitCode };
        },
      });
      const runner = new WorkspaceLifecycleRunner(
        {
          services: ws.services,
          events: ws.events,
          projectRoot,
          stateDir: path.join(projectRoot, ".paw", "state"),
          runCheckpointPlan: async (plan: import("@proagents/workspace").CheckpointPlan) => {
            const results = await checkpointRunner.runPlan(plan);
            return { passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length };
          },
        },
        flow
      );
      const outcomes = await runner.run();
      const failed = outcomes.find((o) => o.status === "failed");
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify({ command: "lifecycle run", ok: failed === undefined, flow: flow.title, outcomes }, null, 2)}\n`);
      } else {
        process.stdout.write(`Lifecycle: ${flow.title}\n\n`);
        for (const o of outcomes) {
          const mark = o.status === "completed" ? "✓" : o.status === "skipped" ? "○" : "✗";
          process.stdout.write(`${mark} ${o.phase.padEnd(18)} ${o.status}${o.reason !== undefined ? ` — ${o.reason}` : ""}\n`);
        }
        process.stdout.write(`\nResult: ${failed === undefined ? "FLOW COMPLETE" : `FAILED at ${failed.phase}`}\n`);
      }
      return failed === undefined ? 0 : 1;
    } finally {
      await client.stop();
    }
  }

  process.stderr.write("usage: paw lifecycle [show|run|status] [--json]\n");
  return 2;
}

export { WorkspaceError };
