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
  isIgnoredPath,
  findMatchingWorkspace,
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

  describe("isIgnoredPath", () => {
    it("should ignore internal gemini brain step outputs and transcripts", () => {
      expect(
        isIgnoredPath(
          "/home/dev/.gemini/antigravity/brain/c1faf807-0de7-4959-b53d-fb12ee075cd7/.system_generated/steps/644/output.txt",
        ),
      ).toBe(true);
    });

    it("should ignore internal gemini MCP tool schemas and instructions", () => {
      expect(
        isIgnoredPath("/home/dev/.gemini/antigravity/mcp/coolify/deploy.json"),
      ).toBe(true);
      expect(
        isIgnoredPath("/home/dev/.gemini/antigravity/mcp/browseros/tabs.json"),
      ).toBe(true);
    });

    it("should ignore internal skills and config directories", () => {
      expect(
        isIgnoredPath("/home/dev/.gemini/config/skills/find-skills/SKILL.md"),
      ).toBe(true);
      expect(
        isIgnoredPath("/home/dev/.gemini/config/config.json"),
      ).toBe(true);
    });

    it("should ignore node_modules, .git, and temp paths", () => {
      expect(
        isIgnoredPath("/home/dev/my-project/node_modules/lodash/index.js"),
      ).toBe(true);
      expect(isIgnoredPath("/home/dev/my-project/.git/HEAD")).toBe(true);
      expect(isIgnoredPath("/tmp/scratch.py")).toBe(true);
      expect(isIgnoredPath("/var/tmp/temp.txt")).toBe(true);
    });

    it("should NOT ignore legitimate project source files", () => {
      expect(
        isIgnoredPath(
          "/home/dev/.projects/chronova-antigravity-plugin/src/types.ts",
        ),
      ).toBe(false);
      expect(
        isIgnoredPath("/home/dev/projects/my-app/src/components/Button.tsx"),
      ).toBe(false);
    });
  });

  describe("findMatchingWorkspace", () => {
    const workspaces = [
      "/home/dev/.projects/project-a",
      "/home/dev/.projects/project-b",
    ];

    it("should match file to its workspace", () => {
      expect(
        findMatchingWorkspace(
          "/home/dev/.projects/project-a/src/index.ts",
          workspaces,
        ),
      ).toBe("/home/dev/.projects/project-a");
      expect(
        findMatchingWorkspace(
          "/home/dev/.projects/project-b/README.md",
          workspaces,
        ),
      ).toBe("/home/dev/.projects/project-b");
    });

    it("should return null for files outside all workspaces", () => {
      expect(
        findMatchingWorkspace("/home/dev/.projects/other-project/src/index.ts", workspaces),
      ).toBeNull();
    });
  });

  describe("parseToolCall", () => {
    const base = "/home/dev/my-project";
    const workspacePaths = ["/home/dev/my-project"];

    it("should parse view_file as read for valid workspace files", () => {
      const result = parseToolCall(
        {
          name: "view_file",
          args: { AbsolutePath: "/home/dev/my-project/src/index.ts" },
        },
        base,
        workspacePaths,
      );
      expect(result).toEqual({
        entity: "/home/dev/my-project/src/index.ts",
        isWrite: false,
        projectFolder: "/home/dev/my-project",
      });
    });

    it("should parse write_to_file as write for valid workspace files", () => {
      const result = parseToolCall(
        {
          name: "write_to_file",
          args: { TargetFile: "/home/dev/my-project/src/index.ts", CodeContent: "test" },
        },
        base,
        workspacePaths,
      );
      expect(result).toEqual({
        entity: "/home/dev/my-project/src/index.ts",
        isWrite: true,
        projectFolder: "/home/dev/my-project",
      });
    });

    it("should parse replace_file_content as write", () => {
      const result = parseToolCall(
        {
          name: "replace_file_content",
          args: { TargetFile: "src/state.ts" },
        },
        base,
        workspacePaths,
      );
      expect(result).toEqual({
        entity: "/home/dev/my-project/src/state.ts",
        isWrite: true,
        projectFolder: "/home/dev/my-project",
      });
    });

    it("should filter out internal gemini brain output.txt", () => {
      const result = parseToolCall(
        {
          name: "view_file",
          args: {
            AbsolutePath:
              "/home/dev/.gemini/antigravity/brain/c1faf807-0de7-4959-b53d-fb12ee075cd7/.system_generated/steps/644/output.txt",
          },
        },
        base,
        workspacePaths,
      );
      expect(result).toBeNull();
    });

    it("should filter out internal gemini MCP tool schemas", () => {
      const result = parseToolCall(
        {
          name: "view_file",
          args: {
            AbsolutePath:
              "/home/dev/.gemini/antigravity/mcp/coolify/deploy.json",
          },
        },
        base,
        workspacePaths,
      );
      expect(result).toBeNull();
    });

    it("should filter out files outside workspacePaths", () => {
      const result = parseToolCall(
        {
          name: "view_file",
          args: {
            AbsolutePath: "/home/dev/.projects/unrelated-project/src/foo.ts",
          },
        },
        base,
        workspacePaths,
      );
      expect(result).toBeNull();
    });

    it("should parse call_mcp_tool with filesystem tools inside workspace", () => {
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
        workspacePaths,
      );
      expect(writeResult).toEqual({
        entity: "/home/dev/my-project/package.json",
        isWrite: true,
        projectFolder: "/home/dev/my-project",
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
        workspacePaths,
      );
      expect(readResult).toEqual({
        entity: "/home/dev/my-project/package.json",
        isWrite: false,
        projectFolder: "/home/dev/my-project",
      });
    });

    it("should return null for non-file tool calls", () => {
      const result = parseToolCall(
        {
          name: "ask_question",
          args: { question: "What is your name?" },
        },
        base,
        workspacePaths,
      );
      expect(result).toBeNull();
    });
  });
});
