/**
 * Adversarial gate plugin (spec section 150 §8): a reviewer agent attacks the
 * checkpoint's work — with FRESH context (checkpoint + diff + acceptance
 * criteria, never the implementer's conversation) — and the gate passes only
 * on ZERO unresolved blocker findings. Review execution delegates to the
 * workspace's registered AgentProvider; without one the gate reports
 * `skipped` with an honest note rather than a fabricated pass. A failed gate
 * returns structured findings the host feeds to a fixer agent, closing the
 * implement → adversarial → fix → re-review loop.
 */
import { definePlugin, defineService } from "@proagents/workspace";
import type { AgentProvider, GateContext, GateProvider, GateResult } from "@proagents/workspace";

const gateDefinition = defineService<GateProvider>({
  id: "gate:adversarial",
  contractVersion: "1.0.0",
});

/** Parses the reviewer's output: lines like `- blocker|location|issue`. */
function parseFindings(output: string): { severity: "blocker" | "major" | "minor" | "note"; location: string; issue: string }[] {
  const findings: { severity: "blocker" | "major" | "minor" | "note"; location: string; issue: string }[] = [];
  for (const line of output.split("\n")) {
    const match = /^[-*]\s*(blocker|major|minor|note)\s*\|\s*([^|]+)\|\s*(.+)$/i.exec(line.trim());
    if (match) {
      findings.push({
        severity: match[1]!.toLowerCase() as "blocker" | "major" | "minor" | "note",
        location: match[2]!.trim(),
        issue: match[3]!.trim(),
      });
    }
  }
  return findings;
}

export const adversarialGatePlugin = definePlugin({
  manifest: {
    id: "gate-adversarial",
    provider: "adversarial",
    name: "Adversarial Gate (Fresh-Context Reviewer)",
    version: "0.3.0",
    description: "Agent-driven adversarial review of checkpoint work; passes only on zero unresolved blockers",
    capabilities: ["gate"],
    dependencies: [],
    permissions: ["shell"],
    compatibility: { workspaceApi: "^1.0.0" },
  },
  activate(ctx) {
    const agentDefinition = defineService<AgentProvider>({ id: "agent", contractVersion: "1.0.0" });
    const provider: GateProvider = {
      name: "gate-adversarial",
      contractVersion: "1.0.0",
      health: async () => ({
        status: ctx.services.has(agentDefinition) ? "healthy" : "degraded",
        message: ctx.services.has(agentDefinition) ? "reviewer agent registered" : "no reviewer agent registered — gate reports skipped (advisory)",
      }),
      async evaluate(context: GateContext): Promise<GateResult> {
        const started = Date.now();
        if (!ctx.services.has(agentDefinition)) {
          return {
            gateId: context.gate.id,
            status: "skipped",
            findings: [],
            durationMs: Date.now() - started,
            note: "advisory: no reviewer agent registered — adversarial review did not run (add an agent plugin)",
          };
        }
        const agent = await (async () => {
          const registrations = ctx.services.registrations();
          const match = registrations.find((r) => r.definition.id === "agent");
          return match!.implementation as AgentProvider;
        })();
        const session = await agent.startSession({ workingDirectory: context.projectRoot });
        try {
          // FRESH CONTEXT: the reviewer receives the checkpoint contract —
          // never an implementer's conversation history (spec section 150).
          const criteria = context.checkpoint.acceptanceCriteria.map((c) => `- ${c.description}`).join("\n") || "(none declared)";
          const prompt = [
            `Adversarially review the current working tree against checkpoint "${context.checkpoint.title}".`,
            context.checkpoint.description ?? "",
            `Acceptance criteria:\n${criteria}`,
            "Hunt for real defects, security issues, and unmet criteria. Do NOT grade your own assumptions.",
            "Report findings EXACTLY one per line as: - <blocker|major|minor|note> | <location> | <issue>",
            "If there are no findings, output exactly: NO_FINDINGS",
          ]
            .filter(Boolean)
            .join("\n\n");
          const result = await agent.run(session, { text: prompt, workingDirectory: context.projectRoot });
          const findings = result.output.includes("NO_FINDINGS") ? [] : parseFindings(result.output);
          const blockers = findings.filter((f) => f.severity === "blocker");
          return {
            gateId: context.gate.id,
            status: blockers.length === 0 ? "passed" : "failed",
            findings,
            durationMs: Date.now() - started,
            note: `reviewer verdict: ${blockers.length} blocker(s), ${findings.length} finding(s) total`,
          };
        } finally {
          await agent.stopSession(session);
        }
      },
    };
    ctx.services.register(gateDefinition, provider, "gate-adversarial");
  },
});
