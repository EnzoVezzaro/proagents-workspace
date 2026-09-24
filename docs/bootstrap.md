# Agent Bootstrap

One line turns any repository into a ProAgents Workspace — pasted into any
coding agent, with no pre-installed CLI (spec section 152).

## The UX

```text
Setup https://github.com/EnzoVezzaro/proagents-workspace for @README.md (project's instructions).
```

The agent reads the bootstrap protocol ([`install/AGENT.md`](https://github.com/EnzoVezzaro/proagents-workspace/blob/main/install/AGENT.md)) and runs:

```bash
npx @reposell/proagents-workspace@latest install
```

## The five phases

```text
inspect  →  understand  →  initialize  →  configure  →  verify
```

| Phase | What happens |
|-------|--------------|
| inspect | Detects languages, runtime, package manager, frameworks, monorepo, coding agents |
| understand | Infers project intent (product type, domains, skills) from `README.md` + manifests — every inference names its source |
| initialize | Creates `.paw/` metadata when absent; existing configuration is preserved |
| configure | Writes `AGENTS.md` agent notes when absent; reports the verification plan and lifecycle |
| verify | Reports the verification plan; executes only with `paw install --verify` |

## Starting from a file

The `@README.md` in the prompt is a semantic contract — the workspace starts from the project's own description. Make it explicit by passing the source file (any text file):

```bash
paw init README.md       # init with intent inferred from README.md
paw install BRIEF.md     # install driven by BRIEF.md
```

The inferred intent is persisted as a `project:` block in the generated
`.paw/workspace.yaml` — informational, named sources, edit freely. An
unreadable source file is a structured `INTENT_SOURCE_UNREADABLE` error.

## Guarantees

- **Metadata-only** — application code, `package.json`, and git state are never touched (spec section 44).
- **Preserving** — an existing `AGENTS.md` or `.paw/workspace.yaml` is never overwritten.
- **Idempotent** — running twice changes nothing the second time.
- **Honest** — a README-less, manifest-less directory still installs; inference reports `derived from: no manifests or README` rather than inventing facts.
- **Accountless** — no token, no sign-up; network use is npx itself.

## The contract files

| File | Role |
|------|------|
| `install/manifest.yaml` | Machine-readable package metadata (name, version, install command, config dir, requires) |
| `install/install.yaml` | The install contract as data — the unit tests are its executable form |
| `install/AGENT.md` | The bootstrap protocol for external agents |
| `install/instructions.md` | The human-facing install guide |
| `templates/AGENTS.md` | The shape of the generated target `AGENTS.md` |

## After the install

The agent reports the resulting configuration (the install report, the
verification plan, the lifecycle). The human then works normally:

```bash
paw status            # the workspace picture
paw verify            # run the verification checks
paw lifecycle show    # the phases this workspace runs
```

See [Configuration](configuration.md) for what lives in
`.paw/workspace.yaml`, and [Lifecycle](lifecycle.md) for the canonical
phase flow the install sets up.
