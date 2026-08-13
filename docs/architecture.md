# Architecture

`vscode-debug-harness` has three runtime parts. They deliberately communicate only through public VS Code APIs, Chromium's debugging protocol, and files in the run workspace.

## Controller process

The terminal CLI is a Node process. Before creating a run, it requires the caller to supply a dedicated portable or unpacked desktop VS Code executable through `VSCODE_EXECUTABLE_PATH`. The controller does not discover VS Code or fall back to an installed executable. It then validates the scenario and the extension in the current working directory, creates a unique workspace under the operating system's temporary directory, and bundles the TypeScript scenario to ESM with esbuild. ESM preserves top-level `await`.

The controller bundles normal scenario dependencies, including companion target libraries, into the scenario. Only runtime-provided modules such as `vscode` remain external. It then starts the supplied executable with:

* a clean user-data directory and extensions directory (inside the run workspace for native launches, or in Windows-local temporary storage when Windows VS Code is launched from WSL so Chromium storage and webview service workers work correctly);
* the current directory as an extension development path;
* the harness bridge as a second extension development path;
* a loopback-only Chromium DevTools port; and
* the new run workspace as the folder to open.

Portable VS Code plus isolated run state is the only supported runtime model. The user owns the installation and controls its version; the harness does not download, update, or inspect it for portability.

The process boundary is:

```text
harness controller
    runs where Node runs

VS Code client
    runs wherever the supplied executable runs
```

For example, WSL Node can launch a Windows portable `Code.exe`, which owns its Windows desktop display. Display ownership follows the operating system of the supplied executable.

For Windows VS Code launched from WSL, Linux paths are converted to UNC paths and `wsl.localhost` is added to that child process's UNC allowlist. The user's normal VS Code profile is not changed.

The controller streams the child process output and scenario console event records. It waits for an atomically-written result record. The workspace is never deleted. In an unattended run the bridge requests a normal VS Code shutdown; in an attended run the controller detaches after the result and leaves the window open.

## Bridge extension

The packaged bridge is an ordinary VS Code extension activated on `onStartupFinished`. It dynamically imports the bundled scenario, so the program runs inside the extension host and can use VS Code's public extension API. It captures scenario console calls into a JSON-lines event file and records either success or the thrown error in the result file.

The bridge has no knowledge of the extension under test and never imports it.

## Scenario API

Editor operations use public `vscode` APIs. `openWith` copies a source relative to the original scenario into the run workspace and invokes the public `vscode.openWith` command. `readSource` reads the in-memory `TextDocument`, including unsaved changes.

Input and webview observation use `playwright-core`. The API connects to the launched VS Code renderer through its DevTools endpoint and selects the single visible frame whose URL uses the `vscode-webview://` scheme. Zero candidates are retried for ten seconds; multiple visible candidates are an error. The first version supports one visible extension webview at a time.

The public query boundary is:

```text
Playwright Browser/Page/Frame
    internal to harness runtime

WebviewContext
    public query surface

ElementTarget
    consumes WebviewContext
    returns Playwright Locator
```

VS Code webviews are nested inside VS Code-owned frame structure. The harness exposes only the query operations it can guarantee to run against the actual extension webview, rather than exposing Playwright `Frame` directly. `WebviewContext.locator()` and `getByRole()` compose genuine Playwright locator engines from the extension document root, so CSS, role, and accessible-name behavior remain Playwright behavior.

The target model is a discriminated union:

* `CoordinateTarget` stores a `kind`, `x`, and `y` in webview coordinates.
* `ElementTarget` stores a `kind` and defines `locate(webview)` against `WebviewContext`.
* `Target` is their union.

An extension companion library defines only `ElementTarget.locate()`. The harness turns both target variants into real pointer actions. It delegates element clicks and hit-point selection to Playwright locators and translates coordinate targets using the webview frame's current page position at gesture time.

This split keeps target vocabulary extension-specific and keeps gestures reusable:

```text
terminal controller
  -> launches VS Code and tails run records

VS Code extension host
  -> bridge imports scenario
  -> editor API calls public vscode API
  -> input API connects to VS Code renderer via CDP

VS Code renderer/webview
  -> receives real Chromium mouse and keyboard input
```

## Lifecycle and failure behavior

The run is considered successful only after the scenario module finishes. A synchronous exception or rejected top-level await is serialized with its stack and produces exit code 1. Startup failure, invalid inputs, early VS Code exit, and a two-minute startup/run timeout also produce a non-zero exit. The workspace path is printed before launch so artifacts remain discoverable after every post-launch failure.

The DevTools port is selected by briefly binding an ephemeral loopback port. There is a small unavoidable release-to-launch race; connection errors are retried by the scenario runtime and reported clearly if VS Code cannot bind or expose the endpoint.

## Security boundary

A scenario is trusted executable code with the same privileges as an extension. The DevTools endpoint is bound by VS Code and accessed only through `127.0.0.1`. Scenario paths used by `openWith` may point outside the workspace for reading, but only the basename is copied into the retained workspace. Screenshot names are restricted to plain filenames to prevent writing outside it.
