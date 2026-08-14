# Coding Standards

> **Implementation state:** Current
> **Document state:** Maintained
> **Last reviewed:** 2026-08-13
> **Scope:** Rules and standards for code in vscode-custom-editor-harness

## 1. Enforced standards

These rules are enforced by the compiler and toolchain through `npm run check`.

### TypeScript compiler

Shared configuration lives in `tsconfig.json`; `tsconfig.build.json` emits package files and declarations, while `tsconfig.test.json` type-checks source, tests, Vitest configuration, and ESLint configuration without emitting files.

The shared configuration uses `strict: true`, including:

- `strictNullChecks` — null and undefined require explicit handling;
- `noImplicitAny` — values must have explicit or inferrable types;
- `strictFunctionTypes` — function parameter types are checked contravariantly;
- `strictPropertyInitialization` — class properties must be initialized.

It targets ES2022, uses Node16 modules and module resolution, checks consistent filename casing, and skips declaration-file checking.

### ESLint

Configuration lives in `eslint.config.mjs` and uses ESLint 9 flat configuration with the recommended JavaScript and TypeScript rule sets. Generated output, dependencies, and the E2E fixture extension are ignored. Explicit `any` is allowed because the runtime and tests cross VS Code and Playwright boundaries that are not always statically available.

### Formatting

The repository has no Prettier configuration or formatting script. Formatting is therefore maintained by contributors and reviewed alongside the code. Match the surrounding TypeScript style: two-space indentation, semicolons, double quotes, and trailing commas in multiline constructs.

### Verification

`npm run check` cleans and builds the package, builds the bundled scenario API and bridge copy, type-checks tests, runs ESLint, and runs the normal Vitest suite.

---

## 2. Standards requiring judgment

### Code readability

Optimize code for reducing the cognitive load of a human reader.

- Prefer early returns over nested conditionals.
- Prefer named functions over multi-step inline closures when the name clarifies the call site.
- Keep obvious one-line closures inline.
- Prefer an existing named type over an indexed-access type when it saves the reader from following type indirection.
- Keep orchestration functions linear; move detailed path, process, polling, and serialization work behind accurately named helpers.

Bad — nested conditionals add to the reader's mental stack:

```ts
function describe(result: RunResult): string {
  if (result.ok) {
    return "ok";
  } else {
    if (result.error === "timeout") {
      return "timed out";
    } else {
      return "failed";
    }
  }
}
```

Good — guard clauses leave only the remaining case to read:

```ts
function describe(result: RunResult): string {
  if (result.ok) return "ok";
  if (result.error === "timeout") return "timed out";
  return "failed";
}
```

### Non-bloated code

Avoid redundant safeguards and unreachable branches. If an invariant might genuinely fail and silent failure would be dangerous, throw rather than returning silently. Do not introduce abstractions merely to reduce argument counts or line counts.

### Naming

Follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) for naming.

- `camelCase` — variables, functions, and module-scope constants;
- `PascalCase` — classes, type aliases, and interfaces;
- `UPPER_SNAKE_CASE` — true compile-time constants;
- no underscore prefix for private class members;
- use abbreviations only when unambiguous in this domain, such as `cdp`, `id`, and `url`;
- describe responsibility rather than implementation, such as `waitForResult` rather than `processFile`.

### Comments and annotations

Use JSDoc-style annotations. Comments should reduce cognitive load: keep them concise, include only information that is not evident from the code, and structure longer explanations clearly.

#### File-level annotation

Every TypeScript source module begins with a concise `@fileoverview` block:

```ts
/**
 * @fileoverview Launches one custom-editor-harness run from the terminal.
 * Validates the run, prepares its workspace, launches VS Code, and reports completion.
 */
```

Describe the module's responsibility and, only when useful, an important boundary. Do not list functions or explain file history.

#### Function annotation

Every exported function has a JSDoc block with at least a one-line summary:

```ts
/**
 * Runs one custom-editor-harness launch from the supplied options.
 */
export async function runHarness(options: RunOptions): Promise<RunResult> {
```

Add `@param` and `@returns` only when the TypeScript signature does not make the contract clear. Add JSDoc to non-exported functions when they are non-trivial or their contract is not obvious; omit it for obvious small helpers.

#### Inline comments

Use `//` comments when code does not make clear what it is doing or why it is necessary. Put long comments above the relevant code and short comments after it. Do not narrate self-explanatory operations.

```ts
// Console writes may race the result file, so drain events once more after polling stops.
const remaining = await fs.readFile(eventFile, "utf8").catch(() => "");
```
