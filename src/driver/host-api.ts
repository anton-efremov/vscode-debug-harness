/**
 * @fileoverview Provides the driver's extension-host API and owns the currently opened source state.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { ENV_PACKAGE_ROOT, ENV_SCENARIO_DIR, ENV_WORKSPACE, requireEnv } from "../protocol";

interface VscodeApi {
  Uri: { file(value: string): any };
  workspace: {
    fs: { copy(from: any, to: any, options: { overwrite: boolean }): Promise<void> };
    textDocuments: Array<{ uri: { fsPath: string }; getText(): string }>;
  };
  commands: { executeCommand<T>(id: string, ...args: unknown[]): Promise<T> };
}

export class HostApi {
  private openedSource?: string;

  private api(): VscodeApi {
    const packageRoot = requireEnv(ENV_PACKAGE_ROOT);
    return createRequire(path.join(packageRoot, "package.json"))("vscode") as VscodeApi;
  }

  /** Copies a source into the run workspace and opens it with the requested editor. */
  async openWith(sourceFile: string, viewType: string): Promise<void> {
    const vscode = this.api();
    const source = path.resolve(requireEnv(ENV_SCENARIO_DIR), sourceFile);
    const workspace = requireEnv(ENV_WORKSPACE);
    const stat = await fs.stat(source).catch(() => undefined);
    if (!stat?.isFile()) throw new Error(`Source file does not exist: ${source}`);
    const destination = path.join(workspace, path.basename(source));
    await vscode.workspace.fs.copy(vscode.Uri.file(source), vscode.Uri.file(destination), { overwrite: true });
    this.openedSource = destination;
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(destination), viewType);
  }

  /** Executes a VS Code command with the supplied arguments. */
  async runCommand<T>(id: string, ...args: unknown[]): Promise<T> {
    return this.api().commands.executeCommand<T>(id, ...args);
  }

  /** Reads the in-memory text of the source most recently opened by the driver. */
  async readSource(): Promise<string> {
    if (!this.openedSource) throw new Error("readSource() requires openWith() to be called first");
    const document = this.api().workspace.textDocuments.find((item) => item.uri.fsPath === this.openedSource);
    if (!document) throw new Error(`The source document is no longer open: ${this.openedSource}`);
    return document.getText();
  }
}
