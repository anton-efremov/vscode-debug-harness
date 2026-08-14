import { build } from "esbuild";
import { cp } from "node:fs/promises";

await build({
  entryPoints: ["src/runner/extension.ts"],
  outfile: "dist/runner/extension.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["vscode"],
});

await cp("src/runner/package.json", "dist/runner/package.json");
