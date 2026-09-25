import { describe, expect, it } from "vitest";
import { pluginManifestSchema, workspaceConfigSchema } from "../src/schemas.js";

describe("pluginManifestSchema", () => {
  it("accepts a valid manifest", () => {
    const parsed = pluginManifestSchema.safeParse({
      id: "docker",
      name: "Docker runtime",
      version: "0.1.0",
      capabilities: ["runtime"],
      dependencies: [],
      permissions: ["shell", "filesystem:read:/workspace/repo"],
      compatibility: { "runtimeContract": "^1.0.0" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-kebab-case ids", () => {
    const parsed = pluginManifestSchema.safeParse({
      id: "Docker_Runtime",
      name: "x",
      version: "0.1.0",
      capabilities: ["runtime"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown permission forms", () => {
    const parsed = pluginManifestSchema.safeParse({
      id: "x",
      name: "x",
      version: "0.1.0",
      capabilities: ["runtime"],
      permissions: ["root"],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires at least one capability", () => {
    const parsed = pluginManifestSchema.safeParse({
      id: "x",
      name: "x",
      version: "0.1.0",
      capabilities: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("workspaceConfigSchema", () => {
  it("accepts the documented workspace.yaml shape", () => {
    const parsed = workspaceConfigSchema.safeParse({
      runtime: { provider: "local" },
      repository: { provider: "git", repository: "acme/project", branch: "main" },
      context: { providers: ["acc"] },
      agent: { provider: "codex" },
      network: { mode: "restricted", allow: ["registry.npmjs.org", "github.com"] },
      permissions: {
        filesystem: { read: ["/workspace/repo"], write: ["/workspace/repo"] },
        git: { commit: true, push: true },
        secrets: { allowed: ["npm_token"] },
      },
      verification: { commands: ["pnpm lint", "pnpm test"] },
      approval: { mode: "guarded" },
      protection: { provider: "repo-shield", mode: "guarded" },
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults present sections conservatively (guarded, restricted)", () => {
    const parsed = workspaceConfigSchema.parse({
      runtime: { provider: "local" },
      approval: {},
      network: {},
    });
    expect(parsed.approval?.mode).toBe("guarded");
    expect(parsed.network?.mode).toBe("restricted");
  });

  it("leaves absent sections undefined — the kernel resolver applies effective defaults", () => {
    const parsed = workspaceConfigSchema.parse({ runtime: { provider: "local" } });
    expect(parsed.approval).toBeUndefined();
    expect(parsed.network).toBeUndefined();
  });

  it("accepts ZERO configuration — the local machine is the default runtime (spec 148)", () => {
    const parsed = workspaceConfigSchema.parse({ version: 1 });
    expect(parsed.version).toBe(1);
    expect(parsed.runtime).toBeUndefined();
  });

  it("accepts an entirely empty configuration object", () => {
    const parsed = workspaceConfigSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("rejects an unsupported config version", () => {
    const parsed = workspaceConfigSchema.safeParse({ version: 99 });
    // `version` is informational today; any integer parses, and higher
    // versions are gated by the loader, not the schema (forward-compatible).
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown approval modes", () => {
    const parsed = workspaceConfigSchema.safeParse({
      runtime: { provider: "local" },
      approval: { mode: "yolo" },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts every documented protection mode (DISTRIBUTION.md section 7)", () => {
    // Regression: `protection.mode` was validated with the APPROVAL
    // vocabulary, so the five modes the distribution spec documents
    // (off/audit/warn/guarded/strict) were all rejected by the schema.
    for (const mode of ["off", "audit", "warn", "guarded", "strict"]) {
      const parsed = workspaceConfigSchema.safeParse({
        protection: { provider: "repo-shield", mode },
      });
      expect(parsed.success, `protection.mode: ${mode}`).toBe(true);
    }
  });

  it("defaults protection to the safe guarded posture", () => {
    const parsed = workspaceConfigSchema.safeParse({ protection: { provider: "repo-shield" } });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.protection?.mode).toBe("guarded");
  });

  it("keeps the approval and protection axes distinct", () => {
    // Approval decides WHO decides; protection decides HOW STRICTLY. An
    // approval value must not be accepted as a protection mode.
    const parsed = workspaceConfigSchema.safeParse({
      protection: { provider: "repo-shield", mode: "autonomous" },
    });
    expect(parsed.success).toBe(false);
  });
});
