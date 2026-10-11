# US-P006-AC06 thumbnail caching — Codex handoff (API)

Assigned 2026-10-11 by Claude Code (lead). Runs in parallel with Claude's keyboard-only check
of the quiz editor and the learner's quiz view under `app/` in this same working tree. Read
`AGENTS.md` (including "Two agents in one working tree") first.

## Why

INV-018: `GET /courses/:id/thumbnail` answers `Cache-Control: private, no-store` even when
the URL carries the asset id as `?v=`. Every catalog visit downloads every thumbnail again.
Scenario: US-P006-AC06 in `docs/user_stories.md`.

## Decision taken by the lead (recorded in the spec as "confirm or change")

Browser cache only, never a shared cache. Alex has not decided whether published thumbnails
may be cached publicly, so nothing is marked `public`.

## Scope

1. Reproduce INV-018 first with an isolated HTTP test (the header today), then promote it to
   the next DEF ID in `docs/defect_management.md`, keeping the investigation link.
2. Deliver the contract below in `api/src/**`.
3. Record it in `docs/specs/US-P006-class-load.md`, remove AC06 from US-P006 in
   `docs/user_stories.md`, and update `docs/architecture.md` if it describes the header.

## Contract (the deployed and the current frontend rely on it)

The frontend already requests `/courses/:id/thumbnail?v=<thumbnailAssetId>` in
`app/src/app/services/course.service.ts` (`preloadCourseThumbnails`), with a Bearer token when
signed in, and reads the body as a blob. It needs no change and you do not edit it.

- 200 where `v` is present and equals the id of the asset actually served:
  `Cache-Control: private, max-age=31536000, immutable`. `Vary: Authorization` stays.
- 200 without `v`: `private, no-store`, as today.
- Every 404 and every error: `private, no-store`, as today. A wrong or stale `v`, a course
  the caller may not see, and a missing asset keep returning exactly what they return today.
- Who may read which thumbnail does not change: the author-only branch for a revision's
  thumbnail, `canSeeCourse`, and the `asset.courseId` check stay as they are.
- Status codes, `Content-Type`, `Content-Length` and the body are unchanged.
- No other route's cache headers change. The `/api/courses/:id/thumbnail` alias, if it serves
  reads, behaves the same as the plain path.

Tests must show: the three header cases above; an anonymous caller and a signed-in caller on
a published course; a draft thumbnail still 404 for a non-author with `no-store`; after a
thumbnail is replaced, the old `v` no longer returns 200 to a learner.

## Files

Yours: `api/src/**`, `docs/specs/US-P006-class-load.md`, `docs/user_stories.md`,
`docs/defect_management.md`, `docs/architecture.md`, your row in `docs/work_queue.md`, and
the version lines the commit hook requires (`package.json`, `app/package.json`,
`package-lock.json`, line 65 of `app/src/app/services/app-state.service.ts`).

Not yours (Claude is editing them now): everything else under `app/`, `CLAUDE.md`,
`docs/specs/US-T013-simple-quiz.md`.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset, restore or check out changes you did not make. Read the version from
`package.json` right before committing; the later committer bumps again. Isolated in-memory
stores only; no servers on ports 3001 or 4200. Run `npm run api:test`,
`npm run verify:journeys`, `npm run api:build`, `npm run app:test` and
`npm run app:build:pages`. A frontend failure caused by Claude's unfinished files under
`app/` is reported, not fixed, and does not block your commit. If you need a file outside
your list, do NOT stop: finish and commit everything that does not depend on it, then
describe the exact change you need in your queue row. Do not push. Update your queue row
with your commits, what you verified and what you could not, then stop and summarize.
