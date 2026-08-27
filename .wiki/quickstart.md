---
type: guide
title: Quickstart
description: Install, configure, and verify the Chronova Antigravity heartbeat plugin in minutes.
tags: [quickstart, install, setup, chronova, antigravity]
---

# Quickstart

Get the Chronova heartbeat plugin running in Google Antigravity and start seeing coding activity on your [Chronova](https://chronova.dev) dashboard.

## Prerequisites

1. **Google Antigravity** — Antigravity 2.0, Antigravity IDE, or the `agy` CLI.
2. **Chronova CLI** — `chronova-cli` installed at `~/.local/bin/chronova-cli` or available in `PATH`. See [`chronova-cli`](https://github.com/nx-solutions-ug/chronova-cli).
3. **Chronova API key** — configured in `~/.chronova.cfg` (the same file used by `chronova-cli`).

## Install the plugin

### Global installation (recommended)

```bash
bun add -g @chronova/antigravity-plugin
mkdir -p ~/.gemini/config/plugins
ln -sfn ~/.bun/install/global/node_modules/@chronova/antigravity-plugin \
  ~/.gemini/config/plugins/chronova-antigravity-plugin
```

### Install directly into Antigravity

```bash
mkdir -p ~/.gemini/config/plugins/chronova-antigravity-plugin
cd ~/.gemini/config/plugins/chronova-antigravity-plugin
bun add @chronova/antigravity-plugin
```

Antigravity discovers any plugin located in `~/.gemini/config/plugins/`.

### Project-local installation

```bash
mkdir -p .agents/plugins/chronova-antigravity-plugin
cd .agents/plugins/chronova-antigravity-plugin
bun add @chronova/antigravity-plugin
```

Or register it via `.agents/plugins.json`:

```json
{
  "entries": [
    { "path": "node_modules/@chronova/antigravity-plugin" }
  ]
}
```

## Verify the setup

1. Confirm the plugin manifest is present:

```bash
cat ~/.gemini/config/plugins/chronova-antigravity-plugin/plugin.json
```

2. Confirm the hook manifest points to the built entrypoint:

```bash
cat ~/.gemini/config/plugins/chronova-antigravity-plugin/hooks.json
```

3. Confirm `dist/index.js` exists. If it does not, rebuild from the source checkout:

```bash
cd ~/.gemini/config/plugins/chronova-antigravity-plugin
bun install
bun run build
```

## Enable debug logging

Set the environment variable or edit `~/.chronova.cfg`:

```bash
export CHRONOVA_ANTIGRAVITY_DEBUG=1
```

or in `~/.chronova.cfg`:

```ini
debug = true
```

Logs are appended to `~/.chronova-antigravity-plugin/plugin.log`.

## Confirm heartbeats

Trigger a file action in Antigravity (for example, ask the agent to read or edit a file in a workspace). Then check the log:

```bash
tail -f ~/.chronova-antigravity-plugin/plugin.log
```

You should see entries such as:

```text
[...] [INFO] Session terminating in Stop hook, force-flushing heartbeats {...}
[...] [DEBUG] Spawning chronova-cli {...}
```

If `chronova-cli` is configured correctly, the activity appears on your Chronova dashboard within moments.

## Next steps

- Learn how the plugin integrates with Antigravity in [Architecture overview](./architecture/index.md).
- Understand [which tools are tracked and how paths are normalized](./architecture/tracking.md).
- Read about [rate limiting and flushing](./architecture/heartbeats.md).
