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

/**
 * Satisfies: `*`, exact `1.2.3`, and caret `^1.2.3` ranges.
 * Caret semantics: same major, version >= floor. Prerelease versions only
 * satisfy ranges that themselves carry a prerelease on the floor.
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
    if (floor.prerelease !== undefined) return true;
    if (exact.prerelease !== undefined) return false;
    return (
      exact.minor > floor.minor ||
      (exact.minor === floor.minor && exact.patch >= floor.patch)
    );
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
