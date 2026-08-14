/**
 * @fileoverview Implements stateless pointer gestures against Playwright and scenario targets.
 */
import type { Frame, Locator, Page } from "playwright-core";
import type { CoordinateTarget, ElementTarget, Target } from "../types";

interface PagePoint {
  x: number;
  y: number;
}

/** Converts a webview-local coordinate to its current workbench page position. */
export async function coordinateToPagePoint(target: CoordinateTarget, frame: Frame): Promise<PagePoint> {
  const element = await frame.frameElement();
  const box = await element.boundingBox();
  if (!box) throw new Error("The webview frame is not visible");
  return { x: box.x + target.x, y: box.y + target.y };
}

/** Clicks either a located element or a webview-local coordinate. */
export async function clickTarget(page: Page, root: Locator, frame: Frame, target: Target): Promise<void> {
  if (target.kind === "element") {
    await target.locate(root).click();
    return;
  }
  const point = await coordinateToPagePoint(target, frame);
  await page.mouse.click(point.x, point.y);
}

/** Double-clicks either a located element or a webview-local coordinate. */
export async function doubleClickTarget(page: Page, root: Locator, frame: Frame, target: Target): Promise<void> {
  if (target.kind === "element") {
    await target.locate(root).dblclick();
    return;
  }
  const point = await coordinateToPagePoint(target, frame);
  await page.mouse.click(point.x, point.y, { clickCount: 2 });
}

/** Drags between element or coordinate targets and always releases the mouse. */
export async function dragTarget(page: Page, root: Locator, frame: Frame, target: Target, to: Target): Promise<void> {
  if (target.kind === "element") {
    await target.locate(root).hover();
  } else {
    const point = await coordinateToPagePoint(target, frame);
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.down();
  try {
    if (to.kind === "element") {
      await to.locate(root).hover();
    } else {
      const point = await coordinateToPagePoint(to, frame);
      await page.mouse.move(point.x, point.y, { steps: 10 });
    }
  } finally {
    await page.mouse.up();
  }
}

/** Checks that an element target has zero or one match and reports its visibility. */
export async function elementExists(root: Locator, target: ElementTarget): Promise<boolean> {
  const locator = target.locate(root);
  const count = await locator.count();
  if (count === 0) return false;
  if (count > 1) throw new Error(`Element target matched ${count} elements`);
  return locator.isVisible();
}
