/**
 * Human gate plugin (spec section 150 §11): the HUMAN is the product
 * authority, not the implementation engine. The gate asks the approval flow
 * the checkpoint's acceptance question; "denied" produces a finding that the
 * host converts into a new checkpoint (feedback → learning → rework).
 * Honesty rule (spec sections 24/142): in `autonomous` approval mode this
 * gate CANNOT block — it reports `skipped` with an advisory note instead of
 * pretending a human looked at the work.
 */
import { definePlugin, defineService } from "@proagents/workspace";
import type { GateContext, GateProvider, GateResult } from "@proagents/workspace";

const gateDefinition = defineService<GateProvider>({
  id: "gate:human",
  contractVersion: "1.0.0",
});

export const humanGatePlugin = definePlugin({
  manifest: {
    id: "gate-human",
    provider: "human",
    name: "Human Gate (Product Authority)",
    version: "0.3.0",
    description: "Product-authority approval for a checkpoint; honest advisory reporting in autonomous mode",
    capabilities: ["gate"],
    dependencies: [],
    permissions: [],
    compatibility: { workspaceApi: "^1.0.0" },
  },
  activate(ctx) {
    const provider: GateProvider = {
      name: "gate-human",
      contractVersion: "1.0.0",
      health: async () => ({
        status: "healthy",
        message: `approval mode: ${ctx.config.approval?.mode ?? "guarded"} (${(ctx.config.approval?.mode ?? "guarded") === "autonomous" ? "advisory only" : "blocking"})`,
      }),
      async evaluate(context: GateContext): Promise<GateResult> {
        const started = Date.now();
        const mode = ctx.config.approval?.mode ?? "guarded";
        if (mode === "autonomous") {
          // Honest degradation: no human is available in autonomous mode.
          return {
            gateId: context.gate.id,
            status: "skipped",
            findings: [],
            durationMs: Date.now() - started,
            note: "advisory: approval.mode is autonomous — no human reviewed this checkpoint",
          };
        }
        const question =
          (context.gate.config?.["question"] as string | undefined) ??
          `Does checkpoint "${context.checkpoint.title}" solve the problem and match the product intent?`;
        const decision = await ctx.permissions.approve(
          { operation: "checkpoint.human-gate", target: `${context.checkpoint.id}: ${question}`, pluginId: "gate-human" },
          true
        );
        return {
          gateId: context.gate.id,
          status: decision === "approved" ? "passed" : "failed",
          findings:
            decision === "approved"
              ? []
              : [{
                  severity: "blocker",
                  location: "human-review",
                  issue: "human review rejected the checkpoint",
                  suggestion: (context.gate.config?.["rejectHint"] as string | undefined) ?? "Record the feedback as learnings and plan a follow-up checkpoint",
                }],
          durationMs: Date.now() - started,
          note: "blocking: the approval flow gate asked for product-authority judgment",
        };
      },
    };
    ctx.services.register(gateDefinition, provider, "gate-human");
  },
});
