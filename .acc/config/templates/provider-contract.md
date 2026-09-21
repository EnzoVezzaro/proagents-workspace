# {{name}}Provider — Capability Contract Template

Template for defining a new capability contract. Copy, fill, and register — see `.acc/config/workflows/new-provider.md`.

```typescript
import type { ServiceDefinition } from "@proagents/workspace";

/**
 * {{name}} capability contract (spec section 9 registry).
 * Version: 1.0.0
 *
 * The contract is the only thing the kernel knows about {{name}}.
 * Implementations live in plugins and are discovered through the
 * service registry — never instantiated directly (spec sections 6–7).
 */
export interface {{name}}Provider {
  /** Human-readable provider name for `paw doctor` and logs. */
  readonly name: string;

  /** Version of this contract the implementation declares (spec section 120). */
  readonly contractVersion: string;

  /** Health for `paw doctor` (spec sections 62–63). */
  health(): Promise<ProviderHealth>;

  // --- capability operations -------------------------------------------
  // One method per operation. Every operation:
  //   - validates its request with the capability's Zod schema
  //   - flows through the permission framework
  //   - runs protection BEFORE executing when enabled (spec sections 101–102)
  //   - emits the capability's typed events (spec section 7)
  //   - never logs secrets (spec section 100)
  //
  // {{operation}}(request: {{name}}Request): Promise<{{name}}Result>;
}

/** Service definition used by `services.get({{name}}Provider)`. */
export const {{name}}ProviderDefinition: ServiceDefinition<{{name}}Provider> = {
  id: "{{slug}}",
  contractVersion: "1.0.0",
  requiredPermissions: [
    // Declare the permission categories this capability needs.
    // The kernel enforces these; the plugin never self-grants (spec section 59).
  ],
};
```

## Checklist for a new contract

- [ ] Added to the capability contract registry (spec section 9) via spec change (`.acc/config/workflows/spec-change.md`)
- [ ] Zod request/response schemas exported next to the contract (spec section 119)
- [ ] Typed events defined (`{{slug}}/*`) and documented in the events section (spec section 7)
- [ ] Contract suite (`{{name}}ProviderContract`) written before the first implementation (spec section 90)
- [ ] `paw doctor` health surface defined (spec sections 62–63)
- [ ] Matching `docs/` page updated; CLI examples on `paw`
- [ ] No provider-specific business logic anywhere in the contract (spec section 139)
