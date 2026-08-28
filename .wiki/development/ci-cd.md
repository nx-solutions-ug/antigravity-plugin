---
type: reference
title: CI/CD workflows
description: GitHub Actions workflows for testing, releasing, running the OMP
  agent, and keeping the wiki up to date.
tags: [ ci-cd, github-actions, workflows, release, omp, wiki ]
last_updated: "2026-08-28T09:10:54.079Z"
updated_by: "wiki-agent"
---

# CI/CD workflows

All workflows live in `.github/workflows/` and are defined as YAML. They use Bun for dependency management and Node 25 for compatibility checks, plus a GitHub App token (`secrets.APP_CLIENT_ID` / `secrets.APP_PRIVATE_KEY`) wherever repository write access is required.

## Summary

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [`test.yml`](./../../.github/workflows/test.yml) | push/PR to `main`, `develop`, `feat/*`, `fix/*` | Type-check, lint, test, and build gate. |
| [`release.yml`](./../../.github/workflows/release.yml) | push to `main` | Test gate → `semantic-release` → replace release notes with full commit list. |
| [`update-wiki.yml`](./../../.github/workflows/update-wiki.yml) | push to `main`, daily cron `0 8 * * *`, manual | Run `wiki --update`, publish to the GitHub Wiki, and open a staging PR. |
| [`omp.yml`](./../../.github/workflows/omp.yml) | issue/PR review comment containing `/omp` | Run the OMP agent on demand with the `ollama-cloud/minimax-m3` model. |
| [`omp-ci.yml`](./../../.github/workflows/omp-ci.yml) | issues/PR events, manual | Triage issues, label PRs, and review PRs automatically. |
| [`omp-fix-issue.yml`](./../../.github/workflows/omp-fix-issue.yml) | `issue-triaged` dispatch, manual | Have the OMP agent generate a fix for a triaged issue. |
| [`auto-manage.yml`](./../../.github/workflows/auto-manage.yml) | new/reopened issues, new PRs | Add `needs-triage` label and auto-assign to `niklasschaeffer`. |

## `test.yml` — quality gate

Runs on every push or PR targeting `main`, `develop`, or feature/fix branches.

```yaml
bun install
bun run type-check
bun run lint
bun run test
bun run build
```

The job is limited to 10 minutes and uses a `group` concurrency key to cancel stale runs on the same ref.

## `release.yml` — semantic release

1. Reuses the test gate.
2. Generates a GitHub App token for publishing.
3. Runs `semantic-release` with `NPM_TOKEN` and the app token as `GITHUB_TOKEN`.
4. After release, replaces the generated release notes with the full commit list from `PREVIOUS_TAG..LATEST_TAG` using `gh release edit`. If the notes exceed 120,000 bytes, they are truncated and a fallback link to `CHANGELOG.md` is appended.

The release job requires:

- `contents: write`
- `issues: write`
- `pull-requests: write`
- `id-token: write`

## `update-wiki.yml` — wiki automation

The workflow that keeps this wiki current:

1. Generates an app token for checkout/PR/wiki push.
2. Checks out the repository.
3. Installs the `@chronova/wiki-agent` package globally.
4. Runs `wiki --update --print --verbose --wiki` with provider/model env vars.
5. Detects content changes under `.wiki/`.
6. If the wiki is initialized, flattens `.wiki/` with `wiki-flatten`, pushes the flattened output to the repo's `.wiki.git` remote.
7. Opens a staging PR from `wiki/staging-<timestamp>` containing the `.wiki` changes, regardless of whether the wiki push succeeded.

Secrets used: `APP_CLIENT_ID`, `APP_PRIVATE_KEY`, and optionally `WIKI_PUSH_TOKEN` with repo scope.

## `omp.yml` — on-demand agent

Triggered by an issue or PR review comment starting with `/omp` (or containing ` /omp`). It:

- Skips comments from `[bot]` users.
- Checks out the repo with full history.
- Installs the OMP agent and the `gh-pr-review` extension.
- Resolves `.omp/commands/<command>.md` if the prompt starts with a known command, otherwise appends commit/push instructions from `.omp/commands/_pr-commit-push.md` for PR comments.
- Runs `omp -p --model ollama-cloud/minimax-m3 --mode json`.

Permissions include `id-token: write`, `contents: write`, `pull-requests: write`, and `issues: write`.

## `omp-ci.yml` — automated triage, labeling, and review

This workflow runs three conditional jobs:

- **`triage-issue`** — on new issues or manual dispatch with `issue_number`. Reacts with 👀, runs the `triage-issue` command, and dispatches `omp-fix-issue.yml` via repository dispatch.
- **`label-pr`** — on new/synchronized/ready-for-review PRs. Skips PRs that already have both a type and a priority label, then runs the `label-pr` command.
- **`review-pr`** — on PR open/synchronize or manual dispatch with `pr_number`. It skips re-review for `synchronize` events unless the latest commit is from a non-agent author, then installs `gh-pr-review` and runs the `review-pr` command. The `review-pr` job needs `contents: write` so it can resolve review threads.

All three jobs use the `ollama-cloud/minimax-m3` model and authenticate to the OMP agent with `secrets.OLLAMA_API_KEY`. The `review-pr` job grants `contents: write` so the agent can resolve review threads.

## `omp-fix-issue.yml` — automated fix

Runs after `omp-ci.yml` dispatches an `issue-triaged` event, or manually with an `issue_number`. It checks out the repo, runs the `fix-issue` command against the issue, and pushes any resulting changes.

## `auto-manage.yml` — issue and PR housekeeping

- On new/reopened issues, adds the `needs-triage` label.
- On new issues and PRs, assigns `niklasschaeffer`.

## Authentication

Workflows that need to write to the repo or use `gh` with elevated rights create a token with `actions/create-github-app-token@v3`. The app must have permissions for contents, pull requests, and issues (and, for `omp-ci.yml` review jobs, write access to resolve review threads).

## Related pages

- [Development index](./index.md)
- [Architecture overview](../architecture/index.md)
- [Testing and QA](../architecture/heartbeats.md) (environment setup is also covered in the [Quickstart](../quickstart.md))
