/**
 * Service definitions — how capabilities are requested (spec sections 6–7).
 *
 * `services.get(repositoryProvider)` is the only sanctioned way to obtain a
 * capability. Direct instantiation (`new GitHubService()`) is forbidden
 * (architecture standard, spec section 139).
 */

/**
 * A typed service definition. Ids are stable identifiers; contract versions
 * gate compatibility (spec section 120).
 */
export interface ServiceDefinition<T = unknown> {
  readonly id: string;
  readonly contractVersion: string;
  /** Permission categories the capability requires to operate. */
  readonly requiredPermissions?: readonly string[];
  /**
   * Phantom type marker — never set at runtime. It keeps the type parameter
   * `T` (the capability's implementation type) in the type so inference flows
   * through the registry (`services.get(definition): T`, spec section 139).
   */
  readonly "@type"?: T | undefined;
}

export function defineService<T>(definition: ServiceDefinition<T>): ServiceDefinition<T> {
  return definition;
}

/** Helper for compile-time inference: const def = defineService<MyType>({...}) */
export type ServiceOf<D> = D extends ServiceDefinition<infer T> ? T : never;
