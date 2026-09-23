/**
 * Bundled plugin registry for the control-room UI — the same catalog the CLI
 * ships. Catalog semantics: plugins activate only when the workspace config
 * references them (by id or capability), so the UI boots with exactly the
 * capabilities the environment asks for.
 */
import type { PluginDefinition } from "@proagents/workspace";
import { filesystemPlugin } from "@proagents/plugin-filesystem";
import { shellPlugin } from "@proagents/plugin-shell";
import { gitPlugin } from "@proagents/plugin-git";
import { localRuntimePlugin } from "@proagents/plugin-runtime-local";
import { dockerRuntimePlugin } from "@proagents/plugin-runtime-docker";
import { accContextPlugin } from "@proagents/plugin-context-acc";
import { codexAgentPlugin } from "@proagents/plugin-agent-codex";
import { repoShieldPlugin } from "@proagents/plugin-repo-shield";
import { agentClaudePlugin, agentCodexPlugin, agentOpencodePlugin, agentGeminiPlugin } from "@proagents/plugin-agent-cli";
import { agentDshPlugin } from "@proagents/plugin-agent-dsh";
import { lifecycleWebPlugin } from "@proagents/plugin-lifecycle-web";
import { lifecycleSecurityPlugin } from "@proagents/plugin-lifecycle-security";

export function bundledPlugins(): PluginDefinition[] {
  return [
    filesystemPlugin,
    pluginOf(agentClaudePlugin),
    pluginOf(agentDshPlugin),
    pluginOf(agentCodexPlugin), // codex also has its own plugin; the CLI one activates when referenced
    pluginOf(agentOpencodePlugin),
    pluginOf(agentGeminiPlugin),
    shellPlugin,
    gitPlugin,
    localRuntimePlugin,
    dockerRuntimePlugin,
    accContextPlugin,
    codexAgentPlugin,
    repoShieldPlugin,
    // Lifecycle definition plugins (spec §146): pure data contributors —
    // the wizard references their definitions by id in config.
    lifecycleWebPlugin(),
    lifecycleSecurityPlugin(),
  ];
}

/**
 * The CLI agent plugins come from `cliAgentPlugin()` factories; they are
 * singletons here, but the workspace entry selects them by id, so the same
 * definition object re-entering the catalog is fine (catalog = available,
 * activation = per workspace scope).
 */
function pluginOf(definition: PluginDefinition): PluginDefinition {
  return definition;
}
