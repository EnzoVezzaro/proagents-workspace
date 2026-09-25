# Getting Started

## Installation

```bash
# Install ProAgents Workspace (provides the `paw` CLI)
npm install -g @reposell/proagents-workspace

paw --version
```

Requires Node.js 18+. No cloud account, API key, Docker, or desktop application — the terminal is the interface.

## The Golden Path

```bash
cd my-project
paw init
paw status
paw verify
codex        # your existing agent keeps working
```

That is the product. Everything else is progressive.

## Initialize an Existing Repository

```bash
paw init
```

Run inside an existing repository. `init` is the workspace BOOTSTRAPPER
(spec section 152) — it runs six stages, one per layer:

1. **resolve** — detects the repository and project (languages, package manager, frameworks), the available coding agents (Codex, Claude Code, OpenCode, Gemini CLI, …), and decides where identity comes from: code AND README, else README, else code, else the questionnaire
2. **acc** — writes the ACC knowledge layer (`.acc/config/config.yaml`) from detected languages only
3. **shield** — writes the Repo Shield policy (`.reposhield/policy.yaml`): destructive git operations are refused before execution
4. **proagents** — writes WHO operates: profiles (`.proagents/profiles/`), a crew wired to ACC context (`.proagents/crew/`), the environment config (`.proagents/config.yaml`)
5. **reposell** — writes the distribution posture (`.reposell/distribution.yaml`)
6. **paw** — creates `.paw/` LAST (the config that ties the layers together) plus `AGENTS.md` when absent; reports verification and the lifecycle

An empty repository (no code, no README) gets the five-question interview: `paw init` asks it in a terminal, or pass `paw init --answers "web app" "one sentence" "TypeScript" "open source" "guarded"` headlessly. (`paw install` is an alias of `paw init`.)

Example output:

```text
✓ resolve
    basis: code + README — typescript, pnpm
✓ acc
    + .acc/config/config.yaml
✓ shield
    + .reposhield/policy.yaml
✓ proagents
    + .proagents/config.yaml
    ...
✓ reposell
    + .reposell/distribution.yaml
✓ paw
    + .paw/workspace.yaml

Workspace ready.
```

`paw init` never overwrites project files, never rewrites `package.json`, and never changes Git state. Existing `AGENTS.md`, `.acc/`, `.reposhield/`, `.proagents/`, and `.reposell/` files stay owned by their existing owners.

## Status and Doctor

```bash
paw status      # where am I, what is here, what is possible
paw doctor      # diagnostics; optional components are marked optional, never failed
```

Both support `--json`.

## Verify Changes

```bash
paw verify
```

With no configuration, verification is inferred from project conventions (package scripts: lint → typecheck → test → build). Configure explicit commands in `.paw/workspace.yaml` when you want to override:

```yaml
version: 1
verification:
  commands:
    - pnpm lint
    - pnpm test
```

## Use Your Existing Agent

The Workspace improves the environment around the agent; it does not replace the agent:

```bash
paw agent list   # detected agents + integration tiers
codex            # keeps working exactly as before
claude
opencode
```

## Research (optional, product/environment discovery)

```bash
paw research                       # consults context providers (ACC) + repository facts
paw research answer product-goal "A CLI that ships faster"
paw research status
```

Artifacts land in `.paw/research/` and agent requirements are handed to ProAgents via `.paw/proagents/requirements.json` (see [Agent Providers](agent-providers.md#proagents-integration-official)). See spec section 149.

## Isolated Workspaces (optional, progressive)

The default mode operates directly on the current repository. When you need isolation (CI, untrusted or parallel agents), create an explicit isolated workspace:

```bash
paw workspace create \
  --repo github:acme/my-project \
  --runtime docker \
  --branch feature/auth
```

Runtimes: `local` (default, host-level — NOT a sandbox), `docker`, `e2b`.

## Next Steps

- [PAW Installation Runbook](paw-install-runbook.md) — the complete install → set up → complete contract for an AI agent (start prompt, long-run playbook, gates, self-review, report)
- [Configuration](configuration.md) — minimal config, precedence, full reference
- [CLI Reference](cli-reference.md) — every command
- [Verification](verification.md) — the verification loop
- [Agent Providers](agent-providers.md) — connect Codex, Claude, OpenCode, Gemini
- [Runtime Providers](runtime-providers.md) — isolated runtimes (opt-in)
- [Context Providers](context-providers.md) — ACC and other context providers (optional)
- [Security](security.md) — permissions, approval modes, network policy
