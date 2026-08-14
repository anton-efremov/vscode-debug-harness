/**
 * @fileoverview Defines the environment and file-record contract shared by all harness processes.
 */

export const ENV_SCENARIO = "VSCODE_CUSTOM_EDITOR_HARNESS_SCENARIO";
export const ENV_SCENARIO_DIR = "VSCODE_CUSTOM_EDITOR_HARNESS_SCENARIO_DIR";
export const ENV_WORKSPACE = "VSCODE_CUSTOM_EDITOR_HARNESS_WORKSPACE";
export const ENV_RESULT = "VSCODE_CUSTOM_EDITOR_HARNESS_RESULT";
export const ENV_EVENTS = "VSCODE_CUSTOM_EDITOR_HARNESS_EVENTS";
export const ENV_CDP_PORT = "VSCODE_CUSTOM_EDITOR_HARNESS_CDP_PORT";
export const ENV_PACKAGE_ROOT = "VSCODE_CUSTOM_EDITOR_HARNESS_PACKAGE_ROOT";
export const ENV_ATTENDED = "VSCODE_CUSTOM_EDITOR_HARNESS_ATTENDED";

export interface ResultRecord {
  ok: boolean;
  error?: string;
}

export interface EventRecord {
  text: string;
}

/** Reads a required harness environment variable for an active scenario. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is only available while a vscode-custom-editor-harness scenario is running`);
  return value;
}
