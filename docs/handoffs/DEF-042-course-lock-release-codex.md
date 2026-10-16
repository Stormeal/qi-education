# DEF-042 course lock released after the answer — Codex handoff (API)

Assigned 2026-10-16 by Claude Code (lead). Runs in parallel with Claude's fixes for DEF-037 to
DEF-041, which touch only `app/`. Read `AGENTS.md` (including "Two agents in one working tree")
first.

## Problem (observed, not yet reproduced in a test)

Hosted log 2026-10-13, two Mux upload requests on course `1602e5b5` (see the 2026-10-13
session in `docs/work_queue.md`): after each answer the API logged
`Course lock release requires verified recovery` and
`Unable to finish course operation coordination. CourseBusyError`, 16 and 46 seconds later,
under the request that woke the instance.

Suspected cause: `withCourseLock` in `api/src/server.ts` (lines 153-190 on the base commit)
lets the handler send its answer inside `courseContent.withCourseMutationLock(...)`. The
release in `MongoCourseMutationLock.run` (`api/src/courseMutationLock.ts`, the `finally`
block) therefore runs after the response. Vercel can pause the function once the response is
sent; when it resumes, the release's five-second `beforeDeadline` has already expired, so it
throws `CourseBusyError` even though the delete may have reached MongoDB. Worst case the
course answers "This course is being updated" until the 31-minute expiry. Every locked route
has this order.

## Scope

1. Reproduce in an in-process test: a locked route's answer reaches the client before the
   lock is released (e.g. a lock whose release you can observe or delay).
2. Fix. Default decided by the lead (record in the defect as "confirm or change"):
   **the client receives the answer only after the lock has been released** (or after the
   release failed and was logged). Hold the finished response inside `withCourseLock` and
   deliver it after `withCourseMutationLock` returns. No new dependency (no
   `@vercel/functions` `waitUntil`). Status codes, bodies and headers of every existing route
   stay exactly as they are; a release failure after a successful handler still answers
   with the handler's response and logs as today.
3. Tests: the new ordering on at least one route per method that uses `withCourseLock`
   (the routes at `server.ts` lines ~224, ~296, ~600, ~833 on the base), plus the existing
   `courseMutationLock.test.ts` and `lockRecovery.test.ts` still pass.
4. Update `docs/course_operation_recovery.md` ("Normal behavior") to say the answer is sent
   after the release.

## Files

Owned by Codex: `api/src/server.ts` (only `withCourseLock` and code it needs),
`api/src/courseMutationLock.ts`, new or changed tests under `api/`,
`docs/course_operation_recovery.md`, this handoff (add an "Outcome" section), your row in
`docs/work_queue.md`, and the three version lines (`package.json`, `app/package.json`,
`app/src/app/services/app-state.service.ts` line `appVersion`).

Must not edit: anything else under `app/`, `docs/defect_management.md` and `CLAUDE.md`
(Claude transfers your outcome there during the check), `docs/user_stories.md`.

If you find you need a file outside this list, finish everything else first, then report the
file and the reason in your summary. Do not stop before writing the code.

## Contract Claude's side relies on

Nothing in the frontend changes. Every route keeps its paths, status codes, response bodies
and headers. The only observable difference is that the answer arrives after the lock
release instead of before it.

## Rules

- Isolated in-memory stores only. No real MongoDB, Google Sheets, Mux or Vercel.
- Do not use ports 3001 or 4200 (Claude's browser checks). In-process tests or other ports.
- Shared working tree on `main`: stage your own files by path; never `git add -A`; never
  stash, reset, restore or check out Claude's changes. Read the version from `package.json`
  right before committing and bump all three version lines; the later committer bumps again.
- A test failure caused by Claude's files (`app/`) is reported, not fixed.
- Commit locally, do not push.
- Run `npm run api:test`, `npm run api:build` and `npm run verify:journeys` before your last
  commit.
- Update your row in `docs/work_queue.md` (state, commits, checks, what is not verified),
  then stop and summarize.
