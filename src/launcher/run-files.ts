/**
 * @fileoverview Creates retained run workspaces and allocates their process resources.
 */
import fs from "node:fs/promises";
import net from "node:net";
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

/** Allocates an ephemeral loopback port for Chromium DevTools. */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a DevTools port"));
      server.close(() => resolve(address.port));
    });
  });
}

/** Creates a unique retained workspace for one run. */
export async function createRunWorkspace(root?: string): Promise<string> {
  const parent = root ? path.resolve(root) : path.join(os.tmpdir(), "vscode-debug-harness");
  await fs.mkdir(parent, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return fs.mkdtemp(path.join(parent, `${stamp}-`));
}

/** Creates the retained workspace and its internal run-file paths. */
export async function createRunFiles(root?: string): Promise<RunFiles> {
  const workspace = await createRunWorkspace(root);
  const internal = path.join(workspace, ".vscode-debug-harness");
  await fs.mkdir(internal);
  return {
    workspace,
    internal,
    bundle: path.join(internal, "scenario.mjs"),
    result: path.join(internal, "result.json"),
    events: path.join(internal, "events.jsonl"),
  };
}
