/**
 * @fileoverview Runs the bundled scenario inside the VS Code extension host.
 * Relays console events and writes the scenario result record for the Launcher.
 */
import fs from "node:fs/promises";
import { inspect } from "node:util";
import { pathToFileURL } from "node:url";
import * as vscode from "vscode";
import {
  ENV_ATTENDED,
  ENV_EVENTS,
  ENV_RESULT,
  ENV_SCENARIO,
  type EventRecord,
  type ResultRecord,
} from "../protocol";

async function writeEvent(file: string, values: unknown[]): Promise<void> {
  const text = values
    .map((value) => typeof value === "string" ? value : inspect(value, { colors: false, depth: 8 }))
    .join(" ");
  const event: EventRecord = { text };
  await fs.appendFile(file, `${JSON.stringify(event)}\n`);
}

async function writeResult(file: string, result: ResultRecord): Promise<void> {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(result));
  await fs.rename(temporary, file);
}

/** 
 * VS Code's required entry point for every extension
 * Activates the runner and executes the scenario configured by the Launcher. 
 */
export async function activate(): Promise<void> {

  // Read configuration and guard
  const scenario = process.env[ENV_SCENARIO];
  const resultFile = process.env[ENV_RESULT];
  const eventFile = process.env[ENV_EVENTS];
  if (!scenario || !resultFile || !eventFile) return;

  // Console redirection
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  let eventWrites = Promise.resolve();
  const relay = (...values: unknown[]): void => {
    // makes every write wait for the previous and redirects stream to file
    eventWrites = eventWrites.then(() => writeEvent(eventFile, values));
  };
  console.log = relay;
  console.info = relay;
  console.warn = relay;
  console.error = relay;

  // Run the scenario
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
    if (process.env[ENV_ATTENDED] !== "1") {
      setTimeout(() => void vscode.commands.executeCommand("workbench.action.quit"), 100);
    }
  }
}

/** Provides the VS Code extension deactivation hook. */
export function deactivate(): void {}
