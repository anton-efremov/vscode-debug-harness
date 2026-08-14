/**
 * @fileoverview Resolves the single visible VS Code webview and its root locator.
 */
import type { Frame, Locator, Page } from "playwright-core";

export interface ResolvedWebview {
  root: Locator;
  coordinateFrame: Frame;
}

/** Waits for and resolves the single visible extension webview on a workbench page. */
export async function resolveWebview(page: Page): Promise<ResolvedWebview> {
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
      if (active && await active.boundingBox()) {
        return { root: visible[0].locator("vscodewebview=*"), coordinateFrame: visible[0] };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for a visible VS Code webview");
}
