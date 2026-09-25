# Agent Bootstrap

One line turns any repository into a ProAgents Workspace — pasted into any
coding agent, with no pre-installed CLI (spec section 152).

## The UX

```text
Setup https://github.com/EnzoVezzaro/proagents-workspace for @README.md (project's instructions).
```

The agent reads the bootstrap protocol ([`install/AGENT.md`](https://github.com/EnzoVezzaro/proagents-workspace/blob/main/install/AGENT.md)) and runs:

```bash
npx @reposell/proagents-workspace@latest init
```

(`install` is a stable alias for the same machine.)

## The six stages

```text
resolve  →  acc  →  shield  →  proagents  →  reposell  →  paw
```

| Stage | What happens |
|-------|--------------|
| resolve | Detects languages, runtime, package manager, frameworks, monorepo, coding agents; decides where identity comes from — code AND README, else README, else code, else the questionnaire |
| acc | Writes the ACC knowledge layer (`.acc/config/config.yaml`) from detected languages only — every inference names its source |
| shield | Writes the Repo Shield policy (`.reposhield/policy.yaml`): what must never happen, refused before execution |
| proagents | Writes WHO operates: profiles (`.proagents/profiles/`), a crew wired to ACC context (`.proagents/crew/`), the environment config (`.proagents/config.yaml`) |
| reposell | Writes the distribution posture (`.reposell/distribution.yaml`) — consumed, never re-implemented by the workspace |
| paw | Creates `.paw/` LAST — the config that names the protection and distribution providers — plus `AGENTS.md` when absent; reports verification and lifecycle |

`.paw/` is written last on purpose: the config names the layers it configures,
so writing it first would reference files that do not exist yet.

## Starting from a file

The `@README.md` in the prompt is a semantic contract — the workspace starts from the project's own description. Make it explicit by passing the source file (any text file):

```bash
paw init README.md       # init with intent inferred from README.md
paw init BRIEF.md        # init driven by BRIEF.md (alias: paw install BRIEF.md)
```

The inferred intent is persisted as a `project:` block in the generated
`.paw/workspace.yaml` — informational, named sources, edit freely. An
unreadable source file is a structured `INTENT_SOURCE_UNREADABLE` error.

## The questionnaire — empty repositories

When a repository cannot describe itself (no code, no README), the installer
does not guess. It asks five questions:

1. What is this project? (web app / CLI tool / API / library / desktop app / …)
2. What does it do, in one sentence?
3. Which technologies/languages do you plan to use?
4. How will it be distributed? (drives the reposell layer)
5. How strict should protection be? (drives the shield layer; default `guarded`)

Interactive (a terminal): `paw init` asks them inline and applies the intent
immediately. Headless (agents, CI): the report prints the exact command:

```bash
paw init --answers "web app" "a task manager" "TypeScript" "open source" "guarded"
```

Until the interview is answered, the layers are scaffolded but no `project:`
block is written — a scaffolded workspace is reported as such, never as
"ready".

## Guarantees

- **Metadata-only** — application code, `package.json`, and git state are never touched (spec section 44).
- **Preserving** — existing `AGENTS.md`, `.paw/`, `.acc/`, `.reposhield/`, `.proagents/`, and `.reposell/` files are never overwritten.
- **Idempotent** — running twice changes nothing the second time.
- **Honest** — an indescribable repository gets the questionnaire, not a guess; nothing claims "ready" while the project intent is unknown.
- **Accountless** — no token, no sign-up; network use is npx itself.
- **Agent-namespace-clean** — the installer never writes into `.agents/` (agent-owned).

## The contract files

| File | Role |
|------|------|
| `install/manifest.yaml` | Machine-readable package metadata (name, version, install command, config dir, requires) |
| `install/install.yaml` | The install contract as data — the unit tests are its executable form |
| `install/AGENT.md` | The bootstrap protocol for external agents |
| `install/instructions.md` | The human-facing install guide |
