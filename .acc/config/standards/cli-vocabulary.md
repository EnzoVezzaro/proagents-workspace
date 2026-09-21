# cli-vocabulary.md — paw CLI Vocabulary Standard

This standard fixes the exact product vocabulary. Every document, example, error message, and future implementation must use these names consistently.

## Fixed Names

| Concept | Name | Never |
|---------|------|-------|
| CLI binary | `paw` | `proagent-workspace`, `proagents`, `pw` |
| npm package (global install) | `proagents-workspace` | `@proagents/proagent-workspace` |
| SDK package | `@proagents/workspace` | any other scope |
| CLI config file | `workspace.yaml` | `paw.yaml`, `proagents.yaml` |
| Success criterion command | `paw workspace create --repo ... --runtime ... --context acc --agent codex` | — |

## Install

```bash
npm install -g proagents-workspace
```

Requires Node.js 18+.

## Command Structure (spec sections 50–55)

```text
paw
├── workspace ├── runtime ├── repository ├── context
├── agent ├── plugin ├── git ├── pr
├── exec ├── shell ├── terminal ├── service
├── secret ├── snapshot ├── verify ├── logs
├── protection ├── distribution └── config
```

Key commands every document must agree on:

```bash
paw workspace create [--repo] [--branch] [--runtime] [--image] [--from] [--headless]
paw workspace export <id>          # produces workspace.yaml
paw workspace create --from workspace.yaml
paw agent start <provider>
paw context status | rebuild | query | inspect
paw verify                         # NOT `paw verification run`
paw git status | diff | commit | push
paw pr create
paw doctor
paw protection status | audit | rules | inspect
paw distribution inspect | prepare | publish | verify
```

## Interface Rules

- Every important command supports `--json` for machine-readable output (agent-first requirement).
- Everything works headless: `--headless` is supported on workspace create, agent start, verify.
- Errors are structured with stable codes:
  ```json
  {
    "code": "REPOSITORY_AUTH_FAILED",
    "message": "Repository authentication failed.",
    "provider": "github",
    "recoverable": true,
    "suggestions": ["Reconnect GitHub", "Verify repository permissions"]
  }
  ```
- Structured logging includes: timestamp, workspaceId, sessionId, provider, operation, severity, duration, result. **Secrets are never logged.**

## Workspace Vocabulary

- `workspace.yaml` — the declarative workspace definition (reproducibility: export → create --from).
- Providers: `runtime` (e2b, docker, local), `repository` (github, gitlab, git), `context` (acc), `agent` (codex, claude, opencode, gemini, proagent).
- Protection: provider `repo-shield`; Distribution: provider `reposell`.
- Workspace filesystem: `/workspace/repo` (repository), `/workspace/.proagents/` (metadata).

## Validation

Any command example in `docs/` or `README.md` that uses a different binary name, package name, or command form is a bug — fix it on sight.
