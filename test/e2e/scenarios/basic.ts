import { at, click, doubleClick, drag, exists, openWith, press, readSource, runCommand, screenshot, type, webview } from "vscode-custom-editor-harness";
import { button, input, region } from "./targets.js";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const clickButton = button("Click");
await openWith("./case.fixture", "debugHarnessFixture.editor");
assert(await exists(clickButton), "Click button was not found");
assert(!(await exists(button("Missing"))), "Missing target unexpectedly exists");
await click(clickButton);
await doubleClick(button("Double click"));
await click(input("Name"));
await type("Order");
await press("Enter");
await drag(button("Draggable box"), region("Drop area"));
await click(at(20, 20));
await click(button("Write source"));
const view = await webview();
await view.getByRole("status").filter({ hasText: "source written" }).waitFor();
assert((await readSource()).includes("changed by harness"), "In-memory source was not changed");
assert(await view.locator("body[data-source-written=true]").count() === 1, "Direct webview query failed");
await runCommand("workbench.action.files.saveAll");
await screenshot("final");
console.log("HARNESS_E2E_OK");
