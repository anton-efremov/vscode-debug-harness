# Architecture

> **Implementation state:** Current  
> **Document state:** Maintained  
> **Last reviewed:** 2026-08-13  
> **Scope:** System structure of vscode-debug-harness — context view, runtime view, module view, execution flow

`vscode-debug-harness` runs a user-written TypeScript debugging scenario against a real VS Code instance with the user's extension loaded.

This document has four views:

- **Context view** — the elements involved in debugging and how they connect.
- **Runtime view** — the processes of a run and how they communicate.
- **Module view** — how the harness source code is organized.
- **Execution flow** — the steps of a run, with the modules as actors.

---

## 1. Context view

Debugging with the harness involves the following elements.

**Product:**

- **Tested extension** — the user's ordinary VS Code extension. It is loaded, unmodified, by **portable VS Code**; the **launcher** only passes its path. It is acted on only through surfaces a real user could reach: the **driver** sends input into its webview and invokes public VS Code commands. It contains no harness code.

**Debug instrumentation** (written by the user, on harness APIs):

- **Scenarios** — TypeScript programs, one per debugging session: open a file, click, drag, type, check, screenshot. A scenario imports actions from the **driver** (`click`, `drag`, `openWith`, ...) and targets from the **target library** (`classBox`, ...); a typical line uses both: `await click(classBox("Order"))`. The user hands a scenario to the **launcher**; the **runner** executes it inside VS Code.
- **Target library** — the extension-specific UI vocabulary: functions like `classBox("Order")` that name elements of the **tested extension**'s webview. Each target implements the **driver**'s `ElementTarget` interface: a rule for finding one element.

**Harness** (this package):

- **Launcher** — terminal program. Takes a **scenario**, bundles it into a single runnable file, starts **portable VS Code** with the **tested extension** and the **runner** loaded, and reports the scenario's result.
- **Runner** — a minimal internal VS Code extension. Loads the bundled **scenario** into the extension host and reports its outcome back to the **launcher**.
- **Driver** — library of the generic actions **scenarios** are written with. Turns targets from the **target library** into real input in the **tested extension**'s webview, and calls public VS Code API for editor operations.

**Environment** (supplied by the user):

- **Portable VS Code** — a dedicated portable or unpacked desktop VS Code executable. Started by the **launcher**; hosts the **tested extension**, the **runner**, and through the runner the **scenario**. The user owns it and its version; the harness gives it isolated per-run state and never touches the user's normal profile.

---

## 2. Runtime view

### 2.1 Processes

The **launcher** starts one process, **portable VS Code**, which itself starts the extension host and the renderer. Three processes matter during a run:

- **Launcher process** — Node, started from the terminal. Runs: the **launcher**.
- **Extension host process** — Node, inside VS Code. Runs: the **tested extension**'s host part; the **runner**; and, loaded by the runner, the **scenario** with the **driver** bundled inside it.
- **Renderer process** — Chromium, inside VS Code. Runs: the workbench window and, as a frame inside it on a `vscode-webview://` address, the **tested extension**'s webview frontend.

The tested extension therefore spans both VS Code processes: its host part is reached through the VS Code API, its webview frontend through real input over CDP (see 4.2).

```text
Terminal
│
│  npx vscode-debug-harness scenario.ts
▼
Launcher process (Node)
│
│  starts with run configuration
▼
Portable VS Code
├─ Extension host process (Node)
│    ├─ tested extension (host part)
│    └─ runner
│         └─ imports bundled scenario
│              └─ scenario calls driver functions
└─ Renderer process (Chromium)
     └─ workbench window
          └─ webview frontend of the tested extension
```

### 2.2 Communication channels

The processes communicate through three channels:

- **Environment variables** (launcher process → VS Code). Set once at start; carry the run configuration: the paths of the scenario bundle, workspace, result file, and event file; the DevTools port; the package root; the attended flag. Inside the extension host they are read by the **runner** and the **driver**. Defined once in `src/protocol.ts`.
- **Files in the run workspace** (launcher process ↔ extension host process):
    - the scenario bundle — written by the **launcher**, imported by the **runner**;
    - the event file (JSON lines, one record per console call) — appended by the **scenario**'s console relay, tailed and printed live by the **launcher**;
    - the result file (one JSON record `{ ok, error? }`) — written by the **runner** atomically through a rename, polled by the **launcher**, which therefore never reads a partial record.
- **CDP on loopback** (extension host process ↔ renderer process). Chromium's DevTools protocol over one two-way connection. VS Code exposes the debug port because the launcher requests it at start; the **driver** learns the port from the environment and connects to it. The driver sends real mouse and keyboard input, element queries, and screenshot requests; results and element data come back the same way.

There are no private channels and no shared in-process state between the launcher process and VS Code.

### 2.3 Security boundary

- A scenario is trusted executable code with the same privileges as an extension.
- The DevTools endpoint is bound by VS Code and accessed only through `127.0.0.1`.
- `openWith` may read a source file outside the workspace, but copies only its basename into the workspace.
- Screenshot names are restricted to plain filenames, so the scenario cannot write outside the workspace through the screenshot API.

---

## 3. Module view

### 3.1 Source tree

```text
src/
  api.ts                 public scenario API; one-line forwards to the
                         driver singleton, no logic (only `at` builds locally)
  types.ts               target contract: Target = CoordinateTarget (x, y in
                         webview pixels) | ElementTarget (locate(root: Locator)
                         → Locator); targets describe, the driver acts
  protocol.ts            env variable names and record shapes; no raw
                         VSCODE_DEBUG_HARNESS_* string outside it
  launcher/
    main.ts              CLI entry; runHarness only calls sibling files
    validate-inputs.ts   validates executable, extension, scenario
    prepare-workspace.ts creates the run workspace and its paths
    bundle-scenario.ts   bundles the scenario with esbuild
    wsl.ts               WSL crossing; the only file that knows .exe,
                         wslpath, cmd.exe
    launch-vscode.ts     allocates the port; starts VS Code
    report-output.ts     tails events; polls the result
  runner/
    extension.ts         runs the scenario; reports its outcome; blind to
                         the tested extension; never imports the driver
  driver/
    main.ts              Driver class and singleton; composes Connection
                         (renderer side) and HostApi (host side)
    connection.ts        CDP connection; owns the Browser/Page state
    webview.ts           finds the webview fresh per gesture; builds its
                         root Locator
    gestures.ts          pure pointer gestures; the unit-test surface
    host-api.ts          vscode module access; owns the opened source
```

The packaged runner extension lives in `runner/` at the repository root; the build copies the compiled extension into it.

### 3.2 Dependencies

`launcher/`, `runner/`, and `driver/` are isolated: they never import each other and cooperate only through the runtime channels. In code they share only the two contract modules — `protocol.ts` (channel vocabulary) and `types.ts` (target vocabulary) — which themselves import nothing internal.

`api.ts` is the driver's public interface for scenarios and depends only on `driver/main.ts` and `types.ts`; the launcher's interface is its command line; the runner exposes nothing importable.

Unit tests touch only the pure and public modules — `api.ts`, `types.ts`, `driver/gestures.ts`, `launcher/main.ts` — never the stateful adapters.

### 3.3 Build outputs

- `dist/` — compiled package: `api.js` (+ types) as the library entry, `launcher/main.js` as the `bin` entry.
- `dist/scenario-api.mjs` — the driver bundled as ESM. The scenario bundler aliases the package name to this file, so scenarios get the driver without Node resolution inside the extension host.
- `runner/dist/extension.js` — the compiled runner, copied into the packaged extension folder.

---

## 4. Execution flow

A step-by-step description of one run. Actors are the modules from section 3.

### 4.1 Launch

1. `launcher/validate-inputs.ts` validates three inputs:
    - the VS Code executable from `VSCODE_EXECUTABLE_PATH`;
    - the tested extension (manifest in the working directory or `extensionPath`);
    - the scenario file.
2. `launcher/prepare-workspace.ts` creates a unique run workspace under the temporary directory. The workspace holds the opened files, the screenshots, and an internal directory with the scenario bundle, the result file, and the event file.
3. `launcher/bundle-scenario.ts` bundles the scenario with esbuild:
    - output is ESM, so top-level `await` works;
    - ordinary dependencies, including the target library, are bundled in;
    - the driver is bundled in through an alias on the package name;
    - only runtime-provided modules such as `vscode` stay external.
4. `launcher/launch-vscode.ts` allocates a free DevTools port and starts VS Code with:
    - a clean user-data directory and extensions directory;
    - the tested extension as one extension development path;
    - the runner as a second extension development path;
    - a loopback-only DevTools port;
    - the run workspace as the opened folder.
5. VS Code activates the runner on `onStartupFinished`. `runner/extension.ts` redirects scenario console methods into the event file and imports the scenario bundle.

WSL variant: WSL Node may launch a Windows portable `Code.exe`. Then the launcher and VS Code live in different operating systems, and the display belongs to Windows. `launcher/wsl.ts` adjusts the launch: Linux paths passed to VS Code are converted to UNC paths; `wsl.localhost` is added to the child's UNC allowlist so Windows Node can load files exposed by WSL; user-data and extensions directories are placed in Windows-local temporary storage, because Chromium storage and webview service workers do not work over UNC. This state is removed after an unattended run.

### 4.2 Scenario execution

The scenario's top-level code runs inside the extension host. Each call it makes enters through `api.ts` into `driver/main.ts`, which routes it onto one of two paths:

- **VS Code API path** — `openWith`, `runCommand`, `readSource`. `driver/host-api.ts` calls the public `vscode` module directly, available because the scenario runs in the extension host. `readSource` reads the in-memory document, including unsaved changes.
- **Input path** — `click`, `doubleClick`, `drag`, `type`, `press`, queries, screenshots. Real Chromium input over CDP, exactly as from a user.

A gesture call on the input path goes through three steps:

1. **Connect** — `driver/connection.ts` connects to the DevTools port (retrying until the endpoint is up) and finds the workbench page. The connection is made once and reused.
2. **Resolve the webview** — `driver/webview.ts` selects the single visible frame whose URL uses the `vscode-webview://` scheme and builds its root `Locator`, rooted at the extension's document. Zero candidates are retried for ten seconds; more than one visible candidate is an error. One visible webview at a time is a stated limit of the current version.
3. **Resolve the target and act** — `driver/gestures.ts` turns the target into input. An `ElementTarget` is resolved by calling its `locate(root)` with the root `Locator` and acted on through the returned locator. A `CoordinateTarget` is translated to page coordinates using the webview frame's position at gesture time. The input is then sent over CDP.

Element queries are plain Playwright: `locate()` receives a genuine `Locator`, so the full query API (`locator`, `getByRole`, `getByText`, chaining, ...) is available to targets, with Playwright's documented behavior. By convention, targets only describe elements; actions go through driver functions.

Throughout execution, the scenario's console calls are appended to the event file, and `launcher/report-output.ts` tails the file and prints each record to the terminal live.

### 4.3 Completion

1. When the scenario module finishes, `runner/extension.ts` writes the result record: success, or the thrown error with its stack.
2. `launcher/report-output.ts`, which has been polling for the result, reads it, drains the remaining event records, and the launcher exits with the scenario's outcome:
    - unattended run — the runner requests a normal VS Code shutdown;
    - attended run — the launcher detaches and leaves the window open.

The workspace is never deleted. Its path is printed before launch, so artifacts stay discoverable after every failure.

### 4.4 Failures

- A run succeeds only after the scenario module finishes. A synchronous exception or a rejected top-level `await` is serialized with its stack and produces exit code 1.
- Invalid inputs, launch failure, early VS Code exit, and a two-minute startup/run timeout produce a non-zero exit with a specific message.
- The DevTools port is chosen by briefly binding an ephemeral loopback port. A small release-to-launch race is unavoidable; the driver retries the connection and reports clearly if VS Code cannot expose the endpoint.
