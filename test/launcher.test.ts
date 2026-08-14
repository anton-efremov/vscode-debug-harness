/**
 * @fileoverview Verifies the Launcher workflow across its terminal and process boundaries.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHarness } from "../src/launcher/main";

const temporary: string[] = [];
let originalExecutable: string | undefined;
beforeEach(() => { originalExecutable = process.env.VSCODE_EXECUTABLE_PATH; });
afterEach(async () => {
  if (originalExecutable === undefined) delete process.env.VSCODE_EXECUTABLE_PATH;
  else process.env.VSCODE_EXECUTABLE_PATH = originalExecutable;
  await Promise.all(temporary.splice(0).map((item) => fs.rm(item, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; scenario: string; executable: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "harness-e2e-")); temporary.push(root);
  const extension = path.join(root, "extension"); await fs.mkdir(extension);
  await fs.writeFile(path.join(extension, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0", engines: { vscode: "^1.90.0" }, main: "extension.js" }));
  await fs.writeFile(path.join(extension, "extension.js"), "exports.activate = () => {};\n");
  const modules = path.join(root, "node_modules", "companion-targets"); await fs.mkdir(modules, { recursive: true });
  await fs.writeFile(path.join(modules, "package.json"), JSON.stringify({ name: "companion-targets", version: "1.0.0", main: "index.js" }));
  await fs.writeFile(path.join(modules, "index.js"), "module.exports = { message: 'bundled companion' };\n");
  const scenario = path.join(root, "scenario.ts");
  await fs.writeFile(scenario, "import { message } from 'companion-targets'; await Promise.resolve(); console.log(message);\n");
  const executable = path.join(root, "fake-code.mjs");
  await fs.writeFile(executable, `#!/usr/bin/env node
import fs from "node:fs/promises";
const event = process.env.VSCODE_DEBUG_HARNESS_EVENTS;
const result = process.env.VSCODE_DEBUG_HARNESS_RESULT;
const scenario = process.env.VSCODE_DEBUG_HARNESS_SCENARIO;
const original = console.log;
console.log = (...v) => fs.appendFile(event, JSON.stringify({text: v.join(" ")}) + "\\n");
try { await import(scenario); await fs.writeFile(result + ".tmp", JSON.stringify({ok:true})); await fs.rename(result + ".tmp", result); }
catch (error) { await fs.writeFile(result, JSON.stringify({ok:false,error:String(error)})); }
console.log = original;
`);
  await fs.chmod(executable, 0o755);
  return { root: extension, scenario, executable };
}

describe("launcher process boundary", () => {
  it("rejects invalid terminal arguments with usage and exit code 2", () => {
    const launcher = path.resolve(__dirname, "../dist/launcher/main.js");
    const result = spawnSync(process.execPath, [launcher, "--unknown", "scenario.ts"], { encoding: "utf8" });
    expect(result.status).toBe(2);
  });

  it("bundles a top-level-await scenario, streams output, and retains its workspace", async () => {
    const data = await fixture(); let output = "";
    process.env.VSCODE_EXECUTABLE_PATH = data.executable;
    const stream = new Writable({ write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } });
    const result = await runHarness({ scenario: data.scenario, extensionPath: data.root, runRoot: path.dirname(data.root), cdpPort: 9333, attended: false, stdout: stream, stderr: stream });
    expect(result.exitCode).toBe(0);
    expect(output).toContain("Run workspace:");
    const events = await fs.readFile(path.join(result.workspace, ".vscode-debug-harness", "events.jsonl"), "utf8");
    expect(events).toContain("bundled companion");
    expect(output).toContain("bundled companion");
    await expect(fs.stat(result.workspace)).resolves.toBeTruthy();
  });

  it("reports an invalid VS Code executable without an unhandled error event", async () => {
    const data = await fixture(); let output = "";
    const stream = new Writable({ write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } });
    const missing = path.join(path.dirname(data.executable), "missing-code");
    process.env.VSCODE_EXECUTABLE_PATH = missing;
    await expect(runHarness({ scenario: data.scenario, extensionPath: data.root, runRoot: path.dirname(data.root), cdpPort: 9333, attended: false, stdout: stream, stderr: stream })).rejects.toThrow(`Failed to launch VS Code: ${missing}`);
    expect(output).not.toContain("Run workspace:");
  });

  it.each([undefined, ""])("requires a nonempty VSCODE_EXECUTABLE_PATH (%s)", async (value) => {
    const data = await fixture();
    if (value === undefined) delete process.env.VSCODE_EXECUTABLE_PATH;
    else process.env.VSCODE_EXECUTABLE_PATH = value;
    await expect(runHarness({ scenario: data.scenario, extensionPath: data.root, attended: false })).rejects.toThrow(
      "VSCODE_EXECUTABLE_PATH is required and must point to a portable VS Code executable",
    );
  });

  it("validates the scenario before creating a run workspace", async () => {
    const data = await fixture();
    process.env.VSCODE_EXECUTABLE_PATH = data.executable;
    const missing = path.join(path.dirname(data.scenario), "missing.ts");
    await expect(runHarness({ scenario: missing, extensionPath: data.root, runRoot: path.dirname(data.root), attended: false })).rejects.toThrow();
    const entries = await fs.readdir(path.dirname(data.root));
    expect(entries.filter((entry) => entry.startsWith("20"))).toHaveLength(0);
  });

  it("validates the extension manifest before creating a run workspace", async () => {
    const data = await fixture();
    process.env.VSCODE_EXECUTABLE_PATH = data.executable;
    await fs.writeFile(path.join(data.root, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
    await expect(runHarness({ scenario: data.scenario, extensionPath: data.root, runRoot: path.dirname(data.root), attended: false })).rejects.toThrow(
      "Extension manifest has no engines.vscode",
    );
  });

  it("propagates a scenario failure and retains its workspace", async () => {
    const data = await fixture();
    process.env.VSCODE_EXECUTABLE_PATH = data.executable;
    await fs.writeFile(data.scenario, "throw new Error('expected launcher failure');\n");
    let output = "";
    const stream = new Writable({ write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } });
    const result = await runHarness({ scenario: data.scenario, extensionPath: data.root, runRoot: path.dirname(data.root), cdpPort: 9333, attended: false, stdout: stream, stderr: stream });
    expect(result.exitCode).toBe(1);
    expect(output).toContain("expected launcher failure");
    await expect(fs.stat(result.workspace)).resolves.toBeTruthy();
  });
});
