# cli-vocabulary.md — paw CLI Vocabulary Standard

This standard fixes the exact product vocabulary. Every document, example, error message, and future implementation must use these names consistently.

## Fixed Names

| Concept | Name | Never |
|---------|------|-------|
| CLI binary | `paw` | `proagent-workspace`, `proagents`, `pw` |
| npm package (global install) | `@reposell/proagents-workspace` (published) | any other name |
| repo CLI package (source of the binary) | `proagents-workspace` (workspace pkg, not published) | — |
| SDK package | `@proagents/workspace` | any other scope |
| CLI config file | `workspace.yaml` | `paw.yaml`, `proagents.yaml` |
| Success criterion command | `paw workspace create --repo ... --runtime ... --context acc --agent codex` | — |

## Install

```bash
npm install -g @reposell/proagents-workspace
```

Requires Node.js 18+. The published package is a SELF-CONTAINED bundle (packages/cli/esbuild.mjs → one file, zero runtime deps, spec section 61); republish via `pnpm --filter proagents-workspace bundle && pnpm --filter proagents-workspace pack:npm`, then `npm publish --access public` in `packages/cli/npm-stage/` (publish is irreversible — smoke the tarball with `npm install -g ./` in a scratch prefix first).

## Command Structure (spec sections 50–55, 148)

```text
paw
├── install ├── init ├── status ├── research ├── doctor ├── verify ├── diff   (bootstrap + convention-first surface)
├── workspace ├── runtime ├── repository ├── context
├── agent ├── plugin ├── git ├── pr
├── exec ├── shell ├── terminal ├── service
├── secret ├── snapshot ├── logs
├── protection ├── distribution └── config
```

Key commands every document must agree on:

```bash
paw install                                # agent bootstrap: the five-phase install (spec section 152)
paw init README.md                         # file-driven init: infer intent from a source file (also: paw install <file>)
paw init                                   # convention-first: initialize current repository
paw status | research | doctor | verify | diff   # convention-first surface (current repo)
paw agent list                             # detected agents + integration tiers
paw research answer <id> <answer>          # interview loop
paw workspace create [--repo] [--branch] [--runtime] [--image] [--from] [--headless]
paw workspace export <id>                  # produces workspace.yaml
paw workspace create --from workspace.yaml
paw agent start <provider>
paw context status | rebuild | query | inspect
paw verify                                 # NOT `paw verification run`
paw git status | diff | commit | push
paw pr create
paw doctor
paw protection status | audit | rules | inspect
paw distribution inspect | prepare | publish | verify
```

Ergonomic rule (spec section 148): `paw verify`, `paw diff`, `paw status` operate on the CURRENT repository — never write `paw workspace verify`, `paw workspace diff`, `paw workspace status`. The `workspace` noun is reserved for isolated workspaces.

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
- `.paw/workspace.yaml` — the minimal convention-first project configuration (spec section 148); `version: 1` alone is valid.
- Bootstrap vocabulary (spec section 152): installer command `npx @reposell/proagents-workspace@latest install`; contract dir `install/` (`manifest.yaml`, `install.yaml`, `AGENT.md`, `instructions.md`); template `templates/AGENTS.md`; target config dir stays `.paw/` — never `.proagents/` (that namespace belongs to the ProAgents project) and never `.agents/` in TARGET repositories (agent-owned).
- **Workspace** (default) = the developer's project environment; **isolated/runtime workspace** = the explicit sandboxed mode (spec section 148). Never use "workspace" alone for the sandboxed mode.
- Providers: `runtime` (e2b, docker, local), `repository` (github, gitlab, git), `context` (acc), `agent` (codex, claude, opencode, gemini, proagent).
- Protection: provider `repo-shield`; Distribution: provider `reposell`.
- Local project mode filesystem: `.paw/` metadata alongside the developer's untouched source. Isolated mode filesystem: `/workspace/repo` (repository), `/workspace/.proagents/` (metadata).

## Validation

Any command example in `docs/` or `README.md` that uses a different binary name, package name, or command form is a bug — fix it on sight.
