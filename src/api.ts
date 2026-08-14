/**
 * @fileoverview Exposes the public interaction API used by debugging scenarios.
 */
import { driver } from "./driver/main";
import type { CoordinateTarget, ElementTarget, Target, WebviewContext } from "./types";

export type { CoordinateTarget, ElementTarget, Locator, Target, WebviewContext } from "./types";

/** Creates a coordinate target in webview-local pixels. */
export function at(x: number, y: number): CoordinateTarget {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError("at(x, y) requires finite coordinates");
  return { kind: "coordinate", x, y };
}

/** Clicks a scenario target. */
export async function click(target: Target): Promise<void> { await driver.click(target); }
/** Double-clicks a scenario target. */
export async function doubleClick(target: Target): Promise<void> { await driver.doubleClick(target); }
/** Drags one scenario target to another. */
export async function drag(target: Target, to: Target): Promise<void> { await driver.drag(target, to); }
/** Types text through the VS Code workbench keyboard. */
export async function type(text: string): Promise<void> { await driver.type(text); }
/** Presses one keyboard key or key combination. */
export async function press(key: string): Promise<void> { await driver.press(key); }
/** Copies a source file into the run workspace and opens it with the requested editor. */
export async function openWith(sourceFile: string, viewType: string): Promise<void> { await driver.openWith(sourceFile, viewType); }
/** Executes a VS Code command with the supplied arguments. */
export async function runCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T> { return driver.runCommand<T>(id, ...args); }
/** Reads the current text of the source most recently opened by the scenario. */
export async function readSource(): Promise<string> { return driver.readSource(); }
/** Reports whether an element target resolves to exactly one visible element. */
export async function exists(target: ElementTarget): Promise<boolean> { return driver.exists(target); }
/** Captures the active webview to a PNG in the run workspace. */
export async function screenshot(name: string): Promise<string> { return driver.screenshot(name); }
/** Returns the restricted query surface for the active webview. */
export async function webview(): Promise<WebviewContext> { return driver.webview(); }
