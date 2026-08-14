"use strict";
/**
 * @fileoverview Defines the environment and file-record contract shared by all harness processes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV_ATTENDED = exports.ENV_PACKAGE_ROOT = exports.ENV_CDP_PORT = exports.ENV_EVENTS = exports.ENV_RESULT = exports.ENV_WORKSPACE = exports.ENV_SCENARIO_DIR = exports.ENV_SCENARIO = void 0;
exports.requireEnv = requireEnv;
exports.ENV_SCENARIO = "VSCODE_DEBUG_HARNESS_SCENARIO";
exports.ENV_SCENARIO_DIR = "VSCODE_DEBUG_HARNESS_SCENARIO_DIR";
exports.ENV_WORKSPACE = "VSCODE_DEBUG_HARNESS_WORKSPACE";
exports.ENV_RESULT = "VSCODE_DEBUG_HARNESS_RESULT";
exports.ENV_EVENTS = "VSCODE_DEBUG_HARNESS_EVENTS";
exports.ENV_CDP_PORT = "VSCODE_DEBUG_HARNESS_CDP_PORT";
exports.ENV_PACKAGE_ROOT = "VSCODE_DEBUG_HARNESS_PACKAGE_ROOT";
exports.ENV_ATTENDED = "VSCODE_DEBUG_HARNESS_ATTENDED";
/** Reads a required harness environment variable for an active scenario. */
function requireEnv(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`${name} is only available while a vscode-debug-harness scenario is running`);
    return value;
}
//# sourceMappingURL=protocol.js.map