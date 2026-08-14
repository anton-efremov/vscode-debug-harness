/**
 * @fileoverview Reports scenario events and waits for the runner's result record.
 */
import type { ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import type { EventRecord, ResultRecord } from "../protocol";

function writeEventLine(line: string, output: NodeJS.WritableStream): void {
  try {
    const event = JSON.parse(line) as EventRecord;
    output.write(`${event.text ?? line}\n`);
  } catch {
    output.write(`${line}\n`);
  }
}

/** Streams complete JSON-lines scenario events until the caller signals completion. */
export async function tailEvents(file: string, output: NodeJS.WritableStream, stop: Promise<void>): Promise<number> {
  let offset = 0;
  let carry = "";
  let finished = false;
  void stop.then(() => {
    finished = true;
  });
  while (true) {
    const data = await fs.readFile(file, "utf8").catch(() => "");
    const chunk = carry + data.slice(offset);
    offset = data.length;
    const lines = chunk.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      writeEventLine(line, output);
    }
    if (finished) return offset;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Polls for the result while detecting launch, exit, and timeout failures. */
export async function waitForResult(resultFile: string, child: ChildProcess, executable: string): Promise<ResultRecord> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    child.once("error", (error) => {
      reject(new Error(`Failed to launch VS Code: ${executable}`, { cause: error }));
    });
    const poll = async (): Promise<void> => {
      try {
        resolve(JSON.parse(await fs.readFile(resultFile, "utf8")) as ResultRecord);
        return;
      } catch {
        // The runner has not written the result yet.
      }
      if (child.exitCode !== null) {
        reject(new Error(`VS Code exited before the scenario completed (exit ${child.exitCode})`));
        return;
      }
      if (Date.now() - started > 120_000) {
        reject(new Error("Timed out waiting for the scenario to start or finish"));
        return;
      }
      setTimeout(() => void poll(), 50);
    };
    void poll();
  });
}

/** Drains event records that raced the final tailing interval. */
export async function drainRemainingEvents(file: string, offset: number, output: NodeJS.WritableStream): Promise<void> {
  const remaining = await fs.readFile(file, "utf8").catch(() => "");
  for (const line of remaining.slice(offset).split("\n")) {
    if (!line) continue;
    writeEventLine(line, output);
  }
}
