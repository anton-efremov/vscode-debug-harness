/**
 * @fileoverview Defines the public target and locator types used by scenarios.
 * Targets only describe elements; all actions go through driver functions.
 */
import type { Locator } from "playwright-core";

export type { Locator } from "playwright-core";

export interface CoordinateTarget {
  readonly kind: "coordinate";
  readonly x: number;
  readonly y: number;
}

export interface ElementTarget {
  readonly kind: "element";
  locate(root: Locator): Locator;
}

export type Target = CoordinateTarget | ElementTarget;
