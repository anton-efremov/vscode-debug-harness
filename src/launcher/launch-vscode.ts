/**
 * @fileoverview Builds and starts the isolated VS Code process for one prepared run.
 */
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import {
  ENV_ATTENDED,
  ENV_CDP_PORT,
  ENV_EVENTS,
  ENV_PACKAGE_ROOT,
  ENV_RESULT,
  ENV_SCENARIO,
  ENV_SCENARIO_DIR,
  ENV_WORKSPACE,
} from "../protocol";
import { packageRoot, type RunFiles } from "./prepare-workspace";
import { childEnvironment, createLaunchDataRoot, pathForExecutable, type LaunchDataRoot } from "./wsl";

export interface Launch {
  executable: string;
  arguments: string[];
  environment: NodeJS.ProcessEnv;
  dataRoot: LaunchDataRoot;
}

/** Allocates an ephemeral loopback port for Chromium DevTools. */
export async function freePort(): Promise<number> {
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

/** Builds the complete VS Code process invocation for the prepared run. */
export async function prepareLaunch(
  executable: string,
  extensionPath: string,
  scenario: string,
  files: RunFiles,
  port: number,
  attended: boolean,
): Promise<Launch> {
  const root = packageRoot();
  const childWorkspace = pathForExecutable(files.workspace, executable);
  const dataRoot = await createLaunchDataRoot(executable, files.internal);
  const joinDataPath = dataRoot.disposable ? path.win32.join : path.join;
  const arguments_ = [
    "--new-window",
    "--disable-extensions",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-workspace-trust",
    `--extensionDevelopmentPath=${pathForExecutable(extensionPath, executable)}`,
    `--extensionDevelopmentPath=${pathForExecutable(path.join(root, "dist", "runner"), executable)}`,
    `--user-data-dir=${joinDataPath(dataRoot.child, "user-data")}`,
    `--extensions-dir=${joinDataPath(dataRoot.child, "extensions")}`,
    `--remote-debugging-port=${port}`,
    childWorkspace,
  ];
  const harnessEnvironment = {
    [ENV_SCENARIO]: pathForExecutable(files.bundle, executable),
    [ENV_SCENARIO_DIR]: pathForExecutable(path.dirname(scenario), executable),
    [ENV_WORKSPACE]: childWorkspace,
    [ENV_RESULT]: pathForExecutable(files.result, executable),
    [ENV_EVENTS]: pathForExecutable(files.events, executable),
    [ENV_CDP_PORT]: String(port),
    [ENV_PACKAGE_ROOT]: pathForExecutable(root, executable),
    [ENV_ATTENDED]: attended ? "1" : "0",
  };
  const forwardedEnvironment = [...Object.keys(harnessEnvironment), "NODE_UNC_HOST_ALLOWLIST"];
  return {
    executable,
    arguments: arguments_,
    environment: {
      ...childEnvironment(executable),
      ...harnessEnvironment,
      WSLENV: [process.env.WSLENV, ...forwardedEnvironment].filter(Boolean).join(":"),
    },
    dataRoot,
  };
}

/** Starts VS Code with the prepared arguments and environment. */
export function launchVsCode(launch: Launch, attended: boolean): ChildProcess {
  return spawn(launch.executable, launch.arguments, {
    env: launch.environment,
    stdio: ["ignore", "pipe", "pipe"],
    detached: attended,
  });
}
