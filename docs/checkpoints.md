# Checkpoints and Gates

The Workspace execution model is a **checkpoint + gate loop** (spec section 150):

> **Small work → isolated context → objective evidence → hard gate → feedback → retry → proven checkpoint → next checkpoint.**

The core rule is normative:

> **ATTEMPT ≠ COMPLETION.** An agent saying "finished" is an attempt. Only gates complete a checkpoint.

## Checkpoint Plans

Plans live at `.paw/checkpoints.json` (convention) or anywhere you point `checkpoints.plan` to in `.paw/workspace.yaml`:

```json
{
  "version": 1,
  "title": "Ship the dashboard",
  "checkpoints": [
    {
      "id": "CP-001",
      "title": "Auth service returns sessions",
      "description": "Implement the session endpoint against the auth contract.",
      "gates": [
        { "id": "tests", "kind": "behavior", "config": { "command": "pnpm test auth" } },
        { "id": "shield", "kind": "security" },
        { "id": "review", "kind": "adversarial", "policy": { "maxRetries": 2 } }
      ],
      "acceptanceCriteria": [
        { "id": "ac1", "description": "expired sessions return 401", "command": "pnpm verify:expired" }
      ]
    },
    {
      "id": "CP-002",
      "title": "Dashboard renders real data",
      "dependencies": ["CP-001"],
      "visualReference": { "type": "prototype", "path": ".paw/research/prototypes/dashboard.html" },
      "gates": [
        { "id": "tests", "kind": "behavior", "config": { "command": "pnpm test dashboard" } },
        { "id": "look", "kind": "visual", "config": { "provider": "any-vision-model" } },
        { "id": "human", "kind": "human", "config": { "question": "Does the dashboard match the product intent?" } }
      ]
    }
  ]
}
```

Checkpoints form a DAG (`dependencies`) — parallel tracks merge naturally. Every gate produces **evidence** (status, findings, duration) or nothing; a crashed gate can never pass a checkpoint.

## Gates Are Plugins

Gates resolve through the service registry against the `gate` capability. The kernel never hard-codes gate logic (spec sections 139/146). Bundled:

| Gate | Proves | Failure behavior |
|------|--------|------------------|
| `behavior` | a command exits 0 (tests, build, custom scripts) | blocker finding with the command's stderr |
| `security` | Repo Shield's protection evaluation, inside the loop | fails CLOSED without a protection provider |
| `adversarial` | a fresh-context reviewer agent finds ZERO unresolved blockers | skipped (advisory) without a registered agent |
| `human` | product-authority approval via the approval flow | advisory skip in autonomous mode — honestly reported |
| `visual` | implementation matches a declared visual reference (pluggable reviewer) | findings with severity + location |

Custom gates are plugins implementing `GateProvider`:

```typescript
definePlugin({
  manifest: { id: "gate-a11y", provider: "accessibility", capabilities: ["gate"], ... },
  activate(ctx) {
    ctx.services.register(defineService<GateProvider>({ id: "gate:accessibility", contractVersion: "1.0.0" }), {
      name: "gate-a11y", contractVersion: "1.0.0",
      health: async () => ({ status: "healthy", message: "ready" }),
      evaluate: async (context) => ({ gateId: context.gate.id, status: "passed", findings: [], durationMs: 0 }),
    }, "gate-a11y");
  },
});
```

## The Adversarial Loop

The reviewer's context is deliberately SMALL and FRESH — never the implementer's conversation:

```text
checkpoint + diff + relevant ACC context + architecture rules + tests + acceptance criteria
```

A failed adversarial gate returns structured findings; the host feeds them to a fixer agent and re-runs the gate until zero blockers remain or the retry budget is spent. Human rejection is converted into learnings and a follow-up checkpoint — the human is the product authority, not the implementation engine.

## Commands

```bash
paw checkpoint list                     # plan order, dependencies, gates [--json]
paw checkpoint run                      # run the plan in dependency order (fail-closed)
paw checkpoint run --checkpoint CP-001  # run a single checkpoint
paw checkpoint status [--json]          # plan state
```

Progress flows over typed events (`checkpoint/*`) — any interface built on them is a projection, never the source of truth.

## Related

- [Development Lifecycle](lifecycle.md) — the programmable stage model
- [Agent Providers](agent-providers.md) — the agents gates and checkpoints orchestrate
- [Protection Layer](protection.md) — Repo Shield, the security gate's engine
- [Agent Environment](agent-environment.md) — ProAgents profiles/crews that provide reviewers and implementers
