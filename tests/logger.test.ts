import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { logger } from "../src/logger.js";

const LOG_DIR = path.join(os.homedir(), ".chronova-antigravity-plugin");
const LOG_FILE = path.join(LOG_DIR, "plugin.log");

describe("logger", () => {
  const originalEnv = process.env.CHRONOVA_ANTIGRAVITY_DEBUG;

  beforeEach(() => {
    logger._resetDebugCache();
    process.env.CHRONOVA_ANTIGRAVITY_DEBUG = "1";
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
    }
  });

  afterEach(() => {
    logger._resetDebugCache();
    if (originalEnv !== undefined) {
      process.env.CHRONOVA_ANTIGRAVITY_DEBUG = originalEnv;
    } else {
      delete process.env.CHRONOVA_ANTIGRAVITY_DEBUG;
    }
  });

  test("writes log lines without data payload", () => {
    logger.info("Test message without data");
    expect(fs.existsSync(LOG_FILE)).toBe(true);
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    expect(content).toMatch(/\[.*\] \[INFO\] Test message without data\n/);
  });

  test("writes log lines with data payload", () => {
    logger.info("Test message with data", { foo: "bar" });
    expect(fs.existsSync(LOG_FILE)).toBe(true);
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    expect(content).toMatch(/\[.*\] \[INFO\] Test message with data {"foo":"bar"}\n/);
  });

  test("writes debug, warn, and error log levels", () => {
    logger.debug("Debug msg");
    logger.warn("Warn msg");
    logger.error("Error msg");

    const content = fs.readFileSync(LOG_FILE, "utf-8");
    expect(content).toContain("[DEBUG] Debug msg");
    expect(content).toContain("[WARN] Warn msg");
    expect(content).toContain("[ERROR] Error msg");
  });
});
