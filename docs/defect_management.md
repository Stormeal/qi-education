# Defect management

Updated: 2026-10-05. Original audit baseline: `6e19213` on `main`.
Evidence: [audit report](audits/2026-10-04/application_audit.md) and
[isolated API probe](audits/2026-10-04/reproduce-api.mjs).
Career path follow-up: [2026-10-05 audit](audits/2026-10-05/career_path_audit.md),
base `9a2f30b` plus preserved, unfinished lifecycle changes.

## Triage rules

P1: unauthorized changes/disclosure or a serious release risk. P2: broken core
behavior or misleading results with a workaround. P3: smaller usability/layout issue.
Severity is impact; delivery order is in [work_queue.md](work_queue.md).

States: Open, Investigating, In progress, Fixed, Verified, Deferred, Duplicate. Fixed requires
a delivery commit and regression evidence. Verified also requires the specified
environment check. A plausible code concern without reproduction is an investigation,
not a confirmed production defect. Capture user data only in anonymized form.
Keep resolved defects in this file with their original reproduction, resolution
date, fixing commit, passing regression checks, and any remaining release checks.

## Confirmed findings

| ID | Defect | Severity | State | Evidence | Story |
| --- | --- | --- | --- | --- | --- |
| DEF-001 | Any teacher can mutate another teacher's course | P1 | Fixed | Resolved 2026-10-04 in `a9940cc`; API/UI/browser checks pass | US-T001 |
| DEF-002 | General authoring routes bypass admin pricing/publication restrictions | P1 | In progress | API and teacher UI; unfinished local fix | US-T002 |
| DEF-003 | Anonymous API exposes drafts, full lessons, and quiz answer flags | P1 | In progress | Isolated API; unfinished local fix | US-T002, US-L001 |
| DEF-004 | Enrollment accepts unpublished/archived courses | P1 | In progress | Isolated API; unfinished local fix | US-L001 |
| DEF-005 | An impossible quiz can be saved and published | P2 | In progress | Isolated API; unfinished local fix | US-T004 |
| DEF-006 | Leaving the course editor silently discards unsaved changes | P2 | Open | Browser and code | US-T003 |
| DEF-007 | Library progress is hardcoded to 0 percent | P2 | Open | Browser and template | US-L002 |
| DEF-008 | Malformed JSON and oversized uploads become HTTP 500 | P2 | Open | Isolated API | US-P002 |
| DEF-009 | Dashboard presents fixture activity as account progress | P2 | Open | Browser and code | US-L002 |
| DEF-010 | Direct learning URL/refresh falsely reports course missing | P2 | Open | Browser and code | US-L001 |
| DEF-011 | Adjust track, Q&A, and Notes controls have no action | P3 | Open | Browser and templates | US-L005 |
| DEF-014 | Quiz completion indicator counts question position as completed work | P2 | Open | Untouched quiz browser capture and computed formula | US-L002 |

All are local/code findings. Production impact has not been verified against
shared stores or user accounts. The audit report preserves the original findings;
the current statuses and resolution sections below track subsequent fixes.

DEF-002–DEF-005 are owned by Codex on `main`, base `9a2f30b`. Their local
implementation is unfinished and has no fixing commit. See
[work_queue.md](work_queue.md) for remaining response/session guards and final
verification. In progress does not mean Fixed or released. The broader related
stories remain Proposed because this selected defect batch does not deliver their
entire review/progress/access workflow.

### DEF-001 — Any teacher can mutate another teacher's course

- Expected: the user's confirmed policy permits owner teachers and admins only.
- Reproduce: teacher A creates a draft; teacher B sends valid metadata via
  `PATCH /courses/:id` for A's course. The probe returns **200**, not 403.
- Audit cause: `requireCourseCreator` checked role only; course records had no owner ID.
  The same role gate is used for content and media mutations.
- Source: `api/src/server.ts` (`requireCourseCreator` and authoring routes),
  `api/src/course.ts` (course schema).
- Verify fix: US-T001-AC01–AC05; deny every authoring route before storage/Mux calls.
- Resolution implemented on 2026-10-04: authenticated `ownerUserId` on creation,
  immutable general updates, column U persistence, and one owner/admin authorizer
  applied to all seven metadata/content/media routes and their `/api` aliases.
  Blank legacy owners stay admin-only. Draft filtering and editor actions use
  stable IDs; direct forbidden URLs show denial without editable controls.
  Review also reproduced foreign asset deletion through forged references on an
  owned course. New foreign bindings/removals are denied; storage deletion is
  scoped to course ID, including thumbnail replacement and rollback cleanup.
- Regression evidence: [verification record](verification/2026-10-04/DEF-001.md).
  All 111 API and 31 frontend tests pass; API/Pages builds and isolated browser
  owner/unrelated-teacher/admin checks pass. The original tests failed before the fix.
- Fix commit: `a9940ccd9fc13a149b5eb96017c5484796b0012d`
  (`fix(DEF-001): enforce course and media ownership`). Status: **Fixed — resolved
  in code on 2026-10-04**. Required release environment checks:
  disposable Sheets + shared MongoDB roundtrip, followed by hosted role checks.
  No deployment or legacy owner mapping has been performed.

### DEF-002 — General authoring bypasses admin controls

- Expected: admins control publication and pricing, as the existing project guidance
  describes; teachers can author and submit their course for review.
- Reproduce: teacher sends `PATCH /courses/:id` with `status: published` and
  `priceDkk: 1200`. Both changes persist with **200**. The dedicated
  `PATCH /courses/:id/price` returns **403** for the same teacher.
- The teacher editor also offers Published and Archived in its Status select.
  Creation accepts admin-oriented fields in `createCourseSchema` under a role-only gate.
- Source: `api/src/server.ts`, `api/src/course.ts`,
  `app/src/app/pages/course-editor-page/course-editor-page.html`.
- Verify fix: test restricted-field changes on POST/PATCH, not only dedicated routes;
  preserve ordinary teacher saves that echo an unchanged price from the current client.
- Fix commit / verified environment: none / pending.

### DEF-003 — Anonymous API exposes private authoring and assessment data

- Expected: unpublished authoring content is private to its owner/admin; full learning
  content requires the agreed entitlement policy. Public previews need an explicit DTO.
- Reproduce: create a draft with text content. Anonymous `GET /courses` includes its
  metadata; `GET /courses/:id/content` returns the private lesson with **200**.
  A quiz response also includes `answers[].isCorrect` with no authentication.
- Cause: both GET routes return repository data without auth or lifecycle checks.
  Hiding drafts in the Angular catalog does not protect API access.
- Source: `api/src/server.ts` (`GET /courses`, `GET /courses/:id/content`),
  `api/src/courseContent.ts` (quiz DTO).
- Verify fix: anonymous/unrelated teacher/unenrolled learner denial, owner/admin
  preview, enrolled access, and a learner quiz DTO without scoring secrets.
- Product decisions: public preview and archived learner access remain Proposed in US-L001.
- Fix commit / verified environment: none / pending.

### DEF-004 — Enrollment accepts unpublished and archived courses

- Expected: new learner enrollments target published eligible courses.
- Reproduce: student calls `POST /users/me/courses/:id` for a draft; response is
  **200** and its ID is persisted in enrollments. The route also returns **200**
  after the same course is archived.
- Cause: the route checks existence, not publication/eligibility.
- Source: `api/src/server.ts` (enrollment route).
- Verify fix: deny draft/review/archived new enrollment; repeated published enrollment
  remains idempotent. Existing enrollment access after archival needs a product decision.
- Fix commit / verified environment: none / pending.

### DEF-005 — An impossible quiz can be published

- Expected: a published assessment has an answerable question and attainable pass mark.
- Reproduce: save one question worth one point, four answers all marked false, and
  `passPoints: 2`. Content save returns **200**; publishing also returns **200**.
- Cause: Zod validates individual fields but not scoring relationships or a publishing
  readiness checklist. Saving incomplete draft content alone is not the defect.
- Source: `api/src/courseContent.ts`, `api/src/server.ts` (content save and status update),
  `app/src/app/pages/course-view-page/course-view-page.ts` (client scoring).
- Verify fix: incomplete drafts remain editable; review/publication rejects impossible
  scoring with useful question-level feedback. Valid quizzes can be passed.
- Fix commit / verified environment: none / pending.

### DEF-006 — Editor navigation discards unsaved work

- Expected proposed contract: warn before abandoning changed metadata or outline,
  and preserve the draft when the user chooses to stay. Recovery scope is US-T003.
- Reproduce: change an existing course title without saving; use Catalog; reopen
  the editor. Navigation is immediate with no discard prompt and the original title returns.
- Cause: routes have no `canDeactivate` guard; Cancel/navigation methods move directly,
  and `syncCourseEditorDraftFromPath` resets metadata from the stored course.
- Source: `app/src/app/app.routes.ts`,
  `app/src/app/services/app-state.service.ts` (`cancelCreateCourse`, draft synchronization).
- Verify fix: links, Cancel, browser back, unchanged drafts, and failed saves; test
  refresh recovery separately only if selected in US-T003.
- Fix commit / verified environment: none / pending.

### DEF-007 — My Learning progress remains 0 percent

- Expected: library progress agrees with the learning workspace for the same course.
- Reproduce: enroll in a local course with one text component; complete it in the
  workspace; return to My Learning. Workspace completion changes; library stays **0%**.
- Cause: `library-page.html` renders literal `<strong>0%</strong>`, while the workspace
  stores completed component IDs in localStorage under an account/course key.
- Source: `app/src/app/pages/library-page/library-page.html`,
  `app/src/app/pages/course-view-page/course-view-page.ts`.
- Verify fix: a two-component course shows 50% after one completion in both views;
  completion and persistence rules are to be selected in US-L002.
- Fix commit / verified environment: none / pending.
- Reconfirmed 2026-10-05: complete the text and pass/finish the quiz in an isolated
  two-component enrolled course; both IDs are in browser completion storage, but
  My Learning still shows 0%. [Evidence](audits/2026-10-05/career-library-after-completion.png).

### DEF-008 — Request errors become HTTP 500

- Expected: malformed JSON returns 400 and a file over the documented limit returns 413.
- Reproduce: POST `{` as JSON to `/auth/login`; result is **500**. Upload a buffer of
  `2 * 1024 * 1024 + 1` bytes to the thumbnail route; result is also **500**.
- Cause: body-parser provides status 400/413, but the final error middleware only
  recognizes `ZodError` and maps everything else to generic 500.
- Source: `api/src/server.ts` (raw/json parsers and final error middleware).
- Verify fix: malformed JSON, oversized thumbnail/attachment, unsupported MIME, invalid
  Zod fields, and unexpected exceptions have appropriate safe JSON responses.
- Fix commit / verified environment: none / pending.

### DEF-009 — Dashboard account activity is synthetic

- Expected: signed-in account progress and next steps reflect actual learning data
  or a clearly labeled empty state.
- Reproduce: log in as an unenrolled demo user. Home shows ISTQB activity and 62%
  progress, while My Learning has no courses. These fixtures are not labeled as demo activity.
- Cause: `courses`, `nextActions`, and role-based path progress are hardcoded in
  `AppStateService`, independently of actual enrollments and completion.
- Source: `app/src/app/services/app-state.service.ts`, dashboard route/page components.
- Verify fix: accounts with no activity show an honest empty state; actual enrollment
  and completion update Home and My Learning consistently.
- Fix commit / verified environment: none / pending.
- Career path audit, 2026-10-05: a newly signed-up, unenrolled local account shows
  38% career progress, 62% active-course progress, and a completed Chapter 3.
  Its library is empty. An existing learner completing both real test components
  also leaves Home unchanged. The target career role is assigned from permission
  role, not the saved profile goal. [Audit and captures](audits/2026-10-05/career_path_audit.md).

### DEF-010 — Direct learning URL does not restore course metadata

- Expected: an enrolled user's direct learning URL works after session restoration.
- Reproduce: enroll locally; load `/library/:id` directly or refresh it. The page
  shows **Course not found**. Navigate to `/library`, then select the same course;
  its workspace loads successfully.
- Cause: `loadCoursesWhenNeeded` allows `/courses...` or exact `/library`, excluding
  `/library/:id`. On a fresh page, `selectedCourse` has no catalog metadata to resolve.
- Source: `app/src/app/services/app-state.service.ts` (`loadCoursesWhenNeeded`,
  `selectedCourse`), `app/src/app/app.routes.ts`.
- Verify fix: direct URL, refresh, expired session, missing course, and unauthorized
  course; preserve the correct loading state until restoration completes.
- Fix commit / verified environment: none / pending.

### DEF-011 — Feature controls silently do nothing

- Expected: visible enabled controls perform an action or explain unavailable behavior.
- Reproduce: click Q&A/Notes in the workspace; Overview stays selected and no view
  changes. Home's Adjust track is also displayed without an event binding.
- Cause: these buttons have no handlers or target views in their templates.
- Source: `app/src/app/pages/course-view-page/course-view-page.html` (learning tabs),
  `app/src/app/pages/dashboard-page/dashboard-page.html` (Adjust track).
- Verify fix: implement the agreed feature contract or hide/disable the unfinished
  control with clear context; verify pointer and keyboard behavior.
- Fix commit / verified environment: none / pending.
- Reconfirmed 2026-10-05: activating Adjust track leaves `/` and its content
  unchanged with no dialog; the dashboard template still has no event binding.
  Full path selection/switching is Proposed in US-L009/US-L011, separate from
  correcting the misleading enabled control.

### DEF-014 — Quiz completion indicator counts position as completed work

- Severity/state: P2 / Open. Discovered: 2026-10-05. Owner: unassigned.
- Tested: `main`, base `9a2f30b` plus uncommitted DEF-002–DEF-005 work; isolated
  Angular browser and in-memory API, no shared stores.
- Expected contract: question position is distinct from completed assessment work
  (Proposed US-L002-AC04); an untouched attempt must not claim completion.
- Reproduce: enroll in a test course containing a one-question quiz; open that
  quiz without selecting or submitting an answer. Header reads Question 1 of 1
  and **100% complete**; its progressbar accessibility value is also 100.
- Actual cause: `activeQuizProgressPercent` calculates `(questionIndex + 1) /
  questionCount`, while the template labels that value as completion. Selecting
  the last question yields 100% independently of submission or passing.
- Impact: learners see completed-work language before doing the assessment;
  assistive output repeats the misleading value. This does not by itself prove
  that a quiz lesson has been marked passed; that is a separate rule.
- Source: `app/src/app/pages/course-view-page/course-view-page.ts`
  (`activeQuizProgressPercent`) and its template's quiz topbar/progressbar.
- Related story: US-L002-AC04. Spec: pending selection of a narrow labeling versus
  attempt-progress contract; do not silently expand grading behavior.
- Regression check: untouched one- and multi-question quizzes, final-question
  navigation, skipped questions, failed/pass outcomes, and text/accessibility values.
  Renaming a position indicator is a valid small fix if it clearly identifies
  position and never claims completion; real completion must use an agreed rule.
- Evidence: [career path audit](audits/2026-10-05/career_path_audit.md) and
  [untouched quiz capture](audits/2026-10-05/career-quiz-before-answer.png).
- Fix commit/date: none. Verification: reproduced locally; fix checks pending.

## Existing reported defects, not yet reproduced

| ID | Report | Severity | State | Required reproduction | Story |
| --- | --- | --- | --- | --- | --- |
| DEF-012 | [GitHub #42](https://github.com/Stormeal/qi-education/issues/42): incorrect Uncategorized on populated courses | P2 provisional | Investigating | Matching test sheet row, API DTO, list card, category filter | US-L008 |
| DEF-013 | [GitHub #44](https://github.com/Stormeal/qi-education/issues/44): badges obscured by two-line course titles | P3 provisional | Investigating | Matching title, badges, card, and desktop/mobile viewport | US-L008 |

Imported on 2026-10-04 to preserve existing work. Neither report is declared
reproduced, fixed, or obsolete based only on an issue description.

## Investigations requiring further evidence

| ID | Concern and code evidence | Next verification | Related story |
| --- | --- | --- | --- |
| INV-001 | Full-document saves lack revision checks; metadata and content save sequentially | Controlled concurrent saves and a storage failure after metadata success | US-T005 |
| INV-002 | Mux removal detaches the component; service exposes no provider deletion. Signed policy config exists but playback token flow is absent | Mock lifecycle probes, then isolated real Mux upload/removal/signed playback | US-T006 |
| INV-003 | Signup checks email then appends; Sheets enrollment reads then rewrites a user row. No atomic uniqueness/update protection is evident | Concurrent operations against a dedicated test spreadsheet | US-P003 |
| INV-004 | Feedback triage creates an issue before persisting the link | Fail persistence after stub issue creation, retry, and inspect duplicates | US-P003 |

Do not describe these as reproduced live-service incidents. If reproduced, create
the next DEF ID, retain the investigation link, and document concrete evidence.

## New defect record

Include the next unused DEF ID, title, severity, state, discovery date, tested
commit/environment, expected behavior and its contract/source, actual behavior,
minimal reproduction, impact, source location/root cause if verified, related
story/spec, regression check, fixing commit, and verification outcome. Use
Investigating when the observation is not yet confirmed. Keep resolved records
for traceability rather than deleting or reusing IDs.
