# Whole-repo code audit — 2026-10-09

Owner: Claude Code. Branch: `main`. Audited tree: `96e9ff9` plus the then
uncommitted US-T002 implementation, since delivered in `86196cf`; line numbers
below are from `86196cf`. Audit only: no product code, shared store, or
deployment was changed.

## Method and limits

Read in full: every non-test file in `api/src/`, `api/[...path].ts`, `vercel.json`,
both workflows, the git hooks, `api-client.service.ts`, `session.service.ts`, and
the HTML-insertion paths in the course builder and course view. Skimmed:
`app-state.service.ts`, `course-builder.ts`. Not read: styles, most templates,
test files, `scripts/`, `design/`, vendored skill folders.

Checks run on this tree: API build, frontend build, 238 API tests, 107 frontend
tests — all pass.

Assumed load: a small school. Tens of learners online, one class opening the same
course at the same moment, a few teachers editing.

**Nothing here was reproduced against a running system.** Every item is a code
reading. Under [defect_management.md](../../defect_management.md) rules they are
therefore investigations, not confirmed defects. Provider limits quoted (Google
Sheets about 60 reads per minute per service account, Vercel 4.5 MB request and
response bodies, MongoDB 16 MB documents) are published defaults, not measured.

## Findings and where they are recorded

| # | Finding | Source | Record | Story |
| --- | --- | --- | --- | --- |
| 1 | Each authenticated request makes 3 Sheets reads for login plus up to 6 for the course; a lesson save makes about 9. A new Google client is built per call | `api/src/googleSheets.ts:7`, `api/src/authRepository.ts:86`, `api/src/server.ts:93` | INV-005 | US-P006 |
| 2 | A failed write inside the course lock, or a killed function, leaves the lock in place forever; readers are blocked too | `api/src/courseMutationLock.ts:71` | INV-006 | US-P005 |
| 3 | The course editor assigns stored lesson HTML to `innerHTML` without sanitizing; the API stores it unfiltered | `app/src/app/ui/course-builder/course-builder.ts:509,780,822,1274` | INV-008 | US-P007 |
| 4 | Sheets writes use `USER_ENTERED`, so user text starting with `=` becomes a formula | 8 call sites in `authRepository.ts`, `courseRepository.ts`, `feedbackRepository.ts` | INV-009 | US-P007 |
| 5 | Read routes (thumbnail, outline, content, attachment, quiz attempt) take the exclusive course lock | `api/src/server.ts:545,630,643,677,761` | INV-007 | US-P006 |
| 6 | Attachments allow 25 MB in app and API; the host rejects bodies over 4.5 MB and MongoDB documents over 16 MB | `api/src/server.ts:232`, `app/src/app/services/app-state.service.ts:1095` | INV-010 | US-T009 |
| 7 | New review code loads the full content document of every course on each course list | `api/src/courseReview.ts:110` | INV-011 | US-P006, US-T002 |
| 8 | Saving content fetches every attachment's binary to compare its course id | `api/src/server.ts:745` | INV-012 | US-P006 |
| 9 | Removing a video never deletes the Mux asset; `signed` policy has no token flow | `api/src/server.ts:874`, `api/src/muxService.ts:20` | INV-002 (existing) | US-T006 |
| 10 | Missing Sheets settings in production silently enable in-memory demo users, including a documented admin password | `api/src/authRepository.ts:140`, `api/src/config.ts:91` | INV-013 | US-P008 |
| 11 | Login and signup have no attempt limit; each attempt also spends Sheets quota | `api/src/server.ts:428` | INV-014 | US-P008 |
| 12 | On localhost the frontend retries a failed request against the hosted API | `app/src/app/services/api-client.service.ts:39,193` | INV-015 | US-P008 |
| 13 | CI runs only on pull requests; work now lands by push to `main`, and the API deploys regardless of test results | `.github/workflows/ci.yml:3` | INV-016 | US-P008 |
| 14 | Feedback triage creates the GitHub issue before saving its link | `api/src/server.ts:1150` | INV-004 (existing) | US-P003 |
| 15 | After the review change, status branches in `PATCH /courses/:id` cannot take effect, and the Courses sheet no longer reflects reviewed title/status | `api/src/server.ts:956` | INV-017 | US-T002 |
| 18 | Thumbnails are served `no-store` even when the URL carries a version id | `api/src/server.ts:531` | INV-018 | US-P006 |

Concurrent signup and concurrent enrollment were also seen again; they are
already INV-003.

## Chain worth fixing together

Findings 1, 2 and 5 compound: a busy minute exhausts the Sheets quota, a quota
error on a write inside the lock is treated as an uncertain write, the lock is
kept, and because reads also need the lock the course is unavailable to everyone
until manual recovery. Finding 2 conflicts with a recorded decision (no
time-based takeover, see [course operation recovery](../../course_operation_recovery.md));
changing it is a product decision, noted on US-P005.

## Maintenance candidates (not defects, no story)

- Four near-identical `updateCourse*` methods in `api/src/courseRepository.ts`;
  `toColumnName` exists three times.
- Markdown/escape helpers duplicated between `course-view-page.ts` and
  `course-builder.ts`; the attachment size formatter exists four times.
- `app/src/app/services/app-state.service.ts` is 2,975 lines covering auth forms,
  profile, feedback, URL parsing, course and quiz editing, and uploads.
- Deletable: `api/health/auth.ts` (not built by `vercel.json`; Express serves the
  route), `api/package-lock.json`, the extra header rewrite in
  `feedbackRepository.ts:168`, unused `MUX_SIGNING_*` settings.

Estimated removal: about 300 lines, no dependencies.
