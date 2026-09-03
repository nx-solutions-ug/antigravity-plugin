import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { handlePreToolUse, handleStop, handlePostToolUse, readStdin, safeParseJson } from "../src/index.js";
import { MAX_STDIN_BYTES } from "../src/constants.js";
import type { PostToolUsePayload } from "../src/types.js";
import { Readable } from "node:stream";
import { getPendingHeartbeats } from "../src/state.js";

describe("hook handler", () => {
  const testStateDir = path.join(os.tmpdir(), "chronova-hook-test-" + Date.now());
  const projectFolder = "/home/dev/my-test-project";

  beforeEach(() => {
    process.env.CHRONOVA_STATE_DIR = testStateDir;
    // Set dummy CLI to avoid trying to actually invoke binary during unit test
    process.env.CHRONOVA_CLI_PATH = "true";
    process.env.CHRONOVA_LOG_FILE = path.join(testStateDir, "plugin.log");
    fs.mkdirSync(testStateDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.CHRONOVA_STATE_DIR;
    delete process.env.CHRONOVA_LOG_FILE;
    delete process.env.CHRONOVA_CLI_PATH;
    try {
      fs.rmSync(testStateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("safeParseJson", () => {
    it("should correctly parse valid JSON string", () => {
      const result = safeParseJson<{ key: string }>("{\"key\": \"value\"}");
      expect(result).toEqual({ key: "value" });
    });

    it("should return null for empty or whitespace-only input", () => {
      expect(safeParseJson("")).toBeNull();
      expect(safeParseJson("   \n\t  ")).toBeNull();
    });

    it("should return null for invalid JSON string", () => {
      expect(safeParseJson("{invalid json")).toBeNull();
    });

    it("should return falsy-but-valid JSON payloads instead of null", () => {
      expect(safeParseJson<number>("0")).toBe(0);
      expect(safeParseJson<string>('""')).toBe("");
      expect(safeParseJson<boolean>("false")).toBe(false);
      expect(safeParseJson<string>("null")).toBeNull();
    });
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
    it("should process valid PostToolUse payloads", () => {
      const payload: PostToolUsePayload = {
        workspacePaths: [projectFolder],
        error: "tool failed",
      };
      const response = handlePostToolUse(JSON.stringify(payload));
      expect(JSON.parse(response)).toEqual({});
    });
  });
  describe("readStdin", () => {
    let originalStdin: typeof process.stdin;

    beforeEach(() => {
      originalStdin = process.stdin;
    });

    afterEach(() => {
      Object.defineProperty(process, "stdin", {
        value: originalStdin,
        configurable: true,
      });
    });

    it("should return empty string when isTTY is true", async () => {
      const mockStdin = new Readable() as unknown as typeof process.stdin;
      mockStdin.isTTY = true;
      Object.defineProperty(process, "stdin", {
        value: mockStdin,
        configurable: true,
      });

      const result = await readStdin();
      expect(result).toBe("");
    });

    it("should read stream data normally under size limit", async () => {
      const mockStdin = new Readable({
        read() {},
      }) as unknown as typeof process.stdin;
      mockStdin.isTTY = false;

      Object.defineProperty(process, "stdin", {
        value: mockStdin,
        configurable: true,
      });

      const promise = readStdin();
      mockStdin.push(Buffer.from("hello "));
      mockStdin.push(Buffer.from("world"));
      mockStdin.push(null);

      const result = await promise;
      expect(result).toBe("hello world");
    });

    it("should reject/abort and return empty string when stream exceeds MAX_STDIN_BYTES", async () => {
      const mockStdin = new Readable({
        read() {},
      }) as unknown as typeof process.stdin;
      mockStdin.isTTY = false;

      Object.defineProperty(process, "stdin", {
        value: mockStdin,
        configurable: true,
      });

      const promise = readStdin();
      // Push chunk larger than MAX_STDIN_BYTES
      const largeChunk = Buffer.alloc(MAX_STDIN_BYTES + 100);
      mockStdin.push(largeChunk);

      const result = await promise;
      expect(result).toBe("");
    });

    it("should reject and return empty string when cumulative small chunks exceed MAX_STDIN_BYTES", async () => {
      const mockStdin = new Readable({
        read() {},
      }) as unknown as typeof process.stdin;
      mockStdin.isTTY = false;

      Object.defineProperty(process, "stdin", {
        value: mockStdin,
        configurable: true,
      });

      const promise = readStdin();
      // Push many small chunks, each well under the limit, whose cumulative
      // size crosses the threshold — locks in the running-counter contract.
      const chunkSize = 1024 * 1024; // 1 MB per chunk
      const chunk = Buffer.alloc(chunkSize, "a");
      for (let pushed = 0; pushed <= MAX_STDIN_BYTES; pushed += chunkSize) {
        mockStdin.push(chunk);
      }
      // Push one more small chunk to push the cumulative total over the limit
      mockStdin.push(Buffer.from("overflow"));

      const result = await promise;
      expect(result).toBe("");
    });

    it("should return empty string on stdin error", async () => {
      const mockStdin = new Readable({
        read() {},
      }) as unknown as typeof process.stdin;
      mockStdin.isTTY = false;

      Object.defineProperty(process, "stdin", {
        value: mockStdin,
        configurable: true,
      });

      const promise = readStdin();
      mockStdin.emit("error", new Error("stdin read error"));

      const result = await promise;
      expect(result).toBe("");
    });
  });
});
