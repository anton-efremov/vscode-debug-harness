/**
 * @fileoverview Validates and resolves Launcher inputs before run preparation begins.
 */
import fs from "node:fs/promises";
import path from "node:path";

/** Resolves and validates the explicitly configured VS Code executable. */
export async function validateExecutable(): Promise<string> {
  const executable = process.env.VSCODE_EXECUTABLE_PATH?.trim();
  if (!executable) throw new Error("VSCODE_EXECUTABLE_PATH is required and must point to a portable VS Code executable");
  try {
    await fs.access(executable);
  } catch (error) {
    throw new Error(`Failed to launch VS Code: ${executable}`, { cause: error });
  }
  return executable;
}

/** Resolves the scenario path and verifies that it is accessible. */
export async function validateScenario(scenario: string): Promise<string> {
  const resolved = path.resolve(scenario);
  await fs.access(resolved);
  return resolved;
}

/** Resolves and validates the extension manifest and VS Code entry point. */
export async function validateExtension(extensionPath?: string): Promise<string> {
  const resolved = path.resolve(extensionPath ?? process.cwd());
  const manifestPath = path.join(resolved, "package.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    engines?: { vscode?: string };
    main?: string;
    browser?: string;
  };
  if (!manifest.engines?.vscode) throw new Error(`Extension manifest has no engines.vscode: ${manifestPath}`);
  if (!manifest.main && !manifest.browser) throw new Error(`Extension manifest has neither main nor browser: ${manifestPath}`);
  return resolved;
}
