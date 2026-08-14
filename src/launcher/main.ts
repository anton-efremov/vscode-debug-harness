#!/usr/bin/env node
/**
 * @fileoverview Launches one debug-harness run from the terminal.
 * Validates the run, prepares its workspace, launches VS Code, and reports completion.
 */
import { bundleScenario } from "./bundle-scenario";
import { freePort, launchVsCode, prepareLaunch } from "./launch-vscode";
import { createRunFiles } from "./prepare-workspace";
import { drainRemainingEvents, tailEvents, waitForResult } from "./report-output";
import { validateExecutable, validateExtension, validateScenario } from "./validate-inputs";
import { removeLaunchDataRoot } from "./wsl";

export interface RunOptions {
  scenario: string;
  attended: boolean;
  extensionPath?: string;
  runRoot?: string;
  /** Fixed DevTools port for controlled launchers and tests. Normal runs allocate one. */
  cdpPort?: number;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export interface RunResult {
  workspace: string;
  exitCode: number;
}

function usage(): never {
  process.stderr.write("Usage: vscode-debug-harness [--attended] <scenario-file>\n");
  process.exit(2);
}

function parseArguments(args: string[]): RunOptions {
  const attended = args.includes("--attended");
  const unknown = args.filter((argument) => argument.startsWith("-") && argument !== "--attended");
  const positional = args.filter((argument) => !argument.startsWith("-"));
  if (unknown.length || positional.length !== 1) usage();
  return { scenario: positional[0], attended };
}

/** Runs one debug-harness launch from the supplied options. */
export async function runHarness(options: RunOptions): Promise<RunResult> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const executable = await validateExecutable();
  const scenario = await validateScenario(options.scenario);
  const extensionPath = await validateExtension(options.extensionPath);
  const files = await createRunFiles(options.runRoot);
  await bundleScenario(scenario, files.bundle);
  const port = options.cdpPort ?? await freePort();
  const launch = await prepareLaunch(executable, extensionPath, scenario, files, port, options.attended);
  stdout.write(`Run workspace: ${files.workspace}\n`);
  const child = launchVsCode(launch, options.attended);
  child.stdout?.pipe(stdout, { end: false });
  child.stderr?.pipe(stderr, { end: false });
  let stopTail!: () => void;
  const tailStop = new Promise<void>((resolve) => {
    stopTail = resolve;
  });
  const tail = tailEvents(files.events, stdout, tailStop);
  let completed = false;
  try {
    const result = await waitForResult(files.result, child, executable);
    completed = true;
    if (!result.ok) {
      stderr.write(`${result.error ?? "Scenario failed"}\n`);
      return { workspace: files.workspace, exitCode: 1 };
    }
    return { workspace: files.workspace, exitCode: 0 };
  } catch (error) {
    if (!options.attended && child.exitCode === null) child.kill("SIGTERM");
    throw error;
  } finally {
    // Console writes can race the result file, so let queued records settle before the final drain.
    await new Promise((resolve) => setTimeout(resolve, 100));
    stopTail();
    const eventOffset = await tail;
    await drainRemainingEvents(files.events, eventOffset, stdout);
    if (options.attended && completed) child.unref();
    if (!options.attended) await removeLaunchDataRoot(launch.dataRoot);
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const result = await runHarness(options);
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
