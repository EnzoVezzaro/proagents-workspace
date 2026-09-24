# Installing ProAgents Workspace (spec section 152)

One line — no pre-installed CLI, no account:

```text
Setup https://github.com/EnzoVezzaro/proagents-workspace for @README.md (project's instructions).
```

Paste that into any coding agent that can run shell commands
(Claude Code, Codex, Gemini CLI, OpenCode, …). The agent reads the
repository's bootstrap protocol (`install/AGENT.md`) and runs the
deterministic installer:

```bash
npx @reposell/proagents-workspace@latest install
```

## What the install does

Five phases, metadata only (see [install.yaml](install.yaml)):

```
inspect  →  understand  →  initialize  →  configure  →  verify
```

| Phase | What happens |
|-------|--------------|
| inspect | Detects languages, runtime, package manager, frameworks, monorepo, coding agents |
| understand | Infers project intent (product type, domains, skills) from `README.md` + manifests |
| initialize | Creates `.paw/` metadata (config, sessions, artifacts) — existing config is preserved |
| configure | Writes `AGENTS.md` agent notes when absent; reports the verification plan and lifecycle |
| verify | Reports the verification plan; executes checks only with `--verify` |

What it NEVER does: modify application code, rewrite `package.json`,
change git state, overwrite an existing configuration file, or require an
account.

## What the repository looks like afterwards

```
repo/
├── AGENTS.md              ← agent notes (only if none existed)
└── .paw/                  ← runtime configuration
    ├── workspace.yaml     ← minimal config; everything else is inferred
    ├── sessions/
    └── artifacts/
```

## The distribution thesis

> The GitHub repository is the distribution package; `AGENTS.md` is the
> universal bootstrap protocol; `npx @reposell/proagents-workspace@latest`
> is the deterministic installer; `.paw/` is the runtime configuration.

## Flags

```bash
npx @reposell/proagents-workspace@latest install --json      # machine-readable report
npx @reposell/proagents-workspace@latest install --verify    # also run verification checks
```

Already initialized? Running install again is a no-op (idempotent) — use
`paw init` / `paw status` directly instead.
