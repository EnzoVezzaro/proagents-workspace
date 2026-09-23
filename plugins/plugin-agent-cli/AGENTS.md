# plugin-agent-cli

CLI agent capability providers (claude, codex, opencode, gemini) for ProAgents
Workspace. Each adapter probes for its binary on PATH with honest availability
detection (`AGENT_PROVIDER_UNAVAILABLE` when missing, never silent degradation)
and runs the CLI in the working directory of the workspace it is hired into.

## Dependencies

- packages/ (capability contracts and the SDK surface this plugin is built on)
- plugins/ (the bundled capability catalog this plugin registers its agent
  adapters into; agents activate per workspace scope, spec section 141)
