import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");
const extensionRoot = path.join(__dirname, "fixture-extension");
const scenarios = path.join(__dirname, "scenarios");
const cli = path.join(projectRoot, "dist", "launcher", "main.js");

async function run(scenario: string): Promise<{ code: number; output: string; workspace: string }> {
  const executable = process.env.VSCODE_EXECUTABLE_PATH;
  if (!executable?.trim()) throw new Error("VSCODE_EXECUTABLE_PATH is required and must point to a portable VS Code executable");
  const child = spawn(process.execPath, [cli, path.join(scenarios, scenario)], { cwd: extensionRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const code = await new Promise<number>((resolve, reject) => { child.on("error", reject); child.on("exit", value => resolve(value ?? -1)); });
  const match = output.match(/^Run workspace: (.+)$/m);
  if (!match) throw new Error(`Desktop VS Code did not produce a run workspace using VSCODE_EXECUTABLE_PATH=${executable}.\n${output}`);
  return { code, output, workspace: match[1].trim() };
}

describe.sequential("real desktop VS Code", () => {
  it("drives a custom editor through public UI and saves the copied source", async () => {
    const originalPath = path.join(scenarios, "case.fixture");
    const original = await fs.readFile(originalPath, "utf8");
    const result = await run("basic.ts");
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("HARNESS_E2E_OK");
    await expect(fs.stat(result.workspace)).resolves.toBeTruthy();
    await expect(fs.stat(path.join(result.workspace, "final.png"))).resolves.toBeTruthy();
    expect(await fs.readFile(path.join(result.workspace, "case.fixture"), "utf8")).toContain("changed by harness");
    expect(await fs.readFile(originalPath, "utf8")).toBe(original);
  });

  it("propagates scenario failures and retains the workspace", async () => {
    const result = await run("failure.ts");
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("EXPECTED_E2E_FAILURE");
    await expect(fs.stat(result.workspace)).resolves.toBeTruthy();
  });
});
