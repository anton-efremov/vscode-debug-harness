import type { ElementTarget } from "vscode-debug-harness";

export const button = (name: string): ElementTarget => ({ kind: "element", locate: webview => webview.getByRole("button", { name, exact: true }) });
export const input = (name: string): ElementTarget => ({ kind: "element", locate: webview => webview.getByRole("textbox", { name, exact: true }) });
export const region = (name: string): ElementTarget => ({ kind: "element", locate: webview => webview.getByRole("region", { name, exact: true }) });
