import fs from "node:fs/promises";
import { inspect } from "node:util";
import { pathToFileURL } from "node:url";
import * as vscode from "vscode";

async function writeEvent(file: string, values: unknown[]): Promise<void> {
  const text = values.map((value) => typeof value === "string" ? value : inspect(value, { colors: false, depth: 8 })).join(" ");
  await fs.appendFile(file, `${JSON.stringify({ text })}\n`);
}

async function writeResult(file: string, result: { ok: boolean; error?: string }): Promise<void> {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(result));
  await fs.rename(temporary, file);
}

export async function activate(): Promise<void> {
  const scenario = process.env.VSCODE_DEBUG_HARNESS_SCENARIO;
  const resultFile = process.env.VSCODE_DEBUG_HARNESS_RESULT;
  const eventFile = process.env.VSCODE_DEBUG_HARNESS_EVENTS;
  if (!scenario || !resultFile || !eventFile) return;
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  let eventWrites = Promise.resolve();
  const relay = (...values: unknown[]): void => { eventWrites = eventWrites.then(() => writeEvent(eventFile, values)); };
  console.log = relay; console.info = relay; console.warn = relay; console.error = relay;
  try {
    await import(pathToFileURL(scenario).href);
    await eventWrites;
    await writeResult(resultFile, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    await eventWrites.catch(() => undefined);
    await writeResult(resultFile, { ok: false, error: message });
  } finally {
    Object.assign(console, original);
    if (process.env.VSCODE_DEBUG_HARNESS_ATTENDED !== "1") {
      setTimeout(() => void vscode.commands.executeCommand("workbench.action.quit"), 100);
    }
  }
}

export function deactivate(): void {}
