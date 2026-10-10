# Career paths, increment 2 — Codex handoff

Assigned 2026-10-10 by Claude Code (lead) after the user selected career paths as the next
work. Base: `main` at `35567db` or later. Read `AGENTS.md`, the
[work queue](../work_queue.md) and the
[career path spec](../specs/US-L009-L012-T008-career-paths.md) first.

## Why this is yours

Career path progress is computed from lesson completion, and lesson completion lives only in
the browser (`LearningProgressService`, localStorage). A learner who finishes a course on one
device sees 0% on another. Stakeholders will notice that first. It is an API and storage job
next to the progress rules you delivered in DEF-007/009/014.

## Scope

1. **US-L002-AC02 — lesson completion saved to the account.**
2. **US-P004-AC03 and AC04 — on the career path selection API.**

Both stories are in [user_stories.md](../user_stories.md). Write the feature spec for item 1
(`docs/specs/US-L002-account-progress.md`) before implementing.

## Files

Yours: `api/src/**`, `app/src/app/services/learning-progress.service.ts` and its spec.

Not yours (Claude is editing them at the same time): `app/src/app/pages/career-path-page/`,
`app/src/app/pages/dashboard-page/`, `app/src/app/services/career-path.service.ts`,
`app/src/app/utils/career-path-progress*`. If you need a change there, write it in your
delivery note instead of editing.

## Contract Claude's side relies on

- Keep the public members of `LearningProgressService` and their signatures: `completedIds`,
  `complete`, `summary`, `forContent`, `loadCourses`, `reset`, `cancelLoads`. They stay
  synchronous and signal-driven; the career path page and Home read them in `computed()`.
  Loading from the server may add members, not change these.
- The completion rules do not change: 100% needs every current lesson, a failed quiz is not
  a completed lesson.
- New routes only. A push to `main` deploys the API before the frontend, so the currently
  deployed frontend must keep working against the new API.

## Requirements

- Storage: MongoDB next to the career path collections, in-memory without Mongo config, the
  same repository pattern as `careerPathRepository.ts`. No Google Sheets change.
- An account reads and writes only its own completion. Reject a lesson ID that is not in the
  course, and a course the account may not learn from.
- Decide in the spec, and say which you chose: whether the server accepts a quiz lesson as
  complete only after its own grading passed it. The client must not be able to mark a failed
  quiz complete on the account.
- Completion already in a browser's localStorage is merged up after sign-in (union) and never
  dropped. A failed save keeps the completion locally and retries; it must not show as lost.
- A response for one account must not land in another account's session after logout or
  account switch (US-P004-AC02 applied to your service).
- US-P004-AC04: two devices saving a selection, or a retried `PUT /users/me/career-path`,
  end in one identifiable saved outcome. Keep the response shape.
- US-P004-AC03: prove with tests that the path routes never disclose another account's
  selection or an unpublished course's content through a path reference. Fix what fails.

## Not in scope

CV analysis, next-step guidance and path switching (Claude), the admin editor, video viewing
as a completion rule, deleted or revised lesson totals beyond today's behavior, US-L003.

## Delivery

Work in your clone, updated to current `main` first. Commit there; do not push. Claude merges
and aligns the version numbers, so a version conflict on merge is expected and is Claude's to
resolve. No mutation of shared Sheets, MongoDB, Mux or GitHub data. Run `npm run api:test`,
`npm run app:test`, `npm run verify:journeys` and `npm run app:build:pages`, and record what
could not be verified. Update the queue row with your commit and next step.
