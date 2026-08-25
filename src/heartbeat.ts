import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { logger } from "./logger.js";
import {
  shouldSendHeartbeat,
  updateLastHeartbeat,
  getPendingHeartbeats,
  clearPendingChanges,
} from "./state.js";
import type { HeartbeatPayload } from "./types.js";

const DEFAULT_CLI_PATH = path.join(os.homedir(), ".local", "bin", "chronova-cli");

export function getCliPath(): string {
  if (process.env.CHRONOVA_CLI_PATH) {
    return process.env.CHRONOVA_CLI_PATH;
  }
  if (existsSync(DEFAULT_CLI_PATH)) {
    return DEFAULT_CLI_PATH;
  }
  return "chronova-cli";
}

export function readPluginVersion(): string {
  try {
    const pkgPath = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "1.0.0";
  } catch {
    return "1.0.0";
  }
}

export const PLUGIN_VERSION: string = readPluginVersion();

/**
 * User-Agent style plugin identifier sent to chronova-cli.
 * Format adheres to WakaTime/Chronova two-token plugin convention.
 */
export const PLUGIN_ARG = `antigravity/2.0 chronova-antigravity-plugin/${PLUGIN_VERSION}`;

/**
 * Build the chronova-cli argv for a heartbeat payload.
 */
export function buildHeartbeatArgs(payload: HeartbeatPayload): string[] {
  const args: string[] = [
    "--entity", payload.entity,
    "--entity-type", "file",
    "--project-folder", payload.projectFolder,
    "--plugin", PLUGIN_ARG,
    "--category", "coding",
  ];

  if (payload.isWrite) {
    args.push("--write");
  }

  return args;
}

/**
 * Send a single heartbeat via chronova-cli (fire-and-forget).
 * Spawns detached/unreferenced child process to prevent blocking.
 */
export function sendHeartbeat(payload: HeartbeatPayload): void {
  const cliPath = getCliPath();
  const args = buildHeartbeatArgs(payload);

  logger.debug("Spawning chronova-cli", { cliPath, args });

  try {
    const child = execFile(cliPath, args, (err, stdout, stderr) => {
      if (err) {
        logger.error("chronova-cli error", { error: String(err) });
        return;
      }
      if (stderr) {
        logger.warn("chronova-cli stderr", { stderr: stderr.trim() });
      }
      if (stdout) {
        logger.debug("chronova-cli stdout", { stdout: stdout.trim() });
      }
    });

    child.unref();
  } catch (err) {
    logger.error("Failed to spawn chronova-cli", { error: String(err) });
  }

  updateLastHeartbeat(payload.projectFolder);
}

/**
 * Dispatch pending heartbeats for a project folder.
 */
export function flushPendingHeartbeats(projectFolder: string, force = false): void {
  if (!projectFolder) return;

  if (!force && !shouldSendHeartbeat(projectFolder)) {
    logger.debug("Rate-limited, keeping pending changes in state", { projectFolder });
    return;
  }

  const pending = getPendingHeartbeats(projectFolder);
  if (pending.length === 0) return;

  logger.info("Flushing pending heartbeats", { projectFolder, count: pending.length, force });

  for (const payload of pending) {
    sendHeartbeat(payload);
  }

  clearPendingChanges(projectFolder);
}
