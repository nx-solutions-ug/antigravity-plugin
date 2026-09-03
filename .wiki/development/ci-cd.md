---
type: reference
title: CI/CD workflows
description: GitHub Actions workflows that test, release, review, and publish the wiki.
tags: [ ci, cd, github-actions, workflows, release, omp ]
last_updated: "2026-09-03T14:16:04.146Z"
updated_by: "wiki-agent"
---

# CI/CD workflows

The repository runs entirely through GitHub Actions defined in `.github/workflows/`. All production workflows authenticate with a GitHub App token (`secrets.APP_CLIENT_ID` / `secrets.APP_PRIVATE_KEY`) and, where needed, `secrets.OLLAMA_API_KEY` for the OMP agent.

## Test and build

### `test.yml`

Runs on every push/PR to `main`, `develop`, `feat/*`, or `fix/*`.

| Step | Command |
|------|---------|
| Type check | `bun run type-check` |
| Lint | `bun run lint` |
| Unit tests | `bun run test` |
| Build | `bun run build` |

Node 25 and Bun are installed; the job has a 10-minute timeout.

## Release

### `release.yml`

Triggers on every push to `main`.

1. Runs the same test/build gate as `test.yml`.
2. Runs `semantic-release` with `NPM_TOKEN` and an app-token `GITHUB_TOKEN`.
3. After a new tag is created, overwrites the release notes with the full commit list since the previous tag (truncated to ~120 KB if necessary).

Releases are published to npm as `@chronova/antigravity-plugin`.

## OMP agent workflows

The repository uses the **OMP agent** (`omp`) with model `ollama-cloud/glm-5.3-flash:max` for triage, labelling, review, and issue fixing. Each workflow installs OMP with the native bash installer (`curl -fsSL https://omp.sh/install | sh`), then authenticates the `ollama-cloud` provider by inserting `secrets.OLLAMA_API_KEY` into the OMP agent database and running `omp models refresh ollama-cloud`. Agent output is streamed through `.omp/stream-log.py`.

### `omp.yml`

Triggered by comments containing `/omp` or `/oc` on issues or pull request review comments. It installs the OMP agent, authenticates to `ollama-cloud`, and runs a command file from `.omp/commands/<command>.md` if one matches the prompt, or a freeform prompt otherwise. For PR comments it appends commit/push instructions from `.omp/commands/_pr-commit-push.md`.

The workflow installs and pins the `agynio/gh-pr-review` GitHub CLI extension to **v1.6.2**.

### `omp-ci.yml`

Runs automatically on issue and PR lifecycle events:

- **`triage-issue`** — opened issues; reacts with 👀, runs `triage-issue` command, then dispatches `omp-fix-issue.yml` via repository dispatch.
- **`label-pr`** — opened/synchronize/ready_for_review PRs; skips if both a type label and a priority label are already applied, otherwise runs the `label-pr` command.
- **`review-pr`** — opened/synchronize/ready_for_review PRs or manual workflow dispatch; skips re-review when the latest synchronized commit is from an agent or bot, then runs the `review-pr` command through the pinned `gh-pr-review` extension.

The `review-pr` job also uses the pinned `agynio/gh-pr-review` extension at **v1.6.2**.

### `omp-fix-issue.yml`

Triggered by repository dispatch (`issue-triaged`) or manual workflow dispatch with an issue number. It runs the `fix-issue` command against the issue and commits the result back to a new branch.

## Repository management

### `auto-manage.yml`

- Adds the `needs-triage` label to new/reopened issues.
- Auto-assigns new issues and PRs to `niklasschaeffer`.

## Wiki

### `update-wiki.yml`

Runs on push to `main`, daily at 08:00 UTC, or manually. It installs the `@chronova/wiki-agent` CLI and runs `wiki --update` with the model from `vars.WIKI_MODEL` (default **`kimi-k3`**) against the configured provider, flattens the `.wiki/` output, pushes to the repository's Wiki Git repo, and opens a `wiki/staging-<timestamp>` PR for any `.wiki` content changes.

## Common workflow details

- **Runners:** `ubuntu-latest`
- **Node:** 25
- **Package manager:** Bun
- **Authentication:** GitHub App token via `actions/create-github-app-token@v3`
- **Pinning:** `gh extension install agynio/gh-pr-review --pin v1.6.2 --force` is used in any workflow that posts PR reviews through `gh-pr-review`.

## Related pages

- [Development index](./index.md)
- [Architecture overview](../architecture/index.md)
- [Quickstart](../quickstart.md)
