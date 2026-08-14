/**
 * @fileoverview Connects Playwright to VS Code and resolves the workbench page over CDP.
 */
import path from "node:path";
import { createRequire } from "node:module";
import type { Browser, Page, Selectors } from "playwright-core";
import { ENV_CDP_PORT, ENV_PACKAGE_ROOT, requireEnv } from "../protocol";

async function registerWebviewSelector(selectors: Selectors): Promise<void> {
  await selectors.register("vscodewebview", () => ({
    query(root: Document | Element): Element | null {
      return this.queryAll(root)[0] ?? null;
    },
    queryAll(root: Document | Element): Element[] {
      const document = (root.ownerDocument ?? root) as Document;
      const content = (document.querySelector("iframe#active-frame") as HTMLIFrameElement | null)?.contentDocument;
      return content?.documentElement ? [content.documentElement] : [];
    },
  })).catch((error: unknown) => {
    if (!String(error).includes("has been already registered")) throw error;
  });
}

export class Connection {
  private browser?: Browser;
  private workbench?: Page;

  /** Returns the connected VS Code workbench page, connecting and retrying when needed. */
  async page(): Promise<Page> {
    if (this.workbench && !this.workbench.isClosed()) return this.workbench;
    const packageRoot = requireEnv(ENV_PACKAGE_ROOT);
    const { chromium, selectors } = createRequire(path.join(packageRoot, "package.json"))("playwright-core") as typeof import("playwright-core");
    const port = requireEnv(ENV_CDP_PORT);
    const deadline = Date.now() + 10_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        await registerWebviewSelector(selectors);
        const page = this.browser.contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => candidate.url().includes("workbench"));
        if (page) {
          this.workbench = page;
          return page;
        }
        lastError = new Error("The VS Code workbench page was not found");
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Could not connect to VS Code DevTools on port ${port}: ${String(lastError)}`);
  }
}
