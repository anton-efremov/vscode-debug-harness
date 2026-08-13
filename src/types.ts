/**
 * @fileoverview Defines the public target and webview-query types used by scenarios.
 */
import type { Frame, Locator } from "playwright-core";

export type { Locator } from "playwright-core";

export interface WebviewContext {
  locator(selector: string): Locator;
  getByRole(
    role: Parameters<Frame["getByRole"]>[0],
    options?: Parameters<Frame["getByRole"]>[1],
  ): Locator;
}

export interface CoordinateTarget {
  readonly kind: "coordinate";
  readonly x: number;
  readonly y: number;
}

export interface ElementTarget {
  readonly kind: "element";
  locate(webview: WebviewContext): Locator;
}

export type Target = CoordinateTarget | ElementTarget;
