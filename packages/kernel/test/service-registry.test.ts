import { describe, expect, it } from "vitest";
import { WorkspaceError, defineService } from "@proagents/contracts";
import { ServiceRegistry } from "../src/service-registry.js";

interface FakeRepository {
  clone(): Promise<string>;
}
const repositoryDefinition = defineService<FakeRepository>({
  id: "repository",
  contractVersion: "1.0.0",
});

describe("ServiceRegistry", () => {
  it("registers and resolves by definition", () => {
    const registry = new ServiceRegistry();
    const impl: FakeRepository = { clone: async () => "/repo" };
    registry.register(repositoryDefinition, impl, "git");
    expect(registry.has(repositoryDefinition)).toBe(true);
    expect(registry.get(repositoryDefinition)).toBe(impl);
  });

  it("rejects duplicate registration of the same capability", () => {
    const registry = new ServiceRegistry();
    registry.register(repositoryDefinition, { clone: async () => "a" }, "git");
    expect(() =>
      registry.register(repositoryDefinition, { clone: async () => "b" }, "github")
    ).toThrowError(WorkspaceError);
  });

  it("throws SERVICE_NOT_REGISTERED with actionable suggestions", () => {
    const registry = new ServiceRegistry();
    try {
      registry.get(repositoryDefinition);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceError);
      const e = error as WorkspaceError;
      expect(e.code).toBe("SERVICE_NOT_REGISTERED");
      expect(e.recoverable).toBe(true);
      expect(e.suggestions.length).toBeGreaterThan(0);
    }
  });

  it("rejects contract version mismatches", () => {
    const registry = new ServiceRegistry();
    registry.register({ ...repositoryDefinition, contractVersion: "2.0.0" }, { clone: async () => "x" }, "future");
    try {
      registry.get(repositoryDefinition);
      expect.unreachable();
    } catch (error) {
      const e = error as WorkspaceError;
      expect(e.code).toBe("CONTRACT_VERSION_MISMATCH");
      expect(e.details).toMatchObject({ declared: "2.0.0", required: "1.0.0" });
    }
  });

  it("lists registrations with plugin provenance", () => {
    const registry = new ServiceRegistry();
    registry.register(repositoryDefinition, { clone: async () => "a" }, "git");
    expect(registry.list()).toEqual([
      { id: "repository", contractVersion: "1.0.0", pluginId: "git", capability: "repository" },
    ]);
  });
});
