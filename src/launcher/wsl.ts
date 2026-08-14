/**
 * @fileoverview Adapts paths, environment, and VS Code state when launching Windows from WSL.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface LaunchDataRoot {
  host: string;
  child: string;
  disposable: boolean;
}

function launchesWindowsExecutable(executable: string): boolean {
  return process.platform === "linux" && executable.toLowerCase().endsWith(".exe");
}

/** Converts a host path when Linux Node launches a Windows executable through WSL. */
export function pathForExecutable(value: string, executable: string): string {
  if (!launchesWindowsExecutable(executable)) return value;
  return execFileSync("wslpath", ["-w", value], { encoding: "utf8" }).trim();
}

/** Adds the UNC allowance required for Windows Node to load files exposed by WSL. */
export function childEnvironment(executable: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  if (!launchesWindowsExecutable(executable)) return environment;
  const hosts = new Set(
    (environment.NODE_UNC_HOST_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  hosts.add("wsl.localhost");
  environment.NODE_UNC_HOST_ALLOWLIST = [...hosts].join(",");
  return environment;
}

/** Creates Windows-local VS Code state when the run crosses the WSL boundary. */
export async function createLaunchDataRoot(executable: string, internal: string): Promise<LaunchDataRoot> {
  if (!launchesWindowsExecutable(executable)) return { host: internal, child: internal, disposable: false };
  const windowsTemp = execFileSync("cmd.exe", ["/d", "/s", "/c", "echo %TEMP%"], { encoding: "utf8" }).trim();
  const hostTemp = execFileSync("wslpath", ["-u", windowsTemp], { encoding: "utf8" }).trim();
  const host = path.join(hostTemp, "vscode-debug-harness", path.basename(path.dirname(internal)));
  await fs.mkdir(host, { recursive: true });
  return { host, child: pathForExecutable(host, executable), disposable: true };
}

/** Removes disposable Windows-local run state after an unattended launch. */
export async function removeLaunchDataRoot(dataRoot: LaunchDataRoot): Promise<void> {
  if (!dataRoot.disposable) return;
  await fs.rm(dataRoot.host, { recursive: true, force: true }).catch(() => undefined);
}
