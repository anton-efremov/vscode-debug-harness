/**
 * @fileoverview Defines element targets for the E2E fixture extension.
 */
import type { ElementTarget } from "vscode-custom-editor-harness";

/** Locates a fixture button by its accessible name. */
export const button = (name: string): ElementTarget => ({
  kind: "element",
  locate: (root) => root.getByRole("button", { name, exact: true }),
});
/** Locates a fixture textbox by its accessible name. */
export const input = (name: string): ElementTarget => ({
  kind: "element",
  locate: (root) => root.getByRole("textbox", { name, exact: true }),
});
/** Locates a fixture region by its accessible name. */
export const region = (name: string): ElementTarget => ({
  kind: "element",
  locate: (root) => root.getByRole("region", { name, exact: true }),
});
