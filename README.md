[![npm version](https://img.shields.io/npm/v/@chronova/antigravity-plugin.svg)](https://www.npmjs.com/package/@chronova/antigravity-plugin)
[![Tests](https://github.com/nx-solutions-ug/antigravity-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/nx-solutions-ug/antigravity-plugin/actions/workflows/test.yml)
[![Release](https://github.com/nx-solutions-ug/antigravity-plugin/actions/workflows/release.yml/badge.svg)](https://github.com/nx-solutions-ug/antigravity-plugin/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# chronova-antigravity-plugin

Chronova heartbeat tracking plugin for [Google Antigravity](https://antigravity.google) (Antigravity 2.0, Antigravity IDE, and Antigravity CLI).

Automatically sends coding activity heartbeats to your [Chronova](https://chronova.dev) dashboard via `chronova-cli` — a high-performance, drop-in replacement for `wakatime-cli`.

## Features

- **Automatic tracking** — Intercepts Antigravity tool calls (`view_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `read_resource`, MCP tools)
- **Zero latency overhead** — Responds to lifecycle hooks immediately (`decision: "allow"`) while spawning heartbeats detached (`unref()`) in the background
- **Rate limiting** — 1 heartbeat per minute per project workspace, persisted across CLI hook executions in `~/.chronova-antigravity-plugin/state/`
- **Force flush on session completion** — All queued file changes are force-flushed on session end via the `Stop` lifecycle hook
- **Path & URI safety** — Handles home directory expansion (`~`), strips line selectors (`:50-56`), normalizes `file://` URLs, and rejects non-file URIs (`artifact://`, `memory://`, `ssh://`)

## Prerequisites

- [Google Antigravity](https://antigravity.google) (Antigravity 2.0 / Antigravity IDE / `agy` CLI)
- [chronova-cli](https://github.com/nx-solutions-ug/chronova-cli) installed at `~/.local/bin/chronova-cli` (or in `PATH`)
- A Chronova account with API key configured in `~/.chronova.cfg`

## Installation

### Project Workspace (Recommended for Repositories)

Place the plugin in your project's `.agents/plugins/` directory:

```bash
mkdir -p .agents/plugins/chronova-antigravity-plugin
# Clone or copy the plugin into .agents/plugins/chronova-antigravity-plugin
```

Or declare it in your `.agents/plugins.json`:

```json
{
  "entries": [
    { "path": "path/to/chronova-antigravity-plugin" }
  ]
}
```

### Global Installation (User-wide)

Install the plugin into your global Antigravity configuration:

```bash
mkdir -p ~/.gemini/config/plugins/chronova-antigravity-plugin
# Clone or link into ~/.gemini/config/plugins/chronova-antigravity-plugin
```

Antigravity automatically discovers and activates plugins in `~/.gemini/config/plugins/`.

## Configuration

The plugin reads your API key from `~/.chronova.cfg` automatically (the same configuration file used by `chronova-cli` and `wakatime-cli`). No separate plugin configuration is needed.

### Debug Logging

Set `CHRONOVA_ANTIGRAVITY_DEBUG=1` in your environment or add `debug = true` to `~/.chronova.cfg` to enable verbose logging to `~/.chronova-antigravity-plugin/plugin.log`.

## How It Works

1. Antigravity discovers the plugin via `plugin.json` and registers lifecycle hooks from `hooks.json`.
2. On `PreToolUse` events:
   - Tool calls are inspected to identify file operations:
     - `view_file` / `read_resource` → tracked as view / read
     - `write_to_file` / `replace_file_content` / `multi_replace_file_content` → tracked as write (`--write`)
   - The hook responds immediately with `{"decision": "allow"}` so the agent loop is never delayed.
   - If the per-project rate limit allows (60s cooldown), the heartbeat is dispatched to `chronova-cli`. If rate-limited, the change is queued in persistent state.
3. On `Stop` events (agent turn / session completion):
   - Any pending queued changes are force-flushed to `chronova-cli`.

### chronova-cli Arguments

```bash
chronova-cli \
  --entity <absolute-file-path> \
  --entity-type file \
  --project-folder <project-directory> \
  --plugin "antigravity/2.0 chronova-antigravity-plugin/<version>" \
  --category coding \
  [--write]
```

## Project Structure

```
├── plugin.json       # Antigravity plugin manifest
├── hooks.json        # Antigravity lifecycle hook definitions
├── package.json      # NPM package configuration
├── tsconfig.json     # TypeScript build configuration
├── eslint.config.js  # ESLint flat configuration
├── src/
│   ├── index.ts      # Hook CLI entrypoint & event routing
│   ├── tracker.ts    # ToolCall extraction, URI & path sanitization
│   ├── heartbeat.ts  # chronova-cli invocation & argument builder
│   ├── state.ts      # Persistent file-based project state & queue
│   ├── logger.ts     # Safe debug logging to ~/.chronova-antigravity-plugin/plugin.log
│   └── types.ts      # TypeScript interfaces for hook contracts
└── tests/            # Vitest unit & integration test suite
```

## Development

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Type check
npm run type-check

# Lint code
npm run lint

# Build production bundle
npm run build
```

## License

MIT © NX Solutions UG (haftungsbeschränkt)
