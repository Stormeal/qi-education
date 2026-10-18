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

## Outcome

2026-10-16, Codex, `main`, base `0deff80` (required ancestor `926bb19`
confirmed). Implementation: `953b534` (`fix(DEF-042): send course answers after
lock release`, version 0.1.203). This delivery-record commit updates the queue
and bumps the three authorized version lines again for the hook.

**Confirm or change: confirm the lead's default.** The client receives the
handler's finished answer only after release settles. If release fails, the
existing recovery/coordination logs precede the handler's original answer.
No dependency, frontend behavior, route path, status, response body, or header
contract changed.

Reproduced before implementation in `api/src/courseLockResponse.test.ts`: 12
cases failed because HTTP headers had already been sent while owner deletion
was paused. Tests use real local HTTP on ephemeral ports, isolated repositories,
and `MongoCourseMutationLock` with an in-memory collection whose deletion is
gated. Both route prefixes cover PUT thumbnail, POST Mux upload (201), PATCH
price, DELETE video, and handler validation responses. Additional cases cover
forwarded validation errors, failed release after success, failed acquisition,
ambiguous writes retaining ownership, and missing courses without acquisition.

Fix: `withCourseLock` temporarily holds the final Express `send` call. JSON is
serialized by the existing handler, and the original `send` is restored before
error middleware or delivery. Awaited coordination finishes before the saved
answer is sent. All currently locked handlers use `json`; streaming asset reads
use a separate wrapper. `courseMutationLock.ts` needed no change: its existing
awaited release and conservative ambiguous-write behavior remain intact.
The runbook's Normal behavior section now records this ordering.

Verification before delivery:

- Focused response/lock/recovery suites: 35 tests pass, including all 20 new
  route cases and existing `courseMutationLock.test.ts` / `lockRecovery.test.ts`.
- `npm run api:test`: 1,301 tests in 51 files pass.
- `npm run api:build`: passes.
- `npm run verify:journeys`: all six journeys pass.
- Independent read-only review: no actionable findings; `git diff --check` clean.

Not verified: hosted Vercel suspension behavior, real MongoDB majority writes,
timeouts/recovery, or real Sheets/Mux integration. No shared services or ports
3001/4200 were used. No push or deployment. Frontend tests/build were not rerun
for this API-only behavior change. Claude must transfer the outcome to the
read-only DEF-042 record; hosted release checks remain with the lead/Alex.

Outside-file follow-up: `package-lock.json` is outside the assigned list. The
delivery workflow asks that its root/top-level/app version entries match the
package manifests; those entries remain at 0.1.202. The lead should align them
with the final delivery version. No dependency or lockfile edit was needed for
the fix, and no outside-owned file was changed.
