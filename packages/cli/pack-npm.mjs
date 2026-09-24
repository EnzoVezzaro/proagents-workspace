/**
 * npm publish packaging for the `paw` CLI.
 *
 * Produces the publishable package `@reposell/proagents-workspace`:
 *   - ONE self-contained bundle (dist/paw.bundle.mjs) — zero runtime deps
 *   - LICENSE + README (npm-facing) + a package.json scoped for @reposell
 *
 * The repo package stays `proagents-workspace` (cli-vocabulary standard);
 * the published name is scoped because the workspace packages it bundles are
 * not on the registry. Both names are documented in the CLI vocabulary.
 *
 * Usage: pnpm --filter proagents-workspace pack:npm
 * Result: packages/cli/npm-stage/ — cd there and `npm publish --access public`.
 */
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const stage = path.resolve("npm-stage");
const repoRoot = path.resolve("../..");

rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, "dist"), { recursive: true });

// 1. The bundle (must exist — run `pnpm bundle` first).
copyFileSync(path.resolve("dist/paw.bundle.mjs"), path.join(stage, "dist/paw.bundle.mjs"));

// 2. License + npm-facing README.
copyFileSync(path.join(repoRoot, "LICENSE"), path.join(stage, "LICENSE"));
writeFileSync(
  path.join(stage, "README.md"),
  readFileSync(path.resolve("npm-README.md"), "utf8")
);

// 3. The publish manifest. No dependencies, no files beyond bundle+docs:
//    `npm install -g` must not resolve anything beyond npm itself.
const pkg = {
  name: "@reposell/proagents-workspace",
  version: readFileSync(path.resolve("package.json"), "utf8").match(/"version": "([^"]+)"/)?.[1] ?? "0.0.0",
  description: "ProAgents Workspace — the convention-first workspace for AI coding agents (paw CLI)",
  license: "MIT",
  type: "module",
  bin: { paw: "./dist/paw.bundle.mjs" },
  files: ["dist", "README.md", "LICENSE"],
  engines: { node: ">=18" },
  repository: {
    type: "git",
    url: "git+https://github.com/EnzoVezzaro/proagents-workspace.git",
  },
  homepage: "https://github.com/EnzoVezzaro/proagents-workspace#readme",
  bugs: "https://github.com/EnzoVezzaro/proagents-workspace/issues",
  keywords: ["ai", "agents", "cli", "workspace", "developer-tools", "codex", "claude", "copilot"],
};
writeFileSync(path.join(stage, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`
staged ${pkg.name}@${pkg.version} → packages/cli/npm-stage/

Next (manual, publish is irreversible):
  cd packages/cli/npm-stage
  npm publish --access public

Verify before publishing:
  npm pack --dry-run          # contents: dist/paw.bundle.mjs, README, LICENSE
  npm install -g ./           # local global-install rehearsal
  paw --version && paw init   # smoke in a scratch repo
`);
