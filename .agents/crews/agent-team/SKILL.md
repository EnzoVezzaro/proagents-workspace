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

- [missing section file: coordination/01-members-coordinate-exclusively-through-named.json]
- [missing section file: coordination/02-a-member-that-cannot-meet-its-handoff-contrac.json]

## Tasks

- [missing section file: tasks/01-technical-writer-owns-the-documentation-work.json]
- [missing section file: tasks/02-backend-engineer-owns-the-implementation-work.json]
- [missing section file: tasks/03-devops-engineer-owns-the-operations-work-for.json]
- [missing section file: tasks/04-qa-engineer-owns-the-review-work-for-this-cre.json]
- [missing section file: tasks/05-release-engineer-owns-the-operations-work-for.json]
- [missing section file: tasks/06-security-engineer-owns-the-review-work-for-th.json]

## Workflows

- [missing section file: workflows/01-standard-run-start-at-the-entry-member-foll.json]

## Pipeline

- Start at **backend-engineer**.

## Rules

- [missing section file: rules/01-every-member-stays-inside-its-permission-model.json]
- [missing section file: rules/02-handoff-artifacts-are-named-and-reviewable.json]

## Verification

- [missing section file: verification/01-each-handoff-artifact-exists-and-names-its-pr.json]
- [missing section file: verification/02-no-member-exceeded-its-permission-model-chec.json]

## Rules (normative baseline)

- Handoffs pass named artifacts only — never a shared context pool.
- Every member stays inside its permission model; approval-gated tools
  require a recorded human approval before the call.
