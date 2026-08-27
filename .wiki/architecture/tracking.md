---
type: reference
title: Activity tracking
description: How the plugin extracts, normalizes, filters, and classifies file activity from Antigravity tool calls.
tags: [tracking, paths, normalization, tool-calls, mcp]
---

# Activity tracking

The plugin's `src/tracker.ts` converts an incoming Antigravity tool call into an absolute file path and a read/write flag. If extraction fails, the path is invalid, the path points to a non-file URI, or the path is outside the active workspace, the tool call is ignored.

## Supported tool names

### Antigravity core tools

| Tool name | Path argument candidates | Tracked as |
|-----------|--------------------------|------------|
| `view_file` | `AbsolutePath`, `TargetFile`, `filePath`, `path` | read |
| `write_to_file` | `TargetFile`, `AbsolutePath`, `filePath`, `path` | write |
| `replace_file_content` | `TargetFile`, `AbsolutePath`, `filePath`, `path` | write |
| `multi_replace_file_content` | `TargetFile`, `AbsolutePath`, `filePath`, `path` | write |
| `read_resource` | `Uri`, `uri`, `path` | read |
| `call_mcp_tool` | `Arguments.AbsolutePath`, `Arguments.TargetFile`, `Arguments.filePath`, `Arguments.file_path`, `Arguments.path`, `Arguments.targetFile` | determined by MCP tool name |

### Generic tool fallback

For any other tool, the plugin scans the arguments in this order for a file path:

```text
AbsolutePath → TargetFile → filePath → file_path → targetFile → target_file → path → file → Uri → uri
```

The write flag is set if the tool name matches `/write|edit|create|replace|save|update|append|delete|insert/i`.

## Tool-call payload extraction

`extractToolCall` accepts multiple payload shapes:

- `payload.toolCall`
- `payload.preToolHookArgs.toolCall`
- `payload.toolHookArgs.toolCall`
- Legacy `tool_name` / `tool_input` (string or object)

## Path normalization

`resolvePath(baseFolder, rawPath)` performs the following transformations:

1. Trim whitespace.
2. Convert `file://` URIs to filesystem paths and URL-decode them.
3. Reject other URI schemes such as `artifact://`, `memory://`, `ssh://`, and `http://`.
4. Strip trailing line selectors (`:50`, `:50-56`, `:50+150`, `#L50-L60`).
5. Expand a leading `~` to the user's home directory.
6. Resolve relative paths against `baseFolder` or `process.cwd()`.
7. Return an absolute, normalized path.

## Workspace boundary check

When `workspacePaths` are present in the payload, `findMatchingWorkspace` verifies that the resolved file is inside one of the listed directories. Files outside the active workspace are skipped.

## Ignored paths

`isIgnoredPath` rejects internal/system directories so plugin, agent, and temporary files are not tracked:

- `.gemini/`
- `.system_generated/`
- `.chronova*` and `.chronova-antigravity-plugin/`
- `.cache/`
- `.omp/`
- `node_modules/`
- `.git/`
- System temp directories (`/tmp`, `/var/tmp`, `/dev/shm`, `/proc`, `/sys`, `/dev`)
- `brain/<uuid>/`
- `mcp/<name>/`

## Project folder resolution

`extractProjectFolder` uses, in order:

1. `workspacePaths[0]` (expanded and normalized).
2. `toolCall.args.Cwd`.
3. `process.cwd()`.

If a resolved file belongs to a different workspace than `workspacePaths[0]`, that matched workspace becomes the project folder for the heartbeat.

## Related pages

- [Architecture overview](./index.md)
- [Hook lifecycle](./hook-lifecycle.md)
- [Heartbeats & rate limiting](./heartbeats.md)
