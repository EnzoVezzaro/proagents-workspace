/**
 * Security gate plugin (spec section 150 §7): makes RepoShield part of the
 * CONTINUOUS checkpoint loop, not just initialization. Evaluation delegates
 * to the workspace's registered ProtectionProvider (repo-shield) — this gate
 * never implements security logic itself (kernel purity, spec 139). When no
 * protection provider is registered the gate FAILS CLOSED: unverified
 * security is a finding, not a pass.
 */
import { definePlugin, defineService } from "@proagents/workspace";
import type { GateContext, GateProvider, GateResult, ProtectionProvider } from "@proagents/workspace";

const gateDefinition = defineService<GateProvider>({
  id: "gate:security",
  contractVersion: "1.0.0",
});

export const securityGatePlugin = definePlugin({
  manifest: {
    id: "gate-security",
    provider: "security",
    name: "Security Gate (Repo Shield)",
    version: "0.3.0",
    description: "Runs the protection layer's evaluation as a checkpoint gate — fails closed without a provider",
    capabilities: ["gate"],
    dependencies: [],
    permissions: [],
    compatibility: { workspaceApi: "^1.0.0" },
  },
  activate(ctx) {
    const protectionDefinition = defineService<ProtectionProvider>({ id: "protection", contractVersion: "1.0.0" });
    const provider: GateProvider = {
      name: "gate-security",
      contractVersion: "1.0.0",
      health: async () => ({
        status: ctx.services.has(protectionDefinition) ? "healthy" : "degraded",
        message: ctx.services.has(protectionDefinition) ? "delegates to the registered protection provider" : "no protection provider registered — gate will fail closed",
      }),
      async evaluate(context: GateContext): Promise<GateResult> {
        const started = Date.now();
        if (!ctx.services.has(protectionDefinition)) {
          // Fail closed (spec section 24): a security gate without a security
          // brain must never claim "passed".
          return {
            gateId: context.gate.id,
            status: "failed",
            findings: [{
              severity: "blocker",
              location: "security",
              issue: "no protection provider registered — security cannot be verified for this checkpoint",
              suggestion: "Add the repo-shield plugin to the workspace configuration",
            }],
            durationMs: Date.now() - started,
            note: "fail-closed: unverified security is a finding, not a pass",
          };
        }
        const protection = await (async () => {
          // Resolve through the registry (sanctioned access, spec section 7).
          const registrations = ctx.services.registrations();
          const match = registrations.find((r) => r.definition.id === "protection");
          return match!.implementation as ProtectionProvider;
        })();
        const decision = await protection.evaluate({
          operation: `checkpoint:${context.checkpoint.id}`,
          target: context.checkpoint.scope?.files.join(",") || context.projectRoot,
          details: { gateId: context.gate.id, gates: context.checkpoint.gates.length },
        });
        return {
          gateId: context.gate.id,
          status: decision.action === "block" ? "failed" : "passed",
          findings:
            decision.action === "block"
              ? [{ severity: "blocker", location: "security", issue: decision.reason }]
              : [],
          durationMs: Date.now() - started,
          note: `protection verdict: ${decision.action} — ${decision.reason}`,
        };
      },
    };
    ctx.services.register(gateDefinition, provider, "gate-security");
  },
});
