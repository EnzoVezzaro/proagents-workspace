import { describe, expect, it } from "vitest";
import { workspaceConfigSchema, WorkspaceError } from "@proagents/contracts";
import { PermissionFramework } from "../src/permissions.js";

function config(overrides: Record<string, unknown> = {}) {
  return workspaceConfigSchema.parse({
    runtime: { provider: "local" },
    ...overrides,
  });
}

describe("PermissionFramework", () => {
  it("grants permissions that the configuration allows", () => {
    const fw = new PermissionFramework(
      config({ permissions: { filesystem: { write: ["/workspace/repo"] } } })
    );
    fw.grantPlugin("fs", ["filesystem:write:/workspace/repo"]);
    expect(fw.has({ pluginId: "fs", category: "filesystem:write:/workspace/repo" })).toBe(true);
  });

  it("denies permissions the configuration does not grant", () => {
    const fw = new PermissionFramework(config());
    fw.grantPlugin("fs", ["filesystem:write:/workspace/repo"]);
    expect(fw.has({ pluginId: "fs", category: "filesystem:write:/workspace/repo" })).toBe(false);
    expect(() =>
      fw.require({ pluginId: "fs", category: "filesystem:write:/workspace/repo" })
    ).toThrowError(WorkspaceError);
  });

  it("denies secrets not on the allowlist", () => {
    const fw = new PermissionFramework(config({ permissions: { secrets: { allowed: ["npm_token"] } } }));
    fw.grantPlugin("pub", ["secrets:npm_token", "secrets:aws_key"]);
    expect(fw.has({ pluginId: "pub", category: "secrets:npm_token" })).toBe(true);
    expect(fw.has({ pluginId: "pub", category: "secrets:aws_key" })).toBe(false);
  });

  it("autonomous mode approves without prompting", async () => {
    const fw = new PermissionFramework(config({ approval: { mode: "autonomous" } }));
    const decision = await fw.approve({ operation: "deploy", target: "prod", pluginId: "x" }, true);
    expect(decision).toBe("approved");
  });

  it("guarded mode approves safe operations without prompting", async () => {
    const fw = new PermissionFramework(config({ approval: { mode: "guarded" } }));
    const decision = await fw.approve({ operation: "read", target: "file", pluginId: "x" }, false);
    expect(decision).toBe("approved");
  });

  it("guarded mode fails closed headless for dangerous operations (APPROVAL_REQUIRED)", async () => {
    const fw = new PermissionFramework(config({ approval: { mode: "guarded" } }));
    await expect(
      fw.approve({ operation: "push --force", target: "origin/main", pluginId: "git" }, true)
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });

  it("manual mode requires confirmation for every operation", async () => {
    const fw = new PermissionFramework(config({ approval: { mode: "manual" } }));
    await expect(
      fw.approve({ operation: "read", target: "file", pluginId: "x" }, false)
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });
});
