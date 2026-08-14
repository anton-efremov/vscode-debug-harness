# vscode-custom-editor-harness

`vscode-custom-editor-harness` runs a TypeScript debugging scenario against a real VS Code instance with your extension loaded.

It is intended for cases where calling extension functions directly is not enough and you need to reproduce real VS Code or webview behavior.

A scenario can:

* open a file in your custom editor;
* run VS Code commands;
* click, double-click, drag, and type in the webview;
* inspect rendered elements;
* read the underlying document;
* take screenshots.

The harness acts through normal user-facing surfaces. It does not call private APIs of the extension under test.

Architecture details: `docs/architecture.md`.

## How it fits together

There are three public APIs: the Run API, the Interaction API, and the Target Interface API.

```text
Terminal
│
│ CLI API
│ npx vscode-custom-editor-harness scenario.ts
▼
Harness launcher
│
│ launches dedicated VS Code
▼
VS Code
├─ Extension Host
│   runs scenario.ts:
│
│   click(classBox("Order"))
│   drag(resizeHandle(...))
│   ...
|        ▲
│        |
│        | Playwright over CDP
│        |
│        ▼
└─ Renderer / client
    └─ Webview
       runs extension frontend
       and receives Playwright-driven input
```

The harness knows how to perform generic actions, e.g. click, drag.

Your extension-specific target library defines which UI elements the harness can address.

For example:

```ts
await click(classBox("Order"));
```

`click()` comes from `vscode-custom-editor-harness`.

`classBox("Order")` comes from the extension-specific target library.

## Install

### Install the package

```bash
npm install --save-dev vscode-custom-editor-harness
```

### Configure VS Code

The harness requires a dedicated portable or unpacked VS Code installation.

Set `VSCODE_EXECUTABLE_PATH` to its desktop executable:

```bash
export VSCODE_EXECUTABLE_PATH="/path/to/portable-vscode"
```

The harness does not discover or use your normal VS Code installation.

Using a dedicated copy keeps the VS Code version fixed and avoids interference from normal VS Code updates and user state.

If the harness runs in WSL and VS Code runs on Windows, point `VSCODE_EXECUTABLE_PATH` to the Windows executable through `/mnt/c/...`:

```bash
export VSCODE_EXECUTABLE_PATH="/mnt/c/Users/me/Tools/VSCode-E2E/Code.exe"
```

The harness handles the required WSL-to-Windows path conversion.

## Run API

Run the command from the root of the VS Code extension under development:

```bash
npx vscode-custom-editor-harness ./harness/scenarios/bug.ts
```

The current working directory is treated as the extension under test.

The argument is the TypeScript scenario to execute.

Use:

```bash
npx vscode-custom-editor-harness ./harness/scenarios/bug.ts --attended
```

to keep VS Code open after the scenario finishes.

Without `--attended`, VS Code is closed when the run completes.

### What a run does

The launcher:

1. validates `VSCODE_EXECUTABLE_PATH`;
2. creates a fresh temporary workspace;
3. bundles the TypeScript scenario and its normal dependencies;
4. launches the dedicated VS Code;
5. loads the extension under development;
6. loads the harness runner extension;
7. enables Chromium remote debugging;
8. waits for the scenario result.

The runner runs inside the new VS Code Extension Host and imports the bundled scenario.

The scenario therefore runs inside the Extension Host. It can use the VS Code API directly. For webview interaction, Playwright connects from the Extension Host to the VS Code renderer over CDP.

### Output

The terminal receives:

- the run workspace path;
- scenario `console` output;
- launch and runtime errors;
- exit code `0` when the scenario completes;
- a non-zero exit code when the scenario throws or the run cannot start.

Each run uses a fresh temporary workspace. It is kept after the run so it can be inspected.

The workspace contains:

- copies created by `openWith`;
- files written by the extension;
- screenshots created by the scenario.

The original scenario fixtures are not modified.

## Interaction API

A **scenario** is a TypeScript program that describes one debugging run.

It imports interaction functions from `vscode-custom-editor-harness` and extension-specific targets from normal local modules or packages:

```ts
import {
  openWith,
  click,
  drag,
  at,
  readSource,
} from "vscode-custom-editor-harness";

import {
  classBox,
} from "../targets";

await openWith("./case.mmd", "myExtension.editor");

await click(classBox("Order"));

await drag(
  classBox("Order"),
  at(400, 200),
);

console.log(await readSource());
```

Top-level `await` is supported.

The launcher bundles normal scenario dependencies together with the scenario. A target library does not need to be registered separately.

If the scenario throws, the harness run exits with a non-zero exit code.

### Gestures

Gestures describe generic user input.

#### `click(target)`

Click once.

```ts
await click(button("Delete"));
```

#### `doubleClick(target)`

Double-click.

```ts
await doubleClick(classBox("Order"));
```

#### `drag(target, to)`

Grab `target`, move it to `to`, and release.

```ts
await drag(
  classBox("Order"),
  at(500, 300),
);
```

Both arguments are `Target`s.

The first argument is what the user grabs.

The second argument is the destination.

#### `type(text)`

Type into the current keyboard focus.

```ts
await type("Customer");
```

`type()` does not take a target. Establish focus first:

```ts
await click(nameField());
await type("Customer");
```

#### `press(key)`

Press one keyboard key.

```ts
await press("Enter");
await press("Escape");
```

### Editor and document

#### `openWith(sourceFile, viewType)`

Copy a source file into the run workspace and open the copy using a VS Code editor.

```ts
await openWith(
  "./case.mmd",
  "myExtension.editor",
);
```

Relative paths are resolved relative to the scenario file.

The original source file is never modified.

#### `runCommand(id, ...args)`

Execute a VS Code command.

```ts
await runCommand(
  "workbench.action.files.saveAll",
);
```

Additional values are forwarded as separate command arguments:

```ts
await runCommand(
  "myExtension.command",
  firstArgument,
  secondArgument,
);
```

#### `readSource()`

Return the in-memory text of the document most recently opened with `openWith()`.

```ts
const source = await readSource();
```

Unsaved edits are included.

To inspect what is written to disk, save first:

```ts
await runCommand(
  "workbench.action.files.saveAll",
);
```

### Observation

#### `exists(target)`

Check whether an `ElementTarget` currently resolves to one visible element.

```ts
if (await exists(button("Delete"))) {
  // ...
}
```

`exists()` does not wait for the element to appear.

If the target matches more than one element, it throws.

Coordinate targets such as `at(...)` cannot be passed to `exists()`.

#### `screenshot(name)`

Save the current extension webview as `<run-workspace>/<name>.png`.

```ts
const path = await screenshot("after-drag");
```

The function returns the written file path.

#### `webview()`

Return the root locator for the extension webview as a `Promise<Locator>`.

```ts
const view = await webview();

const status = view.getByRole("status");
```

The returned value is a genuine Playwright `Locator` rooted at the webview's document. The full Playwright locator query API is available, including `locator`, `getByRole`, `getByText`, filtering, and chaining:

```ts
const input = view.getByRole(
  "textbox",
  { name: "Name" },
);

await input.hover();
await input.fill("Order");
```

The harness does not expose the full Playwright `Page` or `Frame`. It owns VS Code frame discovery and raw page-level input.

## Target interface API

The harness knows how to perform generic gestures, but it does not know the UI structure of the extension under test.

An extension-specific target library defines addressable UI elements such as:

```ts
classBox("Order")
button("Delete")
resizeHandle("Order", "e")
```

The scenario imports these functions normally:

```ts
import {
  classBox,
  resizeHandle,
} from "../targets";
```

### `Target`

A pointer gesture accepts a `Target`:

```ts
type Target =
  | CoordinateTarget
  | ElementTarget;
```

### `ElementTarget`

An `ElementTarget` describes a rendered UI element.

```ts
interface ElementTarget {
  readonly kind: "element";

  locate(
    root: Locator,
  ): Locator;
}
```

The target library implements `locate(root)` and returns a Playwright `Locator`. The `root` argument is a genuine Playwright `Locator` rooted at the webview's document, so the full locator query API is available.

By convention, targets only describe elements. All actions go through driver functions.

For example:

```ts
import type {
  ElementTarget,
} from "vscode-custom-editor-harness";

export function button(
  name: string,
): ElementTarget {
  return {
    kind: "element",

    locate(root) {
      return root.getByRole(
        "button",
        { name },
      );
    },
  };
}
```

The target library answers:

> Which rendered element does this target mean?

The harness answers:

> How should this gesture be performed on that element?

For example:

```ts
await click(classBox("Order"));
```

combines an extension-specific target with a generic harness gesture.

### `CoordinateTarget`

The harness also provides a built-in target for a point in webview coordinates:

```ts
at(x, y)
```

For example:

```ts
await click(at(300, 200));
```

Its public type is:

```ts
interface CoordinateTarget {
  readonly kind: "coordinate";
  readonly x: number;
  readonly y: number;
}
```

The extension-specific target library does not need to implement coordinate targets.
