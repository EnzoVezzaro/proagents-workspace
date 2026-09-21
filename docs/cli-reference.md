# CLI Reference

The CLI is the primary interface to ProAgents Workspace.

- **Binary:** `paw`
- **Package:** `proagents-workspace` (installed via `npm install -g proagents-workspace`)

The CLI uses the same underlying Workspace API as the SDK — the CLI never duplicates SDK implementation.

## Command Structure

```
paw
├── workspace
├── runtime
├── repository
├── context
├── agent
├── plugin
├── git
├── pr
├── exec
├── shell
├── terminal
├── service
├── secret
├── snapshot
├── verify
├── logs
├── protection
├── distribution
└── config
```

## Workspace Commands

```bash
paw workspace create [--repo <ref>] [--branch <name>] [--commit <sha>] \
                     [--runtime <provider>] [--image <image>] \
                     [--from <workspace.yaml>] [--headless]
paw workspace list
paw workspace get <id>
paw workspace start <id>
paw workspace stop <id>
paw workspace restart <id>
paw workspace destroy <id>
paw workspace inspect <id>
paw workspace logs <id>
paw workspace events <id>
paw workspace export <id>
paw workspace snapshot create
paw workspace snapshot restore <id>
```

`workspace create` produces a [reproducible workspace](configuration.md#reproducibility) and reports every initialization step. `workspace export` emits `workspace.yaml`, which can recreate the workspace with `--from`.

## Repository Commands

```bash
paw repository list
paw repository connect
paw repository clone
paw repository status
paw repository fetch
paw repository checkout
paw github connect
```

See [Repository Providers](repository-providers.md).

## Agent Commands

```bash
paw agent list
paw agent detect
paw agent start <provider>
paw agent stop <session>
paw agent status <session>
paw agent attach <session>
paw agent logs <session>
```

See [Agent Providers](agent-providers.md).

## Context Commands

```bash
paw context list
paw context status
paw context initialize
paw context index
paw context rebuild
paw context query
paw context inspect
```

See [Context Providers](context-providers.md).

## Verification Commands

```bash
paw verify
paw verify test
paw verify build
paw verify lint
paw verify typecheck
```

See [Verification](verification.md).

## Git Commands

```bash
paw git status
paw git diff
paw git branch create <name>
paw git commit
paw git push
```

Git operations are subject to [protection policies](protection.md#git-protection). The actual repository provider handles remote operations.

## Pull Request Commands

```bash
paw pr create
```

Collects branch, commits, diff, verification results, test results, context impact, and agent summary into a structured PR description. See [Verification](verification.md#pull-request-verification).

## Execution Commands

```bash
paw exec -- <command>        # One-shot command execution
paw shell                    # Interactive shell session
paw terminal attach           # Persistent terminal
paw service start <name>
paw service stop <name>
paw secret list
paw snapshot create
paw snapshot restore <id>
paw logs
paw config get
paw config set
```

## Protection Commands

```bash
paw protection status
paw protection audit
paw protection rules
paw protection inspect
```

See [Protection](protection.md).

## Distribution Commands

```bash
paw distribution inspect
paw distribution prepare
paw distribution publish
paw distribution verify
paw distribution provider reposell
paw reposell init
paw reposell doctor
paw reposell publish
paw reposell verify
```

See [Distribution](distribution.md).

## Plugin Commands

```bash
paw plugin list
paw plugin install
paw plugin uninstall
paw plugin inspect
```

## Diagnostics

```bash
paw doctor
```

`paw doctor` diagnoses:

```
runtime connectivity
provider installation
credentials
repository access
Git
filesystem
network
context indexing
agent availability
MCP
services
resource limits
```

Example output:

```
ProAgents Workspace Doctor

Runtime
  ✓ E2B

Repository
  ✓ GitHub

Context
  ✓ ACC

Agent
  ✓ Codex

Filesystem
  ✓ Ready

Network
  ✓ Restricted

Secrets
  ✓ Available

Verification
  ✓ Configured
```

Every provider must expose health, and every error must be actionable.

## Global Options

### JSON Output

Every important command supports machine-readable output:

```bash
paw workspace inspect ws_123 --json
paw verify --json
paw context status --json
```

### Headless Mode

Everything works without a UI:

```bash
paw workspace create --headless
paw agent start codex --headless
paw verify --headless
paw workspace destroy
```

### Structured Errors

Errors have stable codes:

```json
{
  "code": "REPOSITORY_AUTH_FAILED",
  "message": "Repository authentication failed.",
  "provider": "github",
  "recoverable": true,
  "suggestions": [
    "Reconnect GitHub",
    "Verify repository permissions"
  ]
}
```

### Logging

Structured logging includes where applicable:

```
timestamp
workspaceId
sessionId
provider
operation
severity
duration
result
```

Secrets are never logged.

## Workspace Modes

| Mode | Contents |
|------|----------|
| Minimal | runtime, filesystem, shell — for benchmarks, experiments, CI |
| Developer | + Git, repository, terminal, services, network, browser, context, verification |
| ProAgent | + ProAgent profile, skills, methods, rules, policies, ACC, MCP, workspace requirements |
| CI | Workspace created against a commit with `--runtime docker`, then `paw verify` |

## SDK

The CLI and SDK call the same services:

```typescript
import { Workspace } from "@proagents/workspace";

const workspace = await Workspace.create({
  runtime: "e2b"
});

await workspace.repository.clone(...);

await workspace.agent.start(...);

await workspace.verify();
```

The SDK must not duplicate the CLI implementation. A remote Workspace API (and optional Web UI) can sit on the same services for multi-tenant operation.
