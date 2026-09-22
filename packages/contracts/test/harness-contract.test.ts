/**
 * Contract suite for the harness capability (written before any adapter).
 *
 * The Workspace is the policy/verification backend for coding harnesses:
 * host-harness hooks translate into typed events where Repo Shield can veto
 * before execution. Adapters implement the `HarnessProvider` contract as
 * plugins (capability: harness); this suite pins the CONTRACT surface so an
 * implementation is only "compatible" when it satisfies it (spec section 90;
 * freebuff's spec change for README section 9 + a harness section).
 */
import { describe, expect, it } from "vitest";
import { defineService } from "../src/services.js";
import type {
  HarnessDecision,
  HarnessEnforcement,
  HarnessHandle,
  HarnessIntegrationTier,
  HarnessProvider,
  ProviderBase,
} from "../src/providers.js";
import type { WorkspaceEventName } from "../src/events.js";

/** A conforming Tier-2 adapter used to pin the contract shape. */
const processAdapter = {
  name: "harness-toy",
  contractVersion: "1.0.0",
  tier: "process" as const,
  async health() {
    return { status: "healthy", message: "toy adapter attached" };
  },
  async available() {
    return true;
  },
  async attach(request: { harness: string; workspaceId: string; cwd?: string }) {
    return { adapterId: "harness-toy:1", tier: "process" as const, sessionId: undefined };
  },
  async detach() {},
  async enforce(handle: HarnessHandle, decision: HarnessDecision): Promise<HarnessEnforcement> {
    return { applied: false, enforcement: "advisory", note: `decision ${decision.action} on ${decision.event} reported (Tier 2)` };
  },
} as const;

// Type-level contract pin: the fake must satisfy the contract, and a
// Tier-2 adapter may not be typed as `native`. Checked by `pnpm typecheck`
// once test sources enter the include; Vitest exercises the runtime side.
type _Conforms = { readonly [K in keyof HarnessProvider]: (typeof processAdapter)[K] };
const _payload: HarnessDecision = { event: "model/before" as WorkspaceEventName, action: "blocked", reason: "policy demo" };

describe("HarnessProvider contract", () => {
  it("defines exactly the two honest integration tiers", () => {
    const tiers: readonly HarnessIntegrationTier[] = ["native", "process"];
    expect(tiers).toContain(processAdapter.tier);
    // A Tier-2 (process) adapter must never claim native — honesty about
    // reduced observability is part of the contract.
    expect(processAdapter.tier).toBe("process");
  });

  it("keeps the typed service definition usable through defineService", () => {
    const definition = defineService<typeof processAdapter>({
      id: "harness",
      contractVersion: "1.0.0",
      requiredPermissions: [],
    });
    expect(definition.id).toBe("harness");
    expect(definition.contractVersion).toBe("1.0.0");
    expect(_payload.event).toMatch(/^[a-z]+(\/[a-z0-9-]+)+$/);
  });

  it("reports enforcement honestly on an advisory surface", async () => {
    const viaRegistry: ProviderBase = processAdapter;
    expect(viaRegistry.name).toBe("harness-toy");
    const enforcement = await processAdapter.enforce(
      { adapterId: "harness-toy:1", tier: "process" },
      _payload
    );
    // The contract forbids claiming a block that was not enforced.
    expect(enforcement.enforcement).toBe("advisory");
    expect(enforcement.applied).toBe(false);
  });
});