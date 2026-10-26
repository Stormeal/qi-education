# Course Reviewers (US-A007) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins assign teacher/admin reviewers to a course; reviewers read the submitted revision and send a verdict; publish waits until every assigned reviewer has approved since the last submit.

**Architecture:** Reviewer IDs live on the course beside `teacherIds` (no new collection). Verdicts are two new actions in the existing review workflow (`courseReview.ts`), stored in its history; a pure gate function reads that history. The app reuses the course-teachers picker pattern, the review panel and the Home dashboard.

**Tech Stack:** Express + Zod + Vitest (api), Angular signals + Vitest (app), MongoDB / in-memory repositories, Brevo via `mailSender.ts`.

**Spec:** `docs/stories/US-A007-course-reviewers.md`

**Split (CLAUDE.md working sessions):** Tasks 1–5 are Codex's (`api/src/**`). Tasks 6–9 are Claude's (`app/`). Task 10 is the joint check routine. The API contract both sides rely on is the Interfaces block of Tasks 1–4.

## Global Constraints

- Reviewers: 0–20 per course, active `teacher` or `admin` accounts at the time they are added; never an assigned teacher of the same course (and the reverse).
- Only admins read or change a course's reviewers.
- Verdict actions: `approve` (comment optional) and `request-changes` (comment required; message `Enter a comment before requesting changes.`). Only while the working revision is `ready-for-review`.
- Publish is refused with 409 `Waiting for N of M reviewers to approve this revision.` unless every assigned reviewer's latest verdict since the latest `submit` of the current revision is `approve`. Return and Archive are never blocked.
- A disabled or demoted reviewer still counts in the gate until removed.
- Reviewers never edit, submit, return, publish, archive or change price/catalog settings.
- Mail: assignment and every `submit` email the reviewers; a mail failure never fails the request.
- Every new route gets rows (route and `/api` alias) in `api/src/routePermissions.test.ts`.
- Courses with no reviewers behave exactly as before (existing tests stay green unchanged).
- Version bump on every commit (`package.json`, `app/package.json`, `app-state.service.ts`, the three `package-lock.json` lines).

## Review Focus

- Reviewer approves, admin returns, teacher resubmits → old approval must not count (Task 2 test `resubmit resets verdicts`).
- Reviewer sends two verdicts (changes, then approve) → only the latest counts (Task 2 test `latest verdict wins`).
- Admin removes a reviewer who requested changes → publish allowed if the rest approved (Task 2 test `removed reviewer leaves gate`).
- Reviewer tries `submit`/`publish`/a PATCH on the course → 403, no change (Task 3 test `reviewer cannot author`).
- Admin who is also listed as reviewer publishes without approving → blocked like anyone else (Task 2 test `admin reviewer must approve too`).

---

### Task 1: Store reviewer IDs and the assignment route (Codex)

**Files:**
- Modify: `api/src/course.ts` (add `reviewerIds?: string[]` to `Course`, to the stored-field list next to `'teacherIds'`, and `courseReviewerIds(course): string[]` returning `course.reviewerIds ?? []`)
- Modify: `api/src/courseRepository.ts`, `api/src/mongoCourseRepository.ts`, `api/src/courseStore.ts` (add `updateCourseReviewers`, mirroring `updateCourseTeachers`; read-only/unavailable stores throw like their teacher variants)
- Create: `api/src/courseReviewersRoutes.ts` (copy the shape of `courseTeachersRoutes.ts`)
- Modify: `api/src/courseTeachersRoutes.ts` (refuse a teacher id that is in `courseReviewerIds(course)`: 400 `<id> reviews this course and cannot also teach it.`)
- Modify: `api/src/server.ts` (register the routes; add `reviewers` to the `/(price|catalog-metadata|quiz-attempts|teachers)/` exclusions in `withCourseLock` so assignment is not an author write)
- Modify: `api/src/routePermissions.test.ts` (`GET`/`PUT /courses/:id/reviewers`: `'admin'`)
- Test: `api/src/courseReviewers.test.ts`

**Interfaces:**
- Produces: `GET /courses/:id/reviewers` → `{ reviewers: CourseReviewer[] }`; `PUT /courses/:id/reviewers` body `{ reviewerIds: string[] }` → `{ reviewers: CourseReviewer[]; mailWarning?: string }`.
- `type CourseReviewer = { id: string; displayName: string; email: string; active: boolean }`; `active` = role is teacher or admin and status active.
- `courseReviewerIds(course: Pick<Course, 'reviewerIds'>): string[]` exported from `course.ts`.
- `CourseRepository.updateCourseReviewers(id: string, reviewerIds: string[]): Promise<Course | null>`.

- [ ] **Step 1: Write failing tests** in `courseReviewers.test.ts` (use the app factory and in-memory stores as `courseTeachers.test.ts` does): `admin assigns teacher and admin reviewers` (200, both listed, `active: true`); `refuses a student` (400); `refuses an assigned teacher` (400); `refuses more than 20 or duplicates` (400); `teacher cannot read or change reviewers` (403); `teacher assignment refuses a reviewer` (PUT teachers with a reviewer id → 400); `keeps a disabled reviewer already stored` (re-saving the list with a now-disabled reviewer succeeds, `active: false`).
- [ ] **Step 2: Run** `npm --prefix api test -- src/courseReviewers.test.ts` — expected FAIL (404 route).
- [ ] **Step 3: Implement** the field, repository methods, routes and server wiring above. Stored-but-now-inactive ids are kept on re-save, like `courseTeachersRoutes.ts` does with `storedIds`.
- [ ] **Step 4: Run** the test file and `npm --prefix api test -- src/routePermissions.test.ts` — expected PASS.
- [ ] **Step 5: Commit** (stage by path) `feat(US-A007): store course reviewers`.

### Task 2: Verdicts and the publish gate (Codex)

**Files:**
- Modify: `api/src/courseReview.ts`
- Test: `api/src/courseReview.test.ts` (add a `describe('reviewers')` block)

**Interfaces:**
- Consumes: `courseReviewerIds` (Task 1).
- Produces:
  - `reviewActionSchema.action` gains `'approve' | 'request-changes'`.
  - `export type ReviewerVerdict = 'waiting' | 'approved' | 'changes-requested'`.
  - `export function reviewerVerdicts(workflow: CourseReviewWorkflow, reviewerIds: string[]): Record<string, ReviewerVerdict>` — for each id, its latest `approve`/`request-changes` event whose `revisionId` is the current working revision and that comes after the latest `submit` event of that revision; none → `'waiting'`.
  - `CourseReviewState` gains `reviewers: { total: number; approved: number; viewerVerdict: ReviewerVerdict | null }` (`viewerVerdict` is `null` unless the viewer is an assigned reviewer). `state(id, user?)` and `reviewState(base, workflow, user?)` take the optional viewer.

- [ ] **Step 1: Write failing tests:** `approve while ready-for-review records an approve event`; `request-changes needs a comment` (400 message from Global Constraints); `verdict refused on a draft` (409); `non-reviewer verdict refused` (403 `Only assigned reviewers can send a verdict.`); `publish blocked until all approve` (409 message with `1 of 2`); `latest verdict wins`; `resubmit resets verdicts`; `removed reviewer leaves gate`; `admin reviewer must approve too`; `return and archive not blocked`; `no reviewers publishes as before`; `state reports reviewers.total, approved and viewerVerdict`.
- [ ] **Step 2: Run** `npm --prefix api test -- src/courseReview.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** in `act()`: verdict actions check the user is in `courseReviewerIds(base)` (an admin not listed is refused too), status `ready-for-review`, comment rule; they do not change status. The `publish` branch computes `reviewerVerdicts` and refuses unless all are `'approved'`. Non-verdict actions keep today's checks.
- [ ] **Step 4: Run** the test file — expected PASS; run all of `npm run api:test` — expected PASS.
- [ ] **Step 5: Commit** `feat(US-A007): reviewer verdicts gate publishing`.

### Task 3: Reviewer read access, verdict route access (Codex)

**Files:**
- Modify: `api/src/courseAccess.ts` (add `canReviewCourse(course, user)`: user active, role teacher or admin, id in `courseReviewerIds(course)`; and `canReadAuthorView(course, user) = canAuthorCourse || canReviewCourse`)
- Modify: `api/src/server.ts`: every **read** that grants the author view by `canAuthorCourse` (course list/detail with `view=author`, `GET /courses/:id/content?view=author` near line 910, asset/attachment/thumbnail/video playback reads near line 953) uses `canReadAuthorView`. Writes keep `canAuthorCourse`. `POST /courses/:id/review` lets reviewers through `requireCourseAuthor` only for `approve`/`request-changes` (the action is checked in `act()` too). The review route passes the user into `review.state(courseId, user)`; `authorContent` also gets the user so `reviewers.viewerVerdict` is filled.
- Test: `api/src/courseReviewers.test.ts` (extend)

**Interfaces:**
- Produces: `canReviewCourse(course: Course, user?: AuthenticatedUser): boolean`, `canReadAuthorView(course: Course, user?: AuthenticatedUser): boolean` from `courseAccess.ts`.

- [ ] **Step 1: Write failing tests:** `reviewer reads author content of a submitted course` (200, `view: 'author'`, quiz answers present); `reviewer reads thumbnail and attachments`; `reviewer cannot author` (PATCH course, content write, `submit`, `publish`, price → 403); `unassigned teacher cannot read author view` (403); `disabled reviewer cannot read` (403).
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** as above. Find read sites with `grep -n canAuthorCourse api/src/server.ts api/src/*Routes.ts`; change only reads.
- [ ] **Step 4: Run** `npm run api:test` — expected PASS.
- [ ] **Step 5: Commit** `feat(US-A007): reviewers read the submitted revision`.

### Task 4: Reviewer list and emails (Codex)

**Files:**
- Create: `api/src/courseReviewerMail.ts` (`sendReviewRequest(sender: MailSender, to: string, course: { id: string; title: string }, appUrl: string): Promise<boolean>`; returns false and logs on failure)
- Modify: `api/src/courseReviewersRoutes.ts` (mail newly added reviewers after saving; any failure → `mailWarning: 'Reviewers were saved, but some emails could not be sent.'`)
- Modify: `api/src/server.ts` (after a successful `submit`, mail every assigned active reviewer; add `GET /reviews/mine`)
- Modify: `api/src/routePermissions.test.ts` (`GET /reviews/mine`: `'signed-in'`)
- Test: `api/src/courseReviewers.test.ts` (extend; inject a recording `MailSender` through `dependencies.mailSender`)

**Interfaces:**
- Produces: `GET /reviews/mine` → `{ reviews: { courseId: string; title: string; status: 'draft' | 'ready-for-review' | 'published' | 'archived'; verdict: ReviewerVerdict }[] }` — courses where the user is an assigned reviewer, working revision's title/status.
- Mail: subject `Course to review: <title>`; text `You have been asked to review "<title>" on QI Academy.\n\n<APP_PUBLIC_URL>/courses/<id>/edit` (same base-URL rule as `organizationService.ts` line 166).

- [ ] **Step 1: Write failing tests:** `assignment emails only new reviewers`; `mail failure still saves and warns`; `submit emails every active reviewer`; `reviews/mine lists assigned courses with own verdict`; `reviews/mine is empty for a non-reviewer`.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `npm run api:test` — expected PASS.
- [ ] **Step 5: Commit** `feat(US-A007): reviewer mails and review list`.

### Task 5: Journey check (Codex)

**Files:**
- Modify: `api/src/journey.test.ts`

- [ ] **Step 1:** Add a step after teacher submit: admin assigns a second teacher as reviewer → admin publish refused (409) → reviewer approves → admin publishes (200).
- [ ] **Step 2: Run** `npm run verify:journeys` — expected PASS.
- [ ] **Step 3: Commit** `test(US-A007): reviewer step in release journey`; update Codex's row in `docs/work_queue.md`.

### Task 6: App models and service calls (Claude)

**Files:**
- Modify: `app/src/app/app.models.ts` (`CourseReviewAction` gains `'approve' | 'request-changes'`; `CourseReviewState.reviewers` as in Task 2; `ReviewerVerdict`; `MyReview` as in Task 4)
- Modify: `app/src/app/services/course.service.ts` (`loadCourseReviewers`, `saveCourseReviewers` mirroring the teacher calls; `loadMyReviews(token): Promise<ApiJsonResult<{ reviews: MyReview[] }>>`)
- Modify: `app/src/app/services/app-state.service.ts` (the review-action method near line 2083 accepts the two verdict actions; notices `Approval sent.` / `Change request sent.`)
- Test: `app/src/app/services/course.service.spec.ts` (or the existing service spec for teachers)

- [ ] Steps: failing spec for the three calls' URLs/methods → implement → `npm run app:test` PASS → commit `feat(US-A007): app reviewer API calls`.

### Task 7: Reviewer picker for admins (Claude)

**Files:**
- Create: `app/src/app/ui/course-reviewers/course-reviewers.{ts,html,scss,spec.ts}` (from `ui/course-teachers/`; candidates filtered to active `teacher` or `admin` and not already a teacher of this course; inactive reviewers shown with an "inactive" chip; shows `mailWarning` as a status line)
- Modify: `app/src/app/pages/course-editor-page/course-editor-page.{ts,html}` (render beside `app-course-teachers`, admin only)

- [ ] Steps: load `design-taste-frontend` skill; failing spec (`adds a reviewer`, `hides students and the course's teachers`, `shows inactive`, `shows mail warning`) → implement → `npm run app:test` PASS → commit `feat(US-A007): reviewer picker`.

### Task 8: Verdicts and gate in the review panel (Claude)

**Files:**
- Modify: `app/src/app/ui/course-review-panel/course-review-panel.{ts,html,scss,spec.ts}`
- Modify: `app/src/app/pages/course-editor-page/course-editor-page.{ts,html}` (reviewer viewing: read-only preview, no submit/start-revision/builder edits, no course-lock acquisition; a draft shows `This course is back with its teachers for changes.`)

**Behavior:** when `reviewers.viewerVerdict !== null` and status is `ready-for-review`: comment field + **Approve** and **Request changes** buttons (Request changes disabled until the comment has text). Admin: Publish disabled with `Waiting for {total - approved} of {total} reviewers` while `approved < total`. History labels: `approve` → `Approved by reviewer`, `request-changes` → `Changes requested by reviewer`.

- [ ] Steps: failing spec (`reviewer sees verdict buttons`, `request changes needs a comment`, `publish disabled with waiting count`, `no reviewers leaves publish unchanged`, `history labels`) → implement → `npm run app:test` PASS → commit `feat(US-A007): reviewer verdicts in review panel`.

### Task 9: "To review" on Home (Claude)

**Files:**
- Modify: `app/src/app/pages/dashboard-page/dashboard-page.{ts,html,scss,spec.ts}`

**Behavior:** teachers/admins with at least one review see a "To review" list: course title (link to `/courses/:id/edit`), and `Waiting for you` / `Approved` / `Changes requested`. No list when empty or on load failure (fails quietly; Home must still render).

- [ ] Steps: failing spec (`lists reviews with verdict`, `hidden when empty`, `hidden for students`) → implement → `npm run app:test` PASS → commit `feat(US-A007): to-review list on Home`.

### Task 10: Check routine and docs (Claude)

- [ ] Run `npm run api:test`, `npm run app:test`, `npm run verify:journeys`, `npm run app:build:pages` — all PASS.
- [ ] Browser check on isolated servers (3001/4200): admin assigns reviewer → teacher submits → admin Publish disabled → reviewer approves from Home link → admin publishes.
- [ ] Fold behavior into `docs/specs/authoring/review-and-publication.md` and `docs/business_rules.md`, delete `docs/stories/US-A007-course-reviewers.md`, remove the backlog row, add the release note at push time.
