## [1.0.7](https://github.com/nx-solutions-ug/antigravity-plugin/compare/v1.0.6...v1.0.7) (2026-09-12)


### Bug Fixes

* do not fail pack/publish when husky is unavailable ([434a789](https://github.com/nx-solutions-ug/antigravity-plugin/commit/434a7890ae183692a20bdcbf27f982fb127348e6))

## [1.0.6](https://github.com/nx-solutions-ug/antigravity-plugin/compare/v1.0.5...v1.0.6) (2026-09-12)


### Bug Fixes

* **ci:** quote command descriptions containing a colon ([a44e12c](https://github.com/nx-solutions-ug/antigravity-plugin/commit/a44e12c5c26a0b39be254bba37f268f135b1ccc3))

## [1.0.5](https://github.com/nx-solutions-ug/antigravity-plugin/compare/v1.0.4...v1.0.5) (2026-09-12)


### Bug Fixes

* **ci:** bind the head SHA with real jq, not gh api --jq ([9bd58d8](https://github.com/nx-solutions-ug/antigravity-plugin/commit/9bd58d82449c4977ee9a5a33b1751fada2a68044))

## [1.0.4](https://github.com/nx-solutions-ug/antigravity-plugin/compare/v1.0.3...v1.0.4) (2026-09-03)


### Bug Fixes

* isolate logger writes via CHRONOVA_LOG_FILE and stub in tests ([f59c4a3](https://github.com/nx-solutions-ug/antigravity-plugin/commit/f59c4a31800210afa75a99d389d8a76b5ee63362))

## [1.0.3](https://github.com/nx-solutions-ug/antigravity-plugin/compare/v1.0.2...v1.0.3) (2026-09-03)


### Bug Fixes

* address review nits (PostToolUsePayload type, explicit null checks, parse-failure debug log) ([4365bf0](https://github.com/nx-solutions-ug/antigravity-plugin/commit/4365bf0a8d8654263e26fec25b435b3a373fcbe5))

## [1.0.2](https://github.com/nx-solutions-ug/antigravity-plugin/compare/v1.0.1...v1.0.2) (2026-08-30)


### Bug Fixes

* address review — destroy stdin pipe on overflow, move MAX_STDIN_BYTES to constants, cumulative-chunks test ([18a9980](https://github.com/nx-solutions-ug/antigravity-plugin/commit/18a998091589d26e3a14e34e015d0b04b4f5950a))
* **security:** cap stdin input size to prevent memory exhaustion ([5947279](https://github.com/nx-solutions-ug/antigravity-plugin/commit/5947279ea6d286d674cbdc1d43ad6c7906ba87f4))

## [1.0.1](https://github.com/nx-solutions-ug/antigravity-plugin/compare/v1.0.0...v1.0.1) (2026-08-26)


### Bug Fixes

* **tracker:** filter out internal .gemini, brain, and MCP schema files ([1670fcf](https://github.com/nx-solutions-ug/antigravity-plugin/commit/1670fcf3084b8fb059b52e45aa66c6ff8fa9bfa1))

# 1.0.0 (2026-08-25)


### Features

* initial commit for chronova-antigravity-plugin ([302ef9e](https://github.com/nx-solutions-ug/antigravity-plugin/commit/302ef9e3e5bd27369ec9344bcfb4d12fd063142a))
