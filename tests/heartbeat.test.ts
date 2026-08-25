import { describe, it, expect } from "vitest";
import {
  buildHeartbeatArgs,
  PLUGIN_ARG,
  PLUGIN_VERSION,
} from "../src/heartbeat.js";

describe("heartbeat", () => {
  it("should format PLUGIN_ARG with two-token Antigravity identity", () => {
    expect(PLUGIN_ARG).toBe(`antigravity/2.0 chronova-antigravity-plugin/${PLUGIN_VERSION}`);
  });

  it("should build correct chronova-cli arguments for read operations", () => {
    const args = buildHeartbeatArgs({
      entity: "/home/dev/project/src/index.ts",
      projectFolder: "/home/dev/project",
      isWrite: false,
    });

    expect(args).toEqual([
      "--entity",
      "/home/dev/project/src/index.ts",
      "--entity-type",
      "file",
      "--project-folder",
      "/home/dev/project",
      "--plugin",
      PLUGIN_ARG,
      "--category",
      "coding",
    ]);
  });

  it("should build correct chronova-cli arguments for write operations", () => {
    const args = buildHeartbeatArgs({
      entity: "/home/dev/project/src/index.ts",
      projectFolder: "/home/dev/project",
      isWrite: true,
    });

    expect(args).toEqual([
      "--entity",
      "/home/dev/project/src/index.ts",
      "--entity-type",
      "file",
      "--project-folder",
      "/home/dev/project",
      "--plugin",
      PLUGIN_ARG,
      "--category",
      "coding",
      "--write",
    ]);
  });
});
