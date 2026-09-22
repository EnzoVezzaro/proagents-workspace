/**
 * Service registry (spec sections 6–7) and capability registry (spec section 9).
 *
 * Capabilities are requested through service definitions:
 *   const repository = services.get(repositoryProviderDefinition);
 * Direct instantiation of providers is forbidden outside their plugin.
 */
import {
  CAPABILITIES,
  WorkspaceError,
  type CapabilityId,
  type ServiceDefinition,
} from "@proagents/contracts";
import { satisfiesRange } from "./semver.js";

interface Registration<T> {
  definition: ServiceDefinition<T>;
  implementation: T;
  /** Plugin id that registered the service (for doctor output). */
  pluginId: string;
}

export class ServiceRegistry {
  private readonly services = new Map<string, Registration<unknown>>();

  /**
   * Register a service implementation for a definition. A definition may only
   * be registered once — ambiguity in capability resolution is a defect
   * (spec section 48: the kernel never assumes availability).
   */
  register<T>(definition: ServiceDefinition<T>, implementation: T, pluginId: string): void {
    if (this.services.has(definition.id)) {
      throw new WorkspaceError({
        code: "SERVICE_ALREADY_REGISTERED",
        message: `Service "${definition.id}" is already registered (by plugin "${this.services.get(definition.id)?.pluginId}").`,
        recoverable: false,
        suggestions: [
          "Only one plugin may provide a capability at a time",
          "Disable the conflicting plugin in workspace.yaml",
        ],
      });
    }
    this.services.set(definition.id, {
      definition,
      implementation: implementation as unknown,
      pluginId,
    });
  }

  has(definition: ServiceDefinition<unknown>): boolean {
    return this.services.has(definition.id);
  }

  get<T>(definition: ServiceDefinition<T>): T {
    const registration = this.services.get(definition.id);
    if (!registration) {
      throw new WorkspaceError({
        code: "SERVICE_NOT_REGISTERED",
        message: `Service "${definition.id}" is not registered — no plugin provided this capability.`,
        recoverable: true,
        suggestions: [
          "Add a plugin that implements this capability to workspace.yaml",
          "Run `paw doctor` to inspect registered capabilities",
        ],
      });
    }
    const required = definition.contractVersion;
    if (required && !satisfiesRange(registration.definition.contractVersion, `^${required}`)) {
      throw new WorkspaceError({
        code: "CONTRACT_VERSION_MISMATCH",
        message: `Service "${definition.id}" declares contract ${registration.definition.contractVersion}, which does not satisfy required ${required}.`,
        recoverable: false,
        suggestions: ["Upgrade the providing plugin", "Pin a compatible contract version"],
        details: {
          registeredBy: registration.pluginId,
          declared: registration.definition.contractVersion,
          required,
        },
      });
    }
    return registration.implementation as T;
  }

  /** Registration metadata for `paw doctor` / `paw service list`. */
  list(): readonly {
    id: string;
    contractVersion: string;
    pluginId: string;
    capability?: CapabilityId;
  }[] {
    return [...this.services.values()].map((r) => ({
      id: r.definition.id,
      contractVersion: r.definition.contractVersion,
      pluginId: r.pluginId,
      capability: isCapabilityId(r.definition.id) ? r.definition.id : undefined,
    }));
  }

  /** Raw registrations for health aggregation and diagnostics. */
  registrations(): readonly { definition: ServiceDefinition<unknown>; implementation: unknown; pluginId: string }[] {
    return [...this.services.values()];
  }

  private byCapabilityCache?: Map<CapabilityId, unknown>;

  /** Resolve the implementation registered for a capability id, if any. */
  capability(id: CapabilityId): unknown | undefined {
    this.byCapabilityCache ??= (() => {
      const map = new Map<CapabilityId, unknown>();
      for (const r of this.services.values()) {
        if (isCapabilityId(r.definition.id)) map.set(r.definition.id, r.implementation);
      }
      return map;
    })();
    return this.byCapabilityCache.get(id);
  }
}

export function isCapabilityId(id: string): id is CapabilityId {
  return (CAPABILITIES as readonly string[]).includes(id);
}
