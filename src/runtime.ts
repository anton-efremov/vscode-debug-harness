/**
 * @fileoverview Implements scenario interactions across VS Code and Playwright.
 * Keeps those runtime dependencies behind the public scenario API.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type { Browser, Frame, Page } from "playwright-core";
import type { CoordinateTarget, ElementTarget, Target, WebviewContext } from "./types";

interface VscodeApi {
  Uri: { file(value: string): any };
  workspace: { fs: { copy(from: any, to: any, options: { overwrite: boolean }): Promise<void> }; textDocuments: Array<{ uri: { fsPath: string }; getText(): string }> };
  commands: { executeCommand<T>(id: string, ...args: unknown[]): Promise<T> };
}

interface PagePoint { x: number; y: number }

interface ResolvedWebview { context: WebviewContext; coordinateFrame: Frame }

function webviewContext(host: Frame): WebviewContext {
  const root = host.locator("vscodewebview=*");
  return {
    locator: selector => root.locator(selector),
    getByRole: (role, options) => root.getByRole(role, options),
  };
}

/** Converts a webview-local coordinate to its current workbench page position. */
export async function coordinateToPagePoint(target: CoordinateTarget, frame: Frame): Promise<PagePoint> {
  const element = await frame.frameElement();
  const box = await element.boundingBox();
  if (!box) throw new Error("The webview frame is not visible");
  return { x: box.x + target.x, y: box.y + target.y };
}

/** Clicks either a located element or a webview-local coordinate. */
export async function clickTarget(page: Page, webview: WebviewContext, frame: Frame, target: Target): Promise<void> {
  if (target.kind === "element") { await target.locate(webview).click(); return; }
  const point = await coordinateToPagePoint(target, frame);
  await page.mouse.click(point.x, point.y);
}

/** Double-clicks either a located element or a webview-local coordinate. */
export async function doubleClickTarget(page: Page, webview: WebviewContext, frame: Frame, target: Target): Promise<void> {
  if (target.kind === "element") { await target.locate(webview).dblclick(); return; }
  const point = await coordinateToPagePoint(target, frame);
  await page.mouse.click(point.x, point.y, { clickCount: 2 });
}

/** Drags between element or coordinate targets and always releases the mouse. */
export async function dragTarget(page: Page, webview: WebviewContext, frame: Frame, target: Target, to: Target): Promise<void> {
  if (target.kind === "element") await target.locate(webview).hover();
  else { const point = await coordinateToPagePoint(target, frame); await page.mouse.move(point.x, point.y); }
  await page.mouse.down();
  try {
    if (to.kind === "element") await to.locate(webview).hover();
    else { const point = await coordinateToPagePoint(to, frame); await page.mouse.move(point.x, point.y, { steps: 10 }); }
  } finally { await page.mouse.up(); }
}

/** Checks that an element target has zero or one match and reports its visibility. */
export async function elementExists(webview: WebviewContext, target: ElementTarget): Promise<boolean> {
  const locator = target.locate(webview);
  const count = await locator.count();
  if (count === 0) return false;
  if (count > 1) throw new Error(`Element target matched ${count} elements`);
  return locator.isVisible();
}

export class HarnessRuntime {
  private browser?: Browser;
  private page?: Page;
  private openedSource?: string;

  private requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is only available while a vscode-debug-harness scenario is running`);
    return value;
  }

  private vscode(): VscodeApi {
    const packageRoot = this.requireEnv("VSCODE_DEBUG_HARNESS_PACKAGE_ROOT");
    return createRequire(path.join(packageRoot, "package.json"))("vscode") as VscodeApi;
  }

  private async browserPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const packageRoot = this.requireEnv("VSCODE_DEBUG_HARNESS_PACKAGE_ROOT");
    const { chromium, selectors } = createRequire(path.join(packageRoot, "package.json"))("playwright-core") as typeof import("playwright-core");
    const registerWebviewSelector = () => selectors.register("vscodewebview", () => ({
      query(root: Document | Element): Element | null { return this.queryAll(root)[0] ?? null; },
      queryAll(root: Document | Element): Element[] {
        const document = (root.ownerDocument ?? root) as Document;
        const content = (document.querySelector("iframe#active-frame") as HTMLIFrameElement | null)?.contentDocument;
        return content?.documentElement ? [content.documentElement] : [];
      },
    }));
    const port = this.requireEnv("VSCODE_DEBUG_HARNESS_CDP_PORT");
    const deadline = Date.now() + 10_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        await registerWebviewSelector().catch(error => { if (!String(error).includes("has been already registered")) throw error; });
        const page = this.browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes("workbench"));
        if (page) { this.page = page; return page; }
        lastError = new Error("The VS Code workbench page was not found");
      } catch (error) { lastError = error; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Could not connect to VS Code DevTools on port ${port}: ${String(lastError)}`);
  }

  private async resolvedWebview(): Promise<ResolvedWebview> {
    const page = await this.browserPage();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const visible: Frame[] = [];
      for (const frame of page.frames().filter((candidate) => candidate !== page.mainFrame())) {
        const element = await frame.frameElement();
        const source = await element.getAttribute("src");
        if (!frame.url().startsWith("vscode-webview://") && !source?.startsWith("vscode-webview://")) continue;
        const box = await element.boundingBox();
        if (box && box.width > 0 && box.height > 0) visible.push(frame);
      }
      if (visible.length > 1) throw new Error("More than one visible VS Code webview was found");
      if (visible.length === 1) {
        const active = await visible[0].locator("iframe#active-frame").elementHandle();
        if (active && await active.boundingBox()) return { context: webviewContext(visible[0]), coordinateFrame: visible[0] };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timed out waiting for a visible VS Code webview");
  }

  async webview(): Promise<WebviewContext> { return (await this.resolvedWebview()).context; }
  async click(target: Target): Promise<void> { const page = await this.browserPage(); const view = await this.resolvedWebview(); await clickTarget(page, view.context, view.coordinateFrame, target); }
  async doubleClick(target: Target): Promise<void> { const page = await this.browserPage(); const view = await this.resolvedWebview(); await doubleClickTarget(page, view.context, view.coordinateFrame, target); }
  async drag(target: Target, to: Target): Promise<void> { const page = await this.browserPage(); const view = await this.resolvedWebview(); await dragTarget(page, view.context, view.coordinateFrame, target, to); }
  async type(text: string): Promise<void> { await (await this.browserPage()).keyboard.type(text); }
  async press(key: string): Promise<void> { await (await this.browserPage()).keyboard.press(key); }

  async openWith(sourceFile: string, viewType: string): Promise<void> {
    const vscode = this.vscode();
    const source = path.resolve(this.requireEnv("VSCODE_DEBUG_HARNESS_SCENARIO_DIR"), sourceFile);
    const workspace = this.requireEnv("VSCODE_DEBUG_HARNESS_WORKSPACE");
    const stat = await fs.stat(source).catch(() => undefined);
    if (!stat?.isFile()) throw new Error(`Source file does not exist: ${source}`);
    const destination = path.join(workspace, path.basename(source));
    await vscode.workspace.fs.copy(vscode.Uri.file(source), vscode.Uri.file(destination), { overwrite: true });
    this.openedSource = destination;
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(destination), viewType);
  }

  async runCommand<T>(id: string, ...args: unknown[]): Promise<T> { return this.vscode().commands.executeCommand<T>(id, ...args); }

  async readSource(): Promise<string> {
    if (!this.openedSource) throw new Error("readSource() requires openWith() to be called first");
    const document = this.vscode().workspace.textDocuments.find((item) => item.uri.fsPath === this.openedSource);
    if (!document) throw new Error(`The source document is no longer open: ${this.openedSource}`);
    return document.getText();
  }

  async exists(target: ElementTarget): Promise<boolean> { return elementExists(await this.webview(), target); }

  async screenshot(name: string): Promise<string> {
    if (!name || path.basename(name) !== name || name === "." || name === "..") throw new Error("Screenshot name must be a plain file name");
    const filename = path.join(this.requireEnv("VSCODE_DEBUG_HARNESS_WORKSPACE"), `${name.replace(/\.png$/i, "")}.png`);
    await (await this.webview()).locator("body").screenshot({ path: filename });
    return filename;
  }
}

export const runtime = new HarnessRuntime();
