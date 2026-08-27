---
type: reference
title: Heartbeats & rate limiting
description: Persistent per-project state, rate limiting, and chronova-cli dispatch.
tags: [heartbeats, state, rate-limit, chronova-cli, dispatch]
---

# Heartbeats & rate limiting

Heartbeats are dispatched by `src/heartbeat.ts` and throttled by `src/state.ts`. The goal is to capture file activity without overwhelming `chronova-cli` or the network.

## Rate limit

The plugin enforces **one heartbeat per project folder per 60 seconds**. The `RATE_LIMIT_SECONDS` constant in `src/state.ts` defines the window.

Rate-limit state is persisted across plugin invocations because Antigravity starts a fresh plugin process for each hook. State files live in:

```text
~/.chronova-antigravity-plugin/state/
```

Each project folder maps to a JSON file named `<sha256(folder).slice(0,16)>.json`.

## Pending change queue

If a tool call occurs inside the cooldown window, the activity is queued instead of discarded. The queue is stored in the same project state file:

```ts
interface ProjectState {
  lastHeartbeatAt: number; // Unix seconds
  pendingChanges: Record<string, { isWrite: boolean; timestamp: number }>;
}
```

Each unique file path keeps the most recent `isWrite` flag. A read followed by a write is recorded as a write.

## Flush behavior

`flushPendingHeartbeats(projectFolder, force)`:

- Returns early if `projectFolder` is empty.
- If `force` is `false`, returns unless the rate limit window has reopened.
- Converts queued changes into `HeartbeatPayload` objects.
- Spawns `chronova-cli` for each payload.
- Clears the pending changes after spawning.

`PreToolUse` flushes opportunistically when the limit allows. `Stop` always forces a flush.

## chronova-cli invocation

`src/heartbeat.ts` locates the CLI in this order:

1. `process.env.CHRONOVA_CLI_PATH`
2. `~/.local/bin/chronova-cli`
3. `chronova-cli` (PATH lookup)

The command it builds is equivalent to:

```bash
chronova-cli \
  --entity <absolute-file-path> \
  --entity-type file \
  --project-folder <project-directory> \
  --plugin "antigravity/2.0 chronova-antigravity-plugin/<version>" \
  --category coding \
  [--write]
```

The plugin identifier uses the version from `package.json`.

## Fire-and-forget dispatch

`sendHeartbeat` spawns `chronova-cli` with `execFile` and immediately calls `child.unref()`. Errors and stderr are captured in the log but never block Antigravity. The process always updates `lastHeartbeatAt` when a heartbeat is dispatched, even if `chronova-cli` later fails.

## Environment variables

| Variable | Effect |
|----------|--------|
| `CHRONOVA_CLI_PATH` | Override the path to `chronova-cli`. |
| `CHRONOVA_STATE_DIR` | Override the directory used for project state files. |
| `CHRONOVA_ANTIGRAVITY_DEBUG` | Enable debug logging when set to `1`. |
| `CHRONOVA_PI_DEBUG` | Also enables debug logging when set to `1`. |
| `CHRONOVA_DEBUG` | Also enables debug logging when set to `1`. |

Debug logging can also be enabled with `debug = true` in `~/.chronova.cfg`.

## Related pages

- [Architecture overview](./index.md)
- [Hook lifecycle](./hook-lifecycle.md)
- [Activity tracking](./tracking.md)
