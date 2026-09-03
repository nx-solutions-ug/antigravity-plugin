import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const DEFAULT_LOG_FILE = path.join(os.homedir(), ".chronova-antigravity-plugin", "plugin.log");

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

let debugEnabled: boolean | undefined;

function isDebugEnabled(): boolean {
  if (debugEnabled !== undefined) return debugEnabled;
  if (
    process.env.CHRONOVA_ANTIGRAVITY_DEBUG === "1" ||
    process.env.CHRONOVA_PI_DEBUG === "1" ||
    process.env.CHRONOVA_DEBUG === "1"
  ) {
    debugEnabled = true;
    return true;
  }
  try {
    const cfgPath = path.join(os.homedir(), ".chronova.cfg");
    const content = fs.readFileSync(cfgPath, "utf-8");
    debugEnabled = /debug\s*=\s*true/i.test(content);
  } catch {
    debugEnabled = false;
  }
  return debugEnabled;
}

function write(level: LogLevel, msg: string, data?: unknown): void {
  if (level === "DEBUG" && !isDebugEnabled()) return;

  try {
    const logFile = process.env.CHRONOVA_LOG_FILE || DEFAULT_LOG_FILE;
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${msg}${data !== undefined ? ` ${JSON.stringify(data)}` : ""}\n`;
    fs.appendFileSync(logFile, line);
  } catch {
    // Swallow log write failures — never crash the plugin
  }
}

export const logger = {
  debug(msg: string, data?: unknown): void { write("DEBUG", msg, data); },
  info(msg: string, data?: unknown): void { write("INFO", msg, data); },
  warn(msg: string, data?: unknown): void { write("WARN", msg, data); },
  error(msg: string, data?: unknown): void { write("ERROR", msg, data); },
  // Helper for testing to reset debug cache
  _resetDebugCache(): void { debugEnabled = undefined; },
} as const;
