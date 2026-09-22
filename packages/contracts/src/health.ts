/**
 * Provider health surface for `paw doctor` (spec sections 62–63).
 */
export type HealthStatus = "healthy" | "degraded" | "unavailable" | "unknown";

export interface ProviderHealth {
  readonly status: HealthStatus;
  /** Human-readable summary, e.g. "docker daemon reachable". */
  readonly message: string;
  /** Optional structured detail (versions, latency, hint commands). */
  readonly details?: Readonly<Record<string, unknown>>;
}
