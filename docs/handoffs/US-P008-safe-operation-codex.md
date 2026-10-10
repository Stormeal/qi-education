# US-P008 safe operation — Codex handoff

Assigned 2026-10-10 by Claude Code (lead). Runs in parallel with Claude's career path
follow-up in this same working tree. Read `AGENTS.md` (including "Two agents in one working
tree"), the [work queue](../work_queue.md) and US-P008 in [user_stories.md](../user_stories.md).

## Why now

Career paths are about to be pushed and published. INV-013 says a production API that loses
its user-store settings would accept the documented demo admin password. That must be
closed before more people are pointed at the live site.

## Scope

1. **US-P008-AC01 — no demo accounts in production** (INV-013).
2. **US-P008-AC03 — local development never writes to production** (INV-015).

Not in scope: US-P008-AC02 (sign-in attempt limits). Its limits are an open product decision.

Reproduce each investigation with isolated stores before fixing, promote it to a defect with
the reproduction, and turn it into a regression test. Write
`docs/specs/US-P008-safe-operation.md` before implementing.

## Files

Yours: `api/src/**`, `app/src/app/services/api-client.service.ts` and its spec,
`docs/specs/US-P008-safe-operation.md`, `docs/defect_management.md`, `docs/user_stories.md`,
`docs/architecture.md`, and your row in `docs/work_queue.md`.

Not yours (Claude is editing them now): `app/src/app/pages/**`,
`docs/specs/US-L009-L012-T008-career-paths.md`, `CLAUDE.md`.

## Requirements

- AC01: when the API runs in production without its user-store settings, no demo account
  exists and sign-in and sign-up answer with a clear `{ message }` error, not a crash. A
  health endpoint reports the missing configuration without revealing secrets.
- AC01 must not change local development, tests, `NODE_ENV=test`, or `npm run verify:journeys`:
  in-memory demo users keep working there. State in the spec exactly how "production" is
  detected, and why a correctly configured production deployment cannot be locked out by it.
- AC03, decision taken by the lead (confirm or change): from a localhost frontend, a request
  that changes data (any method other than GET or HEAD) is never retried against the hosted
  API. It fails locally with a clear message. Read requests keep today's fallback.
- AC03 must not change the deployed frontend's behavior.
- A push to `main` deploys the API before the frontend. Keep every existing route and
  response shape working for the currently deployed frontend.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset or restore changes you did not make. Read the version from `package.json` right
before committing and apply the aligned bump the hook requires. Use in-process tests or ports
other than 3001 and 4200. Isolated in-memory stores only; no shared Sheets, MongoDB, Mux or
GitHub data. Run `npm run api:test`, `npm run app:test`, `npm run verify:journeys` and
`npm run app:build:pages`. A failure caused by Claude's files is reported, not fixed. Do not
push. Update your queue row with the commit, what you verified and what you could not, then
stop and summarize.
