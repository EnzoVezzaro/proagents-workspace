# ProAgents Workspace (`paw`)

The **convention-first workspace for AI coding agents** — a lightweight developer CLI that makes existing AI coding agents work better inside a predictable, inspectable, convention-driven environment.

```bash
npm install -g @reposell/proagents-workspace

cd my-project
paw init README.md   # Workspace-aware repo — intent inferred from YOUR README, persisted to .paw/workspace.yaml
paw status           # where am I, what is here, what is possible
paw verify           # runs detected lint/typecheck/test/build — no configuration needed
codex                # your existing agent keeps working
```

No CLI at all? Paste this into any coding agent (Claude Code, Codex, Gemini CLI, …):

```text
Setup https://github.com/EnzoVezzaro/proagents-workspace for @README.md (project's instructions).
```

The agent follows the [bootstrap protocol](https://github.com/EnzoVezzaro/proagents-workspace/blob/main/install/AGENT.md) and runs `npx @reposell/proagents-workspace@latest init README.md` — the six-stage bootstrap: resolve → acc → shield → proagents → reposell → paw (`install` is a stable alias).

For the complete **install → set up → complete** contract — a ready-to-paste start prompt, the long-run operating playbook (finish line, stop conditions, evidence-checked subagents, self-review), the verification gates, failure handling, and the final report — see the [PAW Installation Runbook](https://github.com/EnzoVezzaro/proagents-workspace/blob/main/docs/paw-install-runbook.md).

**No runtime required. No cloud account required. No desktop application required.**

Works with Codex, Claude Code, OpenCode, Gemini CLI, DeepSeek Harness, and custom agents — the Workspace improves the environment around your agent; it never replaces it.

## Commands

| Command | What it does |
|---|---|
| `paw init [file]` | The workspace BOOTSTRAPPER: runs the six-stage bootstrap (resolve → acc → shield → proagents → reposell → paw), writing each layer's configuration; with a file (e.g. `README.md`) the inferred intent is persisted as the `project:` block |
| `paw install [file]` | Stable alias of `paw init` — the same six-stage bootstrap, both spellings everywhere |
| `paw lifecycle show` | The canonical phase flow this workspace runs (create → … → operate) |
| `paw status` | Where am I, what project, what branch, what agents, what verification |
| `paw research` | Product/environment discovery (ACC-aware); hands agent requirements to ProAgents |
| `paw doctor` | Diagnostics — optional components are marked optional, never failed |
| `paw verify` | Runs detected or configured checks (lint → typecheck → test → build) |
| `paw diff` | Git working-tree diff |
| `paw agent list` | Detected agents with honest integration tiers |
| `paw --json` | Every important command has machine-readable output |

## Principles

- **Convention first** — everything that can be inferred locally is inferred before asking you to configure it
- **Local first** — the default workspace operates directly on your current repository; nothing is cloned or moved
- **Progressive** — isolated runtimes (Docker/E2B), lifecycle orchestration, and the desktop UI are opt-ins, invisible until they provide value

## Links

- [Documentation](https://github.com/EnzoVezzaro/proagents-workspace/tree/main/docs)
- [PAW Installation Runbook](https://github.com/EnzoVezzaro/proagents-workspace/blob/main/docs/paw-install-runbook.md) — the complete install-to-complete contract for an AI agent
- [Changelog](https://github.com/EnzoVezzaro/proagents-workspace/blob/main/CHANGELOG.md)
- [Contributing / source](https://github.com/EnzoVezzaro/proagents-workspace)

MIT © Enzo Vezzaro
