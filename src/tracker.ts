import * as path from "node:path";
import * as os from "node:os";
import { logger } from "./logger.js";
import type { ToolCall, PreToolUsePayload, PostToolUsePayload, StopPayload } from "./types.js";

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
export function extractProjectFolder(payload: PreToolUsePayload | PostToolUsePayload | StopPayload): string {
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
 * Patterns of internal agent data, logs, schemas, system paths, and temporary files
 * that should never be tracked as project files in Chronova.
 */
export const IGNORED_PATH_PATTERNS: RegExp[] = [
  /[/\\]\.gemini(?:[/\\]|$)/i,
  /[/\\]\.system_generated(?:[/\\]|$)/i,
  /[/\\]\.chronova(?:-antigravity-plugin)?(?:[/\\]|$)/i,
  /[/\\]\.cache(?:[/\\]|$)/i,
  /[/\\]\.omp(?:[/\\]|$)/i,
  /[/\\]node_modules(?:[/\\]|$)/i,
  /[/\\]\.git(?:[/\\]|$)/i,
  /^(?:\/tmp|\/var\/tmp|\/dev\/shm|\/proc|\/sys|\/dev)(?:[/\\]|$)/i,
  /[/\\]brain[/\\][0-9a-fA-F-]+(?:[/\\]|$)/i,
  /[/\\]mcp[/\\][a-zA-Z0-9_-]+(?:[/\\]|$)/i,
];

/**
 * Check if a file path is an internal system/agent path that should not be tracked.
 */
export function isIgnoredPath(filePath: string): boolean {
  const norm = path.normalize(filePath);
  return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(norm));
}

/**
 * Match a file path to its containing workspace directory.
 */
export function findMatchingWorkspace(filePath: string, workspacePaths?: string[]): string | null {
  if (!workspacePaths || workspacePaths.length === 0) {
    return null;
  }
  const normFile = path.normalize(filePath);
  for (const ws of workspacePaths) {
    if (!ws) continue;
    const normWs = path.normalize(expandTilde(ws));
    if (normFile === normWs || normFile.startsWith(normWs + path.sep)) {
      return normWs;
    }
  }
  return null;
}

/**
 * Extract the file entity, write flag, and associated projectFolder from a ToolCall.
 * Returns null if the path is invalid, ignored, or outside the active workspace.
 */
export function parseToolCall(
  toolCall: ToolCall,
  projectFolder: string,
  workspacePaths?: string[],
): { entity: string; isWrite: boolean; projectFolder: string } | null {
  const toolName = toolCall.name.toLowerCase();
  const args = toolCall.args ?? {};

  let rawPath: string | undefined;
  let isWrite: boolean;

  // 1. Antigravity core tools
  if (
    toolName === "view_file" ||
    toolName === "write_to_file" ||
    toolName === "replace_file_content" ||
    toolName === "multi_replace_file_content"
  ) {
    rawPath = (args.AbsolutePath || args.TargetFile || args.filePath || args.path) as string | undefined;
    isWrite = toolName !== "view_file";
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

  // Reject internal system/agent paths (brain, mcp schemas, skills, logs, tmp, .git, node_modules)
  if (isIgnoredPath(resolved)) {
    logger.debug("Ignoring internal/system path", { path: resolved });
    return null;
  }

  // If workspacePaths are provided, verify the file belongs to an active workspace
  let targetProjectFolder = projectFolder;
  if (workspacePaths && workspacePaths.length > 0) {
    const matchedWs = findMatchingWorkspace(resolved, workspacePaths);
    if (!matchedWs) {
      logger.debug("Skipping file outside workspace paths", { path: resolved, workspacePaths });
      return null;
    }
    targetProjectFolder = matchedWs;
  }

  return { entity: resolved, isWrite, projectFolder: targetProjectFolder };
}
