/**
 * Threat-modeling STAGE plugin (spec section 151 §12): contributes a
 * THREAT_MODEL phase after `research` — proving the lifecycle itself is
 * extensible without touching the kernel. Contributions are DATA.
 */
import { definePlugin } from "@proagents/workspace";

export const threatModelingStagePlugin = definePlugin({
  manifest: {
    id: "stage-threat-modeling",
    provider: "threat-modeling",
    name: "Threat Modeling Stage",
    version: "0.3.0",
    description: "Adds a THREAT_MODEL phase after research: STRIDE-style review of the checkpoint scope",
    capabilities: ["lifecycle"],
    category: "stage",
    dependencies: [],
    permissions: [],
    compatibility: { workspaceApi: "^1.0.0" },
    lifecycleStages: [
      {
        phase: "custom",
        after: "research",
        id: "threat-model",
        title: "Threat model the plan",
        execution: "manual",
      },
    ],
  },
  activate() {
    // Contributions are data; no services needed. Execution (if any) is a
    // command/manual phase the host runs.
  },
});
