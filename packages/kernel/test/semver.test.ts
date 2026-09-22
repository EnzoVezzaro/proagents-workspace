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

  it("pins 0.x caret ranges (no pre-1.0 broadening)", () => {
    expect(satisfiesRange("0.1.3", "^0.1.2")).toBe(true);
    expect(satisfiesRange("0.2.0", "^0.1.2")).toBe(false);
    expect(satisfiesRange("0.1.2", "^0.1.2")).toBe(true);
    expect(satisfiesRange("0.0.5", "^0.0.3")).toBe(false);
    expect(satisfiesRange("0.0.3", "^0.0.3")).toBe(true);
  });

  it("excludes prereleases from stable caret ranges", () => {
    expect(satisfiesRange("1.3.0-beta.1", "^1.0.0")).toBe(false);
  });

  it("applies the prerelease floor rule to caret ranges", () => {
    // A stable release still satisfies a prerelease floor within the range.
    expect(satisfiesRange("1.2.4", "^1.2.3-beta.1")).toBe(true);
    // A prerelease must be on the SAME tuple as the floor to satisfy.
    expect(satisfiesRange("1.3.0-beta.1", "^1.2.3-beta.1")).toBe(false);
    expect(satisfiesRange("1.0.0", "^1.2.3-beta.1")).toBe(false);
    // Same tuple, prerelease at or above the floor's.
    expect(satisfiesRange("1.2.3-beta.2", "^1.2.3-beta.1")).toBe(true);
    expect(satisfiesRange("1.2.3-alpha", "^1.2.3-beta.1")).toBe(false);
  });

  it("rejects unparseable versions", () => {
    expect(satisfiesRange("banana", "^1.0.0")).toBe(false);
    expect(parseVersion("banana")).toBeNull();
  });
});
