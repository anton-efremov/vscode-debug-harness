#!/usr/bin/env node
import { runHarness } from "./controller";

function usage(): never {
  process.stderr.write("Usage: vscode-debug-harness [--attended] <scenario-file>\n");
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const attended = args.includes("--attended");
  const unknown = args.filter((arg) => arg.startsWith("-") && arg !== "--attended");
  const positional = args.filter((arg) => !arg.startsWith("-"));
  if (unknown.length || positional.length !== 1) usage();
  const result = await runHarness({ scenario: positional[0], attended });
  process.exitCode = result.exitCode;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
