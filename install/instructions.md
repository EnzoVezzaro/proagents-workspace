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
npx @reposell/proagents-workspace@latest init
```

(`install` is a stable alias for the same machine.)

## What the install does

Six stages, metadata only (see [install.yaml](install.yaml)):

```
resolve  →  acc  →  shield  →  proagents  →  reposell  →  paw
```

| Stage | What happens |
|-------|--------------|
| resolve | Detects languages, runtime, package manager, frameworks, monorepo, coding agents; decides where identity comes from: code AND README, else README, else code, else the questionnaire |
| acc | Writes the ACC knowledge layer (`.acc/config/config.yaml`) from DETECTED languages only |
| shield | Writes the Repo Shield policy (`.reposhield/policy.yaml`) — what must never happen, enforced before execution |
| proagents | Writes WHO operates — profiles (`.proagents/profiles/`), a crew wired to ACC context (`.proagents/crew/`), the environment config (`.proagents/config.yaml`) |
| reposell | Writes the distribution posture (`.reposell/distribution.yaml`) — consumed, never re-implemented |
| paw | Creates `.paw/` LAST — the config that names the protection and distribution providers — plus `AGENTS.md` when absent; reports the verification plan |

What it NEVER does: modify application code, rewrite `package.json`,
change git state, overwrite an existing configuration file, write into
`.agents/` (agent-owned), or require an account.

## What the repository looks like afterwards

```
repo/
├── AGENTS.md                  ← agent notes (only if none existed)
├── .acc/config/               ← ACC knowledge layer (optional at runtime)
├── .reposhield/policy.yaml    ← the rules: enforcement before execution
├── .proagents/                ← WHO operates
│   ├── profiles/              ← one persona contract per profession
│   ├── crew/                  ← crews wired to ACC context + COMMENTS.md
│   └── config.yaml            ← the agent environment
├── .reposell/distribution.yaml ← licensing + distribution (consumed)
└── .paw/                      ← runtime configuration
    ├── workspace.yaml         ← minimal config; ties the layers together
    ├── sessions/
    └── artifacts/
```

## The distribution thesis

> The GitHub repository is the distribution package; `AGENTS.md` is the
> universal bootstrap protocol; `npx @reposell/proagents-workspace@latest`
> is the deterministic installer; `.paw/` is the runtime configuration.

## The init process — every path, one machine

| Context | Command |
|---------|---------|
| Agent-led, no CLI installed (canonical) | `npx @reposell/proagents-workspace@latest init README.md` |
| `paw` installed, init from a file | `paw init README.md` |
| `paw` installed, plain init | `paw init` |
| Empty repository (no code, no README) | `paw init` in a terminal asks five questions; headless: `paw init --answers "web app" "one sentence" "TypeScript" "open source" "guarded"` |
| Inspect after init | `paw status` |

All paths run the same six-stage contract and end with the same layout
above; the file argument makes the intent explicit and persists it as the
`project:` block in `.paw/workspace.yaml`.

## Flags

```bash
npx @reposell/proagents-workspace@latest init --json      # machine-readable report
npx @reposell/proagents-workspace@latest init --verify    # also run verification checks
npx @reposell/proagents-workspace@latest init --answers "…" "…" "…" "…" "…"  # headless interview
```

Already initialized? Running init again is a no-op (idempotent) — use
`paw status` directly instead.

## The install/ contract folder

The files next to this guide are the machine-readable statements of the
process above:

- [`manifest.yaml`](manifest.yaml) — package metadata, the installer command, the configuration directory
- [`install.yaml`](install.yaml) — the install contract as data: the six stages, what is written, what is NEVER touched
- [`AGENT.md`](AGENT.md) — the protocol an external coding agent follows
- [`../templates/AGENTS.md`](../templates/AGENTS.md) — the shape of the AGENTS.md generated in the target repository
