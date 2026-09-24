/**
 * Checkpoint CLI support (spec section 150): load a checkpoint plan and run
 * it through the kernel CheckpointRunner with the bundled gate plugins.
 *
 * Plan discovery order:
 *   1. `.paw/checkpoints.json` (the convention location)
 *   2. `checkpoints.plan` in `.paw/workspace.yaml` (path relative to root)
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  WorkspaceError,
  checkpointPlanSchema,
  type CheckpointPlan,
  type WorkspaceConfig,
} from "@proagents/workspace";
import { WorkspaceClient, type WorkspaceClientOptions } from "@proagents/workspace";
import type { ShellProvider } from "@proagents/workspace";
import { CheckpointRunner, orderCheckpoints } from "@proagents/workspace";

export function loadPlan(projectRoot: string, config?: WorkspaceConfig): CheckpointPlan {
  const conventionPath = path.join(projectRoot, ".paw", "checkpoints.json");
  const configuredPath = typeof (config?.checkpoints as { plan?: string } | undefined)?.plan === "string"
    ? path.join(projectRoot, (config!.checkpoints as { plan: string }).plan)
    : undefined;
  const planPath = existsSync(conventionPath) ? conventionPath : configuredPath;
  if (planPath === undefined || !existsSync(planPath)) {
    throw new WorkspaceError({
      code: "CHECKPOINT_PLAN_INVALID",
      message: "No checkpoint plan found.",
      recoverable: true,
      suggestions: [
        "Create .paw/checkpoints.json (see docs/checkpoints.md)",
        "Or set checkpoints.plan in .paw/workspace.yaml",
      ],
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(planPath, "utf8"));
  } catch (error) {
    throw new WorkspaceError({
      code: "CHECKPOINT_PLAN_INVALID",
      message: `Checkpoint plan is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      recoverable: true,
      suggestions: [`Fix ${path.relative(projectRoot, planPath)}`],
    });
  }
  const parsed = checkpointPlanSchema.safeParse(raw);
  if (!parsed.success) {
    throw new WorkspaceError({
      code: "CHECKPOINT_PLAN_INVALID",
      message: `Checkpoint plan invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      recoverable: true,
      suggestions: [`Fix ${path.relative(projectRoot, planPath)} against the schema in docs/checkpoints.md`],
    });
  }
  return parsed.data;
}

export interface CheckpointCliOptions {
  projectRoot: string;
  parsed: { flags: Record<string, string | boolean>; headless: boolean; json: boolean };
  clientOptions: (config: unknown) => WorkspaceClientOptions;
  config: unknown;
}

export async function runCheckpointsCommand(
  sub: string,
  options: CheckpointCliOptions
): Promise<number> {
  const { projectRoot, parsed, clientOptions, config } = options;
  const plan = loadPlan(projectRoot, config as WorkspaceConfig);
  const ordered = orderCheckpoints(plan);

  if (sub === "list" || sub === undefined) {
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ command: "checkpoint list", plan, order: ordered.map((c) => c.id) }, null, 2)}\n`);
      return 0;
    }
    process.stdout.write(`Plan: ${plan.title} (${plan.checkpoints.length} checkpoints)\n\n`);
    for (const c of ordered) {
      const deps = c.dependencies.length > 0 ? ` (after ${c.dependencies.join(", ")})` : "";
      const gates = c.gates.map((g) => g.kind).join(" → ");
      process.stdout.write(`  ${c.id}  ${c.title}${deps}\n        gates: ${gates}\n`);
    }
    return 0;
  }

  if (sub === "status") {
    const wanted = parsed.flags["checkpoint"];
    process.stdout.write(`${JSON.stringify({ command: "checkpoint status", plan: plan.title, order: ordered.map((c) => c.id) }, null, 2)}\n`);
    void wanted;
    return 0;
  }

  if (sub === "run") {
    const only = typeof parsed.flags["checkpoint"] === "string" ? parsed.flags["checkpoint"] : undefined;
    // Activate the gate plugins the plan references: merge the plan's gate
    // kinds/providers into the effective config (declarative, never a
    // hard-coded kind→implementation table — spec sections 139/150).
    const gateWanted = [...new Set(plan.checkpoints.flatMap((c) => c.gates.map((g) => g.provider ?? g.kind)))];
    const merged = {
      ...(config as Record<string, unknown>),
      plugins: [
        ...(((config as Record<string, unknown>)?.["plugins"] as { id: string }[] | undefined) ?? []),
        ...gateWanted.map((kind) => ({ id: `gate-${kind}` })),
      ],
      tools: [
        ...((((config as Record<string, unknown>)?.["tools"] as string[] | undefined) ?? [])),
        "shell",
      ],
    };
    const client = new WorkspaceClient(clientOptions(merged));
    try {
      const ws = await client.start();
      const runner = new CheckpointRunner({
        services: ws.services,
        events: ws.events,
        projectRoot,
        execCommand: async (command) => {
          const workspace = await import("@proagents/workspace");
          const shell = workspace.defineService<ShellProvider>({ id: "shell", contractVersion: "1.0.0" });
          const provider = await client.service(shell);
          const result = await provider.exec({ command, cwd: projectRoot, timeoutMs: 600_000 });
          return { exitCode: result.exitCode };
        },
      });
      const targets = only !== undefined ? ordered.filter((c) => c.id === only) : ordered;
      if (targets.length === 0) {
        throw new WorkspaceError({
          code: "CHECKPOINT_NOT_FOUND",
          message: `Checkpoint "${only}" is not in the plan.`,
          recoverable: true,
          suggestions: [`Run \`paw checkpoint list\` — known ids: ${ordered.map((c) => c.id).join(", ")}`],
        });
      }
      const results = [];
      for (const checkpoint of targets) {
        results.push(await runner.runCheckpoint(checkpoint));
      }
      const failed = results.find((r) => r.status === "failed");
      if (parsed.json) {
        process.stdout.write(`${JSON.stringify({ command: "checkpoint run", ok: failed === undefined, results }, null, 2)}\n`);
      } else {
        for (const r of results) {
          const mark = r.status === "passed" ? "✓" : "✗";
          process.stdout.write(`${mark} ${r.checkpointId} — ${r.status} (${r.attempts} gate attempts, ${r.durationMs}ms)\n`);
          for (const e of r.evidence) {
            process.stdout.write(`    ${e.status === "passed" ? "✓" : "✗"} ${e.gateId} (${e.gateKind})`);
            for (const f of e.findings) process.stdout.write(`\n        ${f.severity}: ${f.location} — ${f.issue}`);
            process.stdout.write("\n");
          }
        }
        process.stdout.write(`\nResult: ${failed === undefined ? "ALL CHECKPOINTS PASSED" : `FAILED at ${failed.checkpointId}`}\n`);
      }
      return failed === undefined ? 0 : 1;
    } finally {
      await client.stop();
    }
  }

  process.stderr.write("usage: paw checkpoint [list|run|status] [--checkpoint CP-001] [--json] [--headless]\n");
  return 2;
}
