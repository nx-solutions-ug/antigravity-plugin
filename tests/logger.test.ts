import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { logger } from "../src/logger.js";

describe("logger", () => {
  const testLogFile = path.join(os.tmpdir(), "chronova-test-log-" + Date.now(), "plugin.log");
  const originalEnv = process.env.CHRONOVA_ANTIGRAVITY_DEBUG;
  const originalLogEnv = process.env.CHRONOVA_LOG_FILE;

  beforeEach(() => {
    process.env.CHRONOVA_LOG_FILE = testLogFile;
    process.env.CHRONOVA_ANTIGRAVITY_DEBUG = "1";
    logger._resetDebugCache();
  });

  afterEach(() => {
    logger._resetDebugCache();
    if (originalEnv !== undefined) {
      process.env.CHRONOVA_ANTIGRAVITY_DEBUG = originalEnv;
    } else {
      delete process.env.CHRONOVA_ANTIGRAVITY_DEBUG;
    }
    if (originalLogEnv !== undefined) {
      process.env.CHRONOVA_LOG_FILE = originalLogEnv;
    } else {
      delete process.env.CHRONOVA_LOG_FILE;
    }
    try {
      fs.rmSync(path.dirname(testLogFile), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("writes log lines without data payload", () => {
    logger.info("Test message without data");
    const content = fs.readFileSync(testLogFile, "utf-8");
    expect(content).toMatch(/\[.*\] \[INFO\] Test message without data\n/);
  });

  it("writes log lines with data payload", () => {
    logger.info("Test message with data", { foo: "bar" });
    const content = fs.readFileSync(testLogFile, "utf-8");
    expect(content).toMatch(/\[.*\] \[INFO\] Test message with data {"foo":"bar"}\n/);
  });

  it("serializes null data payload instead of omitting it", () => {
    logger.info("Test message with null data", null);
    const content = fs.readFileSync(testLogFile, "utf-8");
    expect(content).toMatch(/\[.*\] \[INFO\] Test message with null data null\n/);
  });

  it("writes debug, warn, and error log levels", () => {
    logger.debug("Debug msg");
    logger.warn("Warn msg");
    logger.error("Error msg");

    const content = fs.readFileSync(testLogFile, "utf-8");
    expect(content).toContain("[DEBUG] Debug msg");
    expect(content).toContain("[WARN] Warn msg");
    expect(content).toContain("[ERROR] Error msg");
  });
});