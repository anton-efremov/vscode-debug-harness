import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

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

export interface RunResult { workspace: string; exitCode: number }

function packageRoot(): string { return path.resolve(__dirname, ".."); }

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Could not allocate a DevTools port"));
      server.close(() => resolve(address.port));
    });
  });
}

async function makeRunWorkspace(root?: string): Promise<string> {
  const parent = root ? path.resolve(root) : path.join(os.tmpdir(), "vscode-debug-harness");
  await fs.mkdir(parent, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return fs.mkdtemp(path.join(parent, `${stamp}-`));
}

async function validateExtension(extensionPath: string): Promise<void> {
  const manifestPath = path.join(extensionPath, "package.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { engines?: { vscode?: string }; main?: string; browser?: string };
  if (!manifest.engines?.vscode) throw new Error(`Extension manifest has no engines.vscode: ${manifestPath}`);
  if (!manifest.main && !manifest.browser) throw new Error(`Extension manifest has neither main nor browser: ${manifestPath}`);
}

async function bundleScenario(scenario: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [scenario], outfile, bundle: true, format: "esm", platform: "node", target: "node20",
    sourcemap: "inline",
    banner: { js: `import { appendFileSync as __harnessAppendEvent } from "node:fs";
const __harnessEventFile = process.env.VSCODE_DEBUG_HARNESS_EVENTS;
const __harnessRelay = (...values) => __harnessAppendEvent(__harnessEventFile, JSON.stringify({ text: values.map(value => typeof value === "string" ? value : String(value)).join(" ") }) + "\\n");
const __harnessConsole = __harnessEventFile ? { log: __harnessRelay, info: __harnessRelay, warn: __harnessRelay, error: __harnessRelay } : console;` },
    define: { console: "__harnessConsole" },
    alias: { "vscode-debug-harness": path.join(packageRoot(), "dist", "scenario-api.mjs") },
    external: ["vscode"],
  });
}

async function getVsCodeExecutable(): Promise<string> {
  const executable = process.env.VSCODE_EXECUTABLE_PATH?.trim();
  if (!executable) throw new Error("VSCODE_EXECUTABLE_PATH is required and must point to a portable VS Code executable");
  try { await fs.access(executable); }
  catch (error) { throw new Error(`Failed to launch VS Code: ${executable}`, { cause: error }); }
  return executable;
}

function pathForExecutable(value: string, executable: string): string {
  if (process.platform !== "linux" || !executable.toLowerCase().endsWith(".exe")) return value;
  return execFileSync("wslpath", ["-w", value], { encoding: "utf8" }).trim();
}

function childEnvironment(executable: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  if (process.platform === "linux" && executable.toLowerCase().endsWith(".exe")) {
    const hosts = new Set((environment.NODE_UNC_HOST_ALLOWLIST ?? "").split(",").map(value => value.trim()).filter(Boolean));
    hosts.add("wsl.localhost");
    environment.NODE_UNC_HOST_ALLOWLIST = [...hosts].join(",");
  }
  return environment;
}

async function launchDataRoot(executable: string, internal: string): Promise<{ host: string; child: string; disposable: boolean }> {
  if (process.platform !== "linux" || !executable.toLowerCase().endsWith(".exe")) return { host: internal, child: internal, disposable: false };
  const windowsTemp = execFileSync("cmd.exe", ["/d", "/s", "/c", "echo %TEMP%"], { encoding: "utf8" }).trim();
  const hostTemp = execFileSync("wslpath", ["-u", windowsTemp], { encoding: "utf8" }).trim();
  const host = path.join(hostTemp, "vscode-debug-harness", path.basename(path.dirname(internal)));
  await fs.mkdir(host, { recursive: true });
  return { host, child: pathForExecutable(host, executable), disposable: true };
}

async function tailEvents(file: string, output: NodeJS.WritableStream, stop: Promise<void>): Promise<number> {
  let offset = 0;
  let carry = "";
  let finished = false;
  void stop.then(() => { finished = true; });
  while (true) {
    const data = await fs.readFile(file, "utf8").catch(() => "");
    const chunk = carry + data.slice(offset);
    offset = data.length;
    const lines = chunk.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      try {
        const event = JSON.parse(line) as { text?: string };
        if (event.text) output.write(`${event.text}\n`);
      } catch { output.write(`${line}\n`); }
    }
    if (finished) return offset;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function awaitResult(resultFile: string, child: ChildProcess, executable: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    child.once("error", (error) => reject(new Error(`Failed to launch VS Code: ${executable}`, { cause: error })));
    const poll = async (): Promise<void> => {
      try { resolve(JSON.parse(await fs.readFile(resultFile, "utf8")) as { ok: boolean; error?: string }); return; } catch { /* not written yet */ }
      if (child.exitCode !== null) { reject(new Error(`VS Code exited before the scenario completed (exit ${child.exitCode})`)); return; }
      if (Date.now() - started > 120_000) { reject(new Error("Timed out waiting for the scenario to start or finish")); return; }
      setTimeout(() => void poll(), 50);
    };
    void poll();
  });
}

export async function runHarness(options: RunOptions): Promise<RunResult> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const executable = await getVsCodeExecutable();
  const scenario = path.resolve(options.scenario);
  await fs.access(scenario);
  const extensionPath = path.resolve(options.extensionPath ?? process.cwd());
  await validateExtension(extensionPath);
  const workspace = await makeRunWorkspace(options.runRoot);
  const internal = path.join(workspace, ".vscode-debug-harness");
  await fs.mkdir(internal);
  const bundle = path.join(internal, "scenario.mjs");
  const resultFile = path.join(internal, "result.json");
  const eventFile = path.join(internal, "events.jsonl");
  await bundleScenario(scenario, bundle);
  const port = options.cdpPort ?? await freePort();
  stdout.write(`Run workspace: ${workspace}\n`);
  const root = packageRoot();
  const childExtension = pathForExecutable(extensionPath, executable);
  const childBridge = pathForExecutable(path.join(root, "bridge"), executable);
  const childWorkspace = pathForExecutable(workspace, executable);
  const launchData = await launchDataRoot(executable, internal);
  const args = [
    "--new-window", "--disable-extensions", "--skip-welcome", "--skip-release-notes", "--disable-workspace-trust", `--extensionDevelopmentPath=${childExtension}`,
    `--extensionDevelopmentPath=${childBridge}`, `--user-data-dir=${launchData.disposable ? path.win32.join(launchData.child, "user-data") : path.join(launchData.child, "user-data")}`,
    `--extensions-dir=${launchData.disposable ? path.win32.join(launchData.child, "extensions") : path.join(launchData.child, "extensions")}`, `--remote-debugging-port=${port}`, childWorkspace,
  ];
  const child = spawn(executable, args, {
    env: { ...childEnvironment(executable), VSCODE_DEBUG_HARNESS_SCENARIO: pathForExecutable(bundle, executable), VSCODE_DEBUG_HARNESS_SCENARIO_DIR: pathForExecutable(path.dirname(scenario), executable), VSCODE_DEBUG_HARNESS_WORKSPACE: childWorkspace, VSCODE_DEBUG_HARNESS_RESULT: pathForExecutable(resultFile, executable), VSCODE_DEBUG_HARNESS_EVENTS: pathForExecutable(eventFile, executable), VSCODE_DEBUG_HARNESS_CDP_PORT: String(port), VSCODE_DEBUG_HARNESS_PACKAGE_ROOT: pathForExecutable(root, executable), VSCODE_DEBUG_HARNESS_ATTENDED: options.attended ? "1" : "0", WSLENV: [process.env.WSLENV, "VSCODE_DEBUG_HARNESS_SCENARIO", "VSCODE_DEBUG_HARNESS_SCENARIO_DIR", "VSCODE_DEBUG_HARNESS_WORKSPACE", "VSCODE_DEBUG_HARNESS_RESULT", "VSCODE_DEBUG_HARNESS_EVENTS", "VSCODE_DEBUG_HARNESS_CDP_PORT", "VSCODE_DEBUG_HARNESS_PACKAGE_ROOT", "VSCODE_DEBUG_HARNESS_ATTENDED", "NODE_UNC_HOST_ALLOWLIST"].filter(Boolean).join(":") },
    stdio: ["ignore", "pipe", "pipe"], detached: options.attended,
  });
  child.stdout?.pipe(stdout, { end: false }); child.stderr?.pipe(stderr, { end: false });
  let stopTail!: () => void;
  const tailStop = new Promise<void>((resolve) => { stopTail = resolve; });
  const tail = tailEvents(eventFile, stdout, tailStop);
  let completed = false;
  try {
    const result = await awaitResult(resultFile, child, executable);
    completed = true;
    if (!result.ok) { stderr.write(`${result.error ?? "Scenario failed"}\n`); return { workspace, exitCode: 1 }; }
    return { workspace, exitCode: 0 };
  } catch (error) {
    if (!options.attended && child.exitCode === null) child.kill("SIGTERM");
    throw error;
  } finally {
    // Console methods are synchronous while their file append is asynchronous;
    // allow writes queued immediately before the result record to settle.
    await new Promise((resolve) => setTimeout(resolve, 100));
    stopTail(); const eventOffset = await tail;
    // Drain records that raced the last polling interval.
    const remaining = await fs.readFile(eventFile, "utf8").catch(() => "");
    for (const line of remaining.slice(eventOffset).split("\n")) {
      if (!line) continue;
      try { stdout.write(`${(JSON.parse(line) as { text?: string }).text ?? line}\n`); } catch { stdout.write(`${line}\n`); }
    }
    if (options.attended && completed) child.unref();
    if (launchData.disposable && !options.attended) await fs.rm(launchData.host, { recursive: true, force: true }).catch(() => undefined);
  }
}
