# Pipelines

> **Document state:** Maintained  
> **Last reviewed:** 2026-08-14  
> **Scope:** Build, test, and release pipelines of vscode-custom-editor-harness

## 1. Build pipeline

### 1.1 Commands

- `npm run build` — full rebuild from zero: clean → tsc → driver bundle → runner assembly. Run it after any change in `src/`, after a pull, after a branch switch.
- `npm run clean` — deletes all build output. Contained in `build`; alone it is rarely needed.

### 1.2 Steps

The pipeline is the `build` line in `package.json`, four steps in order:

1. `scripts/build/clean.mjs` — deletes `dist/`.
2. `tsc -p tsconfig.build.json` — compiles `src/` into `dist/`: the package's plain JavaScript.
3. `scripts/build/build-scenario-api.mjs` — bundles the driver into `dist/scenario-api.mjs`.
4. `scripts/build/bundle-runner.mjs` — assembles the runner extension into `dist/runner/`.

### 1.3 Rules

- All generated files live under `dist/`. Nothing generated is committed, edited, or trusted after a pull without a rebuild.

## 2. Test pipeline

### 2.1 Commands

- `npm run test:unit` — unit tests only, no rebuild. For fast iteration. `npm test` is an alias for it.
- `npm run test:e2e` — `build`, then the end-to-end suite against a real desktop VS Code. Requires `VSCODE_EXECUTABLE_PATH` to point at a portable or unpacked VS Code executable.
- `npm run check` — `build`, then type-checks the tests, lints, runs the unit tests. The gate: code is done only when `check` passes. `check` includes `build` because compiling and bundling are themselves the first checks: source types and deliverable assembly.

### 2.2 Suites

The two suites live in parallel folders with parallel configs; each config states positively which folder it owns.

- **Unit** (`test/unit/`, `vitest.unit.config.mts`) — pure logic: gestures, target validation, argument parsing, result handling. Tests import only the pure and public modules (`api.ts`, `types.ts`, `driver/gestures.ts`, `launcher/main.ts`), never the stateful adapters.
- **E2e** (`test/e2e/`, `vitest.e2e.config.mts`, sequential, 120 s timeouts) — runs the compiled launcher as a child process against a fixture extension (`test/e2e/fixture-extension/`) with real scenarios (`test/e2e/scenarios/`). Asserts the full loop: exit codes, relayed console output, retained workspace, screenshot, source write-back, and failure propagation.

### 2.3 Rules

- `npm run check` must pass before any handoff: a pull request, an agent report, a publish.
- E2e is run when the change touches launch, bundling, the runner, or driver behavior; unit tests alone cover pure logic.

## 3. Release pipeline

1. Verify: `npm run check` and `npm run test:e2e` pass locally.
2. Bump the version in `package.json` (semver; at 0.x, breaking API changes bump the minor version).
3. Publish: `npm publish`. The `prepack` hook runs `check` automatically — a package that fails build, lint, or unit tests cannot be published.
4. Tag the release in git and push the tag.

There is no artifact beyond the npm package: the runner extension and the driver bundle ship inside it (`files: ["dist", ...]`).
