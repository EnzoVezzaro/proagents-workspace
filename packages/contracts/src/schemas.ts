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
  version: semverRangeSchema.or(z.literal("*")).or(z.string().min(1)),
  description: z.string().optional(),
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

export const networkModeSchema = z.enum([
  "allowlist",
  "denylist",
  "offline",
  "restricted",
  "unrestricted",
]);

export const workspaceConfigSchema = z.object({
  workspaceApi: z.string().optional(),
  runtime: z.object({
    provider: z.string().min(1),
    image: z.string().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
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
  context: z
    .object({
      providers: z.array(z.string().min(1)).default([]),
    })
    .optional(),
  agent: z
    .object({
      provider: z.string().min(1),
      options: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
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
  plugins: z
    .array(
      z.object({
        id: z.string().min(1),
        source: z.string().min(1).optional(),
        options: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
});

export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

export type NetworkMode = z.infer<typeof networkModeSchema>;
export type ApprovalMode = z.infer<typeof approvalModeSchema>;
