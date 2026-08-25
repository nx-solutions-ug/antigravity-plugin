import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import {
  expandTilde,
  stripLineSelector,
  resolvePath,
  extractProjectFolder,
  extractToolCall,
  parseToolCall,
} from "../src/tracker.js";

describe("tracker", () => {
  describe("expandTilde", () => {
    it("should expand lone ~ to homedir", () => {
      expect(expandTilde("~")).toBe(os.homedir());
    });

    it("should expand ~/path to homedir/path", () => {
      expect(expandTilde("~/test/file.ts")).toBe(path.join(os.homedir(), "test/file.ts"));
    });

    it("should keep regular paths unchanged", () => {
      expect(expandTilde("/var/log/app.log")).toBe("/var/log/app.log");
      expect(expandTilde("relative/file.ts")).toBe("relative/file.ts");
    });
  });

  describe("stripLineSelector", () => {
    it("should strip single line selectors", () => {
      expect(stripLineSelector("src/index.ts:50")).toBe("src/index.ts");
    });

    it("should strip line range selectors", () => {
      expect(stripLineSelector("src/index.ts:50-56")).toBe("src/index.ts");
      expect(stripLineSelector("src/index.ts:50+150")).toBe("src/index.ts");
    });

    it("should strip markdown line hash fragments", () => {
      expect(stripLineSelector("src/index.ts#L50-L60")).toBe("src/index.ts");
      expect(stripLineSelector("src/index.ts#L25")).toBe("src/index.ts");
    });

    it("should not strip normal path names with colons", () => {
      expect(stripLineSelector("src/index.ts")).toBe("src/index.ts");
    });
  });

  describe("resolvePath", () => {
    const base = "/home/dev/project";

    it("should resolve relative paths against base folder", () => {
      expect(resolvePath(base, "src/main.ts")).toBe("/home/dev/project/src/main.ts");
    });

    it("should handle absolute paths", () => {
      expect(resolvePath(base, "/etc/hosts")).toBe("/etc/hosts");
    });

    it("should expand ~ in paths", () => {
      expect(resolvePath(base, "~/.chronova.cfg")).toBe(path.join(os.homedir(), ".chronova.cfg"));
    });

    it("should handle file:// URIs", () => {
      expect(resolvePath(base, "file:///home/dev/project/src/main.ts")).toBe("/home/dev/project/src/main.ts");
    });

    it("should reject non-file URIs", () => {
      expect(resolvePath(base, "artifact://plan.md")).toBeNull();
      expect(resolvePath(base, "memory://context.json")).toBeNull();
      expect(resolvePath(base, "ssh://git@github.com/repo.git")).toBeNull();
      expect(resolvePath(base, "http://localhost:3000/api")).toBeNull();
      expect(resolvePath(base, "https://chronova.dev")).toBeNull();
    });

    it("should return null for empty/invalid inputs", () => {
      expect(resolvePath(base, "")).toBeNull();
      expect(resolvePath(base, undefined)).toBeNull();
    });
  });

  describe("extractProjectFolder", () => {
    it("should extract from workspacePaths if present", () => {
      const folder = extractProjectFolder({
        workspacePaths: ["/home/dev/my-workspace"],
      });
      expect(folder).toBe("/home/dev/my-workspace");
    });

    it("should extract from toolCall args Cwd if workspacePaths empty", () => {
      const folder = extractProjectFolder({
        workspacePaths: [],
        toolCall: {
          name: "run_command",
          args: { Cwd: "/home/dev/cwd-folder" },
        },
      });
      expect(folder).toBe("/home/dev/cwd-folder");
    });

    it("should fallback to process.cwd()", () => {
      const folder = extractProjectFolder({});
      expect(folder).toBe(process.cwd());
    });
  });

  describe("extractToolCall", () => {
    it("should extract direct toolCall", () => {
      const call = extractToolCall({
        toolCall: { name: "view_file", args: { AbsolutePath: "/foo/bar" } },
      });
      expect(call).toEqual({ name: "view_file", args: { AbsolutePath: "/foo/bar" } });
    });

    it("should extract toolCall from preToolHookArgs", () => {
      const call = extractToolCall({
        preToolHookArgs: {
          toolCall: { name: "write_to_file", args: { TargetFile: "/foo/bar" } },
        },
      });
      expect(call).toEqual({ name: "write_to_file", args: { TargetFile: "/foo/bar" } });
    });

    it("should extract toolCall from toolHookArgs", () => {
      const call = extractToolCall({
        toolHookArgs: {
          toolCall: { name: "replace_file_content", args: { TargetFile: "/foo/bar" } },
        },
      });
      expect(call).toEqual({ name: "replace_file_content", args: { TargetFile: "/foo/bar" } });
    });

    it("should extract tool from tool_name and tool_input", () => {
      const call = extractToolCall({
        tool_name: "view_file",
        tool_input: JSON.stringify({ AbsolutePath: "/foo/bar" }),
      });
      expect(call).toEqual({ name: "view_file", args: { AbsolutePath: "/foo/bar" } });
    });

    it("should return null when no tool call is present", () => {
      const call = extractToolCall({});
      expect(call).toBeNull();
    });
  });

  describe("parseToolCall", () => {
    const base = "/home/dev/my-project";

    it("should parse view_file as read", () => {
      const result = parseToolCall(
        {
          name: "view_file",
          args: { AbsolutePath: "/home/dev/my-project/src/index.ts" },
        },
        base,
      );
      expect(result).toEqual({
        entity: "/home/dev/my-project/src/index.ts",
        isWrite: false,
      });
    });

    it("should parse write_to_file as write", () => {
      const result = parseToolCall(
        {
          name: "write_to_file",
          args: { TargetFile: "/home/dev/my-project/src/index.ts", CodeContent: "test" },
        },
        base,
      );
      expect(result).toEqual({
        entity: "/home/dev/my-project/src/index.ts",
        isWrite: true,
      });
    });

    it("should parse replace_file_content as write", () => {
      const result = parseToolCall(
        {
          name: "replace_file_content",
          args: { TargetFile: "src/state.ts" },
        },
        base,
      );
      expect(result).toEqual({
        entity: "/home/dev/my-project/src/state.ts",
        isWrite: true,
      });
    });

    it("should parse call_mcp_tool with filesystem tools", () => {
      const writeResult = parseToolCall(
        {
          name: "call_mcp_tool",
          args: {
            ServerName: "filesystem",
            ToolName: "write_file",
            Arguments: { path: "package.json" },
          },
        },
        base,
      );
      expect(writeResult).toEqual({
        entity: "/home/dev/my-project/package.json",
        isWrite: true,
      });

      const readResult = parseToolCall(
        {
          name: "call_mcp_tool",
          args: {
            ServerName: "filesystem",
            ToolName: "read_file",
            Arguments: { path: "package.json" },
          },
        },
        base,
      );
      expect(readResult).toEqual({
        entity: "/home/dev/my-project/package.json",
        isWrite: false,
      });
    });

    it("should return null for non-file tool calls", () => {
      const result = parseToolCall(
        {
          name: "ask_question",
          args: { question: "What is your name?" },
        },
        base,
      );
      expect(result).toBeNull();
    });
  });
});
