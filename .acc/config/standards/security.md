# security.md — ProAgents Workspace Security Standard

This standard is referenced by `AGENTS.md` files across the repository. Every document, example, and future implementation must follow these rules. Security is a core product requirement, not a feature.

## Core Principle

The Workspace explicitly controls:

```text
filesystem · processes · network · credentials · MCP · browser · ports
services · repository writes · Git operations · external APIs
```

## Honest Reporting (non-negotiable)

- **Never present local execution as equivalent to a sandbox.** Local runtime always reports:
  ```text
  Runtime: local
  Isolation: host-level
  Network: unrestricted
  ```
- The security model must be visible to the user at all times — isolation level and network policy are always stated.

## Protection Before Execution (non-negotiable)

- Protection must intervene **before** an operation executes — never log after the fact.
- Protection operates at the action boundary (agent → Workspace → Protection Provider → allow/warn/approve/block).
- Protection modes are fixed: `off` · `audit` · `warn` · `guarded` · `strict`.
- Shell commands pass through protection when enabled and are classified: safe, potentially destructive, destructive, privileged, network-sensitive, credential-sensitive.

## Permissions

Permissions are declarative:

```yaml
permissions:
  filesystem:
    read: [/workspace/repo]
    write: [/workspace/repo]
  network:
    mode: restricted
  git:
    commit: true
    push: true
  repository:
    pull_request: true
  secrets:
    allowed: [npm_token]
```

Approval modes are fixed: `autonomous` · `guarded` · `manual`.

## Secrets

- **Never place secrets directly into source code or Workspace configuration files.**
- **Never store long-lived credentials inside a Workspace image** — credentials are injected dynamically at runtime.
- Secrets are injected at runtime, scoped, and **never logged**.
- Repository credentials must be scoped — a GitHub integration must not imply access to every repository in an account.

## Network

Networking must be explicit:

```yaml
network:
  mode: restricted        # allowlist | denylist | offline | restricted | unrestricted
  allow:
    - registry.npmjs.org
    - github.com
```

No undeclared network access. Network requests pass through the protection provider when enabled.

## Git Safety

Default Git behavior is conservative. An agent must never accidentally destroy repository history:

- Force push — guarded
- Branch deletion — guarded (protected branches: `main`, `master`, `production`)
- `reset --hard` — guarded
- `clean -fd` — guarded
- Tag deletion, remote changes, history rewriting — guarded

## Dependency Installation

- **Never blindly execute arbitrary install scripts without applying Workspace security policy** (spec section 19, Project Detection).
- Project detection reads manifests; it does not run project code to decide how to build.

## MCP & Browser

- MCP is an integration layer, not a hard-coded feature; MCP credentials and permissions are governed by Workspace policy.
- Browser access is optional and passes through the protection boundary like every other capability.

## What to Check

When reviewing docs or examples, verify each rule above. Violations are blocking — report the rule and the exact document location.
