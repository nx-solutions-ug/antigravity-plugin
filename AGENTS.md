# Repository Guidelines

<!-- wiki-agent -->
## Wiki Agent

This repository is managed by [wiki-agent](https://github.com/nx-solutions-ug/wiki-agent).
Documentation is generated under `.wiki/` and kept in sync via `wiki --update`.
Do not hand-edit files under `.wiki/` — regenerate them with `wiki --update` instead.

```yaml
version: 1.17.1
wiki-path: .wiki/
initialized: 2026-08-27T05:49:06.970Z
```

## Project Overview

`@chronova/antigravity-plugin` is a heartbeat-tracking plugin for **Google Antigravity** (Gemini 2.0 IDE/CLI). Antigravity discovers the plugin via `plugin.json` and registers lifecycle hooks from `hooks.json`. On each tool call (`PreToolUse`) and at session end (`Stop`), the plugin reads a JSON payload from stdin, extracts the touched file path, classifies it as read or write, persists pending changes to disk (rate-limited to one heartbeat per 60s per project), and dispatches them to `chronova-cli` as a detached, fire-and-forget child process. The plugin is deliberately **fail-soft**: every handler wraps work in try/catch and always returns a benign `{"decision":"allow"}` / `{}` so it can never block the IDE.

## Architecture & Data Flow

```
Antigravity tool call / session stop
        │
        ▼
 hooks.json  ──►  node dist/index.js --hook <PreToolUse|Stop>
        │
        ▼
 src/index.ts          readStdin() ─► parseHookArg() ─► handleHook()
        │
        ▼
 src/tracker.ts        extractProjectFolder ─► extractToolCall ─► parseToolCall
                       resolvePath (~expand, file://, strip :line/#L, reject URIs)
                       classify read|write   ·   isIgnoredPath   ·   findMatchingWorkspace
        │
        ▼
 src/state.ts          queuePendingChange (entity-keyed: dedupes same file)
                       shouldSendHeartbeat (RATE_LIMIT_SECONDS = 60)
        │
        ▼  if rate-limit allows (or Stop force-flush)
        │
 src/heartbeat.ts      flushPendingHeartbeats ─► getPendingHeartbeats
                       buildHeartbeatArgs ─► execFile(chronova-cli, args, cb)
                       child.unref() (fire-and-forget) ─► updateLastHeartbeat
        │
        ▼
 chronova-cli  ──►  Chronova dashboard
```

**Key design points:**
- **Stateless per invocation.** Every hook invocation is a fresh `node` process; all state persists to per-project JSON files at `~/.chronova-antigravity-plugin/state/<sha256(folder).slice(0,16)>.json` (`state.ts:15-18`).
- **Entity-keyed pending queue.** `pendingChanges` is keyed by entity path, so repeated edits to the same file collapse into one heartbeat (`state.ts:67-81`).
- **Rate limiting.** 1 heartbeat / 60s / project (`RATE_LIMIT_SECONDS`, `state.ts:9`). During cooldown, changes queue on disk. `Stop` force-flushes via `flushPendingHeartbeats(folder, true)` (`index.ts:82-95`).
- **chronova-cli invocation** (exact shape, `heartbeat.ts:67-96`):
  ```
  execFile(cliPath, [
    "--entity", <resolvedAbsPath>,
    "--entity-type", "file",
    "--project-folder", <projectFolder>,
    "--plugin", "antigravity/2.0 chronova-antigravity-plugin/<version>",
    "--category", "coding",
    ( "--write" if isWrite )
  ], cb)   // + child.unref()
  ```
  `cliPath` resolution: `CHRONOVA_CLI_PATH` env → `~/.local/bin/chronova-cli` → `chronova-cli` on PATH (`heartbeat.ts:16-23`).
- **PostToolUse** handler exists in `src/index.ts:97-113` (opportunistic flush) but is **not registered** in `hooks.json`.

## Key Directories

| Path | Purpose |
|------|---------|
| `src/` | Plugin source — 6 modules (index, tracker, heartbeat, state, logger, types). Compiled to `dist/` via `tsc`. |
| `tests/` | Vitest unit tests — one `*.test.ts` per source module, colocated here (not in `src/`). |
| `dist/` | Compiled output (`tsc`, `outDir: dist`). Published artifact. Git-ignored. |
| `.github/workflows/` | 8 CI workflows (test, release, omp, omp-ci, omp-code-review, omp-fix-issue, auto-manage, update-wiki). |
| `.wiki/` | wiki-agent generated docs (architecture, quickstart). Regenerate via `wiki --update`. Do not hand-edit. |
| `public/` | Static assets (e.g. README banner). |
| `plugin.json` | Antigravity plugin manifest (`name` only). |
| `hooks.json` | Antigravity hook registration — `PreToolUse` (matcher `*`) and `Stop`, both `node dist/index.js --hook <Type>` with 15s timeout. |

## Development Commands

```bash
bun install                # install dependencies (uses bun.lock)
bun run build              # tsc (prebuild cleans dist/ first)
bun run type-check         # tsc --noEmit
bun run lint               # eslint .
bun run test               # vitest run (single pass)
bun run test:watch         # vitest (watch mode)
bun run pack               # bun pm pack (local tarball)
bun run clean              # rm -rf dist
bun run semantic-release   # semantic-release (CI only)
```

CI runs the full gate: `type-check` → `lint` → `test` → `build` (`.github/workflows/test.yml`).

## Code Conventions & Common Patterns

- **ESM only.** `"type": "module"`; all relative imports use explicit `.js` extension (`import { x } from "./x.js"`), even in source (bundler resolution). Node builtins: `import * as fs from "node:fs"`.
- **Named exports only.** No default exports anywhere. camelCase functions; UPPER_SNAKE_CASE constants (`PLUGIN_VERSION`, `RATE_LIMIT_SECONDS`, `IGNORED_PATH_PATTERNS`, `DEFAULT_CLI_PATH`). Types are `interface`s in `src/types.ts`.
- **Fail-soft error handling.** Every hook handler wraps in try/catch and returns a benign decision (`index.ts:47,83,98`). `sendHeartbeat` catches spawn errors (`heartbeat.ts:78-84`). State read/write catch and log (`state.ts:22-43`). `logger.write` swallows all failures (`logger.ts:30-36`). Errors are logged, never rethrown. Bootstrap catch writes `{"decision":"allow"}` and exits 0 (`index.ts:132-140`).
- **Async.** Only `readStdin` (Promise over stdin events) and `main` are async. All else is synchronous — `fs.*Sync` calls, `execFile` with callback. No timers, debounce, or file watchers. Rate-limit is the only throttle (60s gate).
- **Direct-invocation guard.** `main()` only auto-runs when `process.env.NODE_ENV !== "test"` **and** `process.argv[1]` ends with `index.js`/`index.ts` (`index.ts:133-139`). This is what lets tests import and call handlers directly without triggering the CLI bootstrap. Vitest sets `NODE_ENV=test` automatically.
- **State & log directories.** All plugin data lives under `~/.chronova-antigravity-plugin/`: `state/<sha256(folder).slice(0,16)>.json` (per-project pending changes + last heartbeat timestamp) and `plugin.log` (file logger). `CHRONOVA_STATE_DIR` overrides the state dir root.
- **Path handling** (`tracker.ts`): expands `~`, decodes `file://`, strips `:line`/`#L` selectors, rejects non-file URI schemes (`artifact://`, `memory://`, `ssh://`). Enforces workspace boundary via `findMatchingWorkspace`. Ignores internal paths matching `.gemini`, `.chronova`, `.omp`, `node_modules`, `.git`, `/tmp`, `/proc`, `brain/`, `mcp/`, etc. (`IGNORED_PATH_PATTERNS`, `tracker.ts:124-137`).
- **Tool name → read/write classification** (`parseToolCall`, `tracker.ts:167-215`): `view_file`/`read_resource` = read; `write_to_file`/`replace_file_content`/`multi_replace_file_content` = write; `call_mcp_tool` inspects inner `ToolName` for write verbs; generic fallback via regex.
- **Strict TypeScript.** `strict: true`, target ES2022, `moduleResolution: bundler`, no declaration files / source maps. `@typescript-eslint/no-unused-vars` errors with `^_` ignore pattern for args/vars.
- **ESLint flat config** (`eslint.config.js`): `@eslint/js` + `typescript-eslint` recommended. Allowed globals: `process`, `console`, `fetch`, `Buffer`, `setTimeout`. Ignores `dist/`, `node_modules/`, `*.config.js`, `*.config.mjs`, `.worktrees/`.

## Important Files

| File | Role |
|------|------|
| `src/index.ts` | Entrypoint + hook router. `readStdin`, `handleHook`, `handlePreToolUse`, `handleStop`, `handlePostToolUse`, `main`. |
| `src/tracker.ts` | Path/tool-call parsing. `parseToolCall`, `resolvePath`, `extractToolCall`, `extractProjectFolder`, `isIgnoredPath`, `findMatchingWorkspace`. |
| `src/heartbeat.ts` | chronova-cli integration. `getCliPath`, `buildHeartbeatArgs`, `sendHeartbeat` (execFile + unref), `flushPendingHeartbeats`. |
| `src/state.ts` | Persistent per-project state. `readProjectState`, `writeProjectState`, `shouldSendHeartbeat`, `queuePendingChange`, `getPendingHeartbeats`, `clearPendingChanges`. |
| `src/logger.ts` | File logger → `~/.chronova-antigravity-plugin/plugin.log`. |
| `src/types.ts` | Type-only: `ToolCall`, `PreToolUsePayload`, `PostToolUsePayload`, `StopPayload`, `HeartbeatPayload`, `ProjectState`. |
| `hooks.json` | Antigravity hook registration (`PreToolUse` matcher `*`, `Stop`). |
| `plugin.json` | Antigravity plugin manifest. |
| `package.json` | Manifest, scripts, `packageManager: bun@1.3.14`, `engines: node>=20`. |
| `.releaserc.json` | semantic-release config (main/beta/alpha branches, npm + git + github plugins). |

## Runtime/Tooling Preferences

- **Package manager: Bun** (`packageManager: bun@1.3.14`). Use `bun install` (not `npm ci` / `npm install`).
- **Node >= 20** required (`engines`). CI uses Bun + Node 25.
- **Build: `tsc`** (no bundler). `prebuild` cleans `dist/`; `prepublishOnly` builds.
- **Publishing:** `semantic-release` publishes to npm (`@chronova/antigravity-plugin`, public access). Published files allowlist: `dist/`, `plugin.json`, `hooks.json`, `README.md`, `LICENSE`.
- **Renovate:** `config:recommended`, automerge (squash) minor + patch.
- **Commit conventions:** Conventional Commits (`feat:`, `fix:`, `chore:`, etc.). `fix:` triggers patch release. Release commits: `chore(release): <version> [skip ci]`.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHRONOVA_CLI_PATH` | `~/.local/bin/chronova-cli` (or PATH) | Path to `chronova-cli` binary. Set to `"true"` in tests to stub with no-op binary. |
| `CHRONOVA_STATE_DIR` | `~/.chronova-antigravity-plugin/state` | Per-project state directory. Set to `os.tmpdir()` path in tests. |
| `CHRONOVA_ANTIGRAVITY_DEBUG` | — | Enable debug logging (any truthy value). |
| `CHRONOVA_PI_DEBUG` | — | Enable debug logging (any truthy value). |
| `CHRONOVA_DEBUG` | — | Enable debug logging (any truthy value). |
| `~/.chronova.cfg` `debug=true` | — | Enable debug logging via config file. |

Log file: `~/.chronova-antigravity-plugin/plugin.log`.

## Testing & QA

- **Framework:** Vitest `^4.1.6`. No `vitest.config.*` — runs on defaults, auto-discovers `tests/*.test.ts`.
- **Layout:** `tests/<module>.test.ts` mirrors `src/<module>.ts` 1:1. Imports use `.js` extension (`../src/heartbeat.js`).
- **Structure:** `describe`/`it`/`expect` from `vitest`. Nested `describe` per function. `beforeEach`/`afterEach` only where state/env setup needed (`state.test.ts`, `index.test.ts`).
- **Direct-invocation guard:** Tests import handlers from `src/index.js` without triggering `main()` because the bootstrap guard checks `process.env.NODE_ENV !== "test"` (`index.ts:133-139`), which Vitest sets automatically.
- **Mocking patterns** (no `vi.mock`/`vi.fn`):
  - **CLI binary:** `process.env.CHRONOVA_CLI_PATH = "true"` → `execFile` spawns the no-op `/usr/bin/true` (`index.test.ts:20`).
  - **State/filesystem:** `process.env.CHRONOVA_STATE_DIR = os.tmpdir()/chronova-*-<Date.now()>`, created in `beforeEach`, `rmSync`'d in `afterEach` (`state.test.ts:14-25`).
  - **Time:** Directly mutate persisted state file's `lastHeartbeatAt` to `now - (60+5)s` → `writeFileSync` back (`state.test.ts:44-47`). No `vi.useFakeTimers`.
  - **Fixtures:** Inline JSON payloads per test; no shared fixture files.
- **Coverage:** Strong on pure functions (`tracker.ts`, `heartbeat.ts` args, `state.ts` transitions). Thinner on hook handlers (`index.ts`) — only happy-path JSON responses tested; no error-path, rate-limited-queue, or Stop force-flush assertions. `sendHeartbeat`/`flushPendingHeartbeats` execFile spawn path is only exercised indirectly via `CHRONOVA_CLI_PATH=true`.
- **Adding a test:** Create `tests/<module>.test.ts`, import from `../src/<module>.js`, import `{ describe, it, expect }` (plus `beforeEach`/`afterEach` if state/env needed), use the env-var patterns above for isolation, run `bun run test`. No config file to touch — vitest auto-discovers.

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `test.yml` | push (main/develop/feat/\*/fix/\*), PR | type-check → lint → test → build |
| `release.yml` | push to main | test gate → semantic-release (npm + git + github); then `gh release edit` to replace notes with full commit list |
| `omp.yml` | issue_comment, pull_request_review_comment | `/omp` agent command → runs OMP agent (model `ollama-cloud/glm-5.3-flash:max`) |
| `omp-ci.yml` | issues/PRs events | triage-issue, label-pr |
| `omp-code-review.yml` | PR opened/synchronize/ready_for_review/review_requested, review comments, manual dispatch | dependency-review (renovate/dependabot PRs), code-review (via `gh-pr-review` extension) |
| `omp-fix-issue.yml` | repository_dispatch (issue-triaged), workflow_dispatch | OMP agent fixes a triaged issue |
| `auto-manage.yml` | issues/PRs opened/reopened | `needs-triage` label + auto-assign to `niklasschaeffer` |
| `update-wiki.yml` | push main, daily cron 08:00, workflow_dispatch | `wiki --update` → flatten + publish to repo wiki, open staging PR |

All OMP agent workflows authenticate via a GitHub App token + `OLLAMA_API_KEY` and use model `ollama-cloud/glm-5.3-flash:max`.

## Contributing

Vouching-based contribution model (see `CONTRIBUTING.md`). PRs from vouched contributors are auto-allowed; bots auto-allowed. Maintainers use `!vouch`/`!denounce`/`!unvouch` commands. Conventional Commits required for semantic-release.