/**
 * Stable error codes (spec section 99).
 *
 * Error codes are a stability contract (versioning standard): codes are never
 * reused, and removing or retyping one requires a schema major bump.
 */
export const ErrorCode = {
  // workspace
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  // convention-first local mode (spec section 148)
  PROJECT_NOT_INITIALIZED: "PROJECT_NOT_INITIALIZED",
  WORKSPACE_ALREADY_EXISTS: "WORKSPACE_ALREADY_EXISTS",
  WORKSPACE_INVALID_STATE: "WORKSPACE_INVALID_STATE",
  WORKSPACE_ALREADY_MOUNTED: "WORKSPACE_ALREADY_MOUNTED",
  // sandbox policy (spec section 142): fail closed rather than run unconfined
  SANDBOX_UNAVAILABLE: "SANDBOX_UNAVAILABLE",
  SANDBOX_POLICY_VIOLATION: "SANDBOX_POLICY_VIOLATION",
  // configuration
  CONFIG_INVALID: "CONFIG_INVALID",
  CONFIG_VERSION_UNSUPPORTED: "CONFIG_VERSION_UNSUPPORTED",
  // plugin manifest & lifecycle
  PLUGIN_MANIFEST_INVALID: "PLUGIN_MANIFEST_INVALID",
  PLUGIN_NOT_FOUND: "PLUGIN_NOT_FOUND",
  PLUGIN_INCOMPATIBLE: "PLUGIN_INCOMPATIBLE",
  PLUGIN_DEPENDENCY_MISSING: "PLUGIN_DEPENDENCY_MISSING",
  PLUGIN_DEPENDENCY_CYCLE: "PLUGIN_DEPENDENCY_CYCLE",
  PLUGIN_LOAD_FAILED: "PLUGIN_LOAD_FAILED",
  PLUGIN_INIT_FAILED: "PLUGIN_INIT_FAILED",
  // services & capabilities
  SERVICE_NOT_REGISTERED: "SERVICE_NOT_REGISTERED",
  SERVICE_ALREADY_REGISTERED: "SERVICE_ALREADY_REGISTERED",
  CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
  CONTRACT_VERSION_MISMATCH: "CONTRACT_VERSION_MISMATCH",
  // permissions & approval
  PERMISSION_DENIED: "PERMISSION_DENIED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  // protection
  PROTECTION_BLOCKED: "PROTECTION_BLOCKED",
  // runtime
  RUNTIME_UNAVAILABLE: "RUNTIME_UNAVAILABLE",
  RUNTIME_START_FAILED: "RUNTIME_START_FAILED",
  // repository & git
  REPOSITORY_CLONE_FAILED: "REPOSITORY_CLONE_FAILED",
  GIT_OPERATION_BLOCKED: "GIT_OPERATION_BLOCKED",
  GIT_COMMAND_FAILED: "GIT_COMMAND_FAILED",
  // filesystem & shell
  FILESYSTEM_PATH_DENIED: "FILESYSTEM_PATH_DENIED",
  SHELL_COMMAND_DENIED: "SHELL_COMMAND_DENIED",
  SHELL_COMMAND_FAILED: "SHELL_COMMAND_FAILED",
  // context & agent
  CONTEXT_PROVIDER_UNAVAILABLE: "CONTEXT_PROVIDER_UNAVAILABLE",
  AGENT_PROVIDER_UNAVAILABLE: "AGENT_PROVIDER_UNAVAILABLE",
  // terminal (real PTY surfaces for the workspace UI)
  TERMINAL_UNAVAILABLE: "TERMINAL_UNAVAILABLE",
  TERMINAL_NOT_FOUND: "TERMINAL_NOT_FOUND",
  // CLI & SDK
  COMMAND_NOT_FOUND: "COMMAND_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // verification
  VERIFICATION_FAILED: "VERIFICATION_FAILED",
  // secrets
  SECRET_NOT_ALLOWED: "SECRET_NOT_ALLOWED",
  SECRET_RESOLVE_FAILED: "SECRET_RESOLVE_FAILED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Structured error shape (spec section 99): stable code, message, provider,
 * recoverability and actionable suggestions. Every thrown WorkspaceError
 * serializes to this shape for `--json` output.
 */
export interface WorkspaceErrorShape {
  readonly code: ErrorCode;
  readonly message: string;
  readonly provider?: string;
  readonly recoverable: boolean;
  readonly suggestions: readonly string[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export class WorkspaceError extends Error implements WorkspaceErrorShape {
  readonly code: ErrorCode;
  readonly provider?: string;
  readonly recoverable: boolean;
  readonly suggestions: readonly string[];
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(shape: WorkspaceErrorShape) {
    super(shape.message);
    this.name = "WorkspaceError";
    this.code = shape.code;
    this.provider = shape.provider;
    this.recoverable = shape.recoverable;
    this.suggestions = shape.suggestions;
    this.details = shape.details;
  }

  toJSON(): WorkspaceErrorShape {
    return {
      code: this.code,
      message: this.message,
      ...(this.provider !== undefined ? { provider: this.provider } : {}),
      recoverable: this.recoverable,
      suggestions: this.suggestions,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export function isWorkspaceError(value: unknown): value is WorkspaceError {
  return value instanceof WorkspaceError;
}
