import { describe, expect, it } from "vitest";
import { satisfiesRange, parseVersion } from "../src/semver.js";

describe("satisfiesRange", () => {
  it("handles wildcard", () => {
    expect(satisfiesRange("1.0.0", "*")).toBe(true);
  });

  it("handles exact versions", () => {
    expect(satisfiesRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.4", "1.2.3")).toBe(false);
  });

  it("handles caret ranges", () => {
    expect(satisfiesRange("1.2.3", "^1.0.0")).toBe(true);
    expect(satisfiesRange("1.9.9", "^1.2.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfiesRange("1.1.9", "^1.2.0")).toBe(false);
  });

  it("excludes prereleases from stable caret ranges", () => {
    expect(satisfiesRange("1.3.0-beta.1", "^1.0.0")).toBe(false);
  });

  it("rejects unparseable versions", () => {
    expect(satisfiesRange("banana", "^1.0.0")).toBe(false);
    expect(parseVersion("banana")).toBeNull();
  });
});
