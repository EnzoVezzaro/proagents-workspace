# Self-Diagnostics

`paw check` is the framework policing itself: stable-coded, evidence-backed
diagnostics for configuration drift — the ACC-check analogue applied to the
Workspace's own artifacts (spec section 153).

```bash
paw check            # framework + workspace checks; human-readable
paw check --json     # machine-readable (agent-first)
```

Exit code 1 on any error-severity finding; warnings do not fail a gate.

## What it checks

Two scopes, applied where they exist — the reported scope reflects what
actually ran:

**Framework checks** (run inside a checkout that declares `proagents.yaml`):

| Code | Severity | Catches |
|------|----------|---------|
| `PAW001` | error | `install/manifest.yaml` version ≠ released CLI version |
| `PAW002` | error | workspace package versions disagree with each other |
| `PAW003` | error | `AGENTS.md` section-count claim ≠ actual spec sections in `README.md` |
| `PAW004` | warning | `templates/AGENTS.md` and the SDK generator have drifted apart |
| `PAW005` | error | a bootstrap contract file (`install/`, `templates/`) is missing |
| `PAW007` | warning | a spec citation points beyond the actual spec length |
| `PAW008` | error | the current version has no `CHANGELOG.md` entry |
| `PAW009` | error | a documented command is missing from `docs/cli-reference.md` |

**Workspace checks** (run in any initialized workspace):

| Code | Severity | Catches |
|------|----------|---------|
| `PAW006` | error | `.paw/workspace.yaml` fails schema validation |
| `PAW010` | warning | `.paw/state/lifecycle-state.json` is not readable JSON |
| `PAW011` | warning | nothing was checkable in this scope |

## Diagnostic shape

Every diagnostic carries: the stable code, a severity, a message,
**evidence** (what was compared, what was found), and a **fix suggestion**.
A diagnostic without a fix suggestion is a bug.

```json
{
  "code": "PAW001",
  "severity": "error",
  "message": "install/manifest.yaml says 0.4.0 but the CLI is 0.5.0.",
  "file": "install/manifest.yaml",
  "evidence": "manifest version 0.4.0 ≠ CLI version 0.5.0",
  "suggestion": "Bump install/manifest.yaml (or the packages) so the manifest carries the released version."
}
```

## Product boundaries

Three systems, three independent checkers — no cross-dependency:

| System | Command | Checks |
|--------|---------|--------|
| ACC | `acc check` | context/contract integrity (ACC0xx) |
| ProAgents | `proagent validate --spec` | its agent-environment spec and lock |
| Workspace | `paw check` | the Workspace's own artifacts (PAW0xx) |

`paw check` never reads ACC (`.acc/`) or ProAgents (`proagents.yaml`/`.lock`) files; its framework marker is Workspace-owned (`install/manifest.yaml`).

## Rules

- `paw check` never mutates anything — it reports; `paw init` (alias `paw install`) repair.
- Codes are a stability contract (section 99): never reused, never retyped.
- The release checklist treats `paw check` as a pre-publish blocking step.

See [Bootstrap](bootstrap.md) for the installer, and
[Configuration](configuration.md) for the artifacts being checked.
