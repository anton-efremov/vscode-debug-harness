import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { at, runCommand } from "../src/api";
import { clickTarget, coordinateToPagePoint, doubleClickTarget, dragTarget, elementExists } from "../src/driver/gestures";
import { driver } from "../src/driver/main";
import type { ElementTarget } from "../src/types";
import type { WebviewContext } from "../src/types";

function frameWithBox(x = 100, y = 50): any {
  return { frameElement: vi.fn().mockResolvedValue({ boundingBox: vi.fn().mockResolvedValue({ x, y, width: 500, height: 400 }) }) };
}

describe("targets", () => {
  it("exposes a query context instead of a Playwright Frame", () => {
    expectTypeOf<WebviewContext>().toHaveProperty("locator");
    expectTypeOf<WebviewContext>().toHaveProperty("getByRole");
    expectTypeOf<WebviewContext>().not.toHaveProperty("evaluate");
  });
  it("at stores raw webview coordinates", () => expect(at(20, 30)).toEqual({ kind: "coordinate", x: 20, y: 30 }));
  it.each([[Number.NaN, 1], [Infinity, 1], [-Infinity, 1], [1, Number.NaN]])("rejects invalid coordinates", (x, y) => expect(() => at(x, y)).toThrow(/finite/));
  it("translates coordinates only at runtime", async () => expect(coordinateToPagePoint(at(20, 30), frameWithBox())).resolves.toEqual({ x: 120, y: 80 }));
  it("rejects an invisible frame", async () => {
    const frame = { frameElement: async () => ({ boundingBox: async () => null }) };
    await expect(coordinateToPagePoint(at(1, 2), frame as any)).rejects.toThrow("The webview frame is not visible");
  });
});

describe("element gesture ownership", () => {
  it("uses only locate() for click, double click, and both drag ends", async () => {
    const locator = { click: vi.fn(), dblclick: vi.fn(), hover: vi.fn() };
    const target: ElementTarget = { kind: "element", locate: () => locator as any };
    const mouse = { down: vi.fn(), up: vi.fn(), move: vi.fn(), click: vi.fn() };
    const page = { mouse } as any; const webview = {} as any; const frame = {} as any;
    await clickTarget(page, webview, frame, target);
    await doubleClickTarget(page, webview, frame, target);
    await dragTarget(page, webview, frame, target, target);
    expect(locator.click).toHaveBeenCalledOnce();
    expect(locator.dblclick).toHaveBeenCalledOnce();
    expect(locator.hover).toHaveBeenCalledTimes(2);
    expect(mouse.down).toHaveBeenCalledOnce();
    expect(mouse.up).toHaveBeenCalledOnce();
  });

  it("releases the mouse when a drag destination fails", async () => {
    const source: ElementTarget = { kind: "element", locate: () => ({ hover: vi.fn() }) as any };
    const destination: ElementTarget = { kind: "element", locate: () => ({ hover: vi.fn().mockRejectedValue(new Error("lost")) }) as any };
    const mouse = { down: vi.fn(), up: vi.fn() };
    await expect(dragTarget({ mouse } as any, {} as any, {} as any, source, destination)).rejects.toThrow("lost");
    expect(mouse.up).toHaveBeenCalledOnce();
  });
});

describe("runCommand", () => {
  it("forwards no extra argument", async () => {
    const execute = vi.spyOn(driver, "runCommand").mockResolvedValue(undefined);
    await runCommand("x");
    expect(execute).toHaveBeenCalledWith("x");
  });

  it("forwards separate command arguments", async () => {
    const execute = vi.spyOn(driver, "runCommand").mockResolvedValue(undefined);
    await runCommand("x", 1, "a");
    expect(execute).toHaveBeenCalledWith("x", 1, "a");
  });
});

describe("exists", () => {
  const target = (locator: object): ElementTarget => ({ kind: "element", locate: () => locator as any });
  it("returns false for no matches", async () => expect(elementExists({} as any, target({ count: async () => 0 }))).resolves.toBe(false));
  it("checks visibility for one match", async () => expect(elementExists({} as any, target({ count: async () => 1, isVisible: async () => true }))).resolves.toBe(true));
  it("throws for ambiguous matches", async () => expect(elementExists({} as any, target({ count: async () => 3 }))).rejects.toThrow("Element target matched 3 elements"));
});
