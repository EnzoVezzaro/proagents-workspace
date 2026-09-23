/**
 * Permission framework (spec section 34) and approval policies.
 *
 * Permissions are declarative: plugins request them in their manifest, the
 * workspace configuration grants them. A plugin never self-grants
 * (spec section 59). Approval modes gate dangerous operations:
 *
 *   autonomous — allowed without prompting
 *   guarded    — dangerous actions require confirmation (default)
 *   manual     — every action requires confirmation
 */
import {
  WorkspaceError,
  type ApprovalMode,
  type WorkspaceConfig,
} from "@proagents/contracts";

export type PermissionCategory =
  | "network"
  | "secrets"
  | "shell"
  | "terminal"
  | "browser"
  | "repository"
  | `filesystem:${"read" | "write"}:${string}`
  | `secrets:${string}`;

export interface PermissionRequest {
  /** Plugin requesting the operation. */
  readonly pluginId: string;
  readonly category: PermissionCategory;
  /** Optional concrete target, e.g. a filesystem path. */
  readonly target?: string;
}

export interface ApprovalRequest {
  readonly operation: string;
  readonly target: string;
  readonly pluginId: string;
}

export type ApprovalDecision = "approved" | "denied";

export interface ApprovalFlow {
  /**
   * Ask for human confirmation. Implementations may prompt on a terminal or,
   * in headless mode, must fail closed with APPROVAL_REQUIRED.
   */
  confirm(request: ApprovalRequest): Promise<ApprovalDecision>;
}

/** Headless approval flow: fails closed (spec section 97 — everything works headless). */
export class HeadlessApprovalFlow implements ApprovalFlow {
  async confirm(request: ApprovalRequest): Promise<ApprovalDecision> {
    throw new WorkspaceError({
      code: "APPROVAL_REQUIRED",
      message: `Operation "${request.operation}" on ${request.target} requires approval, but the workspace is running headless.`,
      provider: request.pluginId,
      recoverable: true,
      suggestions: [
        "Re-run interactively to approve the operation",
        "Set approval.mode: autonomous if this operation is safe to automate",
      ],
    });
  }
}

/** Is `target` contained within the granted `scope`? Relative targets resolve
 *  under the granted root by construction — parent-traversal ("..") is the
 *  provider's own sandbox guard (FILESYSTEM_PATH_DENIED). Absolute targets
 *  must lie strictly inside the granted scope. */
function targetWithin(scope: string, target: string): boolean {
  if (scope === "/") return true;
  if (!target.startsWith("/")) return true;
  if (target === scope) return true;
  return target.startsWith(scope.endsWith("/") ? scope : `${scope}/`);
}

export class PermissionFramework {
  private readonly grants = new Map<string, Set<string>>();
  private readonly config: WorkspaceConfig;
  private readonly approvalFlow: ApprovalFlow;
  /**
   * Extra filesystem scopes granted by a NAMED WORKSPACE ENTRY (spec section
   * 141). These come from the validated workspace.yaml `workspaces:` map —
   * still declarative configuration, never plugin self-grants.
   */
  private readonly extraFsScopes?: { read: readonly string[]; write: readonly string[] };

  constructor(
    config: WorkspaceConfig,
    approvalFlow: ApprovalFlow = new HeadlessApprovalFlow(),
    extraFsScopes?: { read: readonly string[]; write: readonly string[] }
  ) {
    this.config = config;
    this.approvalFlow = approvalFlow;
    this.extraFsScopes = extraFsScopes;
    // Effective grants come from the configuration (declarative), merged with
    // plugin manifest requests at load time via grantPlugin().
  }

  /**
   * A permission framework for plugins activating INTO a named workspace
   * whose filesystem root is `root` (declared in the workspace entry). The
   * returned framework shares the approval flow and adds the declared root
   * to the grantable filesystem scopes.
   */
  forWorkspaceRoot(root: string): PermissionFramework {
    return new PermissionFramework(
      this.config,
      this.approvalFlow,
      { read: [root], write: [root] }
    );
  }

  /** Record the permissions requested by a plugin manifest, intersected with config grants. */
  grantPlugin(pluginId: string, requested: readonly string[]): void {
    const set = new Set<string>();
    for (const permission of requested) {
      if (this.isConfigGranted(permission)) set.add(permission);
    }
    this.grants.set(pluginId, set);
  }

  /**
   * Refine a plugin's scoped permission request during activation — e.g. a
   * filesystem plugin computing its effective root from plugin options.
   * The refined request is intersected with the configuration again, so a
   * plugin can never self-grant beyond what workspace.yaml allows
   * (spec section 59). Contrary to the initial grant, refinement MERGES with
   * the manifest-level grants instead of replacing them.
   */
  refinePlugin(pluginId: string, requested: readonly string[]): void {
    const merged = new Set(this.grants.get(pluginId) ?? []);
    for (const permission of requested) {
      if (this.isConfigGranted(permission)) merged.add(permission);
    }
    this.grants.set(pluginId, merged);
  }

  private isConfigGranted(permission: string): boolean {
    // Category-level permissions are granted by config sections; scoped
    // filesystem/secret permissions are granted by their config lists.
    // `network` is only granted when the configuration explicitly declares a
    // network section — an absent section means no network by default.
    if (permission === "network") return this.config.network?.mode !== undefined && this.config.network.mode !== "offline";
    if (permission === "secrets") return (this.config.permissions?.secrets?.allowed?.length ?? 0) > 0;
    if (permission === "shell" || permission === "terminal") return true;
    if (permission === "browser") return (this.config.tools ?? []).includes("browser");
    if (permission === "repository") return this.config.repository !== undefined;
    const fs = /^filesystem:(read|write):(.+)$/.exec(permission);
    if (fs) {
      const scope = fs[2] as string;
      const list = [
        ...(fs[1] === "read"
          ? (this.config.permissions?.filesystem?.read ?? [])
          : (this.config.permissions?.filesystem?.write ?? [])),
        // Named-workspace roots are declared configuration (spec 141).
        ...((fs[1] === "read" ? this.extraFsScopes?.read : this.extraFsScopes?.write) ?? []),
      ];
      // The requested SCOPE must be INSIDE a granted scope — never a suffix
      // match: granting /workspace/repo must not cover /etc/workspace/repo.
      // The scope `list` items are the granted prefixes; we must only grant
      // when the requested scope is a child of (or exactly) a granted prefix.
      return list.some((allowed) => allowed === "/" || scope === allowed || scope.startsWith(allowed.endsWith("/") ? allowed : `${allowed}/`));
    }
    const secret = /^secrets:(.+)$/.exec(permission);
    if (secret) {
      const name = secret[1];
      return name !== undefined && (this.config.permissions?.secrets?.allowed ?? []).includes(name);
    }
    return false;
  }

  /** Check-and-enforce. Throws PERMISSION_DENIED when not granted. */
  require(request: PermissionRequest): void {
    const granted = this.grants.get(request.pluginId);
    if (granted && this.matches(granted, request)) return;
    throw new WorkspaceError({
      code: "PERMISSION_DENIED",
      message: `Plugin "${request.pluginId}" lacks permission ${request.category}${request.target ? ` for ${request.target}` : ""}.`,
      provider: request.pluginId,
      recoverable: false,
      suggestions: [
        "Grant the permission in workspace.yaml under permissions",
        "Declare the permission in the plugin manifest",
      ],
    });
  }

  private matches(granted: Set<string>, request: PermissionRequest): boolean {
    if (granted.has(request.category)) {
      // A scoped filesystem grant is still containment-checked against an
      // absolute target: granting /workspace/repo must not cover
      // /workspace/repository even when the exact category matches.
      if (request.target !== undefined) {
        const scoped = /^filesystem:(?:read|write):(.+)$/.exec(request.category);
        if (scoped !== null) return targetWithin(scoped[1] as string, request.target);
      }
      return true;
    }
    if (request.target === undefined) return false;
    for (const g of granted) {
      const filesystem = /^filesystem:(read|write):(.+)$/.exec(g);
      if (filesystem) {
        if (targetWithin(filesystem[2] as string, request.target)) return true;
        continue;
      }
      const secret = /^secrets:(.+)$/.exec(g);
      if (secret && secret[1] !== undefined && request.target === secret[1]) return true;
    }
    return false;
  }

  has(request: PermissionRequest): boolean {
    try {
      this.require(request);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Approval gate for dangerous operations (spec section 34).
   * autonomous → approved; guarded → confirm only for dangerous ops;
   * manual → always confirm.
   */
  async approve(request: ApprovalRequest, dangerous: boolean): Promise<ApprovalDecision> {
    const mode: ApprovalMode = this.config.approval?.mode ?? "guarded";
    if (mode === "autonomous") return "approved";
    if (mode === "guarded" && !dangerous) return "approved";
    return this.approvalFlow.confirm(request);
  }

  get mode(): ApprovalMode {
    return this.config.approval?.mode ?? "guarded";
  }
}
