/**
 * @fileoverview Creates retained run workspaces and their internal file paths.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface RunFiles {
  workspace: string;
  internal: string;
  bundle: string;
  result: string;
  events: string;
}

/** Resolves the installed package root from compiled Launcher files. */
export function packageRoot(): string {
  return path.resolve(__dirname, "../..");
}

/** Creates a unique retained workspace for one run. */
export async function createRunWorkspace(root?: string): Promise<string> {
  const parent = root ? path.resolve(root) : path.join(os.tmpdir(), "vscode-custom-editor-harness");
  await fs.mkdir(parent, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return fs.mkdtemp(path.join(parent, `${stamp}-`));
}

/** Creates the retained workspace and its internal run-file paths. */
export async function createRunFiles(root?: string): Promise<RunFiles> {
  const workspace = await createRunWorkspace(root);
  const internal = path.join(workspace, ".vscode-custom-editor-harness");
  await fs.mkdir(internal);
  return {
    workspace,
    internal,
    bundle: path.join(internal, "scenario.mjs"),
    result: path.join(internal, "result.json"),
    events: path.join(internal, "events.jsonl"),
  };
}
