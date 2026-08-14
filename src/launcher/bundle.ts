/**
 * @fileoverview Bundles a TypeScript scenario for execution inside the runner extension.
 */
import path from "node:path";
import { build } from "esbuild";
import { ENV_EVENTS } from "../protocol";
import { packageRoot } from "./run-files";

/** Bundles the scenario and its ordinary dependencies for the extension host. */
export async function bundleScenario(scenario: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [scenario],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    sourcemap: "inline",
    banner: { js: `import { appendFileSync as __harnessAppendEvent } from "node:fs";
const __harnessEventFile = process.env[${JSON.stringify(ENV_EVENTS)}];
const __harnessRelay = (...values) => __harnessAppendEvent(__harnessEventFile, JSON.stringify({ text: values.map(value => typeof value === "string" ? value : String(value)).join(" ") }) + "\\n");
const __harnessConsole = __harnessEventFile ? { log: __harnessRelay, info: __harnessRelay, warn: __harnessRelay, error: __harnessRelay } : console;` },
    define: { console: "__harnessConsole" },
    alias: { "vscode-debug-harness": path.join(packageRoot(), "dist", "scenario-api.mjs") },
    external: ["vscode"],
  });
}
