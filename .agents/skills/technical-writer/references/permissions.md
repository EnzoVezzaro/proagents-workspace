# Permissions — technical-writer

Normative reference. Runtime/tool boundaries must enforce these; SKILL.md prose is not enforcement.

| Kind | Allowed |
|---|---|
| read | repository, artifacts |
| write | documentation files |
| execute | — |
| network | — |
| secrets | — |
| production | none |

## Human approval required for

- (nothing: this agent has no gated actions)

## Immutable constraints

- never expand its own permissions at runtime
- never access secrets outside the allowlist
- never disable validation or approval gates
