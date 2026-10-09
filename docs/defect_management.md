# Defect management

Updated: 2026-10-09. Original audit baseline: `6e19213` on `main`.
Evidence: [audit report](audits/2026-10-04/application_audit.md) and
[isolated API probe](audits/2026-10-04/reproduce-api.mjs).
Career path follow-up: [2026-10-05 audit](audits/2026-10-05/career_path_audit.md),
base `9a2f30b` plus preserved, unfinished lifecycle changes.
Code audit: [2026-10-09](audits/2026-10-09/code_audit.md), tree `96e9ff9` plus
the US-T002 changes delivered in `86196cf`; investigations INV-005–INV-018.

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
| DEF-002 | General authoring routes bypass admin pricing/publication restrictions | P1 | Fixed | Resolved 2026-10-07 in `a6767f6`; batch regression checks pass | US-T002 |
| DEF-003 | Anonymous API exposes drafts, full lessons, and quiz answer flags | P1 | Fixed | Resolved 2026-10-07 in `a6767f6`; batch regression checks pass | US-T002, US-L001 |
| DEF-004 | Enrollment accepts unpublished/archived courses | P1 | Fixed | Resolved 2026-10-07 in `a6767f6`; batch regression checks pass | US-L001 |
| DEF-005 | An impossible quiz can be saved and published | P2 | Fixed | Resolved 2026-10-08 in `3feeea4`; LC-05 regression/browser checks pass | US-T004 |
| DEF-006 | Leaving the course editor silently discards unsaved changes | P2 | Fixed | Resolved 2026-10-08 in `3feeea4`; warnings-only NW-01–05 checks pass | US-T003 |
| DEF-007 | Library progress is hardcoded to 0 percent | P2 | Fixed | Resolved 2026-10-09 in `6729b74`; LP-01-05 regression/browser checks pass | US-L002 |
| DEF-008 | Malformed JSON and oversized uploads become HTTP 500 | P2 | Fixed | Resolved 2026-10-09 in `79c2ea5`; RD-01-03 pass | US-P002 |
| DEF-009 | Dashboard presents fixture activity as account progress | P2 | Fixed | Resolved 2026-10-09 in `6729b74`; LP-01-05 regression/browser checks pass | US-L002 |
| DEF-010 | Direct learning URL/refresh falsely reports course missing | P2 | Fixed | Runtime fix `a6767f6`; DL-01–04 verified 2026-10-08 in `3feeea4` | US-L001 |
| DEF-011 | Adjust track, Q&A, and Notes controls have no action | P3 | Fixed | Resolved 2026-10-09 in `79c2ea5`; RD-04 pass | US-L005 |
| DEF-012 | Published catalog categories are missing in stored metadata | P2 | Fixed | Approved data repair verified 2026-10-09; record `79c2ea5` | US-L008 |
| DEF-013 | Catalog titles/badges are clipped at responsive widths | P3 | Fixed | Resolved 2026-10-09 in `79c2ea5`; RD-06 pass | US-L008 |
| DEF-014 | Quiz completion indicator counts question position as completed work | P2 | Fixed | Resolved 2026-10-09 in `6729b74`; LP-01-05 regression/browser checks pass | US-L002 |
| DEF-015 | A stale authoring save silently replaces newer course work | P2 | Fixed | Resolved 2026-10-09 in `d674ee3`; stale/race/partial-save regressions and browser checks pass | US-T005 |

Most findings were reproduced in isolated local/code checks. DEF-012 was
confirmed by read-only inspection of shared course metadata and corrected only
after explicit user approval. Other shared/provider release checks remain pending. The audit report preserves the original findings;
the current statuses and resolution sections below track subsequent fixes.

DEF-002, DEF-003, DEF-004 resumed on `main` at `ff3d68a` in the first batch of
three. Resolved in local code on 2026-10-07 in `a6767f6`; verification passed. DEF-005,
DEF-006 and DEF-010 were delivered locally on 2026-10-08 in `3feeea4`, base `159f45b`.
All three are Fixed (resolved in code). This batch's
[verification](verification/2026-10-08/DEF-005-006-010.md) records the selected
contracts, original reproductions, regressions and release limitations. Local
recovery and broader career/access workflows are outside this delivery.

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
- Resolution implemented 2026-10-07: teachers create drafts with default admin fields;
  only admins change pricing, publication, archival, and catalog fields. General
  saves preserve omitted or unchanged restricted values. Teacher Status offers
  draft/review transitions; published/archived status is read-only for teachers.
  Per-course coordination prevents an overlapping teacher save undoing admin state.
- Regression evidence: [batch verification](verification/2026-10-07/DEF-002-004.md),
  LC-01/02 and isolated teacher/admin UI. Status: **Fixed — resolved in code**.
  Fix commit: `a6767f69e5254e01a47ca33b58dabe34925ea586`. Shared release checks pending.

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
- Resolution implemented 2026-10-07: catalog/media/outline/content use one lifecycle
  access policy. Public preview returns titles/types/duration; full lessons and
  resources require entitlement. Learner quizzes omit correctness/explanations;
  owner/admin author preview is explicit. The API grades stored answers and returns
  submitted-answer feedback. Private responses are no-store; private thumbnail
  blobs are revoked on logout. Session/view guards discard late reads, saves,
  uploads, progress events, polling and stale 401s; updated enrollment/restoration
  restarts loaders, including refreshed/downgraded roles.
- Review reproductions: transient reads could quarantine a course, acquisition
  could wait indefinitely, old 401s could end a new session, and thumbnail cleanup
  after confirmed metadata save could delete its new referenced asset. Provider
  write boundaries, bounded lock acquisition, session-aware 401 handling, and
  cleanup outside rollback now cover these failure cases. See regression evidence.
- Regression evidence: [batch verification](verification/2026-10-07/DEF-002-004.md),
  LC-03/06, role/alias matrix and connected learner/browser checks.
  Status: **Fixed — resolved in code**. Fix commit: `a6767f69e5254e01a47ca33b58dabe34925ea586`.
  Live Mongo/Sheets/Mux and hosted release checks pending.

### DEF-004 — Enrollment accepts unpublished and archived courses

- Expected: new learner enrollments target published eligible courses.
- Reproduce: student calls `POST /users/me/courses/:id` for a draft; response is
  **200** and its ID is persisted in enrollments. The route also returns **200**
  after the same course is archived.
- Cause: the route checks existence, not publication/eligibility.
- Source: `api/src/server.ts` (enrollment route).
- Verify fix: deny draft/review/archived new enrollment; repeated published enrollment
  remains idempotent. Existing enrollment access after archival needs a product decision.
- Resolution implemented 2026-10-07: new enrollment requires published status; other
  statuses return 403 before a write. Repeated published enrollment remains
  idempotent. Existing archived learners retain access under the recorded working
  default; archived courses do not permit new enrollment.
- Regression evidence: [batch verification](verification/2026-10-07/DEF-002-004.md),
  LC-04 and isolated enrollment/learning UI. Status: **Fixed — resolved in code**.
  Fix commit: `a6767f69e5254e01a47ca33b58dabe34925ea586`. Shared release checks pending.

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
- Resolution implemented 2026-10-08: incomplete draft quizzes remain editable;
  review/publication and reviewed/published/archived replacement validate question
  text, four answer texts, exactly one correct option, and attainable pass marks.
  All content saves reject ambiguous IDs. Combined draft outline/review saves write
  content first; serialized API validation reads that current stored content.
- Regression evidence: LC-05 in `courseLifecycle.test.ts`, submission-order UI test,
  and [batch verification](verification/2026-10-08/DEF-005-006-010.md). Five API and
  one frontend reproduction failed before implementation; corrected quiz review
  now succeeds in the isolated browser. API 196/frontend 82 checks pass.
- Status: **Fixed — resolved in code**, 2026-10-08.
  Fix commit: `3feeea4de8d056ba1e88789103a280df52c5d2f0`.
  Shared-store and hosted release checks remain
  pending; invalid legacy published quizzes still need author/admin correction.

### DEF-006 — Editor navigation discards unsaved work

- Expected contract: warn before abandoning changed metadata or outline,
  and preserve the draft when the user chooses to stay. Recovery scope is US-T003.
- Reproduce: change an existing course title without saving; use Catalog; reopen
  the editor. Navigation is immediate with no discard prompt and the original title returns.
- Cause: routes have no `canDeactivate` guard; Cancel/navigation methods move directly,
  and `syncCourseEditorDraftFromPath` resets metadata from the stored course.
- Source: `app/src/app/app.routes.ts`,
  `app/src/app/services/app-state.service.ts` (`cancelCreateCourse`, draft synchronization).
- Verify fix: links, Cancel, browser back, unchanged drafts, and failed saves; test
  refresh recovery separately only if selected in US-T003.
- User confirmed warnings only for the DEF-006 batch on 2026-10-08. That fix remains
  preserved. Local recovery was separately selected and delivered under US-T003
  on 2026-10-09 in `d674ee3`; see its spec and verification.
- Resolution implemented 2026-10-08: real router guards and beforeunload warning
  compare saved metadata/outline snapshots and focused editor buffers. Declining
  departure preserves edits; unchanged/reverted/saved editors do not warn. Draft
  initialization runs once per path before thumbnail warmup; successful partial
  metadata saves update their snapshot. Voluntary logout respects Stay; expired
  sessions clear private state without a prompt.
- Regression evidence: NW-01–05 in `course-navigation.spec.ts`, including focused
  lesson/section edits, Markdown no-change, failed/partial saves, delayed loading,
  editor-ID changes and listener cleanup. Original navigation and review-found
  edge cases reproduced before fixes. [Browser/check evidence](verification/2026-10-08/DEF-005-006-010.md).
- Status: **Fixed — resolved in code**, 2026-10-08.
  Fix commit: `3feeea4de8d056ba1e88789103a280df52c5d2f0`.
  Hosted/browser release checks remain pending. Recovery was delivered separately
  under US-T003 in `d674ee3` on 2026-10-09.

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
- Reconfirmed 2026-10-05: complete the text and pass/finish the quiz in an isolated
  two-component enrolled course; both IDs are in browser completion storage, but
  My Learning still shows 0%. [Evidence](audits/2026-10-05/career-library-after-completion.png).

- Resolution implemented 2026-10-09: shared LearningProgressService uses existing
  account/course keys and current outline IDs for workspace, library and Home.
  Duplicate/stale IDs cannot inflate progress; 100% requires every current lesson.
  Pending/error outlines show loading/unavailable with retry. Session-only values
  survive navigation if persistence fails. Same-browser resume remains supported.
- Regression evidence: LP-01/02/04 in `learning-progress.spec.ts` and
  [isolated browser/check record](verification/2026-10-09/DEF-007-009-014.md).
  Original 0% rendering reproduced before the fix. 98 frontend/196 API tests pass.
- Status: **Fixed - resolved in code**, 2026-10-09. Owner: Codex.
  Fix commit: `6729b740e4b421b015ad9d1b97af1b44749f9707`. Hosted browser/storage checks remain release work;
  cross-device completion remains Proposed.

### DEF-008 — Request errors become HTTP 500

- Expected: malformed JSON returns 400 and a file over the documented limit returns 413.
- Reproduce: POST `{` as JSON to `/auth/login`; result is **500**. Upload a buffer of
  `2 * 1024 * 1024 + 1` bytes to the thumbnail route; result is also **500**.
- Cause: body-parser provides status 400/413, but the final error middleware only
  recognizes `ZodError` and maps everything else to generic 500.
- Source: `api/src/server.ts` (raw/json parsers and final error middleware).
- Verify fix: malformed JSON, oversized thumbnail/attachment, unsupported MIME, invalid
  Zod fields, and unexpected exceptions have appropriate safe JSON responses.
- Implementation checked 2026-10-09: JSON/raw parser callbacks return safe
  400/413/415 messages. Unsupported thumbnail MIME returns 415 before checking
  missing bytes. Application/storage exceptions retain generic 500 even with
  parser-like fields; Zod retains compatible 400/issues responses.
- Regression evidence: RD-01-03 in `requestErrors.test.ts`; malformed JSON,
  oversized JSON/thumbnail/attachment and aliases, MIME, gzip/charset/encoding,
  validation, application errors, and rejected-upload preservation checks pass.
  [Verification](verification/2026-10-09/remaining-defects.md). Status: **Fixed - resolved in code**, 2026-10-09. Owner: Codex.
  Fix commit: `79c2ea5fd2721594f4b1f2c603982d80ef909bce`. Hosted/provider release checks remain separate.

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
- Career path audit, 2026-10-05: a newly signed-up, unenrolled local account shows
  38% career progress, 62% active-course progress, and a completed Chapter 3.
  Its library is empty. An existing learner completing both real test components
  also leaves Home unchanged. The target career role is assigned from permission
  role, not the saved profile goal. [Audit and captures](audits/2026-10-05/career_path_audit.md).

- Resolution implemented 2026-10-09: Home renders actual enrolled course titles,
  shared completion, next incomplete lesson and real learning links. Empty accounts
  receive Browse courses. Catalog/outline failures have honest states and retry.
  Fictional chapters, role-derived career percentages and claimed matched
  recommendations have been removed. Career progress is explicitly unavailable.
- Regression evidence: LP-01/03/04; original empty-account fixture rendering failed
  before implementation. [Verification](verification/2026-10-09/DEF-007-009-014.md)
  includes learner completion, another account, refresh and Browse courses.
- Status: **Fixed - resolved in code**, 2026-10-09. Owner: Codex.
  Fix commit: `6729b740e4b421b015ad9d1b97af1b44749f9707`. Hosted checks remain release work; broader career
  selection/progress features remain Proposed.

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
- Resolution verified in the selected 2026-10-08 batch: `a6767f6` already widened
  catalog loading to nested library routes and restarted private loaders after
  restoration. The original failure no longer reproduces; no extra runtime change
  was necessary. Six dedicated real-router tests cover deferred session/catalog/
  content lookup, missing data, API errors, expired sessions and restored enrollment.
- Runtime fix commit: `a6767f69e5254e01a47ca33b58dabe34925ea586` (2026-10-07).
  Status: **Fixed — resolved in code**; dedicated verification completed 2026-10-08.
  Regression/browser delivery commit: `3feeea4de8d056ba1e88789103a280df52c5d2f0`. Evidence:
  [DL-01–04](verification/2026-10-08/DEF-005-006-010.md). Hosted URLs and live shared
  storage remain release checks; local verification does not imply deployment.

### DEF-011 — Feature controls silently do nothing

- Expected: visible enabled controls perform an action or explain unavailable behavior.
- Reproduce: click Q&A/Notes in the workspace; Overview stays selected and no view
  changes. Home's Adjust track is also displayed without an event binding.
- Cause: these buttons have no handlers or target views in their templates.
- Source: `app/src/app/pages/course-view-page/course-view-page.html` (learning tabs),
  `app/src/app/pages/dashboard-page/dashboard-page.html` (Adjust track).
- Verify fix: implement the agreed feature contract or hide/disable the unfinished
  control with clear context; verify pointer and keyboard behavior.
- Implementation checked 2026-10-09: unfinished controls are hidden under the
  stated default; the optional presentation preference had no reply before work.
  The fake Overview button is removed; course overview content remains readable.
  Full track/Q&A/Notes features remain Proposed, rather than being implemented
  as part of this defect fix.
- Regression evidence: two real-router regressions failed before removal, then
  passed. Isolated pointer/keyboard navigation, overview and quiz entry pass.
  RD-04 [verification](verification/2026-10-09/remaining-defects.md).
  Status: **Fixed - resolved in code**, 2026-10-09. Owner: Codex.
  Fix commit: `79c2ea5fd2721594f4b1f2c603982d80ef909bce`. Hosted/provider release checks remain separate.
- Reconfirmed 2026-10-05: activating Adjust track leaves `/` and its content
  unchanged with no dialog; the dashboard template still has no event binding.
  Full path selection/switching is Proposed in US-L009/US-L011, separate from
  correcting the misleading enabled control.

### DEF-014 — Quiz completion indicator counts position as completed work

- Severity/state: P2 / Fixed. Discovered: 2026-10-05. Owner: Codex.
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
- Related story: US-L002-AC04. Selected contract: LP-05 in
  [the local progress spec](specs/DEF-007-009-014-learning-progress.md); position
  labeling is delivered without expanding grading behavior.
- Regression check: untouched one- and multi-question quizzes, final-question
  navigation, skipped questions, failed/pass outcomes, and text/accessibility values.
  Renaming a position indicator is a valid small fix if it clearly identifies
  position and never claims completion; real completion must use an agreed rule.
- Evidence: [career path audit](audits/2026-10-05/career_path_audit.md) and
  [untouched quiz capture](audits/2026-10-05/career-quiz-before-answer.png).

- Resolution implemented 2026-10-09: percentage describes position through questions,
  with Question position and Question X of Y accessible text. It does not claim
  assessment completion. Existing trusted server scoring/Finish rules remain intact.
- Regression evidence: LP-05 in route/page tests covers untouched one-question and
  final multi-question position, skipped answers, failure, retry and passing.
  [Browser evidence](verification/2026-10-09/DEF-007-009-014.md) shows 50% course
  progress through a failed quiz, and 100% only after successful completion.
- Status: **Fixed - resolved in code**, 2026-10-09. Owner: Codex.
  Fix commit: `6729b740e4b421b015ad9d1b97af1b44749f9707`. Hosted accessibility/browser checks remain release work.

## Imported reports and reproduced follow-up

DEF-012 and DEF-013 were imported as Investigating on 2026-10-04 from existing
GitHub reports. They were not treated as fixed or obsolete from descriptions
alone. The following reproduction and resolution records supersede that initial
state, preserving the report links and the actual verified cause.

### DEF-012 - Catalog category fallback despite populated course fields

- Original report: [GitHub #42](https://github.com/Stormeal/qi-education/issues/42),
  Uncategorized on populated list cards. Initial severity P2 provisional;
  confirmed as a P2 catalog data defect on 2026-10-09.
- Expected: a valid category explicitly stored in column S survives repository,
  API, card and category filter. Other populated fields do not imply a category.
- Reproduction: read-only shared-sheet inspection at `797d55c` found all seven
  published rows with blank category or already Uncategorized. Their mapper/DTO
  faithfully retained the fallback. Isolated full row fixtures with API Testing
  correctly traverse repository/API/card/filter; no category mapping code bug
  was reproduced. No source record/viewport was identified in the original issue.
- Cause: missing/unassigned course category metadata, rather than a valid stored
  category being lost. Source: course sheet column S; `courseFromSheetRow`.
- Resolution applied 2026-10-09 with explicit user approval: Foundation/Advanced
  Test Analyst -> Software Testing; Test Automation Engineer, both Playwright
  courses and Leapwork -> Automation Testing; Fundamental Postman -> API Testing.
  Only seven category cells changed. Old values were backed up; every other sheet
  value and header remained unchanged. Hosted API read returns corrected labels.
- Evidence: [approved correction](verification/2026-10-09/DEF-012-category-correction.md),
  before/after values, fresh zero-change dry-run and RD-05 connected regressions
  in [batch verification](verification/2026-10-09/remaining-defects.md).
  Nine isolated script safety checks and category API/card/filter checks pass.
- Status: **Fixed - approved data correction applied and verified**, 2026-10-09.
  Owner: Codex. Delivery record/script commit: `79c2ea5fd2721594f4b1f2c603982d80ef909bce`.
  No application push/deployment.
  Hosted frontend refresh/filter verification remains a release check.
  Preventive category publication guidance is Proposed in US-A002.

### DEF-013 - Wrapping catalog titles and badges are clipped

- Original report: [GitHub #44](https://github.com/Stormeal/qi-education/issues/44),
  pills almost hidden with two-line titles. Initial P3 provisional;
  reproduced as a P3 catalog layout defect on 2026-10-09.
- Expected: complete titles, all badges and price remain readable without clipping
  or overlap on featured/list cards at desktop/mobile widths (US-L008-AC02).
- Reproduction: isolated fixtures at base `797d55c`, 1440/390 px, show truncated
  featured titles and horizontally clipped rating/category/level pills. The
  rendered 390 px check reports six failures. Representative two/multi-line and
  unbroken titles were used because the issue lacks the historical record/viewport.
- Cause: featured cards/carousel use fixed height and clamped titles; badge rows
  do not wrap and hide their scrollbar. Long unbroken list titles can overflow.
  Source: `courses-page.scss`, featured and list card templates.
- Implementation checked 2026-10-09: content-sized cards, full wrapping titles,
  and wrapping badge rows keep all metadata inside the card. Existing carousel
  controls and visual styling remain in place.
- Regression evidence: read-only rendered browser check fails before the fix;
  passes at 320/390/860/980/1200/1210/1440 px afterward. Two-line title, carousel
  pointer-next/keyboard-previous and category/detail navigation checks pass.
  [Screenshots and verification](verification/2026-10-09/remaining-defects.md), RD-06.
- Status: **Fixed - resolved in code**, 2026-10-09. Owner: Codex.
  Fix commit: `79c2ea5fd2721594f4b1f2c603982d80ef909bce`.
  Hosted responsive/browser checks remain release work.

## US-T002 lifecycle follow-up

Verified 2026-10-09. Delivery commit: `86196cfc088e32bed99a9435b0d3f31739b646a4`. DEF-002, DEF-003 and DEF-005 remain
**Fixed — resolved in code** with their original fix dates/commits and evidence.
US-T002 replaces the earlier Status selector/direct admin status changes with
explicit revision/submission/admin decision actions. Submitted snapshots are
frozen; returned feedback and all decisions persist; working edits cannot withdraw
or modify live learner content. General creation/update cannot bypass review.
Existing pricing/catalog permissions, learner privacy and quiz-readiness gates
retain regression coverage under both API prefixes. Live resources remain usable
for enrolled learners and authorized authors during revision. See
[US-T002 verification](verification/2026-10-09/US-T002.md). Shared provider and
hosted release checks remain separate; no push/deployment for this delivery.

## US-T005 reliable-save follow-up

### DEF-015 — Stale authoring overwrite

- Reproduced 2026-10-09 on `5211365`, explicit in-memory repositories only.
- Load owner-author snapshot version 0 in two sessions. Save a newer title,
  then submit the old full metadata with a different title from the stale session.
- Actual: both PATCHes return 200; stale title replaces newer title, version 2.
- Expected: stale request conflicts, preserving newer stored work and local draft.
- Related: INV-001 is reproduced and resolved by this record.
- Resolution: Fixed 2026-10-09 in `d674ee3a24c487923ca8f8586afefb27bd191753`. Full metadata and
  outline saves require the loaded revision inside the per-course lock. Stale writes
  return 409; missing/malformed revisions return 428. Successful writes acknowledge
  the new version. The first legacy save writes data/version together so provider
  failure cannot change data under an unchanged token. Local drafts survive conflicts
  and partial saves; retries use the last acknowledged version.
- Regression evidence: `courseSave.test.ts` tests both API prefixes, stale metadata
  and outlines, simultaneous writers, missing versions, partial failure/retry and
  a peer freezing a revision. `course-save.spec.ts` covers local retention,
  reconciliation, partial outcomes and media refresh/busy guards. 276 API/122
  frontend tests and all builds pass; isolated browser recovery, two-editor conflict,
  latest preview and reconciled save pass. [Verification](verification/2026-10-09/US-T003-T005.md).
- Release checks: hosted MongoDB coordination/failure behavior, Sheets composition,
  Mux/media processing and accepted native refresh in supported browsers remain
  separate. No shared-provider mutation probes were run. Fixed means resolved in code.

## Investigations requiring further evidence

### Confirmed API class-load defects (Codex, 2026-10-09)

Baseline: main / f8d4c2f. Isolated HTTP/in-memory stores and counting Google API
stub; no shared mutations. `platformLoad.test.ts` contains five RED regressions.

| Defect | Promoted investigation | Reproduction | State |
| --- | --- | --- | --- |
| DEF-P006-01 | INV-005 | Distinct client per call; me 3, catalog 4, outline/content/thumbnail/quiz 5 Sheets reads | Fixed P1 |
| DEF-P006-02 | INV-007 | Only 1 of 20 readers enters while first content read is paused | Fixed P1 |
| DEF-P006-03 | INV-011 | Catalog of 50 seeded courses plus demo performs 51 full content reads | Fixed P2 |
| DEF-P006-04 | INV-012 | Saving ten 4 MiB attachment references fetches 41,943,040 binary bytes | Fixed P2 |

Contract/final evidence: [US-P006 spec](specs/US-P006-class-load.md).
Provider quota exhaustion is not reproduced by these isolated counts; disposable
Sheets load and hosted Mongo verification remain release checks. Fixed 2026-10-09
in `67ec9f2a8da47c31a835ff1ffc430087520ab7a2`: shared client, 1/2 reads per route,
concurrent readers, batched review metadata and asset-owner projections. Independent
review's author snapshot/save-token race is covered by a RED-to-GREEN regression.
319 API / 128 frontend tests, six journey checks and both builds pass locally.
Fixed means resolved in code; no deployment or hosted quota verification.

### DEF-P007-EDITOR — Stored lesson markup could run script in the course editor

Promoted from INV-008, P1. Fixed 2026-10-09 in `9f4cb68` (Claude Code). Reproduction, cause,
fix and browser evidence: [editor markup spec](specs/US-P007-editor-markup.md). The API still
stores author HTML unfiltered; the editor and learner views are the enforcement points.

### DEF-P007-SHEETS — Spreadsheet text becomes formula/number

Promoted INV-009, 2026-10-09, owner Codex, P1 Fixed. Isolated Sheets emulator
through real auth/course/feedback repositories: `=1+1` reads back as `2`; `007`
as `7`; `+01` and `-01` lose their formatting. Reproduced all nine data write
paths (audit said eight) with `spreadsheetText.test.ts` before the mode change.
No shared cell mutations. Contract: [spreadsheet text](specs/US-P007-spreadsheet-text.md).
Live provider round trips remain a disposable spreadsheet release check.
Resolution: nine RAW data writes in `67ec9f2a8da47c31a835ff1ffc430087520ab7a2`;
five RED-to-GREEN round-trip cases, 319 API / 128 frontend tests and all builds pass.
No historical shared cells repaired; not yet hosted-Verified.

### DEF-P005-LOCK — Interrupted mutation leaves permanent ownership

Promoted INV-006, 2026-10-09, owner Codex, P1 Fixed. Fake collection/clock:
a Sheets 429 wrapped as an uncertain write retains its owner; even after 31
minutes, the next mutation times out with 409. A simulated killed legacy owner
behaves the same. `lockRecovery.test.ts` reproduced both before implementation.
Alex approved bounded expiry beyond the host maximum. Contract and accepted
remote-write finality risk: [lock recovery](specs/US-P005-lock-recovery.md).
Resolution: 31-minute owner/timestamp-scoped reclaim in
`67ec9f2a8da47c31a835ff1ffc430087520ab7a2`. Eight expiry/race/malformed timestamp
regressions and existing lock/lifecycle suites pass; 319 API / 128 frontend tests
and all builds pass. Young/uncertain owners remain held until the approved bound.
Hosted clocks, durability and uncertain provider outcomes require release checks.

| ID | Concern and code evidence | Next verification | Related story |
| --- | --- | --- | --- |
| INV-001 | Reproduced as DEF-015; resolved 2026-10-09 in `d674ee3` | Stale/race/partial-failure API regressions and isolated browser pass; shared release checks remain | US-T005 |
| INV-002 | Confirmed with isolated route/SDK stubs: removal never calls provider cleanup; signed configuration is accepted without token flow | Promoted to DEF-T006-CLEANUP and DEF-T006-PUBLIC; live rehearsal remains separate | US-T006 |
| INV-003 | Signup checks email then appends; Sheets enrollment reads then rewrites a user row. No atomic uniqueness/update protection is evident | Concurrent operations against a dedicated test spreadsheet | US-P003 |
| INV-004 | Feedback triage creates an issue before persisting the link | Fail persistence after stub issue creation, retry, and inspect duplicates | US-P003 |
| INV-005 | Sheets read volume: `listUsers` runs a two-read header check plus a data read on every authenticated request; course routes list the Courses sheet up to six more times; a new Google client is built per call. Default quota is about 60 reads/minute per service account | Count Sheets calls per route with a counting stub; then load-test a disposable spreadsheet with 5–10 concurrent learners and record 429s | US-P006 |
| INV-006 | A provider write error inside the course lock (including a quota 429 during enrollment) or a terminated function leaves the lock record forever; read routes then return 409 too | Fake-collection test: fail a Sheets write under the lock, then issue a learner read; confirm host max duration to judge whether an expiry longer than it is safe | US-P005 |
| INV-007 | Read routes (thumbnail, outline, content, attachment, quiz attempt) take the exclusive course lock and give up after 5 seconds | 20 concurrent learner reads of one course against isolated stores with realistic Sheets latency; count 409s | US-P006 |
| INV-008 | Course builder assigns stored lesson HTML to `innerHTML` (`course-builder.ts` 509, 780, 822, 1274) outside Angular sanitization; the API stores `content` unfiltered. A teacher-authored payload would run when an admin opens the editor | Isolated stores: save `<img src=x onerror=...>` as a teacher via the API, open the editor as admin, observe execution | US-P007 |
| INV-009 | Sheets appends/updates use `valueInputOption: 'USER_ENTERED'` (8 call sites), so a display name, feedback message, or course field starting with `=` is evaluated as a formula and plain values are coerced | Dedicated test spreadsheet: sign up with display name `=1+1` and `007`; read the stored cells | US-P007 |
| INV-010 | Attachment limit is 25 MB in app and API, above the host's 4.5 MB request/response body limit and MongoDB's 16 MB document limit | Hosted disposable course: upload 5 MB and 17 MB files; record the response and message shown | US-T009 |
| INV-011 | US-T002 code (`86196cf`): `CourseReviewService.list` loads each course's full content document on every course list | Count Mongo reads and bytes for `GET /courses` with 50 seeded courses | US-P006, US-T002 |
| INV-012 | `PATCH /courses/:id/content` fetches every referenced attachment's binary to compare `courseId` | Save a lesson with ten 4 MB attachments; measure bytes read and duration | US-P006 |
| INV-013 | Without Sheets settings the API falls back to in-memory demo users in any environment, including the documented demo admin password | Start with `NODE_ENV=production` and no Google settings; attempt the demo admin login | US-P008 |
| INV-014 | Login and signup accept unlimited attempts; each also consumes Sheets reads | Scripted attempts against a local instance; confirm no throttle and count Sheets calls | US-P008 |
| INV-015 | On localhost the API client retries a failed request against the hosted API, including mutations | Stop the local API, submit signup from the local frontend with the network inspector open; do not complete it against shared data | US-P008 |
| INV-016 | CI event configuration reproduced locally: pull requests only, no push trigger | Main push trigger added under US-P008-AC04; actual GitHub run/host gating unverified (no push authorized) | US-P008 |
| INV-017 | US-T002 code (`86196cf`): status branches in `PATCH /courses/:id` are unreachable because the review service rejects status changes; reviewed title/status live only in MongoDB so the Courses sheet goes stale | Route tests for each legacy status transition; publish a revision and compare the sheet row | US-T002 |
| INV-018 | Course thumbnails are served `Cache-Control: private, no-store` even when the URL carries the asset id as a version | Reload the catalog and count thumbnail transfers | US-P006 |

INV-005–INV-018 come from the [2026-10-09 code audit](audits/2026-10-09/code_audit.md).
They are code readings; none was reproduced. That audit also re-observed INV-002,
INV-003 and INV-004.

Do not describe these as reproduced live-service incidents. If reproduced, create
the next DEF ID, retain the investigation link, and document concrete evidence.

## New defect record

Include the next unused DEF ID, title, severity, state, discovery date, tested
commit/environment, expected behavior and its contract/source, actual behavior,
minimal reproduction, impact, source location/root cause if verified, related
story/spec, regression check, fixing commit, and verification outcome. Use
Investigating when the observation is not yet confirmed. Keep resolved records
for traceability rather than deleting or reusing IDs.


## DEF-T006-CLEANUP � Video removal leaves provider media behind

State: Fixed (resolved in code). Severity: P2. Owner: Codex. Story: US-T006-AC02.
Reproduced 2026-10-09 at `f602307`, isolated in-memory route and fake Mux.
`server.test.ts` removal regression: HTTP 200 detaches the video but provider
calls remain `[]` (expected asset/upload cleanup). No live Mux requests.
Fix: detach first; check both persisted live and working references before
best-effort cleanup. Provider metadata must bind assets/uploads to the course;
404 is already removed. Cleanup failures log course/asset/upload IDs for manual
follow-up and allow removal and re-upload. Pending uploads are cancelled.
Regression: `muxRoutes.test.ts` VO-01/04, `muxService.test.ts` VO-01.
Verified 2026-10-10: API build, 328 API tests, 135 frontend tests, Pages build and all six journeys pass. Delivery: `cb38175`. Live cancellation/deletion races remain
in the rehearsal checklist in the story spec.

## DEF-T006-PUBLIC � Signed playback accepted without tokens

State: Fixed (resolved in code). Severity: P2. Owner: Codex. Story: US-T006-AC01/03.
Reproduced 2026-10-09 at `f602307`: isolated `muxService.test.ts` constructor
accepted signed configuration instead of refusing unsupported playback.
Fix: reject signed configuration before creating the client/API startup; upload
policy stays public. Signed-only ready callbacks produce an actionable error.
Regression: `muxService.test.ts` VO-02 and `muxRoutes.test.ts` VO-02.
Verified 2026-10-10: API build, 328 API tests, 135 frontend tests, Pages build and all six journeys pass. Delivery: `cb38175`. Hosted public playback remains unverified.

## DEF-T006-POLLING � Pending videos stop updating and lack recovery guidance

State: Fixed (resolved in code). Severity: P2. Owner: Codex. Story: US-T006-AC01.
Reproduced 2026-10-09: reopening an isolated pending-video editor made one load,
then no further read after 65 simulated seconds. Panel tests returned only
"Provider failed." for an error and "Processing" after eleven minutes.
Fix: resume pending polls on editor entry, retry transient reads, continue until
terminal/removal/navigation; slow polling after ten minutes. Error/waiting/delay
messages explain removal and re-upload. Ten-minute age uses the first observed
pending timestamp (persisted content update time on reopen); unrelated earlier
saves can delay the warning, since media has no separate persisted start time.
Regression: `course-media.spec.ts`, `course-builder-video.spec.ts` VO-03.
Verified 2026-10-10: API build, 328 API tests, 135 frontend tests, Pages build and all six journeys pass. Delivery: `cb38175`. Real upload/transcoding behavior unverified.


## DEF-T006-UPLOAD-FAILURE � Provider outage returns an opaque write error

State: Fixed (resolved in code). Severity: P2. Owner: Codex.
Story: US-T006-AC03. Reproduced 2026-10-10 with an isolated route stub:
provider upload creation failure returns 500 instead of actionable 503.
The provider call was also classified as an uncertain course write even though
course content had not been written. No real provider call was made.
Fix: return 503 with saved-draft/retry guidance and release the course lock;
actual course persistence retains its existing uncertain-write protections.
Provider creation may have an unknown upload outcome; log for cleanup.
Regression: `muxRoutes.test.ts` VO-03 verifies unchanged draft and successful
retry. Verified by the four delivery checks and six journeys. Delivery: `cb38175`.
