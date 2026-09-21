# Workflow: New Plugin

The workflow for creating a new plugin package for ProAgents Workspace — the only sanctioned way to add capability to the product.

## When to use

- Creating any new plugin (`plugins/<name>/`)
- Packaging a capability for `paw plugin install <name>` (spec section 58)

## Steps

1. **Read before writing.**
   - Root contract: `AGENTS.md`
   - Agent profile: `.acc/config/agents/plugin-engineer.md`
   - Standards: `.acc/config/standards/architecture.md`, `.acc/config/standards/versioning.md`, `.acc/config/standards/security.md`
   - `.acc-memory.md` for prior lessons

2. **Classify the plugin.**
   - Capability provider (implements a contract from spec section 9) → also follow `.acc/config/workflows/new-provider.md`.
   - Tool/service (MCP server, browser, database, storage) → declares tools & permissions.
   - Cross-cutting layer (protection, distribution) → implements `ProtectionProvider` / `DistributionProvider`.

3. **Scaffold the package.**
   ```text
   plugins/<name>/
   ├── package.json        # from .acc/config/templates/plugin-manifest.json
   ├── src/
   ├── test/               # contract suite + unit tests
   ├── README.md
   └── AGENTS.md           # contract for this boundary (acc document <path> --apply)
   ```

4. **Declare the manifest (required fields, spec section 59).**
   ```text
   id · name · version · description · capabilities · dependencies
   configuration · permissions · compatibility · runtime requirements
   license · integrity
   ```
   Optional: documentation, examples, health checks, upgrade policy, migration information.

5. **Implement the lifecycle (spec section 60).**
   ```text
   discover → resolve dependencies → validate → load → initialize
   → register services → register events → start → running → stop → dispose
   ```
   - Failures unwind cleanly — test the dispose path.
   - Optional failure marks the capability unavailable; the workspace keeps running (spec section 61).
   - Critical dependencies fail fast.

6. **Declare permissions honestly.**
   - Permissions in the manifest are enforced by the kernel — the plugin never grants itself more than it declares.
   - Network, filesystem, secrets, Git permissions are explicit.

7. **Health & doctor.**
   - Expose health checks so `paw doctor` can report your plugin (spec sections 62–63).

8. **Test.**
   - Contract suite for the implemented capability (spec section 90).
   - Isolation test: fail your plugin deliberately, verify unrelated capabilities survive (spec section 61).
   - Dependency resolution test: missing dependency reports clearly (spec section 49).

9. **Validate.**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   acc check
   ```

10. **Record durable knowledge.**
    ```bash
    acc memory add . "<lesson learned>"
    ```

## Guardrails

- Never solve a provider-specific problem in the kernel to make a plugin easier (spec section 139).
- Never ship a plugin without the manifest complete — unknown capabilities or undeclared permissions are load failures.
- Never publish without license and version fields consistent across packages.
