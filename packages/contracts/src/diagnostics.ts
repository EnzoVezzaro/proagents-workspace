/**
 * Stable diagnostic codes (spec section 153) — the `paw check` registry.
 *
 * The Workspace's own drift-check system. Product boundaries apply (spec
 * section 2): ACC checks context (`acc check`, the ACC0xx registry) and
 * ProAgents checks its agent environment (`proagent validate --spec`) —
 * this registry is fully independent of both: no check reads ACC or
 * ProAgents files, and no ACC/ProAgents release affects these codes.
 *
 * Codes are a stability contract (versioning standard): never reused;
 * removing or retyping one requires a schema major bump.
 */
export const PawDiagnosticCode = {
  /** install/manifest.yaml version does not match the released CLI version. */
  MANIFEST_VERSION_DRIFT: "PAW001",
  /** The repo CLI package version does not match the released CLI version. */
  PACKAGE_VERSION_DRIFT: "PAW002",
  /** The spec section count claimed in AGENTS.md does not match README.md. */
  SPEC_SECTION_COUNT_DRIFT: "PAW003",
  /** The AGENTS.md template and the SDK generator have drifted apart. */
  TEMPLATE_GENERATOR_DRIFT: "PAW004",
  /** A bootstrap contract file of the install contract folder is missing. */
  CONTRACT_FILE_MISSING: "PAW005",
  /** .paw/workspace.yaml fails schema validation. */
  CONFIG_INVALID: "PAW006",
  /** A docs/spec section citation points beyond the actual spec length. */
  SECTION_CITATION_STALE: "PAW007",
  /** The current version has no CHANGELOG entry. */
  CHANGELOG_ENTRY_MISSING: "PAW008",
  /** A documented command is missing from docs/cli-reference.md (or vice versa). */
  DOC_PACT_DRIFT: "PAW009",
  /** .paw/state/lifecycle-state.json exists but is not readable JSON. */
  LIFECYCLE_STATE_UNREADABLE: "PAW010",
  /** Nothing matched a checkable scope (neither framework nor initialized workspace). */
  NO_CHECKS_RAN: "PAW011",
} as const;

export type PawDiagnosticCode = (typeof PawDiagnosticCode)[keyof typeof PawDiagnosticCode];
