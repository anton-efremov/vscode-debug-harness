/**
 * @fileoverview Composes scenario-facing driver operations across VS Code and Playwright.
 */
import path from "node:path";
import type { Locator } from "playwright-core";
import { ENV_WORKSPACE, requireEnv } from "../protocol";
import type { ElementTarget, Target } from "../types";
import { Connection } from "./connection";
import { clickTarget, doubleClickTarget, dragTarget, elementExists } from "./gestures";
import { HostApi } from "./host-api";
import { resolveWebview, type ResolvedWebview } from "./webview";

export class Driver {
  private readonly connection = new Connection();
  private readonly hostApi = new HostApi();

  private async resolvedWebview(): Promise<ResolvedWebview> {
    return resolveWebview(await this.connection.page());
  }

  /** Returns the root locator of the active webview. */
  async webview(): Promise<Locator> {
    return (await this.resolvedWebview()).root;
  }

  /** Clicks a scenario target. */
  async click(target: Target): Promise<void> {
    const page = await this.connection.page();
    const resolved = await resolveWebview(page);
    await clickTarget(page, resolved.root, resolved.coordinateFrame, target);
  }

  /** Double-clicks a scenario target. */
  async doubleClick(target: Target): Promise<void> {
    const page = await this.connection.page();
    const resolved = await resolveWebview(page);
    await doubleClickTarget(page, resolved.root, resolved.coordinateFrame, target);
  }

  /** Drags one scenario target to another. */
  async drag(target: Target, to: Target): Promise<void> {
    const page = await this.connection.page();
    const resolved = await resolveWebview(page);
    await dragTarget(page, resolved.root, resolved.coordinateFrame, target, to);
  }

  /** Types text through the VS Code workbench keyboard. */
  async type(text: string): Promise<void> {
    await (await this.connection.page()).keyboard.type(text);
  }

  /** Presses one keyboard key or key combination. */
  async press(key: string): Promise<void> {
    await (await this.connection.page()).keyboard.press(key);
  }

  /** Copies a source into the run workspace and opens it with the requested editor. */
  async openWith(sourceFile: string, viewType: string): Promise<void> {
    await this.hostApi.openWith(sourceFile, viewType);
  }

  /** Executes a VS Code command with the supplied arguments. */
  async runCommand<T>(id: string, ...args: unknown[]): Promise<T> {
    return this.hostApi.runCommand<T>(id, ...args);
  }

  /** Reads the current text of the source most recently opened by the scenario. */
  async readSource(): Promise<string> {
    return this.hostApi.readSource();
  }

  /** Reports whether an element target resolves to exactly one visible element. */
  async exists(target: ElementTarget): Promise<boolean> {
    return elementExists(await this.webview(), target);
  }

  /** Captures the active webview to a PNG in the run workspace. */
  async screenshot(name: string): Promise<string> {
    if (!name || path.basename(name) !== name || name === "." || name === "..") {
      throw new Error("Screenshot name must be a plain file name");
    }
    const filename = path.join(requireEnv(ENV_WORKSPACE), `${name.replace(/\.png$/i, "")}.png`);
    await (await this.webview()).locator("body").screenshot({ path: filename });
    return filename;
  }
}

export const driver = new Driver();
