# cloud-infrastructure.md — Cloud Infrastructure Standard

The OpenTofu/cloud standard for ProAgents Workspace. Grounded in spec sections 12, 114–116, and 123–124.

## Zero-Cloud First (spec section 123)

```text
local runtime · Docker runtime · local Git · local filesystem
```

- Cloud providers are optional. Every feature must be demonstrable with zero cloud spend.
- No code path may hard-require a cloud service.

## Cloud Path Parity (spec section 124)

```yaml
runtime:
  provider: e2b      # cloud
```

switching to:

```yaml
runtime:
  provider: docker   # zero-cloud
```

requires **no other configuration change** — not repository, not context, not agent, not verification. If a change does require it, the parity rule is broken.

## E2B Rules (spec section 12)

- E2B is a runtime provider; the E2B SDK stays behind the `RuntimeProvider` contract.
- The rest of Workspace never imports E2B directly.
- E2B credentials are injected at runtime and scoped; never stored in images or config files.

## Remote Workspace Architecture (spec sections 114–115)

```text
Developer / Agent → Workspace Client → Workspace API → Runtime Provider
```

- The workspace server manages: authentication, authorization, workspace lifecycle, runtime allocation, provider lifecycle, logs, events, artifacts, snapshots.
- The same provider contracts work locally and remotely — remote is a transport difference, not a contract difference.
- Remote execution enforces the same permission, approval, and protection policies as local — never weaker.

## Multi-Tenant Readiness (spec section 116)

- Multi-tenancy is not a V1 requirement — but the architecture must not prevent it.
- Everything is scoped: workspace IDs, sessions, artifacts, credentials, runtime resources.
- No shared global state between workspaces; no credential crosses a workspace boundary.

## OpenTofu Rules

- **Declarative infrastructure only** — modules, no inline copies; one module per concern (workspace server, runtime allocation, observability).
- **State is managed**: remote state with locking; never commit state files.
- **Plan before apply**: `tofu plan` output reviewed before every apply; CI runs `tofu validate` + `plan` on every change.
- **No secrets in `.tf`/`.tfvars`** — credentials come from the environment or a secrets manager at apply time; secret values never appear in plan output.
- **Least privilege**: every cloud identity (IAM role, service account) carries only the permissions its module needs.
- **Everything tagged/labeled with the workspace or tenant scope** so resources are attributable and cleanable.

## Health & Cost

- Cloud connectivity is a `paw doctor` check — actionable errors, not raw SDK stack traces.
- Runtime allocation failures report which resource was exhausted (sandboxes, quota, region).
- The zero-cloud path is the default in examples; cloud examples always show where credentials come from and what they cost.
