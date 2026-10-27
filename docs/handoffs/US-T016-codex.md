# US-T016 — Teacher overview, API part (Codex)

Started 2026-10-27. Story contract: [stories/US-T016-teacher-overview.md](../stories/US-T016-teacher-overview.md).
Scenarios US-T016-AC01, AC02, AC03 (API side). Claude builds the Home card in `app/` at the same time.

## Scope (Codex owns)

- `api/src/**`: a new `teachingRoutes.ts` (or similar) registered from `server.ts`; a read for
  progress of many accounts on one course if needed (`learningProgressRepository.ts`, both the
  MongoDB and in-memory classes: one query per course, not one per learner); `routePermissions.test.ts`
  (both `/teaching/courses` and `/api/teaching/courses`); a new `teachingRoutes.test.ts`.
- `docs/work_queue.md`: the Codex US-T016 row only.
- Version files when committing: `package.json`, `app/package.json`, the `appVersion` line in
  `app/src/app/services/app-state.service.ts`, and the three version lines of `package-lock.json`.
  Read the version from `package.json` right before each commit; Claude commits in between.

## Must not edit

Anything in `app/` except the `appVersion` line; `docs/stories/**`, `docs/specs/**`,
`docs/user_stories.md`, Claude's rows in `docs/work_queue.md`.

## Contract Claude's app side relies on

Exactly the "API contract" section of the story contract: `GET /teaching/courses` (and `/api`
alias), 401/403 rules, the 200 body shape, sorting, the percent rule, no learner identity, no-store
caching. Existing routes and answers unchanged.

## Tests expected

AC01 counts (enrolled / started / completed / average, a removed lesson ignored, an unenrolled
author's progress ignored), AC02 counts and newest five with lesson title and null for a deleted
lesson, AC03 another teacher's course excluded, student and admin 403, disabled teacher 403, no
learner identity in the body.

## Rules

- Isolated in-memory stores only (no `USE_SHARED_SERVICES`); in-process tests or ports other than
  3001/4200.
- Shared tree: stage your own files by path; never `git add -A`, stash, reset, restore or check out
  Claude's changes. A failure caused by Claude's files (`app/`) is reported, not fixed.
- Commit locally, do not push.
