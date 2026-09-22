/**
 * Health check aggregation for `paw doctor` (spec sections 62–63).
 * Aggregates provider health from every activated plugin.
 */
import type { ProviderHealth } from "@proagents/contracts";
import type { WorkspacePlugin } from "./plugin-loader.js";

export interface DoctorEntry {
  readonly pluginId: string;
  readonly health: ProviderHealth;
  /** Set when the health came from a registered capability provider. */
  readonly serviceId?: string;
}

export async function aggregateHealth(
  plugins: readonly WorkspacePlugin[],
  services?: import("./service-registry.js").ServiceRegistry
): Promise<DoctorEntry[]> {
  const entries: DoctorEntry[] = [];
  const reported = new Set<string>();

  // Provider-level health first: every registered capability implementation
  // carries health() on the ProviderBase contract (spec sections 9, 62–63).
  if (services !== undefined) {
    for (const registration of services.registrations()) {
      const implementation = registration.implementation as
        | { health?: () => Promise<ProviderHealth> }
        | undefined;
      if (implementation?.health === undefined) continue;
      let health: ProviderHealth;
      try {
        health = await implementation.health();
      } catch (error) {
        health = {
          status: "unavailable",
          message: error instanceof Error ? error.message : String(error),
        };
      }
      entries.push({ pluginId: registration.pluginId, health, serviceId: registration.definition.id });
      reported.add(registration.pluginId);
    }
  }

  // Plugin-level health for plugins without a registered provider.
  for (const plugin of plugins) {
    if (reported.has(plugin.manifest.id) || plugin.health === undefined) continue;
    let health: ProviderHealth;
    try {
      health = await plugin.health();
    } catch (error) {
      health = {
        status: "unavailable",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    entries.push({ pluginId: plugin.manifest.id, health });
  }
  return entries;
}
