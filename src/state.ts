import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { logger } from "./logger.js";
import type { ProjectState, HeartbeatPayload } from "./types.js";

const DEFAULT_STATE_DIR = path.join(os.homedir(), ".chronova-antigravity-plugin", "state");
export const RATE_LIMIT_SECONDS = 60;

export function getStateDir(): string {
  return process.env.CHRONOVA_STATE_DIR || DEFAULT_STATE_DIR;
}

export function projectStateFile(projectFolder: string): string {
  const hash = crypto.createHash("sha256").update(projectFolder).digest("hex").slice(0, 16);
  return path.join(getStateDir(), `${hash}.json`);
}

export function readProjectState(projectFolder: string): ProjectState | null {
  const filePath = projectStateFile(projectFolder);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as Partial<ProjectState>;
    return {
      lastHeartbeatAt: typeof data.lastHeartbeatAt === "number" ? data.lastHeartbeatAt : 0,
      pendingChanges: data.pendingChanges && typeof data.pendingChanges === "object" ? data.pendingChanges : {},
    };
  } catch {
    return null;
  }
}

export function writeProjectState(projectFolder: string, state: ProjectState): void {
  const stateDir = getStateDir();
  const filePath = projectStateFile(projectFolder);
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  } catch (err) {
    logger.error("Failed to write project state file", { filePath, error: String(err) });
  }
}

export function shouldSendHeartbeat(projectFolder: string, force = false): boolean {
  if (force) return true;

  const state = readProjectState(projectFolder);
  if (!state || state.lastHeartbeatAt === 0) return true;

  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - state.lastHeartbeatAt;
  return elapsed >= RATE_LIMIT_SECONDS;
}

export function updateLastHeartbeat(projectFolder: string): void {
  const existing = readProjectState(projectFolder);
  const now = Math.floor(Date.now() / 1000);
  const state: ProjectState = {
    lastHeartbeatAt: now,
    pendingChanges: existing?.pendingChanges ?? {},
  };
  writeProjectState(projectFolder, state);
  logger.debug("Updated heartbeat state", { projectFolder, lastHeartbeatAt: now });
}

export function queuePendingChange(projectFolder: string, entity: string, isWrite: boolean): void {
  const state = readProjectState(projectFolder) ?? {
    lastHeartbeatAt: 0,
    pendingChanges: {},
  };

  const existing = state.pendingChanges[entity];
  state.pendingChanges[entity] = {
    isWrite: isWrite || (existing?.isWrite ?? false),
    timestamp: Math.floor(Date.now() / 1000),
  };

  writeProjectState(projectFolder, state);
  logger.debug("Queued pending change", { projectFolder, entity, isWrite: state.pendingChanges[entity].isWrite });
}

export function getPendingHeartbeats(projectFolder: string): HeartbeatPayload[] {
  const state = readProjectState(projectFolder);
  if (!state || Object.keys(state.pendingChanges).length === 0) return [];

  const payloads: HeartbeatPayload[] = [];
  for (const [entity, change] of Object.entries(state.pendingChanges)) {
    payloads.push({
      entity,
      projectFolder,
      isWrite: change.isWrite,
    });
  }
  return payloads;
}

export function clearPendingChanges(projectFolder: string): void {
  const state = readProjectState(projectFolder);
  if (!state) return;

  state.pendingChanges = {};
  writeProjectState(projectFolder, state);
  logger.debug("Cleared pending changes", { projectFolder });
}
