# {{name}} — Workspace Profile Template

Template for a reusable, composable Workspace profile (spec sections 46–47). Copy, fill, and distribute. A ProAgent profile references a workspace profile with `workspace.profile: {{name}}`.

```yaml
name: {{name}}

# Runtime — where the agent works (docs/runtime-providers.md)
runtime:
  provider: docker          # docker | local | e2b (future: kubernetes)
  image: node:22            # required for docker; pin the tag

# Repository — source of truth (docs/repository-providers.md)
repository:
  provider: github          # github | gitlab | git
  repository: {{org}}/{{project}}
  branch: {{branch}}

# Context — what the agent understands (docs/context-providers.md)
context:
  providers:
    - acc                   # npm: acc-code-context

# Agent — who works (docs/agent-providers.md)
agent:
  provider: {{codex|claude|opencode|gemini|proagent}}

# Services — databases, queues (docs/configuration.md)
services:
  - name: {{postgres}}
    image: {{postgres:18}}

# Tools & MCP (docs/security.md#mcp-security)
tools:
  - shell
  - filesystem
  - git
mcp:
  servers:
    - name: {{browser}}
      provider: {{browser-mcp}}

# Network — explicit, never implicit (docs/security.md#network-security)
network:
  mode: restricted          # allowlist | denylist | offline | restricted | unrestricted
  allow:
    - registry.npmjs.org
    - github.com

# Permissions — declarative (docs/security.md#permissions-declarative)
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
      - {{secret_name}}

# Approval — autonomous | guarded | manual (docs/security.md#approval-policies)
approval:
  mode: guarded

# Protection — before execution, never after (docs/protection.md)
protection:
  provider: repo-shield
  mode: guarded             # off | audit | warn | guarded | strict

# Verification — the loop, not a final step (docs/verification.md)
verification:
  commands:
    - pnpm lint
    - pnpm typecheck
    - pnpm test
    - pnpm build

# Environment
environment:
  NODE_ENV: development
```

## Checklist for a new profile

- [ ] Zero-cloud path works: `runtime.provider: docker` (or `local`) runs with no cloud credentials (spec section 123)
- [ ] Cloud parity: switching `runtime.provider` requires no other change (spec section 124)
- [ ] No secrets inline — only secret **references**; values inject at runtime (spec section 30)
- [ ] Network is explicit; nothing undeclared
- [ ] Git defaults stay conservative (spec section 35)
- [ ] Exportable and reproducible: `paw workspace export` → `paw workspace create --from` round-trips
