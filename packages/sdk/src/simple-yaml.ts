/**
 * Minimal YAML subset parser for `.paw/workspace.yaml`.
 *
 * The convention-first configuration is intentionally minimal (spec section
 * 34: a basic project may need only `version: 1`), and the default
 * installation must stay lightweight (spec section 61) — so the SDK parses
 * the small YAML the convention file needs (nested maps, lists of scalars,
 * scalars) instead of pulling in a full YAML dependency. Unsupported syntax
 * is a structured, honest error — never a silent misparse.
 */
import { WorkspaceError } from "@proagents/contracts";

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function scalar(raw: string): YamlValue {
  const s = unquote(raw);
  if (s === "null" || s === "~" || s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number.parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return Number.parseFloat(s);
  return s;
}

interface Line {
  readonly indent: number;
  readonly text: string;
  readonly lineNo: number;
}

function significantLines(input: string): Line[] {
  const lines: Line[] = [];
  for (const [index, raw] of input.split("\n").entries()) {
    const noComments = raw.replace(/(^|\s)#.*$/, "$1");
    if (noComments.trim().length === 0) continue;
    if (raw.trim() === "---" || raw.trim() === "...") continue;
    lines.push({ indent: noComments.length - noComments.trimStart().length, text: noComments.trim(), lineNo: index + 1 });
  }
  return lines;
}

function fail(message: string, lineNo: number, file?: string): never {
  throw new WorkspaceError({
    code: "CONFIG_INVALID",
    message: `Invalid workspace configuration${file !== undefined ? ` in ${file}` : ""}: ${message} (line ${lineNo})`,
    recoverable: true,
    suggestions: ["Simplify the YAML (nested maps, lists, scalars) or file an issue for full YAML support"],
  });
}

function parseBlock(lines: readonly Line[], start: number, indent: number, file?: string): { value: YamlValue; next: number } {
  if (start >= lines.length) return { value: null, next: start };
  const isList = lines[start]!.text.startsWith("- ");
  const map: { [key: string]: YamlValue } = {};
  const list: YamlValue[] = [];
  let i = start;
  while (i < lines.length && lines[i]!.indent >= indent) {
    const line = lines[i]!;
    if (line.indent > indent) fail("unexpected indentation", line.lineNo, file);
    if (isList) {
      if (!line.text.startsWith("- ")) fail("mixed list and map entries at the same level", line.lineNo, file);
      const item = line.text.slice(2);
      // A list item that looks like `key: value` is a MAP entry — a shape
      // this parser deliberately does not support. Fail honestly rather
      // than misparse it into a string.
      if (/^[^:#]+:(\s|$)/.test(item)) {
        fail("lists of maps are not supported — use a list of scalar strings", line.lineNo, file);
      }
      list.push(scalar(item));
      i += 1;
      continue;
    }
    const colon = line.text.indexOf(":");
    if (colon < 1) fail(`expected "key: value", got "${line.text}"`, line.lineNo, file);
    const key = unquote(line.text.slice(0, colon));
    const rest = line.text.slice(colon + 1).trim();
    if (rest.length === 0) {
      // Nested block (map or list) owned by this key.
      if (i + 1 < lines.length && lines[i + 1]!.indent > indent) {
        const nested = parseBlock(lines, i + 1, lines[i + 1]!.indent, file);
        map[key] = nested.value;
        i = nested.next;
        continue;
      }
      map[key] = null; // empty section (e.g. `verification:` with nothing under it)
      i += 1;
      continue;
    }
    if (rest.startsWith("- ") || rest === "-") {
      fail("inline lists are not supported — put each item on its own line", line.lineNo, file);
    }
    if (rest.startsWith("{") || rest.startsWith("[")) {
      fail("inline flow syntax ({…}/[…]) is not supported — use nested indentation", line.lineNo, file);
    }
    map[key] = scalar(rest);
    i += 1;
  }
  return { value: isList ? list : map, next: i };
}

/**
 * Parse the YAML subset the convention file needs:
 * nested maps, block lists of scalars, and scalars. Everything else
 * (anchors, multi-line strings, inline flow syntax, lists of maps) fails
 * with a structured, actionable error.
 */
export function parseSimpleYaml(input: string, file?: string): Record<string, unknown> {
  const lines = significantLines(input);
  if (lines.length === 0) return {};
  const parsed = parseBlock(lines, 0, lines[0]!.indent, file);
  if (parsed.next < lines.length) fail("trailing content after the top-level block", lines[parsed.next]!.lineNo, file);
  if (Array.isArray(parsed.value)) fail("top-level list is not a valid configuration", lines[0]!.lineNo, file);
  return parsed.value as Record<string, unknown>;
}
