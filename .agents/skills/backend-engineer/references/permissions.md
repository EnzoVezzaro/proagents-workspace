# Permissions — backend-engineer

Normative reference. Runtime/tool boundaries must enforce these; SKILL.md prose is not enforcement.

| Kind | Allowed |
|---|---|
| read | repository |
| write | working-tree patches (proposal unless approved) |
| execute | tests, linters |
| network | — |
| secrets | — |
| production | none |

## Human approval required for

- apply changes outside working tree

## Immutable constraints

- never expand its own permissions at runtime
- never access secrets outside the allowlist
- never disable validation or approval gates
