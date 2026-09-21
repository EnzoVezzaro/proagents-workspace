# Workflow: New Provider

The workflow for implementing a new capability provider (runtime, repository, context, agent, browser, secrets, etc.) or modifying an existing one.

## When to use

- Implementing any `*Provider` contract from spec section 9
- Changing a provider's implementation

## Steps

1. **Read before writing.**
   - Root contract: `AGENTS.md`
   - Standards: `.acc/config/standards/architecture.md`, `.acc/config/standards/security.md`, `.acc/config/standards/typescript.md`
   - The capability contract in the spec (spec section 9 for the list; each contract has its own section)
   - `.acc-memory.md` for prior lessons

2. **Confirm the boundary.**
   - The implementation lives in `plugins/<provider>/` — never in `packages/core` (spec sections 117, 139).
   - The kernel learns about the provider only through the service registry and typed events.

3. **Implement the contract.**
   - Start from `.acc/config/templates/provider-contract.md`.
   - TypeScript, strict typing; validate external config with Zod at the boundary (spec section 119).
   - Declare compatible API versions (spec section 120).
   - Emit the typed events for your capability (spec section 7).
   - Expose health for `paw doctor` (spec section 62).

4. **Register and resolve.**
   - Plugin manifest declares capabilities, dependencies, permissions, compatibility (spec section 59) — use `.acc/config/templates/plugin-manifest.json`.
   - Dependencies resolve through the kernel; failure reports clearly (spec section 49).
   - Capability requests resolve or honestly report "unavailable" with alternatives — never silently provide a weaker capability (spec section 48).

5. **Test against the contract suite.**
   - The provider is not compatible until it passes its contract suite: `RuntimeProviderContract`, `RepositoryProviderContract`, `ContextProviderContract`, `AgentProviderContract`, … (spec section 90).
   - Add integration coverage where possible — same workflow, multiple providers (spec section 91).

6. **Honor security.**
   - Every operation flows through the permission framework; protection intervenes before execution (spec sections 33–35, 101–102).
   - Secrets injected at runtime, scoped credentials, never logged.

7. **Document.**
   - Update the matching provider doc in `docs/` (runtime → `runtime-providers.md`, repository → `repository-providers.md`, context → `context-providers.md`, agent → `agent-providers.md`).
   - Sync from the spec; keep CLI examples on `paw`.

8. **Validate.**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   acc check
   # link check + index check for docs changes
   ```

9. **Record durable knowledge.**
   ```bash
   acc memory add . "<lesson learned>"
   ```

## Guardrails

- If the provider seems to need a kernel change, stop — restate the need as a contract extension or typed event and propose that instead (spec section 139).
- A provider that cannot enforce a declared restriction must report it, never degrade silently.
- Local/zero-cloud capability must not regress when a cloud provider is added (spec section 123).
