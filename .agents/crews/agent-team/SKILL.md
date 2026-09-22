---
name: crew-agent-team
description: Custom crew derived from the interview: professional profile: api documentation, architecture explainers and onboarding guides — written for the reader under pressure, examples over abstraction; server-side systems: apis, data integrity, re
---

# Crew: agent-team (v0.1.0)

Custom crew derived from the interview: professional profile: api documentation, architecture explainers and onboarding guides — written for the reader under pressure, examples over abstraction; server-side systems: apis, data integrity, re

## Mission

Build and operate the ProAgents Workspace (paw CLI, kernel, SDK) as a coordinated professional team: implementation, dual review (quality + security), gated operations, and documentation - with releases reversible and production actions human-approved.

## Members

| Member | Operates as | Role | Reads | Emits |
|---|---|---|---|---|
| technical-writer (`technical-writer`) | `technical-writer` | coordinator | qa-engineer | documentation-update.md, review-verdict.md |
| backend-engineer (`backend-engineer`) | `backend-engineer` | implementation | — | patches.md, change-description.md |
| devops-engineer (`devops-engineer`) | `devops-engineer` | operator | qa-engineer | rollout-log.md |
| qa-engineer (`qa-engineer`) | `qa-engineer` | reviewer | backend-engineer | review-verdict.md, approved-change-plan.md |
| release-engineer (`release-engineer`) | `release-engineer` | operator | qa-engineer | release-plan.md, release-notes.md, changelog-entry.md |
| security-engineer (`security-engineer`) | `security-engineer` | reviewer | backend-engineer | security-review.md |

## Coordination

- Members coordinate exclusively through named-artifact handoffs - never a shared pool. Patches reach both reviewers; approved change plans reach both operators.
- A member that cannot meet its handoff contract escalates to the coordinator (technical-writer) instead of improvising; uncertainty about permissions escalates to the human.

## Tasks

- technical-writer owns documentation and coordination: aggregates review verdicts, updates docs/ per the Diataxis structure, keeps docs/index.md reachable, and runs the acc check gate.
- backend-engineer owns implementation: TypeScript/pnpm/Zod changes to packages/ and plugins/, commits to main autonomously, guarded git only (no force push, no history rewrite).
- devops-engineer owns operations: CI pipelines, Docker/E2B runtime configs, deployment safety. Executes only approval-gated production actions.
- qa-engineer owns review and verification: reviews patches against the verification lifecycle (acc check, pnpm lint/typecheck/test/build, CI green), produces the review verdict and the approved change plan.
- release-engineer owns releases: version bumps, changelog discipline (Keep a Changelog), release notes, rollback-first planning. Publishes only after explicit human approval.
- security-engineer owns security review: threat modeling, attack-surface analysis of proposed changes, secret-boundary checks. Review comments only; never applies changes.

## Workflows

- Standard run: backend-engineer produces patches and a change description -> qa-engineer and security-engineer review in parallel -> review verdict aggregates to technical-writer (coordinator) -> approved change plan hands off to devops-engineer and release-engineer, whose production actions are human-approval-gated.
- Release run: qa-engineer verifies the release gate (acc check 0 errors with the reviewed ACC014 cycle warning, all links resolve, lint/typecheck/test/build pass, CI green) -> release-engineer prepares version bump, changelog and rollback plan -> human approves -> release-engineer publishes.

## Pipeline

- Start at **backend-engineer**.
- `backend-engineer` hands **patches.md** to `qa-engineer`.
- `backend-engineer` hands **patches.md** to `security-engineer`.
- `qa-engineer` hands **review-verdict.md** to `technical-writer`.
- `qa-engineer` hands **approved-change-plan.md** to `devops-engineer`.
- `qa-engineer` hands **approved-change-plan.md** to `release-engineer`.

## Rules

- Every member stays inside its explicit permission model. Composition never inherits trust implicitly.
- Force push, branch deletion, and history rewriting are forbidden for all members; destructive git operations are guarded.
- Releases, version bumps, and any production action require explicit human approval; markdown informs, runtime boundaries enforce where the harness allows.

## Verification

- Each handoff artifact exists and names its producer.
- No member exceeded its permission model (checked against the agent.json contracts).
- acc check passes with 0 errors (the one reviewed warning is the intentional packages ↔ plugins cycle, ACC014), all docs links resolving, pnpm lint/typecheck/test/build passing, and CI green before any release or production action.

## Rules (normative baseline)

- Handoffs pass named artifacts only — never a shared context pool.
- Every member stays inside its permission model; approval-gated tools
  require a recorded human approval before the call.
