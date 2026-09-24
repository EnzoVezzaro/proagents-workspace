/**
 * Plugin manifest schema (spec section 59).
 *
 * The kernel reads the `proagents` key as machine-readable metadata:
 * capabilities, dependencies, permissions, compatibility. Zod-validated at
 * the boundary (TypeScript standard, spec section 119).
 */
import { z } from "zod";

/** Semver range used for compatibility declarations (e.g. `^1.0.0`). */
export const semverRangeSchema = z.string().regex(
  /^\^?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
  "must be a semver range like ^1.0.0 or 1.2.3"
);

/**
 * Permission categories a plugin may request. The kernel enforces these;
 * a plugin never self-grants (spec section 59).
 */
export const permissionSchema = z.string().superRefine((value, ctx) => {
  const valid = [
    "network",
    "secrets",
    "shell",
    "terminal",
    "browser",
    "repository",
  ];
  const fsWrite = /^filesystem:(read|write):(?<glob>.+)$/;
  const fsLegacy = /^filesystem:(?<glob>.+)$/;
  const secretNamed = /^secrets:(?<name>[a-zA-Z0-9_-]+)$/;
  if (valid.includes(value)) return;
  if (fsWrite.test(value) || fsLegacy.test(value) || secretNamed.test(value)) return;
  ctx.addIssue({
    code: "custom",
    message: `invalid permission "${value}" — expected a category (network, secrets, shell, terminal, browser, repository) or a scoped form (filesystem:read:/path, secrets:NAME)`,
  });
});

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "plugin id must be kebab-case"),
  name: z.string().min(1),
  /** MUST be a real semver (or `*`); a free-form string silently disables
   *  the incompatibility gate, so the catch-all arm is not allowed. */
  version: semverRangeSchema.or(z.literal("*")),
  description: z.string().optional(),
  /**
   * The capability provider VALUE this plugin serves (spec section 9
   * vocabulary), e.g. runtime plugin `local`, context plugin `acc`. The
   * kernel compares config provider values against this declarative field —
   * it never maps provider names itself (kernel purity). Falls back to the
   * plugin id when absent.
   */
  provider: z.string().min(1).optional(),
  /** Capability contracts this plugin implements, e.g. ["runtime", "filesystem"]. */
  capabilities: z.array(z.string().min(1)).min(1),
  /** Service or plugin ids this plugin requires to be present. */
  dependencies: z.array(z.string().min(1)).default([]),
  /** Permission requests — enforced by the kernel, never self-granted. */
  permissions: z.array(permissionSchema).default([]),
  /** Contract API versions this plugin is compatible with. */
  compatibility: z.record(z.string(), semverRangeSchema).default({}),
  /** Optional Zod schema (JSON) for the plugin's configuration section. */
  configurationSchema: z.record(z.string(), z.unknown()).optional(),
  /**
   * Runtime descriptor (plugin-first, spec section 146): how this plugin's
   * capability is materialized OUTSIDE the kernel — e.g. the CLI binary an
   * agent plugin launches. Declared by the plugin, consumed generically by
   * the product layer; the kernel never interprets it (no provider logic).
   */
  runtime: z
    .object({
      /** How the capability runs: a CLI process, an in-process service, … */
      kind: z.enum(["process", "service", "external"]),
      /** The launch command / binary (process kind) or service id. */
      command: z.string().min(1).optional(),
      /** Human label for catalogs and UI pickers. */
      label: z.string().optional(),
    })
    .optional(),
  /** Runtime requirements. */
  runtimeRequirements: z.object({ node: z.string().optional() }).optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

/**
 * Workspace configuration schema — the `workspace.yaml` shape documented in
 * docs/configuration.md and the spec. External configuration is validated
 * with Zod at the boundary (spec section 119).
 */
export const approvalModeSchema = z.enum(["autonomous", "guarded", "manual"]);

/**
 * Sandbox policy modes (spec section 142). `workspace-write` is the
 * backward-compatible default; `read-only` is the recommended mode for
 * unattended multi-workspace runs (DeepSeek Harness parity, minus its
 * read-only fail-safe default — documented difference).
 */
export const sandboxModeSchema = z.enum([
  "read-only",
  "workspace-write",
  "danger-full-access",
]);

/** Reusable plugin selection entry (spec sections 59 and 141). */
const pluginSelectionSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

/** Reusable agent provider selection (spec sections 30 and 141). */
const agentSelectionSchema = z.object({
  provider: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});

/** Reusable context provider selection (spec sections 27 and 141). */
const contextSelectionSchema = z.object({
  providers: z.array(z.string().min(1)).default([]),
});

/** Sandbox policy for a workspace scope (spec section 142). */
export const sandboxPolicySchema = z.object({
  mode: sandboxModeSchema.default("workspace-write"),
});

// ---------------------------------------------------------------------------
// Development lifecycle (spec sections 6 and 16): a declarative, composable
// stage graph a chat/workspace executes instead of one hard-coded loop.
// ---------------------------------------------------------------------------

/** Coarse stage classes the runner and UI understand natively. */
export const lifecycleStageTypeSchema = z.enum([
  "understand",
  "plan",
  "implement",
  "test",
  "review",
  "ship",
  "custom",
]);

/**
 * Tool binding for a stage. Tools are references to workspace capabilities
 * (kernel services / MCP servers), NOT implementations — the kernel stays
 * free of provider business logic (spec section 139).
 */
export const lifecycleToolSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "terminal",
    "filesystem",
    "git",
    "browser",
    "playwright",
    "vitest",
    "search",
    "mcp",
    "custom",
  ]),
  /** Free-form tool configuration (command, engine, MCP server, …). */
  config: z.record(z.string(), z.unknown()).optional(),
});

/** Per-stage execution policy. */
export const lifecycleStagePolicySchema = z.object({
  /** Stages marked parallel MAY run concurrently with the previous stage. */
  parallel: z.boolean().default(false),
  /** A required stage failing fails the lifecycle run. */
  required: z.boolean().default(true),
  /** Failure behavior: stop the run, retry the stage, or continue. */
  onFailure: z.enum(["stop", "retry", "continue"]).default("stop"),
  /** Retry budget when onFailure is "retry". */
  maxRetries: z.number().int().min(0).max(10).default(1),
  /** Wall-clock budget per stage execution in milliseconds. */
  timeoutMs: z.number().int().min(1000).optional(),
});

/** One stage of a development lifecycle (spec sections 6/16). */
export const lifecycleStageSchema = z.object({
  id: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, "stage id must be kebab-case"),
  name: z.string().min(1),
  type: lifecycleStageTypeSchema,
  /** Agent profiles bound to this stage (e.g. architect for Plan). */
  agents: z
    .array(
      z.object({
        profileId: z.string().min(1),
        role: z.string().optional(),
        /** Harness kind override (claude/dsh/opencode/…); default per chat. */
        agentKind: z.string().optional(),
        /** Prompt/task template injected when the stage starts. */
        task: z.string().optional(),
      })
    )
    .default([]),
  tools: z.array(lifecycleToolSchema).default([]),
  policy: lifecycleStagePolicySchema.prefault({}),
});

/** A named, reusable development lifecycle (spec sections 6/16). */
export const developmentLifecycleSchema = z.object({
  id: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, "lifecycle id must be kebab-case"),
  name: z.string().min(1),
  description: z.string().optional(),
  stages: z.array(lifecycleStageSchema).min(1),
});

// ---------------------------------------------------------------------------
// Checkpoints + Gates (spec section 150, Helix-inspired): small ordered,
// dependency-aware units of work whose completion is PROVEN by gates before
// the work can progress. Core rule: ATTEMPT ≠ COMPLETION.
// ---------------------------------------------------------------------------

/** Coarse gate classes the runner understands natively (execution is plugin work). */
export const gateKindSchema = z.enum([
  "behavior",
  "visual",
  "adversarial",
  "human",
  "security",
  "performance",
  "accessibility",
  "contract",
  "custom",
]);

/** The verdict a gate produces. A gate never returns "attempted" — evidence or nothing. */
export const gateStatusSchema = z.enum(["passed", "failed", "skipped"]);

/** A structured finding produced by a gate (adversarial review, visual diff, human feedback). */
export const gateFindingSchema = z.object({
  severity: z.enum(["blocker", "major", "minor", "note"]),
  /** Where the finding applies: a file, a screen, a component, a rule id. */
  location: z.string().min(1),
  issue: z.string().min(1),
  suggestion: z.string().optional(),
});

/** Gate execution policy. */
export const gatePolicySchema = z.object({
  /** A blocker finding or failed gate blocks checkpoint completion. */
  blocking: z.boolean().default(true),
  /** Retry budget when the gate fails (adversarial loops, flaky checks). */
  maxRetries: z.number().int().min(0).max(10).default(1),
  /** Wall-clock budget in milliseconds. */
  timeoutMs: z.number().int().min(1000).optional(),
});

/** A declared gate reference inside a checkpoint (resolved to a plugin). */
export const gateRefSchema = z.object({
  id: z.string().min(1),
  kind: gateKindSchema,
  /** The gate provider plugin to resolve (default: the kind name). */
  provider: z.string().min(1).optional(),
  /** Free-form gate configuration (visual reference, human approver, command). */
  config: z.record(z.string(), z.unknown()).optional(),
  policy: gatePolicySchema.prefault({}),
});

/** How a checkpoint completion criterion is verified, in one line. */
export const acceptanceCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  /** Optional command producing evidence (exit 0 = satisfied). */
  command: z.string().optional(),
});

/** Proof a gate produced: verdict, findings, duration, provenance. */
export const gateEvidenceSchema = z.object({
  gateId: z.string().min(1),
  gateKind: gateKindSchema,
  status: gateStatusSchema,
  findings: z.array(gateFindingSchema).default([]),
  durationMs: z.number().int().min(0),
  at: z.string().min(1),
  /** Honest enforcement note (e.g. human gate advisory in autonomous mode). */
  note: z.string().optional(),
});

/** Checkpoint status machine: attempt ≠ completion — only gates complete a checkpoint. */
export const checkpointStatusSchema = z.enum([
  "planned",
  "ready",
  "running",
  "awaiting-approval",
  "blocked",
  "failed",
  "passed",
]);

/** One checkpoint: a small, independently verifiable unit of work. */
export const checkpointSchema = z.object({
  id: z.string().min(1).regex(/^CP-\d{3,}$/, "checkpoint id must be CP-### (zero-padded)"),
  title: z.string().min(1),
  description: z.string().optional(),
  /** Checkpoint ids this one depends on (DAG). Empty = ready immediately. */
  dependencies: z.array(z.string().regex(/^CP-\d{3,}$/)).default([]),
  /** Scope limits what the checkpoint may touch (enforced via filesystem scope). */
  scope: z
    .object({
      files: z.array(z.string()).default([]),
      features: z.array(z.string()).default([]),
      contracts: z.array(z.string()).default([]),
    })
    .optional(),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).default([]),
  gates: z.array(gateRefSchema).min(1),
  /** Visual/prototype reference for visual gates (spec section 150, §10). */
  visualReference: z
    .object({
      type: z.enum(["prototype", "design", "screenshot"]),
      path: z.string().min(1),
    })
    .optional(),
});

/** A full checkpoint plan: the ordered DAG for one body of work. */
export const checkpointPlanSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  checkpoints: z.array(checkpointSchema).min(1),
});

/** Lifecycle library + the default a workspace uses (spec sections 6/16). */
export const lifecycleConfigSchema = z.object({
  /** Named lifecycles reusable across chats/workspaces. */
  definitions: z.array(developmentLifecycleSchema).default([]),
  /** Which definition a chat/workspace runs when none is specified. */
  default: z.string().optional(),
});

/**
 * Named child workspace entry (spec section 141): an isolated plugin scope
 * with its own filesystem root, sandbox policy, and optional provider
 * selection overrides. Keys are kebab-case workspace ids.
 */
export const workspaceEntrySchema = z.object({
  root: z.string().min(1),
  sandbox: sandboxPolicySchema.optional(),
  plugins: z.array(pluginSelectionSchema).optional(),
  agent: agentSelectionSchema.optional(),
  context: contextSelectionSchema.optional(),
  /** Development lifecycle executed in this workspace (spec sections 6/16). */
  lifecycle: z
    .object({
      /** Reference to a named definition in the top-level lifecycle config. */
      ref: z.string().optional(),
      /** Inline lifecycle overriding the referenced definition. */
      inline: developmentLifecycleSchema.optional(),
    })
    .optional(),
});

export const networkModeSchema = z.enum([
  "allowlist",
  "denylist",
  "offline",
  "restricted",
  "unrestricted",
]);

/**
 * Configuration file version (convention-first product model, spec section
 * 148): a minimal `.paw/workspace.yaml` may contain only `version: 1` —
 * everything else is inferred locally. Absent `version` is accepted for
 * backward compatibility with pre-convention configuration.
 */
export const WORKSPACE_CONFIG_VERSION = 1;

export const workspaceConfigSchema = z.object({
  /** Config schema version; `1` is the only supported value today. */
  version: z.number().int().optional(),
  workspaceApi: semverRangeSchema.optional(),
  /**
   * OPTIONAL since the convention-first model (spec section 148): a local
   * workspace needs no runtime declaration — the host machine IS the
   * runtime. Declared runtimes (docker, e2b, …) opt into isolated mode.
   */
  runtime: z
    .object({
      provider: z.string().min(1),
      image: z.string().optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  repository: z
    .object({
      provider: z.string().min(1),
      repository: z.string().optional(),
      branch: z.string().optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  environment: z.record(z.string(), z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  services: z.record(
    z.string(),
    z.object({
      image: z.string().optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    })
  ).optional(),
  context: contextSelectionSchema.optional(),
  agent: agentSelectionSchema.optional(),
  tools: z.array(z.string()).optional(),
  network: z
    .object({
      mode: networkModeSchema.default("restricted"),
      allow: z.array(z.string()).default([]),
    })
    .optional(),
  permissions: z
    .object({
      filesystem: z
        .object({
          read: z.array(z.string()).default([]),
          write: z.array(z.string()).default([]),
        })
        .optional(),
      network: z
        .object({
          mode: networkModeSchema.default("restricted"),
          allow: z.array(z.string()).default([]),
        })
        .optional(),
      git: z
        .object({
          commit: z.boolean().default(false),
          push: z.boolean().default(false),
        })
        .optional(),
      repository: z
        .object({
          pull_request: z.boolean().default(false),
        })
        .optional(),
      secrets: z
        .object({
          allowed: z.array(z.string()).default([]),
        })
        .optional(),
    })
    .optional(),
  verification: z
    .object({
      commands: z.array(z.string().min(1)).default([]),
    })
    .optional(),
  approval: z
    .object({
      mode: approvalModeSchema.default("guarded"),
    })
    .optional(),
  protection: z
    .object({
      provider: z.string().min(1),
      mode: approvalModeSchema.default("guarded"),
    })
    .optional(),
  distribution: z
    .object({
      provider: z.string().min(1),
    })
    .optional(),
  mcp: z
    .object({
      servers: z
        .array(
          z.object({
            name: z.string().min(1),
            provider: z.string().min(1),
          })
        )
        .default([])
    })
    .optional(),
  plugins: z.array(pluginSelectionSchema).optional(),
  lifecycle: lifecycleConfigSchema.optional(),
  /** Checkpoint plan binding (spec section 150): inline plan or a file path. */
  checkpoints: z
    .object({
      /** Inline plan (rare — plans usually live beside the code). */
      inline: checkpointPlanSchema.optional(),
      /** Path to a checkpoint plan file, relative to the project root. */
      plan: z.string().min(1).optional(),
    })
    .optional(),
  workspaces: z
    .record(
      z.string().regex(/^[a-z][a-z0-9-]*$/, "workspace name must be kebab-case"),
      workspaceEntrySchema
    )
    .optional(),
});

export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

export type NetworkMode = z.infer<typeof networkModeSchema>;
export type ApprovalMode = z.infer<typeof approvalModeSchema>;
export type SandboxMode = z.infer<typeof sandboxModeSchema>;
export type SandboxPolicy = z.infer<typeof sandboxPolicySchema>;
export type WorkspaceEntry = z.infer<typeof workspaceEntrySchema>;
export type LifecycleStageType = z.infer<typeof lifecycleStageTypeSchema>;
export type LifecycleTool = z.infer<typeof lifecycleToolSchema>;
export type LifecycleStagePolicy = z.infer<typeof lifecycleStagePolicySchema>;
export type LifecycleStageAgent = z.infer<typeof lifecycleStageSchema>["agents"][number];
export type LifecycleStage = z.infer<typeof lifecycleStageSchema>;
export type DevelopmentLifecycle = z.infer<typeof developmentLifecycleSchema>;
export type LifecycleConfig = z.infer<typeof lifecycleConfigSchema>;
export type GateKind = z.infer<typeof gateKindSchema>;
export type GateStatus = z.infer<typeof gateStatusSchema>;
export type GateFinding = z.infer<typeof gateFindingSchema>;
export type GatePolicy = z.infer<typeof gatePolicySchema>;
export type GateRef = z.infer<typeof gateRefSchema>;
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;
export type GateEvidence = z.infer<typeof gateEvidenceSchema>;
export type CheckpointStatus = z.infer<typeof checkpointStatusSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type CheckpointPlan = z.infer<typeof checkpointPlanSchema>;
