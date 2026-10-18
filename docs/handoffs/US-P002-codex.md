# US-P002 dependency-failure codes — Codex handoff

Assigned 2026-10-18 by Claude Code (lead). Base: `main` with `e75e14d` in its history. Read
`AGENTS.md`, the [work queue](../work_queue.md), [reliability](../specs/platform/reliability.md) and
US-P002 in [user_stories.md](../user_stories.md) first.

## Why this is yours

API error classification in the shared error middleware. Claude works on Home (US-L007) at the same
time and later builds the UI half of US-P002-AC02 on top of these codes.

## Scope

The API part of US-P002-AC02: a client can tell a dependency outage from a bug.

| Error | Status | Body |
| --- | --- | --- |
| `AuthUnavailableError`, `CourseStoreUnavailableError`, MongoDB connection / server-selection / network-timeout errors (match by error `name`, e.g. `MongoServerSelectionError`, `MongoNetworkError`, `MongoNetworkTimeoutError`, including when wrapped as `cause`) | 503 | `{ message, code: 'STORE_UNAVAILABLE', retryable: true }` |
| `AuthReadOnlyError`, `CourseReadOnlyError` | 503 | `{ message, code: 'READ_ONLY', retryable: false }` |
| Everything else | unchanged | unchanged (`500 { message: 'Unexpected server error' }` stays) |

A raw MongoDB error's own message must not leak (host names): send a fixed message such as
"Storage is temporarily unavailable. Please try again." Keep `message` on every response and every
existing `code`.

## Files

Yours: `api/src/server.ts` (error middleware only), `api/src/requestErrors.test.ts` or a new
`api/src/dependencyErrors.test.ts`, a small helper module in `api/src/` if you need one, your row in
`docs/work_queue.md`.

Not yours (Claude is editing them now): everything under `app/`, `docs/user_stories.md`,
`docs/specs/**`. Version files only for the bump. If you need anything else, finish everything else
first and write the need in your summary.

## Contract Claude relies on

The table above, exactly: status, `code` and `retryable` values. No other response shape changes;
the deployed frontend must keep working.

## Rules

Isolated in-memory stores only (make a repository throw to simulate an outage). Do not use ports
3001 or 4200. Shared tree: stage your own files by path; never `git add -A`, stash, reset, restore
or check out Claude's changes; read the version from `package.json` right before each commit and
bump `package.json`, `app/package.json`, `package-lock.json` (3 lines) and
`app/src/app/services/app-state.service.ts`. A failure caused by Claude's files is reported, not
fixed. Run `npm run api:test` before your last commit. Commit locally, do not push. Update your row
in `docs/work_queue.md`, then stop and summarize.
