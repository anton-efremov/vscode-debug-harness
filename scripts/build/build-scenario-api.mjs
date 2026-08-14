import { build } from "esbuild";

await build({
  entryPoints: ["src/api.ts"],
  outfile: "dist/scenario-api.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["vscode"],
});
