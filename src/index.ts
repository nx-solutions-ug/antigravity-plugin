import { logger } from "./logger.js";
import {
  extractProjectFolder,
  extractToolCall,
  parseToolCall,
} from "./tracker.js";
import { queuePendingChange, shouldSendHeartbeat } from "./state.js";
import { flushPendingHeartbeats } from "./heartbeat.js";
import type { PreToolUsePayload, StopPayload } from "./types.js";

/**
 * Read all data from standard input.
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  return new Promise((resolve) => {
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(""));
  });
}

/**
 * Main hook execution router.
 */
export async function handleHook(hookType: string, inputRaw: string): Promise<string> {
  if (hookType === "PreToolUse") {
    return handlePreToolUse(inputRaw);
  }

  if (hookType === "Stop") {
    return handleStop(inputRaw);
  }

  if (hookType === "PostToolUse") {
    return handlePostToolUse(inputRaw);
  }

  return "{}";
}

export function handlePreToolUse(inputRaw: string): string {
  try {
    if (inputRaw.trim()) {
      const payload = JSON.parse(inputRaw) as PreToolUsePayload;
      const workspacePaths = payload.workspacePaths || [];
      const defaultProjectFolder = extractProjectFolder(payload);
      const toolCall = extractToolCall(payload);

      if (toolCall) {
        const parsed = parseToolCall(toolCall, defaultProjectFolder, workspacePaths);
        if (parsed) {
          const projectFolder = parsed.projectFolder || defaultProjectFolder;
          logger.debug("Captured file activity in PreToolUse", {
            projectFolder,
            entity: parsed.entity,
            isWrite: parsed.isWrite,
          });

          if (shouldSendHeartbeat(projectFolder)) {
            // Rate limit allows: queue and flush directly
            queuePendingChange(projectFolder, parsed.entity, parsed.isWrite);
            flushPendingHeartbeats(projectFolder, false);
          } else {
            // Rate-limited: keep in persistent pending queue for next flush/Stop
            queuePendingChange(projectFolder, parsed.entity, parsed.isWrite);
          }
        }
      }
    }
  } catch (err) {
    logger.error("Error in PreToolUse hook handler", { error: String(err) });
  }

  return JSON.stringify({ decision: "allow" });
}

export function handleStop(inputRaw: string): string {
  try {
    if (inputRaw.trim()) {
      const payload = JSON.parse(inputRaw) as StopPayload;
      const projectFolder = extractProjectFolder(payload);
      logger.info("Session terminating in Stop hook, force-flushing heartbeats", { projectFolder });
      flushPendingHeartbeats(projectFolder, true);
    }
  } catch (err) {
    logger.error("Error in Stop hook handler", { error: String(err) });
  }

  return "{}";
}

export function handlePostToolUse(inputRaw: string): string {
  try {
    if (inputRaw.trim()) {
      const payload = JSON.parse(inputRaw) as PreToolUsePayload;
      const projectFolder = extractProjectFolder(payload);
      // Optional check if there are pending heartbeats that can be flushed
      if (shouldSendHeartbeat(projectFolder)) {
        flushPendingHeartbeats(projectFolder, false);
      }
    }
  } catch (err) {
    logger.error("Error in PostToolUse hook handler", { error: String(err) });
  }

  return "{}";
}

function parseHookArg(): string {
  const args = process.argv.slice(2);
  const hookIdx = args.indexOf("--hook");
  if (hookIdx !== -1 && hookIdx + 1 < args.length) {
    return args[hookIdx + 1];
  }
  return "PreToolUse";
}

export async function main(): Promise<void> {
  const hookType = parseHookArg();
  const inputRaw = await readStdin();
  const response = await handleHook(hookType, inputRaw);

  process.stdout.write(response);
  process.exit(0);
}

// Run CLI when invoked directly
if (process.env.NODE_ENV !== "test" && (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts"))) {
  main().catch((err) => {
    logger.error("Unhandled error in main", { error: String(err) });
    process.stdout.write(JSON.stringify({ decision: "allow" }));
    process.exit(0);
  });
}
