# plugin-agent-dsh

DeepSeek Harness agent capability provider — drives the REAL DSH engine
(`@deepseek-ai/dsh`, npm) as a per-workspace terminal process
(`dsh --profile headless --json <task>` with cwd pinned to the workspace
root). The harness owns the agent loop, model routing, credentials, tools,
and its sandbox; this adapter observes the NDJSON event stream
(`session`, `tool_call`, `tool_result`, `final`) onto the Workspace's
normalized `session/*` and `tool/*` events, and surfaces DSH's own
diagnostics verbatim (`MISSING_CREDENTIAL`, `PI_AI_ERROR`, …) — never a
silent downgrade.

## Dependencies

- packages/ (capability contracts and the SDK surface this plugin is built on)
- plugins/ (the bundled capability catalog this plugin registers its agent
  adapter into; agents activate per workspace scope, spec section 141)
