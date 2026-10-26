# US-A007 — Course reviewers, API part (Codex)

Started 2026-10-26. Release 1, Must. Story: [stories/US-A007-course-reviewers.md](../stories/US-A007-course-reviewers.md).
Plan: [superpowers/plans/2026-10-26-course-reviewers.md](../superpowers/plans/2026-10-26-course-reviewers.md),
**Tasks 1–5** are Codex's. Scenarios US-A007-AC01–AC06 (API side of each).

## Scope (Codex owns)

- `api/src/**`: every file the plan's Tasks 1–5 name, in particular `course.ts`,
  `courseRepository.ts`, `mongoCourseRepository.ts`, `courseStore.ts`, `courseAccess.ts`,
  `courseReview.ts`, `courseTeachersRoutes.ts`, `server.ts`, `routePermissions.test.ts`,
  `journey.test.ts`, `courseReview.test.ts`, and the new `courseReviewersRoutes.ts`,
  `courseReviewerMail.ts`, `courseReviewers.test.ts`.
- `docs/work_queue.md`: the Codex US-A007 row only.
- Version files when committing: `package.json`, `app/package.json`, the `appVersion` line in
  `app/src/app/services/app-state.service.ts`, and the three version lines of `package-lock.json`.
  Read the version from `package.json` right before each commit; Claude commits in between.

## Contract Claude's app side relies on

Exactly the Interfaces blocks of plan Tasks 1–4:

- `GET|PUT /courses/:id/reviewers` (admin) → `{ reviewers: { id, displayName, email, active }[], mailWarning?: string }`; PUT body `{ reviewerIds: string[] }`.
- `POST /courses/:id/review` accepts `action: 'approve' | 'request-changes'` (reason = comment), and
  every review state (`review` in author content and in the review route's answer) carries
  `reviewers: { total: number; approved: number; viewerVerdict: 'waiting' | 'approved' | 'changes-requested' | null }`.
- Publish refused with 409 `Waiting for N of M reviewers to approve this revision.`; request-changes
  without comment 400 `Enter a comment before requesting changes.`.
- `GET /reviews/mine` (signed-in) → `{ reviews: { courseId, title, status, verdict }[] }`.
- A reviewer gets `view=author` reads (course, content, assets) for courses they review, and no writes.
- Courses without reviewers: every existing answer unchanged. No existing route removed or renamed.

## Rules

- Isolated in-memory stores only (no `USE_SHARED_SERVICES`); in-process tests or ports other than
  3001/4200.
- Shared tree: stage your own files by path; never `git add -A`, stash, reset, restore or check out
  Claude's changes. A failure caused by Claude's files (`app/`) is reported, not fixed.
- Commit locally, do not push.

## Not Codex's files

Everything under `app/` except the version line; docs other than the queue row. Claude works in
`app/src/app/**` at the same time (plan Tasks 6–9).
