import * as path from "node:path";
import * as os from "node:os";
import { logger } from "./logger.js";
import type { ToolCall, PreToolUsePayload, StopPayload } from "./types.js";

/**
 * Expand a leading ~ to the user's home directory.
 * Node's path module does not expand ~ by default.
 */
export function expandTilde(filePath: string): string {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

/**
 * Strip trailing line/range selectors and hash fragments from a file path.
 * Examples:
 * - "src/index.ts:50" -> "src/index.ts"
 * - "src/index.ts:50-56" -> "src/index.ts"
 * - "src/index.ts:50+150" -> "src/index.ts"
 * - "src/index.ts#L50-L60" -> "src/index.ts"
 */
export function stripLineSelector(filePath: string): string {
  let cleaned = filePath.replace(/#L\d+(?:-L\d+)?$/i, "");
  const match = cleaned.match(/^(.+):(\d+)(?:[-+]\d+)?$/);
  if (match) {
    cleaned = match[1];
  }
  return cleaned;
}

/**
 * Resolve a raw path or URI to an absolute file path.
 * Expands leading ~, converts file:// URIs, strips line selectors,
 * and rejects non-file URI schemes (artifact://, memory://, ssh://, http://, etc.).
 */
export function resolvePath(baseFolder: string, rawPath: string | undefined): string | null {
  if (!rawPath || typeof rawPath !== "string") return null;

  let sanitized = rawPath.trim();
  if (!sanitized) return null;

  // Handle file:// URI scheme
  if (sanitized.toLowerCase().startsWith("file://")) {
    sanitized = sanitized.slice(7);
    try {
      sanitized = decodeURIComponent(sanitized);
    } catch {
      // Keep original if decoding fails
    }
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(sanitized)) {
    // Reject other URI schemes — they are not real filesystem files
    logger.debug("Skipping non-file URI scheme", { path: rawPath });
    return null;
  }

  sanitized = stripLineSelector(sanitized);
  sanitized = expandTilde(sanitized);

  if (path.isAbsolute(sanitized)) {
    return path.normalize(sanitized);
  }

  return path.normalize(path.resolve(baseFolder || process.cwd(), sanitized));
}

/**
 * Determine the project workspace folder from a hook payload.
 */
export function extractProjectFolder(payload: PreToolUsePayload | StopPayload): string {
  if (payload.workspacePaths && payload.workspacePaths.length > 0 && payload.workspacePaths[0]) {
    const ws = expandTilde(payload.workspacePaths[0]);
    return path.isAbsolute(ws) ? path.normalize(ws) : path.resolve(process.cwd(), ws);
  }

  const prePayload = payload as PreToolUsePayload;
  const toolCall = prePayload.toolCall || prePayload.preToolHookArgs?.toolCall || prePayload.toolHookArgs?.toolCall;
  if (toolCall?.args?.Cwd && typeof toolCall.args.Cwd === "string") {
    const cwd = expandTilde(toolCall.args.Cwd);
    return path.isAbsolute(cwd) ? path.normalize(cwd) : path.resolve(process.cwd(), cwd);
  }

  return process.cwd();
}

/**
 * Extract active ToolCall from various payload structures.
 */
export function extractToolCall(payload: PreToolUsePayload): ToolCall | null {
  if (payload.toolCall && typeof payload.toolCall.name === "string") {
    return payload.toolCall;
  }

  if (payload.preToolHookArgs?.toolCall && typeof payload.preToolHookArgs.toolCall.name === "string") {
    return payload.preToolHookArgs.toolCall;
  }

  if (payload.toolHookArgs?.toolCall && typeof payload.toolHookArgs.toolCall.name === "string") {
    return payload.toolHookArgs.toolCall;
  }

  if (typeof payload.tool_name === "string") {
    let args: Record<string, unknown> = {};
    if (typeof payload.tool_input === "string") {
      try {
        args = JSON.parse(payload.tool_input) as Record<string, unknown>;
      } catch {
        args = {};
      }
    } else if (payload.tool_input && typeof payload.tool_input === "object") {
      args = payload.tool_input as Record<string, unknown>;
    }
    return { name: payload.tool_name, args };
  }

  return null;
}

/**
 * Extract the file entity and whether it was a write operation from a ToolCall.
 */
export function parseToolCall(toolCall: ToolCall, projectFolder: string): { entity: string; isWrite: boolean } | null {
  const toolName = toolCall.name.toLowerCase();
  const args = toolCall.args ?? {};

  let rawPath: string | undefined;
  let isWrite: boolean;

  // 1. Antigravity core tools
  if (toolName === "view_file") {
    rawPath = (args.AbsolutePath || args.TargetFile || args.filePath || args.path) as string | undefined;
    isWrite = false;
  } else if (toolName === "write_to_file") {
    rawPath = (args.TargetFile || args.AbsolutePath || args.filePath || args.path) as string | undefined;
    isWrite = true;
  } else if (toolName === "replace_file_content" || toolName === "multi_replace_file_content") {
    rawPath = (args.TargetFile || args.AbsolutePath || args.filePath || args.path) as string | undefined;
    isWrite = true;
  } else if (toolName === "read_resource") {
    rawPath = (args.Uri || args.uri || args.path) as string | undefined;
    isWrite = false;
  } else if (toolName === "call_mcp_tool") {
    const mcpArgs = (args.Arguments || {}) as Record<string, unknown>;
    rawPath = (mcpArgs.AbsolutePath || mcpArgs.TargetFile || mcpArgs.filePath || mcpArgs.file_path || mcpArgs.path || mcpArgs.targetFile) as string | undefined;
    const mcpTool = String(args.ToolName || "").toLowerCase();
    isWrite = /(?:write|edit|create|replace|save|update|append|delete|insert)/.test(mcpTool);
  } else {
    // 2. Generic tool argument inspection
    rawPath = (
      args.AbsolutePath ||
      args.TargetFile ||
      args.filePath ||
      args.file_path ||
      args.targetFile ||
      args.target_file ||
      args.path ||
      args.file ||
      args.Uri ||
      args.uri
    ) as string | undefined;

    isWrite = /(?:write|edit|create|replace|save|update|append|delete|insert)/.test(toolName);
  }

  if (!rawPath || typeof rawPath !== "string") {
    return null;
  }

  const resolved = resolvePath(projectFolder, rawPath);
  if (!resolved) {
    return null;
  }

  return { entity: resolved, isWrite };
}
