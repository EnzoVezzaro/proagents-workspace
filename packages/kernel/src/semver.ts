/**
 * Semver compatibility helpers.
 *
 * The kernel needs to answer exactly one question: "does version V satisfy
 * declared range R?" with `^`-ranges, exact versions and `*`. Rather than
 * pulling a full semver dependency into the zero-dependency kernel, this
 * module implements the subset the compatibility declarations use
 * (see plugin-manifest template: `workspaceApi: ^1.0.0`).
 */

export function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
} | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(match[4] !== undefined ? { prerelease: match[4] } : {}),
  };
}

type ParsedVersion = ReturnType<typeof parseVersion>;

/**
 * Compare prerelease identifier lists per semver precedence: numeric
 * identifiers compare numerically, alphanumeric identifiers lexically,
 * numeric sorts below alphanumeric, and a larger identifier set outranks a
 * smaller one with identical common prefix. `undefined` (a release) outranks
 * any prerelease.
 */
function comparePrerelease(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  const aParts = a.split(".");
  const bParts = b.split(".");
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const ap = aParts[i];
    const bp = bParts[i];
    if (ap === undefined) return -1;
    if (bp === undefined) return 1;
    if (ap === bp) continue;
    const aNumeric = /^\d+$/.test(ap);
    const bNumeric = /^\d+$/.test(bp);
    if (aNumeric && bNumeric) return Number(ap) > Number(bp) ? 1 : -1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return ap > bp ? 1 : -1;
  }
  return 0;
}

function compareVersion(a: NonNullable<ParsedVersion>, b: NonNullable<ParsedVersion>): number {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/**
 * Satisfies: `*`, exact `1.2.3`, and caret `^1.2.3` ranges.
 *
 * Caret semantics follow node-semver:
 *   `^1.2.3`  := >=1.2.3 <2.0.0         (same major)
 *   `^0.1.2`  := >=0.1.2 <0.2.0         (0.x pins minor)
 *   `^0.0.3`  := >=0.0.3 <0.0.4         (0.0.x pins patch)
 * A version with a prerelease only satisfies a caret floor that itself has a
 * prerelease on the SAME [major.minor.patch] tuple (and is >= the floor's).
 */
export function satisfiesRange(version: string, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === "*" || trimmed === "latest") return true;

  const exact = parseVersion(version);
  if (!exact) return false;

  if (trimmed.startsWith("^")) {
    const floor = parseVersion(trimmed.slice(1));
    if (!floor) return false;
    if (exact.major !== floor.major) return false;
    if (floor.major === 0) {
      // ^0.x.y := >=0.x.y <0.(x+1).0 ; ^0.0.y := ==0.0.y
      if (exact.minor !== floor.minor) return false;
      if (exact.minor === 0 && exact.patch !== floor.patch) return false;
    }
    if (exact.prerelease !== undefined) {
      if (floor.prerelease === undefined) return false;
      if (exact.major !== floor.major || exact.minor !== floor.minor || exact.patch !== floor.patch) return false;
      return compareVersion(exact, floor) >= 0;
    }
    return compareVersion(exact, floor) >= 0;
  }

  const target = parseVersion(trimmed);
  if (!target) return false;
  return (
    exact.major === target.major &&
    exact.minor === target.minor &&
    exact.patch === target.patch &&
    exact.prerelease === target.prerelease
  );
}
