# opentofu

OpenTofu (Terraform-compatible) tooling for the ProAgents Workspace cloud path: E2B, the workspace server, and multi-tenant infrastructure (spec sections 114–116, `.acc/config/standards/cloud-infrastructure.md`).

## Purpose

Everything the cloud infrastructure engineer needs to define, plan, and deploy workspace infrastructure as code — never by hand.

## Prerequisites

- `tofu` CLI on PATH (OpenTofu)
- Remote state backend with locking (S3 + DynamoDB, TACOS, or equivalent)
- Cloud credentials in the environment — never in `.tfvars`

## Commands

```bash
tofu init                     # initialize modules + state backend
tofu validate                  # CI gate — runs on every change
tofu plan -out=tfplan          # required before every apply; review the output
tofu apply tfplan              # apply only a reviewed plan
tofu state list                # audit what is managed
tofu destroy                   # teardown — requires plan review first
```

## Module layout (when infrastructure lands)

```text
infra/
├── modules/workspace-server/    # API, auth, allocation (spec section 115)
├── modules/runtime-allocation/  # sandbox/quota management per provider
└── modules/observability/       # logs, events, artifacts
```

One module per concern; no inline copies; everything tagged with the workspace/tenant scope (spec section 116).

## Safety rules

- **No secrets in `.tf`/`.tfvars`** — from the environment or a secrets manager at apply time; verify plan output contains no secret values
- Plan before apply, always; CI never applies automatically without a reviewed plan artifact
- Least privilege for every cloud identity (IAM role, service account)
- Never commit state files; never let a module grant cluster-admin/host-level rights
- Zero-cloud path must not regress when infra changes (spec section 123)

## Consumers

- `.acc/config/agents/cloud-infrastructure-engineer.md`
- `.acc/config/agents/kubernetes-engineer.md`
- `.acc/config/workflows/security-review.md` (infra changes are security-relevant)
- `.acc/config/workflows/new-provider.md` (cloud runtime providers)
