# Permissions — release-engineer

Normative reference. Runtime/tool boundaries must enforce these; SKILL.md prose is not enforcement.

| Kind | Allowed |
|---|---|
| read | repository, infrastructure config, logs |
| write | — |
| execute | declared operational procedures |
| network | — |
| secrets | — |
| production | write |

## Human approval required for

- every production action

## Immutable constraints

- never expand its own permissions at runtime
- never access secrets outside the allowlist
- never disable validation or approval gates
