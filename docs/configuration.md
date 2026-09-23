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

## Named workspaces (multi-workspace isolation)

One Workspace process can host several **named workspaces** at once — each an isolated plugin scope with its own root, sandbox policy, session log, and plugin selections (spec section 141). Declare them under the optional `workspaces:` map; keys are kebab-case workspace ids:

```yaml
workspaces:
  frontend:
    root: ./projects/frontend
    sandbox:
      mode: read-only
  backend:
    root: ./projects/backend
    sandbox:
      mode: workspace-write
    agent:
      provider: codex
```

- A capability is instantiated independently per workspace; scopes fall through to the root registry for anything they did not register.
- The `root` must exist on disk before the workspace can be mounted; grants come from this validated configuration, never from a plugin.
- Mount/unmount is a runtime operation; only declared workspaces can be mounted, so a running process stays reconstructable from configuration alone.

Each entry may set a sandbox `mode` — `read-only`, `workspace-write` (default), or `danger-full-access` (spec section 142). The sandbox is same-world confinement, honestly reported: `read-only` vetoes writes before execution, and a host-process shell fails closed with `SANDBOX_UNAVAILABLE` under `read-only` because it cannot enforce read-only confinement. Every workspace also keeps an append-only session log (spec section 143) under `.paw/sessions/<workspace>/session.jsonl`, redacted at write time.

### Development lifecycle per workspace (spec sections 6/16)

A workspace entry may bind the development lifecycle it runs — by reference to a named definition, or inline (see [Development Lifecycle](lifecycle.md) for the full stage model and execution semantics):

```yaml
lifecycle:
  definitions:
    - id: web-app
      name: Web application lifecycle
      stages:
        - { id: implement, name: Implement, type: implement,
            agents: [{ profileId: nodejs-engineer }],
            tools: [{ id: terminal, type: terminal }],
            policy: { required: true, onFailure: stop } }
        - { id: test, name: Test, type: test,
            tools: [{ id: vitest, type: vitest }],
            policy: { required: false, onFailure: continue } }
  default: web-app

workspaces:
  flight-booking:
    root: chats/flight-booking-a1b2c3   # each chat owns its own workspace dir
    lifecycle: { ref: web-app }   # or lifecycle.inline: { ... }
```

Resolution order: `lifecycle.inline` → `lifecycle.ref` → top-level `lifecycle.default`; an unknown ref is a structured `CONFIG_INVALID` error. Stage progress is emitted as `lifecycle/*` events on the typed bus.