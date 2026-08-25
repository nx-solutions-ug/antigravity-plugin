import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { handlePreToolUse, handleStop, handlePostToolUse } from "../src/index.js";
import { getPendingHeartbeats } from "../src/state.js";

describe("hook handler", () => {
  const testStateDir = path.join(os.tmpdir(), "chronova-hook-test-" + Date.now());
  const projectFolder = "/home/dev/my-test-project";

  beforeEach(() => {
    process.env.CHRONOVA_STATE_DIR = testStateDir;
    // Set dummy CLI to avoid trying to actually invoke binary during unit test
    process.env.CHRONOVA_CLI_PATH = "true";
    fs.mkdirSync(testStateDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.CHRONOVA_STATE_DIR;
    delete process.env.CHRONOVA_CLI_PATH;
    try {
      fs.rmSync(testStateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("handlePreToolUse", () => {
    it("should return allow decision for valid tool calls", () => {
      const payload = JSON.stringify({
        workspacePaths: [projectFolder],
        toolCall: {
          name: "write_to_file",
          args: {
            TargetFile: "src/new-feature.ts",
            CodeContent: "export const ok = true;",
          },
        },
      });

      const response = handlePreToolUse(payload);
      expect(JSON.parse(response)).toEqual({ decision: "allow" });
    });

    it("should return allow decision on empty or invalid input", () => {
      const response = handlePreToolUse("invalid-json{");
      expect(JSON.parse(response)).toEqual({ decision: "allow" });
    });

    it("should capture and process view_file tool calls", () => {
      const payload = JSON.stringify({
        workspacePaths: [projectFolder],
        toolCall: {
          name: "view_file",
          args: {
            AbsolutePath: `${projectFolder}/README.md`,
          },
        },
      });

      handlePreToolUse(payload);
      // Since it's initial call, it flushes and clears pending queue
      expect(getPendingHeartbeats(projectFolder)).toEqual([]);
    });
  });

  describe("handleStop", () => {
    it("should return empty object on Stop hook", () => {
      const payload = JSON.stringify({
        workspacePaths: [projectFolder],
        terminationReason: "model_stop",
      });

      const response = handleStop(payload);
      expect(JSON.parse(response)).toEqual({});
    });
  });

  describe("handlePostToolUse", () => {
    it("should return empty object on PostToolUse hook", () => {
      const payload = JSON.stringify({
        workspacePaths: [projectFolder],
        stepIdx: 1,
      });

      const response = handlePostToolUse(payload);
      expect(JSON.parse(response)).toEqual({});
    });
  });
});
