# vscode-debug-harness

Drive a real VS Code with your extension loaded, from the terminal, using a TypeScript scenario.

A **scenario** is a TypeScript program describing one debugging run.

The harness:

1. creates a fresh workspace;
2. launches a fresh VS Code with the extension under development loaded;
3. runs the scenario inside the VS Code extension host;
4. lets the scenario act through real VS Code and webview input;
5. keeps the run workspace for inspection;
6. tears VS Code down when the scenario finishes.

The scenario acts as a user acts. It opens files, runs commands, clicks, drags, and types.

The scenario can observe document text, page state, files, and screenshots.

The public API does not call extension internals that a user cannot reach.

Architecture: `docs/architecture.md`.

## Install

```bash
npm install --save-dev vscode-debug-harness
export VSCODE_EXECUTABLE_PATH="/path/to/portable-vscode"
npx vscode-debug-harness ./scenario.ts
```

## VS Code runtime

`vscode-debug-harness` requires a dedicated portable or unpacked VS Code installation. `VSCODE_EXECUTABLE_PATH` must point to its desktop executable. The harness does not use or discover your normal VS Code installation.

Using a dedicated copy provides a fixed VS Code version without interference from normal auto-updates or user state. Each run additionally uses isolated `--user-data-dir` and `--extensions-dir` locations.

### WSL on Windows

When the harness runs in WSL, point `VSCODE_EXECUTABLE_PATH` to a Windows portable `Code.exe` through `/mnt/c/...`:

```bash
export VSCODE_EXECUTABLE_PATH="/mnt/c/Users/me/Tools/VSCode-E2E/Code.exe"
```

The harness process runs in WSL, while VS Code runs as a Windows process on the Windows desktop. The harness handles WSL-to-Windows path conversion.

### Linux

Use an unpacked Linux VS Code build and point the variable at its executable. A display must exist for the Linux GUI process.

### macOS

Use a dedicated VS Code application copy and point the variable at its executable inside the app bundle.

## Run

Run `vscode-debug-harness` from the root of the VS Code extension under development. `VSCODE_EXECUTABLE_PATH` is required.

```bash
npx vscode-debug-harness <scenario-file>
```

Options:

* `--attended` — leave VS Code open after the scenario finishes so the final state can be inspected by hand.
* Default — run the scenario to completion and tear VS Code down.

A run produces output on two channels.

### Terminal

* scenario `console` output, streamed during the run;
* path of the run workspace;
* exit code `0` when the scenario completes;
* non-zero exit code when the scenario throws or the run cannot start.

### Run workspace

The workspace is kept after the run.

It contains:

* files copied into the workspace by `openWith`, as the scenario left them;
* files written by the extension;
* screenshots created by the scenario.

## Scenario

```ts
import {
  openWith,
  click,
  drag,
  at,
  type,
  press,
  readSource,
} from "vscode-debug-harness";

import { classBox } from "my-extension-debug-targets";

await openWith("./case.txt", "myExtension.editor");

await click(classBox("Order"));
await drag(classBox("Order"), at(400, 200));

await type("Customer");
await press("Enter");

console.log(await readSource());
```

Top-level `await` is supported.

A thrown error ends the run with a non-zero exit code.

## API

### Targets

A **target** tells a pointer gesture where to act.

There are two kinds.

#### Coordinate target

A coordinate target directly gives a point in webview coordinates.

```ts
at(x, y)
```

Example:

```ts
at(400, 200)
```

#### Element target

An element target identifies a rendered element.

Extension-specific element targets come from companion libraries.

For example:

```ts
classBox("Order")
dropdown().option("dashed")
```

The harness itself does not define the interface of a particular extension.

An element target provides a Playwright locator for its element.

The harness waits for that element when a gesture needs it, reads its current position, and performs the gesture there.

The public target types are:

```ts
interface CoordinateTarget {
  readonly kind: "coordinate";
  readonly x: number;
  readonly y: number;
}

interface ElementTarget {
  readonly kind: "element";
  locate(webview: WebviewContext): Locator;
}

type Target = CoordinateTarget | ElementTarget;
```

`at(...)` returns a `CoordinateTarget` containing raw webview coordinates.

Companion target libraries implement only `locate()`. The harness owns pointer positioning and gesture mechanics.

`WebviewContext` is the query surface for the extension webview. It exposes Playwright locator operations supported by the harness. It is intentionally smaller than Playwright `Frame`.

### Gestures

Gestures are extension-independent user input.

They use real pointer and keyboard input.

```ts
click(target)
doubleClick(target)
drag(target, to)

type(text)
press(key)
```

* `click(target)` — click the target once.
* `doubleClick(target)` — double-click the target.
* `drag(target, to)` — press on `target`, move to `to` in steps, then release.
* `type(text)` — type text into the current keyboard focus, key by key.
* `press(key)` — press one key by name, such as `Enter` or `Escape`.

`target` and `to` accept any `Target`.

The first argument of `drag` is the thing being grabbed.

The second argument is its destination.

Low-level pointer and keyboard operations remain available through Playwright.

### Editor and document

```ts
openWith(sourceFile, viewType)
runCommand(id, ...args)
readSource()
```

* `openWith(sourceFile, viewType)` — copy the source file into the run workspace and open the copy using the editor registered under `viewType`. Relative source paths are resolved relative to the scenario file. The original file is never modified.
* `runCommand(id, ...args)` — execute any VS Code command by id, forwarding each additional value as a separate command argument. This includes built-in commands and commands registered by the extension under test.
* `readSource()` — return the in-memory text of the document most recently opened by `openWith()`, including unsaved edits.

To inspect the saved file, save it first and then read the copy from the run workspace.

```ts
await runCommand("workbench.action.files.saveAll");
```

### Observation

```ts
exists(target)
screenshot(name)
webview()
```

* `exists(target: ElementTarget)` — report whether an element target currently resolves to an element. It does not wait.
* `screenshot(name): Promise<string>` — save the webview screenshot as `name.png` in the run workspace and return the written file path.
* `webview()` — return a `WebviewContext` for querying the extension webview with supported Playwright locator operations.

Coordinate targets such as `at(...)` are not valid arguments to `exists`.

Use `webview()` when the scenario needs a direct locator query that the higher-level API does not provide. It does not expose a full Playwright `Frame`.

## Target libraries

The harness is independent of any particular extension.

An extension can provide a companion target library containing its stable UI target vocabulary.

For example:

```ts
classBox("Order")
resizeHandle("Order", "e")
editPane().dropdown()
option("dashed")
```

The companion library translates these addresses into Playwright locators.

It does not implement gestures.

The separation is:

```text
extension
    defines its UI targets

vscode-debug-harness
    resolves targets
    performs generic gestures
    controls VS Code
```
