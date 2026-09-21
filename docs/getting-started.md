# Getting Started

## Installation

```bash
# Install ProAgents Workspace (provides the `paw` CLI)
npm install -g proagents-workspace

paw --version
```

Requires Node.js 18+.

## Create a Workspace

### Basic

```bash
paw workspace create
```

### With Repository

Connect a repository provider first (one-time):

```bash
paw github connect
```

Then:

```bash
paw workspace create \
  --repo github:acme/my-project \
  --branch feature/auth
```

### With Runtime

```bash
paw workspace create --runtime docker --image node:22
paw workspace create --runtime e2b
paw workspace create --runtime local
```

## Workspace Creation Output

```
Creating workspace...

✓ Runtime selected
✓ Workspace created
✓ Repository connected
✓ Repository cloned
✓ Project detected
✓ Dependencies prepared
✓ Context provider initialized
✓ Agent connected

Workspace ready.

Path:
  /workspace/repo

Repository:
  acme/my-project

Branch:
  feature/auth

Agent:
  codex

Context:
  acc
```

## Start an Agent

```bash
paw agent start codex
# or
paw agent start claude
# or
paw agent start opencode
```

## Work in the Workspace

The agent operates in `/workspace/repo` and can:

- Inspect files
- Search code
- Modify files
- Execute commands
- Install dependencies
- Run tests
- Run builds
- Start services
- Inspect logs
- Use configured tools
- Use context providers
- Create commits
- Push branches
- Create pull requests

## Verify Changes

```bash
paw verify
```

See [Verification](verification.md).

## Commit & Push

```bash
paw git status
paw git diff
paw git commit
paw git push
paw pr create
```

## Export Workspace

```bash
paw workspace export ws_123
# Produces workspace.yaml
```

## Recreate Workspace

```bash
paw workspace create --from workspace.yaml
```

## Next Steps

- [Configuration](configuration.md) — full workspace definition reference
- [Runtime Providers](runtime-providers.md) — E2B, Docker, local
- [Context Providers](context-providers.md) — give your agent code understanding (ACC)
- [Agent Providers](agent-providers.md) — connect Codex, Claude, OpenCode, Gemini
- [CLI Reference](cli-reference.md) — every command
- [Security](security.md) — permissions, approval modes, network policy