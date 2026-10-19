# US-P005 lock inspection — Codex handoff (API)

Assigned 2026-10-19 by Claude Code (lead). Claude works on US-L001 (course page, docs) and
then the Admin page panel for this list, in this same working tree on `main`. Read
`AGENTS.md` ("Two agents in one working tree") first. Decisions and scenarios:
[docs/stories/US-P005-lock-inspection.md](../stories/US-P005-lock-inspection.md).

## Scope

An admin-only, read-only list of course operation locks. No release or delete route.

## Contract Claude's Admin panel is built against (do not change without recording it)

`GET /admin/course-locks` (and `/api/admin/course-locks`), bearer token required.

- Anonymous: 401. Student or teacher: 403. Both with `{ message }` and no lock data.
- `Cache-Control: no-store`.
- Lock store unreachable: 503 `{ message }`.
- 200 body:

```
{
  checkedAt: string,                 // ISO time of the read
  locks: [{
    courseId: string,
    courseTitle: string | null,      // null when the course row is missing
    owner: string,
    acquiredAt: string | null,       // as stored; null when missing or not a string
    expiresAt: string | null,        // acquiredAt + courseLockExpiryMs; null when acquiredAt is malformed
    state: 'held' | 'expired' | 'needs-recovery'
  }]
}
```

- `state`: `held` = valid timestamp, before expiry; `expired` = valid timestamp, expiry passed
  (the next write to the course removes it); `needs-recovery` = malformed or missing
  timestamp (same validation as `acquisitionTime` in `courseMutationLock.ts`).
- Sorted by `acquiredAt`, oldest first; malformed ones first.
- In-memory mode lists the locks held by the in-memory store, with the time they were taken.
- Reading the list never takes, changes or deletes a lock.

## Files Codex owns

- `api/src/courseMutationLock.ts` — add a list method to `CourseMutationLock` and both
  implementations (Mongo: `find()` on the `_locks` collection; in-memory: record when taken).
- `api/src/courseContentRepository.ts` — expose the list next to `withCourseMutationLock`
  (interface and both repositories).
- A new `api/src/courseLocksRoutes.ts` (or the closest existing pattern) and its registration
  line in `api/src/server.ts`, including the no-store prefix list near line 453.
- Any test double that implements `CourseContentRepository` or `CourseMutationLock` and must
  gain the new method (`api/test/**`, `api/src/*.test.ts`).
- New tests, e.g. `api/src/courseLocks.test.ts`, named by scenario ID (US-P005-AC01…AC04).
- `docs/course_operation_recovery.md` — replace the last sentence of "Recover an abandoned or
  uncertain owner" with how to read the list (Admin page → Course locks, or the route).
- `docs/specs/platform/reliability.md` — one bullet describing the route.
- Your row under Active work in `docs/work_queue.md`.

## Files Codex must not edit

Everything under `app/`, `docs/user_stories.md`, `docs/stories/**`,
`docs/specs/catalog/**`, `docs/specs/admin/**`, `CLAUDE.md`, `AGENTS.md`.

## Checks before committing

`npm run api:test`, `npm run api:build`. Isolated in-memory stores and fake collections only.
Bump the version in `package.json`, `app/package.json`,
`app/src/app/services/app-state.service.ts` (`appVersion`) and `package-lock.json` (three
`version` lines), reading the current value from `package.json` right before committing.
