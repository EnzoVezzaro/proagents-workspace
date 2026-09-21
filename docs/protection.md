# Protection Layer

## Overview

Adds a first-class **Protection Provider** contract. The official implementation is **Repo Shield**.

The Workspace treats protection as a policy boundary around repository and agent operations.

## Protection Provider Contract

```typescript
interface ProtectionProvider {
  inspect(request: ProtectionInspection): Promise<ProtectionResult>;
  authorize(request: ProtectionRequest): Promise<ProtectionDecision>;
  beforeOperation?(operation: WorkspaceOperation): Promise<ProtectionDecision>;
  afterOperation?(operation: WorkspaceOperation, result: OperationResult): Promise<void>;
  scan?(target: ProtectionTarget): Promise<SecurityReport>;
  status(): Promise<ProtectionStatus>;
}
```

## Inspectable Targets

```
repository
branch
file
commit
diff
agent action
shell command
tool invocation
MCP operation
network request
Git operation
release
distribution package
```

## Protection Decisions

```typescript
type ProtectionDecision =
  | { action: "allow" }
  | { action: "warn"; reason: string }
  | { action: "approve"; reason: string; approval: ApprovalRequest }
  | { action: "block"; reason: string; rule?: string };
```

## Protection Policy Configuration

```yaml
protection:
  provider: repo-shield
  mode: guarded

  operations:
    filesystem:
      enabled: true
    shell:
      enabled: true
    git:
      enabled: true
    network:
      enabled: true
    mcp:
      enabled: true
    repository:
      enabled: true
    release:
      enabled: true
```

## Protection Modes

| Mode | Behavior |
|------|----------|
| `off` | Not enforced |
| `audit` | Operations recorded but not blocked |
| `warn` | Dangerous operations generate warnings |
| `guarded` | Sensitive operations require policy evaluation & approval |
| `strict` | Policy violations are blocked |

## Agent Action Protection

Protection operates at the action boundary:

```
Agent
  ↓
"git push --force origin main"
  ↓
Workspace
  ↓
Protection Provider
  ↓
BLOCK
```

Agent receives:
```
Operation blocked.
Rule: protected-branch-force-push
Reason: Force pushing to main is prohibited by Workspace policy.
```

**Protection must intervene before execution**, not log after.

## Shell Protection

Commands pass through protection when enabled:

```
Agent: rm -rf /workspace/repo
       ↓
Protection
       ↓
BLOCK
```

Command classification:
- `safe`
- `potentially destructive`
- `destructive`
- `privileged`
- `network-sensitive`
- `credential-sensitive`

## Git Protection

Protects:
- Force push
- Branch deletion
- Protected branches
- History rewriting
- Destructive resets
- Remote changes
- Tag deletion
- Release operations

```yaml
protection:
  git:
    protected_branches:
      - main
      - master
      - production
    force_push: deny
    branch_delete:
      protected: deny
```

## MCP Protection

```
Agent
  ↓
MCP
  ↓
Workspace
  ↓
Protection
  ↓
MCP Provider
  ↓
External System
```

Security boundary between agent and external capabilities.

## Network Protection

```
Agent
  ↓
request api.example.com
  ↓
Network Provider
  ↓
Protection Provider
  ↓
ALLOW
```

Or:

```
Agent
  ↓
request unknown-domain.example
  ↓
Protection Provider
  ↓
BLOCK
```

## Protection Events

```
protection/check
protection/warning
protection/approval-required
protection/allowed
protection/blocked
protection/error
```

Each event includes: workspace, session, agent, provider, operation, target, decision, rule, timestamp.

## CLI Commands

```bash
paw protection status
paw protection audit
paw protection rules
paw protection inspect
```

Example output:
```
Protection
Provider:   Repo Shield
Mode:       Guarded
Rules:      42 enabled
Today:      182 operations checked
            176 allowed
            4 warnings
            2 blocked
```

## Protection + ACC

ACC provides context to protection:

```
Changed file: src/auth/session.ts
ACC:          Critical authentication module
Protection:   Additional verification required
```

Integration remains:
```
ACC
  ↓
Context Provider
  ↓
Workspace
  ↓
Protection Provider
```

## Protection + ProAgents

A ProAgent profile can request a protection level:

```yaml
agent:
  profile: security-engineer
workspace:
  protection:
    mode: strict
```