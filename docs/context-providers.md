# Context Providers

## Context Provider Contract

```typescript
interface ContextProvider {
  initialize(workspace: Workspace): Promise<void>;
  index(request: ContextIndexRequest): Promise<ContextIndex>;
  query(request: ContextQuery): Promise<ContextResult>;
  status(): Promise<ContextStatus>;
}
```

## Optional Capabilities

```typescript
getSymbol()
getDependencies()
getArchitecture()
getImpact()
getReferences()
getCallGraph()
getGitHistory()
```

Providers declare which capabilities they implement; the kernel never assumes a capability is available.

## ACC Integration (Official)

ACC ([acc-code-context](https://www.npmjs.com/package/acc-code-context)) is the official context provider. ACC is a convention plus an optional CLI that makes repositories agent-native, navigable, and self-describing: `AGENTS.md` contracts, `.acc/config/` control plane, and a durable `.acc-memory.md` knowledge layer.

### Configuration

```yaml
context:
  providers:
    - acc
```

### Behavior

- ACC automatically initializes when installed and enabled
- The ACC provider indexes the repository and exposes its understanding through the generic ContextProvider contract
- The agent can ask questions without the Workspace needing to understand ACC's internal implementation:

```
What depends on this module?
Where is this function used?
What files are affected?
What is the architecture of this package?
Where is authentication implemented?
```

### The `acc` CLI

The Workspace ACC provider is backed by the `acc` CLI:

```bash
npm install -g acc-code-context
```

| Command | Purpose | Contract method |
|---------|---------|-----------------|
| `acc init` | Scaffold `.acc/config/` + root `AGENTS.md` | `initialize` |
| `acc check` | Validate; stable `ACC0xx` diagnostics | `index` / verification |
| `acc context <path>` | Focused, progressive agent context | `query` |
| `acc graph [path]` | Derived architecture graph | `query` / `getArchitecture` |
| `acc slice <path>` | Compact AI-optimized graph slice | `query` |
| `acc inspect <path>` | Roles, owners, deps, constraints | `getSymbol` / `status` |
| `acc dependencies <path>` | Declared vs discovered dependencies | `getDependencies` |
| `acc dependents <path>` | What depends on a path | `getReferences` |
| `acc impact <path>` | Blast radius: dependents, tests, constraints | `getImpact` |
| `acc search <query>` | Architecture-aware search | `query` |
| `acc memory add <path> <text>` | Durable agent knowledge in `.acc-memory.md` | — |

Every command supports `--json` for deterministic, machine-readable output. ACC is offline and deterministic: the same repository state plus the same flags always produce byte-identical output.

### Repository Layout Produced by ACC

```
repository/
├── AGENTS.md                 # Root contract (purpose, dependencies, ownership)
├── .acc/
│   ├── config/
│   │   ├── config.yaml       # ACC configuration
│   │   ├── agents/           # Project-specific agent profiles
│   │   ├── workflows/        # Reproducible procedures
│   │   └── standards/        # Project standards
│   └── state/                # Engine trigger state (disposable)
├── src/auth/
│   └── AGENTS.md             # Contract for the src/auth boundary
├── ACC_WARN.md               # Drift report (gitignored, regenerated)
└── .acc-memory.md            # Durable agent memory (gitignored)
```

### Truth Categorization

Every graph fact carries provenance:

- **Declared** - From `AGENTS.md` (authoritative)
- **Discovered** - From source imports (observational)
- **Inferred** - From `acc discover` (suggestions only)
- **Memory** - From `.acc-memory.md` (agent knowledge)

This provenance feeds [impact-aware verification](verification.md#impact-aware-verification) and [protection context](protection.md#protection-policy-configuration).

## Context Lifecycle

```
Repository ready
      ↓
Context provider initialized
      ↓
Repository scan
      ↓
Index generation
      ↓
Context ready
```

## CLI Commands

```bash
paw context status
paw context rebuild
paw context query
paw context inspect
```

## Other Context Providers

- Filesystem context
- Git context
- Language-server context
- Tree-sitter context
- Custom context