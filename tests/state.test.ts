import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  shouldSendHeartbeat,
  updateLastHeartbeat,
  queuePendingChange,
  getPendingHeartbeats,
  clearPendingChanges,
  readProjectState,
  RATE_LIMIT_SECONDS,
} from "../src/state.js";

describe("state", () => {
  const testStateDir = path.join(os.tmpdir(), "chronova-test-state-" + Date.now());
  const projectFolder = "/home/dev/test-project";

  beforeEach(() => {
    process.env.CHRONOVA_STATE_DIR = testStateDir;
    process.env.CHRONOVA_LOG_FILE = path.join(testStateDir, "plugin.log");
    fs.mkdirSync(testStateDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.CHRONOVA_STATE_DIR;
    delete process.env.CHRONOVA_LOG_FILE;
    try {
      fs.rmSync(testStateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("should allow initial heartbeat when no state exists", () => {
    expect(shouldSendHeartbeat(projectFolder)).toBe(true);
  });

  it("should rate limit within RATE_LIMIT_SECONDS", () => {
    updateLastHeartbeat(projectFolder);
    expect(shouldSendHeartbeat(projectFolder)).toBe(false);
  });

  it("should bypass rate limit when force is true", () => {
    updateLastHeartbeat(projectFolder);
    expect(shouldSendHeartbeat(projectFolder, true)).toBe(true);
  });

  it("should allow heartbeat after RATE_LIMIT_SECONDS elapsed", () => {
    updateLastHeartbeat(projectFolder);

    const state = readProjectState(projectFolder)!;
    state.lastHeartbeatAt = Math.floor(Date.now() / 1000) - (RATE_LIMIT_SECONDS + 5);
    fs.writeFileSync(
      path.join(testStateDir, fs.readdirSync(testStateDir)[0]),
      JSON.stringify(state),
    );

    expect(shouldSendHeartbeat(projectFolder)).toBe(true);
  });

  it("should queue and retrieve pending changes", () => {
    queuePendingChange(projectFolder, "/home/dev/test-project/src/a.ts", false);
    queuePendingChange(projectFolder, "/home/dev/test-project/src/b.ts", true);

    const pending = getPendingHeartbeats(projectFolder);
    expect(pending).toHaveLength(2);

    const a = pending.find((p) => p.entity === "/home/dev/test-project/src/a.ts");
    const b = pending.find((p) => p.entity === "/home/dev/test-project/src/b.ts");

    expect(a?.isWrite).toBe(false);
    expect(b?.isWrite).toBe(true);
  });

  it("should upgrade read to write when same file is queued as write later", () => {
    queuePendingChange(projectFolder, "/home/dev/test-project/src/a.ts", false);
    queuePendingChange(projectFolder, "/home/dev/test-project/src/a.ts", true);

    const pending = getPendingHeartbeats(projectFolder);
    expect(pending).toHaveLength(1);
    expect(pending[0].isWrite).toBe(true);
  });

  it("should clear pending changes", () => {
    queuePendingChange(projectFolder, "/home/dev/test-project/src/a.ts", true);
    expect(getPendingHeartbeats(projectFolder)).toHaveLength(1);

    clearPendingChanges(projectFolder);
    expect(getPendingHeartbeats(projectFolder)).toHaveLength(0);
  });
});
