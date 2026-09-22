# Agent Environment

This repository is agent-native: the professional profiles its agents operate under are declared in configuration, compiled into harness artifacts, and fully regenerable.

## Overview

ProAgents defines **WHO** the agent is, ACC defines **WHAT** it understands, and Workspace provides **WHERE** it works (see [Product Model](product-model.md)). This page documents the WHO layer as it is realized in this repository: the declarative environment spec, the resolution lock, and the compiled artifacts that equip a coding-agent harness.

Two CLIs appear in this ecosystem — do not confuse them:

| CLI | Role | Status |
|-----|------|--------|
| `proagent` | Environment builder: compiles profiles and crews into harness artifacts from `proagents.yaml` | Installed tooling (v0.13.x) |
| `paw` | This product's own CLI for creating and operating workspaces | Specification only — see [CLI Reference](cli-reference.md), not yet implemented |

All commands on this page are `proagent` commands. They configure the repository's agent environment; they are not `paw` workspace commands.

## Environment Files

| File | Role | Authored by |
|------|------|-------------|
| `proagents.yaml` | Human-authored source of truth: professions, capabilities, policies, harness compatibility | Humans |
| `proagents.lock` | Checksummed resolution graph (capability → implementation) | `proagent lock` |
| `.agents/skills/` | Compiled agent skills for the detected harnesses | `proagent setup` / `proagent build` |
| `AGENTS.md` | Root agent contract; carries the `proagent:profile:start/end` block with the equipped professional profile | Humans + `proagent setup` (block only) |
| `.mcp.json` | MCP servers resolved from the declared capabilities | `proagent setup` |

The pipeline is the same one the product spec prescribes for workspaces, applied to the agent environment itself: **declare → resolve → lock → validate → setup**.

```
proagents.yaml  ──resolve──►  proagents.lock  ──validate──►  ok
       │
       └──setup──►  .agents/skills/  ·  AGENTS.md profile block  ·  .mcp.json
```

## What Is Declared

`proagents.yaml` currently declares:

- **Professions** — staff-engineer, security-engineer, technical-writer, backend-engineer, devops-engineer, qa-engineer, sre, release-engineer: one per ACC expertise domain in `.acc/config/agents/`.
- **Capabilities** — browser-automation, database-access, source-control (the same tools declared in `.acc/config/tools/`).
- **Policies** — workspace-only filesystem; explicit network allowlist (github.com, registry.npmjs.org, api.github.com), mirroring the product's own restricted network model (see [Security](security.md)).
- **Harness compatibility** — freebuff (primary), codex, claude-code. Compatibility, never a pin: the same environment equips any supported adapter.

`proagent lock` resolves each capability to a checksummed registry artifact — for example `browser-automation → profile:accessibility-engineer` — making the graph reproducible.

## Compiled Artifacts

`proagent setup` compiles the declared professions into harness artifacts:

- **Composed professional skill** — `.agents/skills/<all-professions>/SKILL.md`, one agent carrying all eight professions, plus its `manifest.json` and knowledge files.
- **Crew skills** — `.agents/skills/<profession>/` per member of the generated agent team (each with `SKILL.md`, a machine-readable `agent.json`, and `references/permissions.md` + `escalation.md`), plus `agent-architecture.json` recording the team decision, members, and handoff graph.
- **Harness config** — the `AGENTS.md` profile block and `.mcp.json` MCP servers.

## The Agent Team

The architecture was derived from a structured interview (`proagent init` → `proagent spec`): decision **agent team**, six profile-bound members mirroring the ACC expertise map.

| Member | Role | Permission shape |
|--------|------|------------------|
| technical-writer | coordinator / documentation | documentation writes, no production access |
| backend-engineer | implementation | working-tree patches, escalation gate outside the tree |
| qa-engineer | review | review comments only |
| security-engineer | review | review comments only |
| devops-engineer | operations | production write, every action human-approved |
| release-engineer | operations | production write, every action human-approved |

Handoffs: backend-engineer sends patches to both reviewers; their verdict aggregates to the coordinator; approved change plans hand off to both operators. The full graph, permissions, and provenance are in `.agents/skills/agent-architecture.json`.

## Regenerating the Environment

### After editing `proagents.yaml`

```bash
proagent resolve            # capability → implementation graph
proagent lock               # persist proagents.lock (checksummed)
proagent validate --spec    # end-to-end spec + lock validation
proagent setup --harness freebuff   # recompile harness artifacts
```

### After changing professions, capabilities, or policies

Edit `proagents.yaml` first, then run the same four commands. Never edit `.agents/skills/` or the `AGENTS.md` profile block by hand — they are build outputs and the next `setup` overwrites them.

### Re-running the interview (full rebuild)

```bash
proagent init --intent "<one-paragraph project objective>"
proagent question --all     # review open questions
proagent answer q_001 "..." # answer each in turn
proagent spec               # derive the architecture (team or single agent)
proagent build              # compile per-agent skills from the session
proagent validate           # validate the architecture graph
```

Interview guidance, learned the hard way:

- The intent should state the objective and stack; every topic word it contains (deploy, secrets, webhook, sub-agent…) pre-answers a question and shortens the questionnaire.
- Answer text feeds the generated skills verbatim — write answers you would accept as skill content.
- Session state lives in `.proagent/` locally; the committed artifacts (`proagents.lock`, `agent-architecture.json`) are the durable record.

### Verification gate

```bash
proagent validate           # architecture: 0 errors, 0 warnings
proagent validate --spec    # spec + lock: no findings
acc check                   # repository contract: 0 diagnostics
```

Also verify the composed skill's knowledge files are present (setup has historically not copied packaged-registry knowledge files, e.g. `knowledge/release-checklist.json`).

## Honesty: What Is and Is Not Enforced

Following the documentation honesty rules:

- **Skills are guidance, not enforcement.** The Freebuff harness (like most harnesses) has no native rule-enforcement surface; `proagent setup` reports this limitation explicitly. Permissions and approval gates in the skill text are advisory.
- **Git guards are declarative.** Force push, branch deletion, and history rewriting are forbidden by `proagents.yaml` policy and the profile rules; actual enforcement must come from the harness or repository protection (the [Protection Layer](protection.md) pattern) once the product implementation lands.
- **MCP servers are real integrations**, resolved from declared capabilities — they run regardless of skill text.
- **Derived content may drift from `.acc/config/`.** Tool lists and permission templates in generated skills come from the environment builder's catalog; when they disagree with `.acc/config/tools/` or this repository's policies, the repository configuration is authoritative — regenerate or correct the catalog input.

## Related

- [Agent Providers](agent-providers.md) — the ProAgents integration contract and what a ProAgent profile may request
- [Product Model](product-model.md) — ecosystem boundaries: ProAgents (WHO), ACC (WHAT), Workspace (WHERE)
- [Security](security.md) — the permission, approval, and network model this environment mirrors
- [Configuration](configuration.md) — the analogous `workspace.yaml` declarative model for workspaces
