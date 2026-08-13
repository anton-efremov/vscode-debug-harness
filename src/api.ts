import { runtime } from "./runtime";
import type { CoordinateTarget, ElementTarget, Target, WebviewContext } from "./types";

export type { CoordinateTarget, ElementTarget, Locator, Target, WebviewContext } from "./types";

export function at(x: number, y: number): CoordinateTarget {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError("at(x, y) requires finite coordinates");
  return { kind: "coordinate", x, y };
}

export async function click(target: Target): Promise<void> { await runtime.click(target); }
export async function doubleClick(target: Target): Promise<void> { await runtime.doubleClick(target); }
export async function drag(target: Target, to: Target): Promise<void> { await runtime.drag(target, to); }
export async function type(text: string): Promise<void> { await runtime.type(text); }
export async function press(key: string): Promise<void> { await runtime.press(key); }
export async function openWith(sourceFile: string, viewType: string): Promise<void> { await runtime.openWith(sourceFile, viewType); }
export async function runCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T> { return runtime.runCommand<T>(id, ...args); }
export async function readSource(): Promise<string> { return runtime.readSource(); }
export async function exists(target: ElementTarget): Promise<boolean> { return runtime.exists(target); }
export async function screenshot(name: string): Promise<string> { return runtime.screenshot(name); }
export async function webview(): Promise<WebviewContext> { return runtime.webview(); }
