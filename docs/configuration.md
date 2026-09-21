# Configuration

## Workspace Definition

A Workspace definition captures:

```yaml
runtime:
  provider: e2b
  # or docker, local, kubernetes, etc.

repository:
  provider: github
  repository: acme/project
  branch: feature/auth

environment:
  NODE_ENV: development

dependencies:
  - node: "22"
  - pnpm: "9"

services:
  postgres:
    image: postgres:18
  redis:
    image: redis:8

context:
  providers:
    - acc

agent:
  provider: codex
  # or proagent, claude, opencode, gemini

tools:
  - shell
  - filesystem
  - git
  - browser

network:
  mode: restricted
  allow:
    - registry.npmjs.org
    - github.com
    - api.example.com

permissions:
  filesystem:
    read:
      - /workspace/repo
    write:
      - /workspace/repo
  network:
    mode: restricted
  git:
    commit: true
    push: true
  repository:
    pull_request: true
  secrets:
    allowed:
      - npm_token

verification:
  commands:
    - pnpm lint
    - pnpm typecheck
    - pnpm test
    - pnpm build

approval:
  mode: guarded
  # or autonomous, manual

protection:
  provider: repo-shield
  mode: guarded

distribution:
  provider: reposell

mcp:
  servers:
    - name: browser
      provider: browser-mcp
    - name: database
      provider: postgres-mcp
```

## Workspace Filesystem Structure

```
/workspace
├── repo/           # Repository code
├── context/        # Context provider data
├── artifacts/      # Build artifacts
├── logs/           # Workspace logs
├── tmp/            # Temporary files
└── .proagents/     # Workspace metadata
```

The repository normally lives at `/workspace/repo`. Workspace metadata lives separately from user code.

## Reproducibility

A Workspace should be reconstructable from its configuration:

```bash
# Export
paw workspace export ws_123
# Produces workspace.yaml

# Recreate
paw workspace create --from workspace.yaml
```

Workspace state includes:
- workspace ID
- runtime & runtime state
- repository, branch, commit
- agent sessions
- context providers
- services
- network policy
- permissions
- secrets references
- snapshots
- verification history

## Workspace Profiles

Profiles are reusable, composable workspace definitions:

```yaml
name: typescript-development

runtime:
  provider: docker
  image: node:22

repository:
  provider: github

context:
  providers:
    - acc

services:
  - postgres

network:
  mode: restricted

verification:
  commands:
    - pnpm lint
    - pnpm test
    - pnpm build
```

A [ProAgent profile](agent-providers.md#proagents-integration-official) can reference a workspace profile:

```yaml
agent:
  profile: senior-software-engineer

workspace:
  profile: typescript-development
```

Or declare workspace requirements that the Workspace resolves:

```yaml
workspace:
  requirements:
    runtime:
      node: ">=22"
    services:
      - postgres
    context:
      - acc
    capabilities:
      - shell
      - filesystem
      - git
```