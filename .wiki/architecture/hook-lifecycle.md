---
type: reference
title: Hook lifecycle
description: How chronova-antigravity-plugin handles Antigravity PreToolUse,
  Stop, and PostToolUse hooks.
tags: [ hooks, lifecycle, PreToolUse, Stop, PostToolUse, antigravity ]
last_updated: "2026-09-03T22:03:05.252Z"
updated_by: wiki-agent
---

# Hook lifecycle

The plugin registers lifecycle hooks in [`hooks.json`](./../../hooks.json). The only two currently active hooks are `PreToolUse` and `Stop`. A `PostToolUse` handler exists in `src/index.ts` but is not registered in the manifest.

## Hook registration

```json
{
  "chronova-heartbeat": {
    "enabled": true,
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node dist/index.js --hook PreToolUse",
            "timeout": 15
          }
        ]
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "node dist/index.js --hook Stop",
        "timeout": 15
      }
    ]
  }
}
```

The `matcher: "*"` on `PreToolUse` means the hook runs before every tool invocation.

## Payload parsing

All three handlers parse the stdin payload through `safeParseJson<T>` in `src/index.ts`. It trims the input, returns `null` for empty or whitespace-only input, and catches `JSON.parse` failures (logging them at debug level) instead of throwing. Each handler parses its own payload type: `PreToolUsePayload`, `StopPayload`, or `PostToolUsePayload`. A handler with an empty or malformed payload simply skips work and returns its benign response.

## PreToolUse

1. Read the JSON payload from stdin.
2. Extract the active `toolCall` and `workspacePaths`.
3. Determine the project folder from `workspacePaths[0]`, the tool call `Cwd` argument, or `process.cwd()`.
4. Use [`tracker.ts`](./tracking.md) to resolve and sanitize the file path.
5. If the path is valid and belongs to a workspace, record it in persistent state.
6. If the per-project [rate limit](./heartbeats.md) allows, flush the pending heartbeat; otherwise queue it.
7. Return `{"decision": "allow"}` immediately.

All errors are swallowed and logged; the agent always receives `allow`.

## Stop

1. Read the JSON payload from stdin.
2. Extract `workspacePaths[0]` or fall back to `process.cwd()`.
3. Call `flushPendingHeartbeats(projectFolder, true)` to bypass the rate limit.
4. Return `{}`.

This ensures the final batch of edits is sent to Chronova even if the rate limit would otherwise suppress them.

## PostToolUse

`src/index.ts` exports `handlePostToolUse`, but it is **not registered** in `hooks.json`. It parses a `PostToolUsePayload` (which adds an `error` field for failed tool calls) and performs an opportunistic flush if the rate limit window has reopened after a tool call. It can be enabled by adding a `PostToolUse` entry to `hooks.json` without code changes.

## Hook return values

| Hook | Return value | Meaning |
|------|--------------|---------|
| `PreToolUse` | `{"decision": "allow"}` | Always allow the tool to proceed. |
| `Stop` | `{}` | No action required from Antigravity. |
| `PostToolUse` | `{}` | No action required from Antigravity. |

## Related pages

- [Architecture overview](./index.md)
- [Activity tracking](./tracking.md)
- [Heartbeats & rate limiting](./heartbeats.md)
