/**
 * esbuild bundler for the `paw` CLI — produces the SELF-CONTAINED single-file
 * binary that npm publishes as @reposell/proagents-workspace.
 *
 * Why a bundle (spec section 61, installation size): the published package
 * must install with ZERO runtime dependency resolution — the workspace
 * packages are `workspace:*` links that do not exist on the registry, and the
 * default installation must stay lightweight. Everything (SDK, kernel,
 * contracts, bundled plugins, zod) is compiled into ONE file with only
 * node: builtins external. The version is injected with --define so the
 * published binary reports the exact released version (`paw --version`).
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  // Only node: builtins stay external — everything else is inlined.
  external: ["node:*"],
  define: {
    // Injected version (stability contract: `paw --version` must report the
    // released version, not a build placeholder).
    __PAW_CLI_VERSION__: JSON.stringify(pkg.version),
    // zod ships CJS-flavored paths in some resolutions; esbuild handles both,
    // but production mode keeps the bundle minimal.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  outfile: "dist/paw.bundle.mjs",
  minify: false, // debuggability over bytes — the bundle is still < 1 MB
  sourcemap: false,
  legalComments: "inline",
});
console.log(`bundle ok → dist/paw.bundle.mjs (paw ${pkg.version})`);

// The shebang MUST be byte-offset 0 for Node to honor it in a bin script
// (esbuild banners can be preceded by emitted legal comments, which breaks
// execution with a SyntaxError). Prepend it explicitly, last.
const outfile = new URL("./dist/paw.bundle.mjs", import.meta.url);
const body = readFileSync(outfile, "utf8");
if (!body.startsWith("#!")) {
  writeFileSync(outfile, `#!/usr/bin/env node\n${body}`);
}
