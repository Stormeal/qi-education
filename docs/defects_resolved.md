# Resolved defects

Every resolved defect and finished investigation, kept unchanged for traceability (records are never
deleted or reused). Open items, triage rules and the record template are in [defects.md](defects.md).
Evidence links point into [history/](history/README.md); links to deleted story specs were repointed
to the matching area spec in [specs/](specs/README.md).

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
| DEF-016 | Public career references expose private course titles | P1 | Fixed | Resolved 2026-10-10 in b66a8e1; isolated boundary regression and full checks pass | US-P004-AC03 |
| DEF-017 | Production without user-store settings accepts demo credentials | P1 | Fixed | Resolved 2026-10-10 in e7afd6d; `safeOperation.test.ts` regression and full checks pass | US-P008-AC01 |
| DEF-018 | Local API network failures replay mutations against hosted API | P1 | Fixed | Resolved 2026-10-10 in e7afd6d; `api-client.service.spec.ts` regression and full checks pass | US-P008-AC03 |
| DEF-019 | Overlapping legacy path writes conceal an intervening change from a versioned editor | P2 | Fixed | Resolved 2026-10-10 in a889155; mixed-client regression/full checks/review pass | US-A003-AC02 |
| DEF-T012-CALLBACK | Video callbacks miss a lesson moved to another chapter | P2 | Fixed | Reproduced then fixed 2026-10-10 in a8595d6; seven isolated media regressions and 425 API tests pass; live provider checks pending | US-T012-AC05 |
| DEF-020 | A published course looks impossible to edit: the form is locked without explanation and Start revision is hidden in a later step | P2 | Fixed | Reported by the first teacher 2026-10-10; reproduced and fixed in baf852c; `course-form-steps.spec.ts` and browser check pass | US-T010 |
| DEF-021 | Versioned course thumbnails cannot use the browser cache | P2 | Fixed | INV-018 reproduced first; resolved 2026-10-11 in f1aed61 (0.1.106); 42 isolated HTTP regressions and all five checks pass; hosted/browser cache-hit check pending | US-P006-AC06 |

Most findings were reproduced in isolated local/code checks. DEF-012 was
confirmed by read-only inspection of shared course metadata and corrected only
after explicit user approval. Other shared/provider release checks remain pending. The audit report preserves the original findings;
the current statuses and resolution sections below track subsequent fixes.

DEF-002, DEF-003, DEF-004 resumed on `main` at `ff3d68a` in the first batch of
three. Resolved in local code on 2026-10-07 in `a6767f6`; verification passed. DEF-005,
DEF-006 and DEF-010 were delivered locally on 2026-10-08 in `3feeea4`, base `159f45b`.
All three are Fixed (resolved in code). This batch's
[verification](history/verification/2026-10-08/DEF-005-006-010.md) records the selected
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
- Regression evidence: [verification record](history/verification/2026-10-04/DEF-001.md).
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
- Regression evidence: [batch verification](history/verification/2026-10-07/DEF-002-004.md),
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
- Regression evidence: [batch verification](history/verification/2026-10-07/DEF-002-004.md),
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
- Regression evidence: [batch verification](history/verification/2026-10-07/DEF-002-004.md),
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
  and [batch verification](history/verification/2026-10-08/DEF-005-006-010.md). Five API and
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
  edge cases reproduced before fixes. [Browser/check evidence](history/verification/2026-10-08/DEF-005-006-010.md).
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
  My Learning still shows 0%. [Evidence](history/audits/2026-10-05/career-library-after-completion.png).

- Resolution implemented 2026-10-09: shared LearningProgressService uses existing
  account/course keys and current outline IDs for workspace, library and Home.
  Duplicate/stale IDs cannot inflate progress; 100% requires every current lesson.
  Pending/error outlines show loading/unavailable with retry. Session-only values
  survive navigation if persistence fails. Same-browser resume remains supported.
- Regression evidence: LP-01/02/04 in `learning-progress.spec.ts` and
  [isolated browser/check record](history/verification/2026-10-09/DEF-007-009-014.md).
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
  [Verification](history/verification/2026-10-09/remaining-defects.md). Status: **Fixed - resolved in code**, 2026-10-09. Owner: Codex.
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
  role, not the saved profile goal. [Audit and captures](history/audits/2026-10-05/career_path_audit.md).

- Resolution implemented 2026-10-09: Home renders actual enrolled course titles,
  shared completion, next incomplete lesson and real learning links. Empty accounts
  receive Browse courses. Catalog/outline failures have honest states and retry.
  Fictional chapters, role-derived career percentages and claimed matched
  recommendations have been removed. Career progress is explicitly unavailable.
- Regression evidence: LP-01/03/04; original empty-account fixture rendering failed
  before implementation. [Verification](history/verification/2026-10-09/DEF-007-009-014.md)
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
  [DL-01–04](history/verification/2026-10-08/DEF-005-006-010.md). Hosted URLs and live shared
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
  RD-04 [verification](history/verification/2026-10-09/remaining-defects.md).
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
  [the local progress spec](specs/learning/progress.md); position
  labeling is delivered without expanding grading behavior.
- Regression check: untouched one- and multi-question quizzes, final-question
  navigation, skipped questions, failed/pass outcomes, and text/accessibility values.
  Renaming a position indicator is a valid small fix if it clearly identifies
  position and never claims completion; real completion must use an agreed rule.
- Evidence: [career path audit](history/audits/2026-10-05/career_path_audit.md) and
  [untouched quiz capture](history/audits/2026-10-05/career-quiz-before-answer.png).

- Resolution implemented 2026-10-09: percentage describes position through questions,
  with Question position and Question X of Y accessible text. It does not claim
  assessment completion. Existing trusted server scoring/Finish rules remain intact.
- Regression evidence: LP-05 in route/page tests covers untouched one-question and
  final multi-question position, skipped answers, failure, retry and passing.
  [Browser evidence](history/verification/2026-10-09/DEF-007-009-014.md) shows 50% course
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
- Evidence: [approved correction](history/verification/2026-10-09/DEF-012-category-correction.md),
  before/after values, fresh zero-change dry-run and RD-05 connected regressions
  in [batch verification](history/verification/2026-10-09/remaining-defects.md).
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
  [Screenshots and verification](history/verification/2026-10-09/remaining-defects.md), RD-06.
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
[US-T002 verification](history/verification/2026-10-09/US-T002.md). Shared provider and
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
  latest preview and reconciled save pass. [Verification](history/verification/2026-10-09/US-T003-T005.md).
- Release checks: hosted MongoDB coordination/failure behavior, Sheets composition,
  Mux/media processing and accepted native refresh in supported browsers remain
  separate. No shared-provider mutation probes were run. Fixed means resolved in code.

## Investigations requiring further evidence

### INV-014 signup and per-client attempts were unlimited

Resolved 2026-10-19 by US-P008 (`b227896` API, Codex; `9e3d8bd` app specs, Claude). Per network
address: 10 reset requests and 20 signups per clock hour, 429 `too-many-requests` with
`Retry-After`. Checks: `api:test` 1,554/1,554, `app:test` 383/383, `verify:journeys` 16/16,
`app:build:pages`; browser check on the isolated servers (11th reset request shows the wait and
keeps the form). Hosted check 2026-10-19 (Alex): 10 requests 202, the 11th 429 with `Retry-After` and the wait in minutes.

### Confirmed API class-load defects (Codex, 2026-10-09)

Baseline: main / f8d4c2f. Isolated HTTP/in-memory stores and counting Google API
stub; no shared mutations. `platformLoad.test.ts` contains five RED regressions.

| Defect | Promoted investigation | Reproduction | State |
| --- | --- | --- | --- |
| DEF-P006-01 | INV-005 | Distinct client per call; me 3, catalog 4, outline/content/thumbnail/quiz 5 Sheets reads | Fixed P1 |
| DEF-P006-02 | INV-007 | Only 1 of 20 readers enters while first content read is paused | Fixed P1 |
| DEF-P006-03 | INV-011 | Catalog of 50 seeded courses plus demo performs 51 full content reads | Fixed P2 |
| DEF-P006-04 | INV-012 | Saving ten 4 MiB attachment references fetches 41,943,040 binary bytes | Fixed P2 |

Contract/final evidence: [US-P006 spec](specs/platform/reliability.md).
Provider quota exhaustion is not reproduced by these isolated counts; disposable
Sheets load and hosted Mongo verification remain release checks. Fixed 2026-10-09
in `67ec9f2a8da47c31a835ff1ffc430087520ab7a2`: shared client, 1/2 reads per route,
concurrent readers, batched review metadata and asset-owner projections. Independent
review's author snapshot/save-token race is covered by a RED-to-GREEN regression.
319 API / 128 frontend tests, six journey checks and both builds pass locally.
Fixed means resolved in code; no deployment or hosted quota verification.

### DEF-P007-EDITOR — Stored lesson markup could run script in the course editor

Promoted from INV-008, P1. Fixed 2026-10-09 in `9f4cb68` (Claude Code). Reproduction, cause,
fix and browser evidence: [editor markup spec](specs/authoring/lessons-and-builder.md). The API still
stores author HTML unfiltered; the editor and learner views are the enforcement points.

### DEF-P007-SHEETS — Spreadsheet text becomes formula/number

Promoted INV-009, 2026-10-09, owner Codex, P1 Fixed. Isolated Sheets emulator
through real auth/course/feedback repositories: `=1+1` reads back as `2`; `007`
as `7`; `+01` and `-01` lose their formatting. Reproduced all nine data write
paths (audit said eight) with `spreadsheetText.test.ts` before the mode change.
No shared cell mutations. Contract: [spreadsheet text](specs/platform/storage-and-run-modes.md).
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
remote-write finality risk: [lock recovery](specs/platform/reliability.md).
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
| INV-005 | Sheets read volume: `listUsers` runs a two-read header check plus a data read on every authenticated request; course routes list the Courses sheet up to six more times; a new Google client is built per call. Default quota is about 60 reads/minute per service account | Count Sheets calls per route with a counting stub; then load-test a disposable spreadsheet with 5–10 concurrent learners and record 429s. Hosted exhaustion reproduced 2026-10-17 as DEF-045 (fixed: GET routes reuse a catalog read up to 10 s). US-P014 adds Mongo account lookups and an enrollment count query: Users reads disappear after verified account cutover. US-P015 adds Mongo course details: Courses reads also disappear after its separate verified cutover; Feedback remains in Sheets. Isolated fake/HTTP evidence only; hosted cutovers not performed | US-P006 / US-P014 / US-P015 |
| INV-006 | A provider write error inside the course lock (including a quota 429 during enrollment) or a terminated function leaves the lock record forever; read routes then return 409 too | Fake-collection test: fail a Sheets write under the lock, then issue a learner read; confirm host max duration to judge whether an expiry longer than it is safe | US-P005 |
| INV-007 | Read routes (thumbnail, outline, content, attachment, quiz attempt) take the exclusive course lock and give up after 5 seconds | 20 concurrent learner reads of one course against isolated stores with realistic Sheets latency; count 409s | US-P006 |
| INV-008 | Course builder assigns stored lesson HTML to `innerHTML` (`course-builder.ts` 509, 780, 822, 1274) outside Angular sanitization; the API stores `content` unfiltered. A teacher-authored payload would run when an admin opens the editor | Isolated stores: save `<img src=x onerror=...>` as a teacher via the API, open the editor as admin, observe execution | US-P007 |
| INV-009 | Sheets appends/updates use `valueInputOption: 'USER_ENTERED'` (8 call sites), so a display name, feedback message, or course field starting with `=` is evaluated as a formula and plain values are coerced | Dedicated test spreadsheet: sign up with display name `=1+1` and `007`; read the stored cells | US-P007 |
| INV-010 | Attachment limit is 25 MB in app and API, above the host's 4.5 MB request/response body limit and MongoDB's 16 MB document limit | Hosted disposable course: upload 5 MB and 17 MB files; record the response and message shown | US-T009 |
| INV-011 | US-T002 code (`86196cf`): `CourseReviewService.list` loads each course's full content document on every course list | Count Mongo reads and bytes for `GET /courses` with 50 seeded courses | US-P006, US-T002 |
| INV-012 | `PATCH /courses/:id/content` fetches every referenced attachment's binary to compare `courseId` | Save a lesson with ten 4 MB attachments; measure bytes read and duration | US-P006 |
| INV-013 | Reproduced in isolated stores as DEF-017 on 2026-10-10. Without Sheets settings the API falls back to in-memory demo users in any environment, including the documented demo admin password | Start with `NODE_ENV=production` and no Google settings; attempt the demo admin login | US-P008 |
| INV-014 | Login and signup accept unlimited attempts; each also consumes Sheets reads | Scripted attempts against a local instance; confirm no throttle and count Sheets calls | US-P008 |
| INV-015 | Reproduced with isolated fetch stubs as DEF-018 on 2026-10-10. On localhost the API client retries a failed request against the hosted API, including mutations | Stop the local API, submit signup from the local frontend with the network inspector open; do not complete it against shared data | US-P008 |
| INV-016 | CI event configuration reproduced locally: pull requests only, no push trigger | Main push trigger added under US-P008-AC04; actual GitHub run/host gating unverified (no push authorized) | US-P008 |
| INV-017 | US-T002 code (`86196cf`): status branches in `PATCH /courses/:id` are unreachable because the review service rejects status changes; reviewed title/status live only in MongoDB so the Courses sheet goes stale | Route tests for each legacy status transition; publish a revision and compare the sheet row. US-P015 removes the stale Courses sheet from reads after verified Mongo course cutover; published metadata remains authoritative in review snapshots. Isolated Mongo repository/review journey evidence only; hosted cutover not performed | US-T002 / US-P015 |
| INV-018 | Reproduced in isolated memory stores as DEF-021 on 2026-10-11: course thumbnails are served `Cache-Control: private, no-store` even when the URL carries the asset id as a version | Matching-version HTTP requests, anonymous and authenticated, both route prefixes: four RED header assertions | US-P006-AC06 |
| INV-019 | Alex 2026-10-17: a hosted video lesson keeps spinning on the new learning page. Not reproduced locally: Mux's public demo video plays, with and without DEF-043's missing `attachments`. Uploads are public playback only (DEF-T006-PUBLIC), so a signed ID is unlikely. Possibly a side effect of DEF-043 | After the DEF-043 fix is deployed, open the same hosted lesson; if it still spins, copy the browser console and the `mux-player` network requests | US-L016 |

INV-005–INV-018 come from the [2026-10-09 code audit](history/audits/2026-10-09/code_audit.md).
They began as code readings; reproduced entries above link their confirmed defects. That audit also re-observed INV-002,
INV-003 and INV-004.

Do not describe these as reproduced live-service incidents. If reproduced, create
the next DEF ID, retain the investigation link, and document concrete evidence.

### DEF-016 - Public career references expose private course titles

Owner: Codex. Severity: P1 (private metadata disclosure). State: Fixed;
implementation and regression verified; fixing commit b66a8e1. Discovered
2026-10-10 against initial 5c2a4b5, with a81255d preserved by user approval.
Contract: US-P004-AC03; [account progress spec](specs/learning/progress.md).

Reproduction uses isolated memory stores: publish a path referencing a real
course with a public curator label, make the course private with a different
title, then anonymously GET /career-paths and /career-paths/:id. Expected:
unavailable reference and the published curator label. Actual: both responses
include the private catalog title. careerPath.test.ts initially failed for both
normal and /api prefixes; no shared records were read or changed.

Root cause: learnerCareerPath derived titles from every catalog entry regardless
of status. Fix: only published courses supply live metadata; private/archived
references use the curator's published label and remain unavailable. No route
handler or response shape changes. Regression also proves account selection
isolation, forged account IDs are ignored, and the path never grants content
access or enrollment. Full API/frontend/build checks pass. Hosted verification
is pending. Fixing commit: b66a8e1; delivery row records the release limitations.

### DEF-035 - Primary buttons fail text contrast

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-035 | Fixed, Claude Code, 2026-10-16 (confirmed 2026-10-15) | P2 | WCAG 2.2 1.4.3 (4.5:1 for text); US-P013-AC01 | Computed from the stylesheet values on `ee1b660`: white on `#f59e0b` is 2.15:1 |

Found while auditing buttons for US-P013 on `main` / `ee1b660`. `app-button.scss`
renders `variant="primary"` as white 12px bold text on `#f59e0b`, hover `#d97706`
(3.19:1). The career path primary (`cp-btn-primary`) is white on a `#ff8a1c` to
`#d97706` gradient. Both are below the 4.5:1 minimum for normal text, so the main
action on most pages is hard to read for low-vision users. Expected: at least 4.5:1 in
every state. Fix: US-P013 makes primary buttons white on `#2f4f43` (9.05:1). Regression:
the contrast test over the design values in US-P013. Fixed; see the resolution below.

### DEF-035 - Resolution and verification, 2026-10-16

Fixed locally on `feat/US-P013-shared-ui-foundation` by US-P013-AC01. Fix: `--color-primary`
`#2f4f43` and `--color-primary-hover` `#243d34` in `app/src/tailwind.css` (`ba43cac`), the shared
button with a green primary (`89ff5d4`), and every page moved to it, the amber fill removed from
buttons and the career path gradient replaced (`03cd669`, `a92570f`, `b74df12`, `1653e72`).
The contrast test over the design values in `scripts/ui-foundation/design-values.test.mjs` proves
white on primary at 9.05:1 and on hover at least 4.5:1, and the removed-pattern guard fails if
`app-button`, `cp-btn` or the other old classes return. Regression checks on `5f23fd8`: `npm run
app:test` (23 node guard tests, 311 Angular tests in 42 files), `npm run api:test` 1281/50,
`npm run verify:journeys` 6, Pages build passes (with font inlining switched off in this
sandbox only). Browser walk 2026-10-16 in `docs/history/verification/2026-10-15/US-P013/`: every page shows
white text on deep green primary buttons. Remaining release checks: the hosted Pages build with font
inlining, a look at the deployed pages, and the final whole-branch review; not pushed yet.

### DEF-036 - Focus rings are inconsistent and partly too faint

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-036 | Fixed, Claude Code, 2026-10-16 (confirmed 2026-10-15) | P3 | WCAG 2.2 1.4.11 (3:1 for focus indicators), 2.4.7; US-P013-AC02 | Stylesheets on `ee1b660`: four different local focus colours, most controls on browser defaults; the design DNA's amber focus colour `#ffd08e` is 1.43:1 on white |

Found in the same audit. Focus styles exist as about 20 local focus rules in 13 stylesheets, at least five colours (`#4f773e`,
`#29463c`, `#315c24`), the login page uses an amber glow, and the remaining controls
depend on the browser. The documented focus colour cannot meet 3:1 against the white
and cream surfaces. Expected: one visible ring of at least 3:1 on every focusable
control. Fix: US-P013's global ring in `--color-focus` `#b45309` (5.0:1). Regression:
the focus contrast test and a keyboard walk of every page. Fixed; see the resolution below.

### DEF-036 - Resolution and verification, 2026-10-16

Fixed locally on `feat/US-P013-shared-ui-foundation` by US-P013-AC02. Fix: one global
`:focus-visible` ring in `app/src/styles.scss` using `--color-focus` `#b45309` (5.0:1 on white)
(`ba43cac`), the remaining local focus outlines removed and a light ring `--color-focus-inverse`
`#ffd08e` on `data-surface="dark"` bands (`d6c605e`), tab focus drawn inside the tab so the row cannot
clip it (`ce01441`, `7014f58`). `scripts/ui-foundation/focus-ring.test.mjs` fails when another stylesheet
draws a focus outline and `design-values.test.mjs` checks the ring contrast. Regression checks on
`5f23fd8`: same suites as DEF-035. Keyboard walk 2026-10-16: ring visible on shared buttons, both
tab sets, the builder toolbar and file picker, and on the course view and editor heroes; the arrow,
Home, End and modal Tab/Escape checks are in the walkthrough. Remaining release checks: the learning
video stage (Mux player) has no `data-surface="dark"` marker and could not be shown with demo data, so
its ring on a dark background is unchecked; the hosted look after deployment; the final whole-branch
review; not pushed yet.

### DEF-037 - Library "Refresh progress" button has no gap below the course list

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-037 | Fixed, Claude Code, 2026-10-16 | P3 (Low) | US-P013 | docs/history/verification/2026-10-15/US-P013/library-student-1440.png (walkthrough finding 3) |

Found in the US-P013 browser walk, 2026-10-16. Environment: branch `feat/US-P013-shared-ui-foundation`, local in-memory API (`npm run app:dev`), Chromium. Steps: Sign in as a student with an enrolled course, open Library at 1440px.
Expected: The button has a visible gap below the course list. Actual: "Refresh progress" sits flush against the bottom edge of the course card. Probably a margin the old `app-button` host used to add; not investigated. Related story: US-P013 (not caused by it unless marked as new). Found, not fixed: left out of the story's scope.

Fixed 2026-10-16: `.library-list` has a 16px bottom margin (`library-page.scss`). Verified in a browser at 1440px with one enrolled course: 16px between the list and the button (docs/history/verification/2026-10-16/DEF-037-041/DEF-037-library-1440.jpg).

### DEF-038 - Admin section switch clips its fourth segment at 400px

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-038 | Fixed, Claude Code, 2026-10-16 (existed before US-P013) | P3 (Low) | US-P013 | docs/history/verification/2026-10-15/US-P013/admin-feedback-admin-400.png (walkthrough finding 4) |

Found in the US-P013 browser walk, 2026-10-16. Environment: branch `feat/US-P013-shared-ui-foundation`, local in-memory API (`npm run app:dev`), Chromium. Steps: Sign in as admin, open Admin at a 400px viewport width.
Expected: All four segments (including "User management") are visible, or the switch wraps cleanly. Actual: The fourth segment is clipped by the right edge and labels wrap onto two lines; the strip scrolls inside itself. The page itself does not scroll horizontally. The switch is a segmented control this story leaves alone. Related story: US-P013 (not caused by it unless marked as new). Found, not fixed: left out of the story's scope.

Fixed 2026-10-16: the switch wraps (`flex-wrap: wrap`) and labels stay on one line (`admin-page.scss`). Verified at 400px as the demo admin: all four segments visible on two rows, no clipping (docs/history/verification/2026-10-16/DEF-037-041/DEF-038-admin-400.jpg).

### DEF-039 - Builder edit modal: the close button drops under the title at 400px

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-039 | Fixed, Claude Code, 2026-10-16 | P3 (Low) | US-P013 | docs/history/verification/2026-10-15/US-P013/builder-richtext-toolbar-focus-teacher-400.png (walkthrough finding 5) |

Found in the US-P013 browser walk, 2026-10-16. Environment: branch `feat/US-P013-shared-ui-foundation`, local in-memory API (`npm run app:dev`), Chromium. Steps: Sign in as a teacher, open a draft course in the editor, press Edit on a lesson in the builder at a 400px viewport width.
Expected: The close button stays beside the title in the modal header. Actual: The close button wraps onto its own row under the title. Modals are out of scope for US-P013; not compared with the base build. Related story: US-P013 (not caused by it unless marked as new). Found, not fixed: left out of the story's scope.

Cause: the narrow-screen rule in `course-builder.scss` turned the modal header into a one-column grid. Fixed 2026-10-16: the header is no longer in that rule and its title block may shrink and wrap. Applies to the component editor and the component picker. Verified at 400px with a 54-character lesson title: the close button stays beside the title (docs/history/verification/2026-10-16/DEF-037-041/DEF-039-builder-modal-400.jpg).

### DEF-040 - Catalog "My drafts" tab vanishing while selected leaves no selected tab

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-040 | Fixed, Claude Code, 2026-10-16 (existed before US-P013) | P3 (Low) | US-P013 | `courses-page.ts` `activeView`; `courses-page.html` panel `aria-labelledby` |

Found in the US-P013 browser walk, 2026-10-16. Environment: branch `feat/US-P013-shared-ui-foundation`, local in-memory API (`npm run app:dev`), Chromium. Steps: Sign in as a teacher with exactly one draft, open the catalog, select "My drafts", then publish or delete that last draft so the tab disappears.
Expected: The view falls back to "Published", which is selected, and the panel is labelled by an existing tab. Actual: No tab is selected, and the panel's `aria-labelledby` points to the missing `catalog-tab-drafts` element. `activeView` keeps the old value. Related story: US-P013 (not caused by it unless marked as new). Found, not fixed: left out of the story's scope.

Fixed 2026-10-16: the shown view is computed and falls back to Published when the drafts tab is not offered (`courses-page.ts`). Regression test in `courses-page.spec.ts` ("DEF-040 falls back to Published..."). Browser: My drafts still selects and labels the panel. Not verified in a browser: the tab disappearing, because no route or screen removes a course in this build.

### DEF-041 - Course builder section chevron has no aria-expanded

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-041 | Fixed, Claude Code, 2026-10-16 (existed before US-P013) | P3 (Low) | US-P013 | `course-builder.html` section chevron button |

Found in the US-P013 browser walk, 2026-10-16. Environment: branch `feat/US-P013-shared-ui-foundation`, local in-memory API (`npm run app:dev`), Chromium. Steps: Sign in as a teacher, open a draft course in the editor, and inspect the section expand/collapse chevron in the builder with a screen reader or the accessibility tree.
Expected: The chevron button exposes `aria-expanded` true or false for its section (WCAG 2.2 4.1.2). Actual: The button has no `aria-expanded`, so assistive technology cannot tell whether the section is open. Related story: US-P013 (not caused by it unless marked as new). Found, not fixed: left out of the story's scope.

Fixed 2026-10-16: `[attr.aria-expanded]` on the section toggle (`course-builder.html`). Verified in a browser: "true" when open, "false" after collapsing, "true" again after expanding.

### DEF-042 - Course lock is released after the answer is sent

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-042 | Fixed, Codex, 2026-10-16 (lead-checked) | P2 | `docs/course_operation_recovery.md` (the lock is held until the handler finishes and then released) | Hosted log 2026-10-13, course `1602e5b5`: `Course lock release requires verified recovery`, then `Unable to finish course operation coordination. CourseBusyError` |

Found in the hosted API log on 2026-10-13 after two video upload requests. `withCourseLock` lets the handler answer inside the lock, so `MongoCourseMutationLock.run` releases it after the response; Vercel can pause the function in between and the release's five-second limit expires. Worst case: the course answers "This course is being updated" until the 31-minute expiry. Every locked route has this order. Fix default (lead, confirm or change): answer only after the release. See the [handoff](history/handoffs/DEF-042-course-lock-release-codex.md).

Fixed 2026-10-16 in `953b534` (Codex): `withCourseLock` holds the handler's final `send` until the lock release has settled, then sends the unchanged answer; a failed release is logged first. Default confirmed by Codex; Alex may still change it. Reproduced first: 12 route cases in `api/src/courseLockResponse.test.ts` failed with the release paused; 20 route cases now pass (both route prefixes, PUT, POST, PATCH, DELETE, failure paths). Lead check: the two `response.end` calls in `server.ts` are in unlocked read routes, so no locked answer bypasses the hold. API 1301/51, app 317/43, six journeys, Pages build pass. Not verified: hosted Vercel behaviour and real MongoDB. Check after the next deploy: the hosted log should no longer show `Course lock release requires verified recovery` after a video upload.

### DEF-043 - Learning page stops rendering for video lessons stored without attachments

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-043 | Fixed, Claude Code, 2026-10-17 (new in US-L016) | P1 | US-L016-AC01, AC07 | Alex's hosted screenshot 2026-10-17 (ISTQB Foundation 4.0): empty sidebar, full-width progress fill; local console `TypeError: Cannot read properties of undefined (reading 'length')` in `LearningPage` |

Found by Alex on the hosted site right after the US-L016 push, 2026-10-17. Steps: open a course whose first lesson is a video uploaded before attachments existed (stored without an `attachments` field, e.g. written by the Mux webhook) at `/library/:id`. Expected: the action bar, tabs and curriculum sidebar render. Actual: the template throws on `lesson.attachments.length` in the action bar on every change detection, so the rest of the page never updates: no rating buttons or tabs, and the sidebar shows only "Your progress" with an unbound progress bar drawn full width. The old learning view read `attachments` only inside text lessons, so video lessons never reached it.
Root cause: `AppStateService.normalizeCourseContent` returned learner content unchanged, so the `attachments: []` default it gives author content never applied to learners. The API keeps stored lessons as they are (it already guards `attachments ?? []` in four places).

Fixed 2026-10-17: learner content now gets the same `attachments` default; learner quizzes still skip the legacy quiz migration. Regression: `learning-progress.spec.ts` "DEF-043" (failed with the TypeError before the fix). Verified in a browser on 3001/4200 with an in-memory course whose video lesson has no `attachments`: action bar, tabs and sidebar render, console clean. Not verified: the hosted course after deploy.

### DEF-044 - Learning page header does not match the course details page

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-044 | Fixed, Claude Code, 2026-10-17 (new in US-L016) | P3 (Low) | US-P013 shared look | Alex's screenshots 2026-10-17 comparing `/courses/:id` and `/library/:id` |

Found by Alex, 2026-10-17. Expected: the header looks and sits the same on the details page and the learning page. Actual: the learning page used a flat page colour instead of the app's cream gradient, put a 16px gap above the course bar, and aligned the course bar and workspace to a 1408/1440px frame, so the breadcrumb did not line up with the logo.
Fixed 2026-10-17: the app's page gradient is the `--gradient-page` token (used by `app.scss`, the details page and the learning page); the course bar starts right under the header and both it and the workspace use the header's 1240px frame. Verified at 1600px: header position and height, breadcrumb alignment and the band's bottom edge (82px) are identical on both pages; 400px has no sideways scroll.

### DEF-045 - One visit exhausts the hosted Sheets read quota

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-045 | Fixed, Claude Code, 2026-10-17 (follows INV-005, new load from US-L016) | P1 | US-P006, DEF-027/DEF-032 freshness | Hosted Vercel log 2026-10-17 15:21-15:23, one admin visit: `GaxiosError: Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user'` on `/api/courses`, `/outline`, `/content`, `/users/me/learning-progress`, `/notes`, `/learners/count`; the learning page lost content and progress |

Reproduction (isolated counting stub, `platformLoad.test.ts` "INV-005 counts Sheets reads for one learner session"): a learner enrolled in 3 of 6 published courses opens Home (14 requests: `/auth/me`, `/courses`, `/career-paths`, `/users/me/career-path`, learning progress, 3 outlines, 6 thumbnails), My Learning (5: `/courses`, progress, 3 outlines) and `/library/:id` (5: `/courses`, content, progress, notes, learner count).
Cause: every authenticated request reads the Users sheet fresh (DEF-027, deliberate) and every course route reads the whole Courses sheet again; reads were shared only while one was in flight. Requests one at a time (separate Vercel instances, or no overlap) cost one Users plus one Courses read each, so the default 60 reads/minute lasts about one and a half such sessions.

| Page | Before, one at a time (Users + Courses) | Before, page burst on one warm instance | After, one at a time | After, burst |
| --- | --- | --- | --- | --- |
| Home | 25 (13 + 12) | 4 | 14 (13 + 1) | 2-4 Users, 0 Courses |
| My Learning | 10 (5 + 5) | 4 | 5 (5 + 0) | 2-5 Users, 0 Courses |
| Lesson page | 10 (5 + 5) | 4 | 5 (5 + 0) | 2-5 Users, 0 Courses |
| Session | 45 | 12 | 24 | Users only |

Fix 2026-10-17 (lead default, Alex to confirm or change: the 10 seconds): GET requests may reuse a Courses sheet read up to `recentCatalogMs` (10 s) old on the same instance, so each instance reads the catalog at most about six times a minute for GETs. Mutations (POST/PATCH/PUT/DELETE), reads after taking the course lock and reads after a write in the same request still read fresh; this instance's own course writes clear the reused read at once. The Users read is unchanged, so DEF-027/DEF-032 hold: a disabled or demoted account is refused on its next request (the AC02 revocation assertions still pass). Tradeoff: a course change made on another instance (unpublish, archive, owner move, new course) can take up to 10 s to show on GET routes of this instance; mutations always see it.
Regression: `platformLoad.test.ts` session count (exact one-at-a-time counts; burst counts depend on overlap, so only their catalog reads are exact), "a reused catalog is at most recentCatalogMs old" (another instance's unpublish visible after 10 s, POST refused at once, own write read fresh) and AC02 per-route counts (later GETs 1 read, quiz POST 2). API 1328/54, six journeys and API build pass.
Not fixed, remaining reads per session (frontend or product decisions, not this API change): the Users read per authenticated request (24 of the 24); outlines are fetched by both `LearningProgressService.loadCourses` and `CareerPathService.loadOutlines` with the cache bypassed; thumbnails are fetched with the bearer token, so each costs a Users read on a cold browser cache. Not verified: real Sheets latency, Vercel instance reuse and the hosted quota after deploy. Check after the next deploy: the hosted log should show no `Quota exceeded` during a normal visit.

### DEF-046 - Learning page drops keyboard focus to the top of the page

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-046 | Fixed, Claude Code, 2026-10-17 (new in US-L016) | P2 | US-L016-AC09; WCAG 2.2 2.4.3 focus order | Keyboard walk on 3001/4200: after "Save note" `document.activeElement` was `<body>` |

Found in the US-L016-AC09 keyboard walk, 2026-10-17 (isolated stores, Chromium, real key presses). Expected: after an action, keyboard focus stays on or near the control that was used. Actual: focus fell to the top of the page whenever the focused control was removed or disabled: Save note (the button disables once the field clears), the rating buttons (replaced by the thanks text), sending or cancelling the problem form, saving, cancelling or deleting a note, Mark complete and the exercise check (replaced by the up-next panel or badge), Stay here and Escape, Next on the last lesson, and the quiz's Submit, Finish and Try again. A keyboard user then had to tab back from the header.
Fixed 2026-10-17: after those actions the page moves focus, only if it was lost, to the next sensible control (the note field, the thanks text, "Report a problem", the note, "Start now", the lesson title, the quiz's next button or first answer). Regression: four focus cases in `learning-page.spec.ts` (all failed first). Verified by a full keyboard walk in a browser: header, course bar, lesson, action bar, tabs (arrow keys), curriculum; a note added and saved; a problem report sent; up next started with Enter and cancelled with Escape; the exercise ticked with Space; the quiz answered, submitted and finished; every stop shows the shared focus ring.


## DEF-T006-CLEANUP - Video removal leaves provider media behind

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

## DEF-T006-PUBLIC - Signed playback accepted without tokens

State: Fixed (resolved in code). Severity: P2. Owner: Codex. Story: US-T006-AC01/03.
Reproduced 2026-10-09 at `f602307`: isolated `muxService.test.ts` constructor
accepted signed configuration instead of refusing unsupported playback.
Fix: reject signed configuration before creating the client/API startup; upload
policy stays public. Signed-only ready callbacks produce an actionable error.
Regression: `muxService.test.ts` VO-02 and `muxRoutes.test.ts` VO-02.
Verified 2026-10-10: API build, 328 API tests, 135 frontend tests, Pages build and all six journeys pass. Delivery: `cb38175`. Hosted public playback remains unverified.

## DEF-T006-POLLING - Pending videos stop updating and lack recovery guidance

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


## DEF-T006-UPLOAD-FAILURE - Provider outage returns an opaque write error

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

### DEF-017 - Production without user-store settings accepts demo credentials

Owner: Codex. Severity: P1. State: Confirmed. Source: INV-013.
Reproduced 2026-10-10 on main, base 0435029, before implementation.
Contract: US-P008-AC01; [spec](specs/accounts/sign-in-and-sessions.md).

Given NODE_ENV=production, a synthetic valid session secret, and no user-store
settings, the factory contains all three documented demo users. Real Express
login and signup requests on ephemeral ports return 200/201 instead of 503,
and health/auth incorrectly returns 200. safeOperation.test.ts initially
failed 15 of 20 tests, including each missing setting and all route aliases.
All other dependencies were explicit memory stores and forbidden provider
stubs; api/.env was never loaded. No shared service was accessed.

Root cause: createAuthRepository selected the demo repository whenever Sheets
configuration was absent, regardless of production. Resolution pending.

### DEF-018 - Local network failures replay mutations against hosted API

Owner: Codex. Severity: P1. State: Confirmed. Source: INV-015.
Reproduced 2026-10-10 on main, base 0435029, before implementation.
Contract: US-P008-AC03; [spec](specs/accounts/sign-in-and-sessions.md).

Given a localhost frontend and a fetch stub rejecting the local API, the real
ApiClientService sends signup, save, enrollment, selection, DELETE, OPTIONS and
lowercase POST to a hosted-URL stub. Its disposable hosted-write list changes
and the promise succeeds instead of reporting a local failure. An explicit
hosted override also sends a local mutation. Eight new regression cases failed
before implementation; existing frontend tests and read fallback passed.
No real network request or shared mutation occurred.

Root cause: fetch retries every failed request against every candidate API URL,
without checking method or the local frontend context. Resolution pending.

### DEF-017 and DEF-018 resolution (2026-10-10)

Fixed in `e7afd6d` (version 0.1.84), implemented by Codex and completed by the lead.
DEF-017: a production API without user-store settings has no accounts and answers sign-in,
sign-up and protected routes with 503 and a message; `/health/auth` reports it. DEF-018: a
localhost frontend never sends a request that changes data to a non-local API. 378 API and
179 frontend tests, six journeys and the API and Pages builds pass. Hosted verification is
pending. Details: [safe-operation spec](specs/accounts/sign-in-and-sessions.md).

### DEF-019 - Legacy path writes can reuse a version token

Owner: Codex. Severity: P2. State: Fixed; fix and regressions pass,
resolved 2026-10-10 in a889155. Found 2026-10-10 in the initial uncommitted
US-A003 implementation on main/base 5278f7c; this was not a live-service incident.
Contract: US-A003-AC02; [spec](specs/career-paths/curation.md).

Reproduction with isolated memory stores and ephemeral HTTP ports: seed a future
updatedAt to model clock skew, suspend legacy save B after its route read, finish
legacy save A, then release B. Both returned the same next timestamp. A versioned
editor loaded after A could overwrite B with A's token and receive 200. The new
regression failed in both normal and /api prefixes before the fix.

Root cause: timestamp allocation used the route's old snapshot. Mongo's conditional
predicate was correct, but unconditional legacy writes could reuse that token.
Resolution implemented: allocate against persisted state in the repository and
return that saved document to the route. Memory allocation/replacement is synchronous;
Mongo legacy saves retry conditional replacements, with unique-id insertion retries
for simultaneous creation. Versioned writes still have one atomic comparison and
return 409 CAREER_PATH_CONFLICT when stale. Legacy writes still succeed/last win.

Regression evidence: delayed legacy HTTP race, overlapping memory/Mongo-adapter
legacy writes, conditional contention, and concurrent first creation. Final 418 API
and 182 frontend tests, six journeys and API build pass; independent review clear.
Actual Mongo deployment, clock/instance contention and durability, hosted editor
withdrawal/conflict flow remain release checks. No shared providers were accessed.

### DEF-T012-CALLBACK - Video callbacks miss a moved lesson

Owner: Codex. Severity: P2. State: Fixed. Resolved in code 2026-10-10, fixing commit a8595d6. Found 2026-10-10 on main/base
853c249 with disposable memory stores; not observed against a live provider.
Contract: US-T012-AC05; [spec](specs/authoring/lessons-and-builder.md).

Reproduction: store a video with upload ID upload in chapter old, load an author
revision, PATCH that lesson into chapter new, then send a stubbed ready callback
whose passthrough still contains chapter old. Both webhook prefixes return 200,
but the lesson retains processing status and empty playback ID. A private working
revision moved away from its published location also misses the same callback.
The ready-playback retention and old-upload/replacement guards already pass.

Regression: api/src/courseMove.test.ts has three expected failures for matching
callbacks (both prefixes and split live/working locations). Attachment uploads
use the existing PUT method; no attachment route defect is confirmed.
Resolution: callbacks locate the stable component ID across chapters in each live/working snapshot; matching upload/asset checks still reject a replaced video. All seven courseMove tests and all 425 API tests pass. Fixing commit a8595d6 (0.1.96). Real Mux, MongoDB and hosted/browser checks
remain outside this isolated regression.

### DEF-020 - A published course looks impossible to edit

Owner: Claude Code. Severity: P2. State: Fixed in `baf852c` (2026-10-10). Reported by the
first teacher on the live site as "not possible to edit the course once it's published".
Reproduction, in-memory API: open a published course in the editor; every field is disabled
and nothing says why. Editing was possible through "Start revision" (US-T002), a small button
inside the third section. Fix: a notice at the top of the form states that the course is
published, archived or in review, and offers "Start revision" when that is the way forward.
Regression: `course-form-steps.spec.ts`; browser check that the button unlocks the form.
Hosted verification pending. Details: [guided course form spec](specs/authoring/course-editor.md).

### DEF-021 - Versioned course thumbnails cannot use the browser cache

Owner: Codex. Severity: P2. State: Fixed in f1aed61 (0.1.106), 2026-10-11. Source: INV-018,
[2026-10-09 code audit](history/audits/2026-10-09/code_audit.md).
Contract: US-P006-AC06; [class-load spec](specs/platform/reliability.md).

Reproduction, 2026-10-11 on main/base df556f0: `npm --prefix api test --
src/thumbnailCache.test.ts` creates a published course and PNG asset in isolated
in-memory stores, then requests its exact `?v=<asset id>` anonymously and with a
learner's Bearer token, on `/courses` and `/api/courses`. All four return 200,
`image/png`, length 14, the original image bytes and `Vary: Authorization`, but
the cache assertion fails: expected `private, max-age=31536000, immutable`,
received `private, no-store`. The shared middleware sets no-store and the read
handler does not override it after successful asset validation. No shared
provider, production incident or browser transfer measurement is claimed.

Resolution: the thumbnail handler overrides Cache-Control only on the existing
successful path, after visibility and asset/course ownership checks, when the
string v equals the actual returned asset ID. It keeps Vary: Authorization;
unversioned and error/404 responses retain private, no-store. Existing author-only
revision selection, response bodies and content headers remain unchanged. No
other route policy changes and no public caching. AC06 removed from the open
backlog; acceptance and scenario-to-test map remain in the class-load spec.

Regression: 42/42 thumbnail HTTP tests pass on both prefixes; old versions return
404/no-store for learners after publication of a replacement, pending versions
remain author-only, and unchanged images keep type/length/bytes. All five checks
pass: 500 API tests, six journeys, API build, 222 frontend tests and Pages build
(existing stylesheet budget warnings and jsdom scrollTo notices). Read-only review
found no issues. Hosted header behavior, actual browser cache-hit transfers and
real provider durability remain release checks, so the state is Fixed, not
Verified. Isolated memory stores/ephemeral ports only; no shared data touched,
push or deployment. Claude's concurrent 9a4d032 commit preserved.

### DEF-022 - The lesson editor dialog does not manage keyboard focus

Owner: Claude Code. Severity: P2 (keyboard and screen-reader users). State: Fixed locally
2026-10-11 (commit `fix(DEF-022)`, 0.1.110); hosted verification pending.
Found 2026-10-11 in the keyboard check of US-T013; the dialog is older than that story and
serves every lesson type. Reproduction, in-memory API, demo teacher: in the course editor,
step 4, focus Edit on a lesson and activate it. The dialog opens but focus stays on the Edit
button behind it; Escape does not close it; Tab is not kept inside it. Expected: focus moves
into the dialog, Escape closes it, Tab stays inside, and focus returns to Edit on close.
The component picker dialog had the same gap. Evidence:
[simple quiz spec](specs/authoring/quizzes.md), keyboard-only check.

Resolution: both dialogs in the course builder now follow the feedback dialog's contract.
Opening moves focus to the dialog's first control (its close button); Tab and Shift+Tab wrap
inside; Escape closes it, except while a save or submit is running, when the close button is
disabled too; closing returns focus to the button that opened it (nowhere, when that lesson
was removed). Regression: `course-builder-authoring.spec.ts`, "DEF-022 lesson editor dialog
keyboard focus" (three cases). Browser, in-memory API, demo teacher, real key presses: Enter
on Edit put focus on Close editor; Shift+Tab went to Done; Tab went back to Close editor and
then to the title field; Escape closed the dialog with focus back on Edit. The picker was
checked the same way with scripted key events. 225 frontend tests and the Pages build pass.
Not verified: Escape while a native select list is open, a screen reader, hosted behavior.

## US-P003 confirmed findings, 2026-10-11 (INV-003 / INV-004)

| ID | Finding | Severity | State | Evidence | Contract |
| --- | --- | --- | --- | --- | --- |
| DEF-023 | Overlapping normalized-email signup creates duplicate accounts | P2 | In progress | Isolated HTTP: both requests return 201 in memory and Sheets-stub cases | US-P003-AC01 / INV-003 |
| DEF-024 | Overlapping Sheets enrollments lose one course | P2 | In progress | Isolated HTTP: two 200 responses, only course-a remains after paused first row write | US-P003-AC02 / INV-003 |
| DEF-025 | Feedback retry creates a second issue after its link save fails | P2 | In progress | First triage 500 after issue 1; retry 200 links issue 2, memory and Sheets-stub cases | US-P003-AC03 / INV-004 |

### DEF-023 - Overlapping signup creates duplicate accounts

Owner: Codex. Severity: P2. State: In progress. Found 2026-10-11, main/base
fc98679. Source: INV-003. Contract: US-P003-AC01; spec
[US-P003 safe retries](specs/platform/reliability.md), written first.
Reproduction: `npm --prefix api test -- src/safeRetries.test.ts`; pause the first
createUser/Sheets append, submit an overlapping signup through the alias with
case-different but equivalent normalized email, then release the first write.
Both return 201; expected one 201 and the existing 409/message duplicate response.
Both memory and real Sheets adapter against in-memory stub rows reproduce, on
plain and /api routes (four RED cases). Root cause: existence check and append
are not coordinated. No shared spreadsheet or live incident is claimed.

### DEF-024 - Overlapping Sheets enrollments lose a course

Owner: Codex. Severity: P2. State: In progress. Found 2026-10-11, main/base
fc98679. Source: INV-003. Contract: US-P003-AC02; same safe-retries spec.
Reproduction: same isolated HTTP command, real GoogleSheetsAuthRepository against
in-memory stub rows, two published memory courses. Pause the first user's row
update while the second request enrolls that user in another course, then release.
Both respond 200 but persisted IDs contain only course-a, not course-a/course-b
(two RED cases, both prefixes). Root cause: whole-row read/modify/write spans
an await and is not serialized by user; course locks use different course IDs.
The in-memory enrollment implementation did NOT reproduce: concurrent course-a,
course-b and repeat course-a preserve both IDs without duplicates (two passing
characterizations). It is not independently rewritten as a purported defect fix.

### DEF-025 - Feedback retry duplicates an already-created issue

Owner: Codex. Severity: P2. State: In progress. Found 2026-10-11, main/base
fc98679. Source: INV-004. Contract: US-P003-AC03; same safe-retries spec.
Reproduction: same HTTP command; inject a GitHub issue stub and fail feedback
triage persistence after creation. First request returns the existing 500 and
feedback has no link; retry returns 200 with issue 2 instead of issue 1. Memory
and real Sheets feedback adapter against local stub rows reproduce, both prefixes
(four RED cases). Root cause: the handler forgets the created issue on save
failure and checks only the stored link. No GitHub request is sent.

Combined pre-fix evidence: 12 tests, ten expected assertion failures and two
passing in-memory enrollment characterizations. Only these reproduced defects
will be fixed; multi-instance uniqueness/atomicity and cold-instance/restart
triage recovery remain open product decisions, not promises of this increment.

### US-P003 local fix verification (DEF-023 / DEF-024 / DEF-025)

2026-10-11, combined tree with Claude's 35b45c2 preserved. The three handlers
now coordinate per normalized email, user ID and feedback ID in createServer;
all other route wiring and repository interfaces remain unchanged. Triage keeps
an instance-owned issue checkpoint after successful creation until a save succeeds.
The checkpoint survives thrown/null saves; retries reuse existing saved links
first. No schema/migration or shared infrastructure was added. Scope is one API
instance, not distributed coordination, restart recovery or ambiguous creation.

Regression: `safeRetries.test.ts` has 34 passing HTTP cases on both prefixes.
The initial 12-case run had ten intended assertion failures and two passing
in-memory enrollment characterizations. Overlap signup now returns one 201 and
one existing 409/message; both Sheets enrollments remain; failed triage save
retries persist issue 1 rather than create issue 2. Additional cases cover failure
release, independent emails/users, overlapping triage, repeated save failures,
non-work retry, saved links, GitHub failures and denied/invalid/missing feedback.

All five checks pass: 534 API tests, six journeys, API build, 225 frontend tests,
Pages build (existing stylesheet warnings; frontend jsdom scrollTo notices).
Read-only review found no Critical/Important/Minor issue within scope. Real
Sheets/GitHub, hosted/browser behavior, multiple instances, cold starts and
restart recovery are unverified. No shared providers, push or deployment.
Fixing commit and final Fixed dispositions follow in an append-only delivery
record after the local implementation commit; original records stay intact.

### DEF-023 / DEF-024 / DEF-025 - Local delivery and latest disposition

Resolved locally 2026-10-11 in c13a800e8a97843f4eb6d81c5d0d6bdb3cc8eab8
(version 0.1.111). These latest dispositions supersede the In progress state in
the preserved reproduction records above; append-only ownership is retained.

| ID | Latest state | Fixing commit | Regression and remaining release check |
| --- | --- | --- | --- |
| DEF-023 | Fixed | c13a800 | Same normalized-email signup serializes check/create; one 201, one exact existing 409/message. Memory and Sheets-stub HTTP pass. US-P014 adds Mongo unique-email enforcement across instances (two-repository/two-server fake tests); active after verified Mongo cutover, which remains unperformed |
| DEF-024 | Fixed | c13a800 | Per-user enrollment wraps the whole Sheets read/modify/write; both courses survive and repeated enrollment adds nothing. US-P014 adds Mongo atomic enrollment union and independent password/access field writes across instances; fake regressions pass, active after verified Mongo cutover. Real-provider/multi-instance execution remains unverified |
| DEF-025 | Fixed | c13a800 | Per-feedback queue and created-issue checkpoint survive failed saves in the same instance; retries reuse the original issue link, stored links win and successful saves clear pending state. Real GitHub/Sheets, restart, cold-instance and ambiguous creation recovery unverified |

Acceptance and the RED-to-GREEN scenario map remain in
[US-P003 safe retries](specs/platform/reliability.md); delivered AC01..03 are
removed from the open backlog. US-P003 remains open for Proposed AC04 and Alex's
shared uniqueness/update and durable issue recovery decision. Across several API
instances nothing new is guaranteed. No attempt limits/auth abuse control.

Final evidence: 34 focused HTTP cases, all 534 API tests, six journeys, API build,
225 frontend tests and Pages build pass, with existing stylesheet budget warnings
and jsdom scrollTo notices. Read-only review found no blocking issue. Isolated
local memory rows/stores and GitHub stub only, no shared providers, frontend
behavior edit, branch/worktree, push or deployment. Claude's 35b45c2 is preserved
and his DEF-022 entry is untouched. No outside-scope file is needed. This delivery
record also carries the hook-required aligned patch bump. Codex stopped.


### DEF-026 - Enrollment can restore a password hash read before a reset

| ID | State | Priority | Scenario | Reproduction |
| --- | --- | --- | --- | --- |
| DEF-026 | Confirmed, Codex, 2026-10-11 | P1 | US-L004-AC02 | Isolated Sheets double: enrollment reads old A:H row and pauses before update; reset writes new D hash; enrollment finishes its full-row write, restoring the old hash |

Reproduced before fixing in api/src/passwordUpdate.test.ts, case "retains a reset
password when an enrollment write read the old hash first". Its assertion failed:
stored hash was the old hash instead of the new reset hash. No real spreadsheet,
MongoDB, provider or mail was touched. This is a persistence interaction with the
new reset flow, not a change to enrollment's public route or response.

Smallest fix planned: enrollment updates H (enrolledCourseIds) only, while reset
updates D (passwordHash) only. Preserve existing per-user enrollment sequencing,
status codes and response shape. Distributed enrollment union remains the open
US-P003 decision; this repair only prevents enrollment from overwriting other cells.
Delivery/fixed disposition and verification follow in an append-only record.


### DEF-026 - Implementation and isolated regression

Implemented locally 2026-10-11; fixing commit follows in the delivery record.
Enrollment writes only Users H; password reset writes only Users D. The paused
old-row enrollment test now preserves the new password hash and enrollment.
Existing signup/enrollment paths, public bodies, success/status behavior and
instance-local enrollment sequencing remain unchanged. Distributed enrollment
union is still an open US-P003 decision, not guaranteed by this repair.

All five checks pass: 744 API tests, six journeys, API build, 248 frontend tests
and Pages build. Read-only recheck is clear. Tests use isolated in-memory rows,
Mongo collection CAS doubles and mail/fetch stubs. No shared spreadsheet/Mongo,
Brevo or real mail; provider contention/durability and hosted/browser behavior
remain unverified. Original non-UTF-8 bytes preserved by append-only writes.


### DEF-026 - Local delivery and latest disposition

Fixed locally 2026-10-11 in 9f87cb741d8942ffc4b98f97bddc01ec07a0e815 (0.1.127).
This disposition supersedes Confirmed in the preserved reproduction above.

| ID | Latest state | Fixing commit | Regression and remaining release check |
| --- | --- | --- | --- |
| DEF-026 | Fixed | 9f87cb7 | Paused old-row enrollment cannot overwrite a new reset password: enrollment H-only, reset D-only. Isolated Sheets and memory password-update tests pass. Real Sheets concurrency/durability and hosted login remain unverified |

All five checks pass: 744 API tests, six journeys, API build, 248 frontend tests,
Pages build. Read-only review clear; no real providers/mail/shared mutations.
The full route, hash/single-use/limit and failure contract remains in the two
account-email/password-reset specs. No public enrollment route contract changes.
This append-only delivery record also carries the hook-required aligned patch bump.
Codex stopped; no push/deployment. Original invalid-UTF-8 bytes remain intact.

### DEF-027 - Authentication can join a pre-revocation Sheets snapshot

| ID | State | Priority | Scenarios | Reproduction |
| --- | --- | --- | --- | --- |
| DEF-027 | Confirmed, Codex, 2026-10-11 | P1 | US-A001-AC01/02 | Two isolated Sheets adapters: B holds an old user fetch; A completes role demotion (or the isolated row is disabled); the account's next authenticated request on B joins the old read and returns 200 instead of 403/401 |

Reproduced before the authentication fix in api/src/adminUsers.test.ts, six
DEF-027 HTTP cases covering teacher demotion, admin demotion and account disabling
on both normal and /api prefixes. The run had six intended assertion failures and
89 passes: four expected 403 and two expected 401, all receiving 200. The disabled
account case reproduces the preexisting authorization-read flaw independently of
the new role route. A read-only reviewer separately reproduced the stale admin
role with two adapters. No shared data, provider or real mail was used.

Smallest fix: request fresh user reads during session authentication, using the
existing fresh option so a new request cannot join a pre-revocation read on any
instance. Paths, DTOs and denial status contracts stay the same. Authenticated
class bursts will cost one fresh Users read per request, while catalog/content
coalescing and shared clients remain. Update the isolated read-cost assertion to
measure that deliberate freshness tradeoff; delivery and fixed evidence follow.

### DEF-027 - Implementation and isolated regression

Implemented locally 2026-10-11; fixing commit follows in the delivery record.
Session authentication uses findById with fresh:true. Six former 200 results now
correctly deny teacher/admin demotions with 403 and disabled accounts with 401,
using the existing session and another instance's held snapshot. Existing paths,
DTOs, authorization denial shapes and cache headers are preserved. One fresh
Users read per request replaces authentication coalescing; catalog/content reads
still coalesce. The 20-reader fixture measured 22 reads, with unchanged one/two
single-route budgets. Hosted quota impact remains unverified.

253 focused cases and all five required checks pass: 908 API tests/40 files, six
journeys, API build, 258 frontend tests/33 files, Pages build (three existing style
budget warnings; jsdom scrollTo notices). Independent read-only review is clear
and its separate 95-case admin run passes. Isolated Sheets rows/memory stores and
mail recorder only. Real Sheets/Mongo/Brevo and hosted/browser flows unverified.
US-P006 historic budget spec is outside ownership; own queue row requests its
append-only budget/freshness clarification. No push or deployment.

### DEF-027 - Local delivery and latest disposition

Fixed locally 2026-10-11 in 54a9427b64425fd82c2d839ad2825db0aa399803 (0.1.141).
This latest disposition supersedes Confirmed in the preserved reproduction.

| ID | Latest state | Fixing commit | Regression and remaining release check |
| --- | --- | --- | --- |
| DEF-027 | Fixed | 54a9427 | Six held-snapshot, two-instance HTTP cases now deny demoted teachers/admins and disabled accounts with current 403/401. Fresh authentication uses one Users read per request; catalog/content coalescing retained. Real Sheets behavior and hosted quota impact unverified |

All five checks pass: 908 API tests, six journeys, API build, 258 frontend tests,
Pages build (existing stylesheet warnings and jsdom notices). Read-only review
clear; 253 focused cases and independent 95-case admin run pass. No shared
providers, real mail, push or deployment. The queue's outside-file follow-up is an
append to US-P006-class-load.md documenting fresh auth and the 22-read measured
20-reader burst while retaining its historic budget evidence. Original invalid
UTF-8 bytes are preserved. Delivery record carries the required fresh patch bump.

### DEF-028 - Frontend tests send requests to the hosted API

Owner: Claude Code. Severity: P2 (real traffic to the live service from every test run,
locally and on CI). State: Fixed in f38f321 (0.1.144), 2026-10-11. Found in the audit of
outside calls Alex asked for. Introduced the same day with US-T007 (commit 67079db).

Reproduction: run `npm run app:test` with no local API, with a preload that records every
real `fetch`. Result before the fix: 20 x `GET https://qi-education.vercel.app/api/instructors`
and 1 x `GET .../api/users/me/instructor-profile`, after the same requests failed against
`localhost:3001`. Cause: the catalog and course pages load instructor descriptions when they
are created, the specs did not stub that request, and on a local host a failed read falls
back to the hosted API.

Fix: `app/src/test-setup.ts`, registered as a setup file of the test target in
`app/angular.json`, replaces `fetch` with one that rejects, so a spec must stub what it
needs. Evidence: the same recorded run shows no real request; 258 frontend tests pass.
The fallback itself is US-P012.

### DEF-029 - API tests load real credentials when the shell sets NODE_ENV

Owner: Claude Code. Severity: P1 (tests could read and write the shared spreadsheet and
database). State: Fixed in f38f321 (0.1.144), 2026-10-11. Found in the same audit. No
shared data was touched while reproducing it: the reproduction only inspected the loaded
settings.

Reproduction: `api/src/config.ts` skips `api/.env` only when `NODE_ENV` is `test`, and the
test runner sets that value only when the shell has not set it. With
`NODE_ENV=development` in the shell and a config without the fix, `config.test.ts` ran with
the real settings loaded: the new case "runs without the credentials in api/.env" failed,
and the CORS default case failed because the real `CORS_ORIGIN` was in effect.

Fix: `api/vitest.config.ts` pins `NODE_ENV` to `test` for every test. Regression:
`config.test.ts`, "tests never see real service settings". Evidence: with
`NODE_ENV=development` in the shell all 912 API tests pass and no credential is visible.

### DEF-030 - Ambient credentials bypass test isolation for assets, webhooks and GitHub

| ID | State | Priority | Scenario | Reproduction |
| --- | --- | --- | --- | --- |
| DEF-030 | Confirmed, Codex, 2026-10-11 | P1 | US-P011-AC03 | NODE_ENV=test with synthetic shared values, opt-in and VERCEL selects Mongo assets, configured Mux webhooks and enabled GitHub rather than local/absent implementations |

Reproduced before fixing in api/src/isolatedServices.test.ts, case DEF-030 ambient
credentials cannot select assets, webhook or GitHub in tests. Assertion failure:
MongoCourseAssetRepository / ConfiguredMuxWebhookService / github=true instead of
InMemoryCourseAssetRepository / null / false. Shared SDKs were stubbed; no network,
real credentials, .env contents or shared data were read. This is distinct from
DEF-029's dotenv import fix: pinning NODE_ENV=test still permits inherited shell
credentials through the direct asset/webhook settings and GitHub presence check.

Planned smallest repair: central isolated/test config filtering and common gated
asset/webhook/GitHub helpers. Existing API and local mail contracts are retained.
Regression and local delivery/fixed disposition follow in append-only records.


### DEF-030 - Resolution, 2026-10-11

| ID | Latest state | Fixing commit | Regression and remaining checks |
| --- | --- | --- | --- |
| DEF-030 | Fixed locally | 2010bfa (0.1.148), US-P011 | Ambient credentials now yield memory assets, absent Mux webhook/video and unconfigured GitHub under NODE_ENV=test, even with VERCEL and exact opt-in; live hosted/shared readiness remains a release check |

The pre-fix isolated assertion failed with MongoCourseAssetRepository,
ConfiguredMuxWebhookService and github=true. The same case now passes with
InMemoryCourseAssetRepository / null / false and no provider calls. Config removes
ignored service settings before validation; common presence helpers gate the
asset, webhook and GitHub paths. Test mode takes priority over hosted markers and
opt-in, keeping DEF-029's pinned environment and dotenv protection intact.

All five checks pass: 963 API tests/43 files, six HTTP journeys, API compilation,
265 frontend tests/34 files and Pages build/fallback (existing warnings). Independent
read-only review clear after a new injected-builder regression was fixed; no hosted
detection doubt remains in reviewed code. Synthetic SDK/FS/mail doubles and loopback
HTTP only; no actual .env inspection/change, shared providers or real mail. Existing
invalid UTF-8 bytes and all earlier defect entries are preserved. Local delivery is
not deployment; hosted login/startup, shared provider readiness and combined browser
acceptance remain unverified. No push. Codex stopped after the delivery-record commit.


### DEF-031 - Disabled-account login discloses account status

| ID | State | Priority | Reproduction |
| --- | --- | --- | --- |
| DEF-031 | Confirmed, Codex, 2026-10-11 | P2 | An isolated disabled user with its correct password receives 403 User account is disabled; a wrong password receives 401 Invalid email or password |

Reproduced before repair in adminUserChanges.test.ts, DEF-031 case under both
normal and /api prefixes: expected generic 401 but received 403. Existing login
checks status after password verification and exposes the account's disabled
state. US-A001-AC07 explicitly requires the wrong-password response instead.
Synthetic memory users and loopback HTTP only; no shared services or .env reads.
Planned repair: the existing generic invalid-credentials condition also checks
inactive status. Existing login paths and active-account responses stay unchanged.
Regression, fixing commit and release limitations follow in append-only records.


### DEF-032 - Login shares a users snapshot begun before a status change

| ID | State | Priority | Reproduction |
| --- | --- | --- | --- |
| DEF-032 | Confirmed, Codex, 2026-10-11 | P2 | Hold one instance's old users read, complete status PATCH on another, then log in on the first: disabled account receives 200; reactivated account receives 401 |

Four isolated HTTP assertions in adminUserChanges.test.ts failed before repair,
covering normal and /api prefixes and both active-to-disabled and disabled-to-active.
Sheets doubles capture and hold the old read; the status change finishes before
login starts. Protected requests already use fresh reads (DEF-027), but login
findByEmail still shares the old listUsers read. No real providers or .env reads.
Planned repair: optional fresh findByEmail selection using the existing fresh-read
coalescer, requested only by login; unrelated routes/read budgets stay as before.
Fixing commit, regression and release limitations follow in append-only records.


### DEF-031 / DEF-032 - Resolution, 2026-10-11

| ID | Latest state | Fixing commit | Regression and remaining checks |
| --- | --- | --- | --- |
| DEF-031 | Fixed locally | d81933e (0.1.153), US-A001-AC07 | Disabled login now matches wrong-password generic 401/body on both aliases and prefixes; hosted login/UI remains a release check |
| DEF-032 | Fixed locally | d81933e (0.1.153), US-A001-AC07 | Four held prior-snapshot/two-instance login cases pass after disable/reactivate; actual Sheets freshness/read quotas remain unverified |

DEF-031 reproduced with correct disabled password returning 403/disclosing status;
wrong password returned 401. The same login condition now treats inactive status
as invalid credentials without changing active login or route paths. Protected
requests retain their existing fresh session/user lookup and disabled-account 401;
reactivation restores both login and a still-valid old session.

DEF-032 reproduced before repair in both directions: a held users snapshot on one
instance allowed 200 after another completed deactivation, and refused 401 after
reactivation. Login now requests optional fresh findByEmail using the existing
fresh-read coalescer. Other email lookups and unrelated routes keep their behavior.
No new distributed compare-and-swap, session renewal or last-admin protection.

All five checks pass: 1055 API tests/46 files, six HTTP journeys, API compilation,
269 frontend tests/34 files and Pages build/fallback (existing warnings). Independent
read-only review clear after stale-login and new audit-metadata corrections; 92 new
cases exercise permissions/status/log/adapter behavior. Synthetic memory, Sheets/
Mongo doubles and loopback HTTP only; no real .env inspection, providers or mail.
Original invalid UTF-8 bytes and prior records are preserved. Local fixes are not
deployment verification: hosted/UI/keyboard, real Sheets/Mongo durability, read quotas
and operational logging remain unverified. Account/log writes are nontransactional;
append failure/crash can leave an unlogged change. No push; Codex stopped after the
delivery-record commit.

### DEF-033 - Unlimited login attempts consume a user-store read each time

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-033 | Confirmed, Codex, 2026-10-12 | P2 | US-P008-AC02 / INV-014 (login only) | 12 wrong-password POST /auth/login requests against an isolated memory user store all returned 401 and made 12 findByEmail calls |

Reproduced before implementation at b646366 on main with
`npm run api:test -- -- src/signInLimit.test.ts`. The DEF-033 regression expected
ten 401 responses followed by two 429 responses and only ten user-store reads;
it failed with twelve 401 responses and twelve reads. No shared service or fixed
server port was used. Root cause: the login handler reads users and checks the
password without any attempt reservation or account lock. Signup remains outside
this fix and the original INV-014 investigation's signup portion is still open.
### DEF-033 - Resolution, 2026-10-12

| ID | State | Contract | Regression evidence |
| --- | --- | --- | --- |
| DEF-033 | Fixed locally, Codex; implementation commit recorded in the next delivery entry | US-P008-AC02 / INV-014 login | signInLimit.test.ts now returns ten generic 401s then 429 without more users reads; all four routes and existing successful-login contract preserved |

The tenth completed failure in a rolling 15-minute window starts a fixed
15-minute per-normalized-address lock. Known, unknown and disabled addresses
share the response contract. Correct passwords cannot bypass a lock; another
account can sign in; success and completed password recovery clear attempts.
Mongo and memory adapters reserve capacity atomically before user reads, use
hash-only address keys and expiring records, and ignore stale completions.

Independent review regressions fixed disconnected polling, stalled-store
fail-open deadlines, remaining-time calculation after slow reads, and late
operations after a deadline. Abort signals reach read/write/CAS stages and late
successful reservations are cancelled. Protection fails open with a fixed safe
warning on storage errors/timeouts; already-issued writes can remain uncertain.
42 new isolated cases cover HTTP and Mongo collection doubles. Real hosted
Mongo cancellation/majority durability/TTL, Sheets quotas and deployed browser
behavior remain release checks. Signup and per-client controls are outside this
fix; INV-014's signup portion remains an investigation. No shared service used.
### DEF-033 - Delivery commit and verification, 2026-10-12

Implementation: `4199948` (0.1.160), US-P008-AC02, Codex, main. This append-only
delivery record follows in a separate docs(US-P008) commit with the required fresh
aligned version. Fixed locally; hosted verification is still pending.

Verified: npm run api:test (1097/48), npm run verify:journeys (6), npm run
api:build, npm run app:test (273/35), npm run app:build:pages. All passed;
existing stylesheet/test-setup/jsdom warnings remain. 42 new focused cases and
final independent review pass; live Mongo/Sheets/hosted-browser release checks
were not attempted. Lead ff23981 and its unstaged queue row were preserved.
No outside-file change was required. Codex stopped; no push or deployment.
### DEF-034 - Pending sign-in capacity has no overall wait bound

| ID | State | Severity | Contract | Evidence |
| --- | --- | --- | --- | --- |
| DEF-034 | Confirmed, Codex, 2026-10-12 | P2 | US-P008-AC02-11 | All four login routes with ten uncompleted memory-store tickets still wait until the test client aborts at 250 ms instead of respecting an injected 25 ms capacity wait |

Reproduced before implementation on main/base 9e06e86 in the four DEF-034 cases
of api/src/signInLimit.test.ts. The first run fails with AbortError and zero
user reads instead of 429, too-many-attempts, Retry-After 900 and no-store.
Existing 18 HTTP cases still pass. Root cause: reserve repeatedly receives busy
and sleeps 100 ms without an overall capacity deadline; storageTimeoutMs only
limits each individual store call. A dead worker's tickets occupy the account
for up to 15 minutes, so a healthy store gets repeatedly polled for that period.
The reproduction uses isolated stores and ephemeral loopback ports only.
### DEF-034 - Resolution and verification, 2026-10-12

Fixed locally by US-P008-AC02-11. An injectable capacityWaitMs (default 3000 ms)
now covers all sleeps and later polls after the first busy snapshot. Busy carries
the minimum expiry of pending tickets and counted failures. Deadline refusal
uses the existing 429 body/code, no-store and rounded Retry-After, without a
user read or password check, counting an attempt or starting/extending a lock.

A final atomic observation has at most min(100 ms, capacityWaitMs) to see genuine
completion/expiry during the last sleep; it cannot restart the wait. Default
capacity wait is about 3.1 seconds maximum with a responsive event loop. If this
read stalls, the last busy expiry is the retry hint. Client disconnects and
cancellation reach store operations; late successful probe tickets are released.

Twenty new regressions cover all aliases, both memory/Mongo CAS doubles,
earliest failure/ticket expiry, singular minutes, no new lock, frozen clock,
slow polls, genuine overlap, final-sleep completion and probe cancellation.
An independent review caught a final-sleep race, reproduced as two failing
regressions before correction; final review has no P1/P2 findings. All checks
pass: API 1117/48, journeys 6, API build, frontend 273/35, Pages build; focused
62 cases. Existing frontend warnings remain. Real Mongo cancellation/TTL,
hosted login/quotas and browser messages remain unverified. No shared service,
real mail or deployment was used. Fixing commit follows in the delivery entry.
### DEF-034 - Delivery commit, 2026-10-12

Fixed locally in `0c6882d` (0.1.164), US-P008-AC02-11, Codex, main/base
9e06e86. This delivery entry follows in a separate docs(US-P008) commit with
its own fresh aligned version. Verified all five required checks: API 1117/48,
journeys 6, API build, frontend 273/35 and Pages build; 62 focused cases,
including 20 new regressions; final independent review clear. Original defect
bytes were preserved. Live Mongo cancellation/TTL/majority, hosted login/quotas
and deployed browser messages remain unverified. No outside-file change needed.
No shared services, real mail, fixed-port servers, push or deployment; Codex stopped.
### DEF-PAGES-MONGO - Pages refuses configured MongoDB account storage

State: In progress. Severity P2. Owner Codex. Reported by Alex 2026-10-18;
main, base 90d9fdf. Contract: [hosted-check spec](specs/platform/deployment-and-checks.md).

Evidence: Alex's Pages log repeats "Hosted API must use configured Google Sheets auth
storage before Pages deploys" on all 12 attempts and exits 1. The completed US-P014
cutover records hosted /health/auth with store: mongodb. .github/workflows/pages.yml
still compares /health/config auth.storage only with google-sheets, rejecting healthy
MongoDB auth. The actual inline workflow program reproduced this failure with synthetic
{ auth: { configured: true, storage: 'mongodb' } }; no live request was needed.

The new pagesWorkflow.test.ts regression first failed for configured MongoDB and transient
HTTP recovery to MongoDB (2 failed, 8 passed). Allowing configured google-sheets or mongodb
makes all 10 cases pass. Memory, unavailable/unknown storage, missing/unconfigured auth and
HTTP failures remain refused. The separate auth health check and retry budget are unchanged.
Full API suite and local delivery commit are pending. A real hosted Pages rerun is unverified.

### DEF-PAGES-MONGO - Resolution and delivery, 2026-10-18

Fixed locally in 5afe5f3 (version 0.1.238). The Pages config guard accepts configured
Google Sheets or MongoDB auth and still rejects demo/unknown/unconfigured storage.
Verified: all 10 workflow regressions and the full API suite (1653 tests, 67 files),
plus git diff --check. The program under test is extracted from the actual workflow;
fetch and retry timers are synthetic, with no external calls. The two failing MongoDB
regressions passed after the fix. Existing records above are retained unchanged.
Hosted workflow execution remains unverified; no push or deployment was authorized.
This delivery record has its own required aligned version bump. Next: authorized push,
then verify that the Pages workflow accepts the hosted MongoDB account configuration.

### DEF-056 — Navigation links misleadingly imply dropdowns

- Severity/state: P3 / Verified locally. Reported by Alex and fixed 2026-10-22; owner Codex.
- Tested base/environment: `4e32b97`, source inspection plus an isolated built-app browser preview
  using disposable in-memory API stores (ports 4318/4319), synthetic teacher account, no shared data.
- Reproduction: Catalog and My Learning in the primary navigation rendered downward chevrons,
  but activated ordinary router links to `/courses` and `/library`, with no dropdown.
- Expected/source: direct page links must not imply menus; disclosure indicators belong to controls
  that expand. User feedback and `specs/platform/ui-foundation.md`.
- Impact/root cause: users expected dropdowns because decorative `nav-chevron` spans and styles
  advertised an interaction absent from the `RouterLink` implementation.
- Resolution: removed both decorative spans and the unused `.with-chevron`/`.nav-chevron` rules
  from the shared page header and the obsolete app-level copy. Navigation targets, active states,
  the real profile menu, and functional course accordions are preserved.
- Delivery commit: the commit containing this resolution, `fix(DEF-056): remove misleading navigation chevrons`.
- Regression evidence: `npm run app:test` passes all 440 app tests plus UI foundation checks;
  existing PageHeader base-href routing and ProfileMenu open/close tests pass. No new test was
  added merely to assert removal of decorative markup. `npm run app:build:pages` passes, with
  existing test-setup/jsdom and CommonJS/bundle warnings only.
- Browser checks: both links navigate to their expected Pages-base routes; profile menu opens;
  no misleading arrows on desktop or in a 375px-wide iframe viewport. Screenshots:
  [desktop](history/verification/2026-10-22/DEF-056/navigation-desktop.png),
  [375px](history/verification/2026-10-22/DEF-056/navigation-375px.png).
- Release limits: local verification only; no hosted mutation, push, or deployment performed.

### DEF-057 - Catalog settings show the wrong category for an uncategorized course

- Severity/state: P3 / Fixed 2026-10-22; owner Claude Code. Found on the hosted site while publishing
  ISTQB Foundation repetition (the dialog showed Software Testing, **Save settings** stored
  Uncategorized; choosing another category and back saved correctly).
- Root cause: `[value]` on a `<select>` is applied before its `@for` options exist, so the browser
  falls back to the first option while the component keeps the stored value. The same pattern was in
  the catalog language and sort filters (`pages/courses-page/courses-page.html`) and the draft
  recovery picker (`ui/course-draft-status/course-draft-status.html`); each showed the first option
  whenever its starting value was not the first.
- Resolution: each generated `<option>` now sets `[selected]` from the current value, in all four
  places.
- Delivery commit: the commit containing this resolution, `fix(DEF-057): dropdowns show their stored value`.
- Regression evidence: `DEF-057 catalog settings show the stored category, not the first option` in
  `course-view-page.spec.ts` failed before (`expected 'Software Testing' to be 'Uncategorized'`) and
  passes after; `npm run app:test` 441 tests pass.
- Browser check: isolated stores, ports 3001/4200, local admin; a new uncategorized course's Catalog
  settings dialog shows Uncategorized. The language, sort and draft pickers were not browser-checked.
- Release limits: not pushed; hosted check after deploy.


### INV-004 - Duplicate feedback issues after a restart (fixed in code)

Original investigation record (preserved):

| ID | Concern | Next verification at investigation | Related |
| --- | --- | --- | --- |
| INV-004 | Reproduced 2026-10-22 (X6, base `f4c1d61`): issue #1 is created, saving its link fails (500), then a fresh server retries (200) and creates issue #2. `api/src/multiInstanceFeedback.test.ts` keeps the desired single-issue assertion as `it.fails` on both URL prefixes; setup guards are outside the expected failure. Isolated memory stores and a stub GitHub service only; same-instance retry protection (DEF-025) is unchanged. | [Options and recommendation](handoffs/INV-004-options.md): choose durable atomic operation tracking plus marker-based recovery, or explicitly accept a smaller partial mitigation. No production fix implemented; real provider/storage behavior unverified. | US-P003-AC04 |

Resolution: fixed 2026-10-25 by Codex in `b274cce` (US-A006). A majority-acknowledged
MongoDB operation journal atomically claims creation and records the issue result
independently of feedback triage. Restart, failed final-link save and non-work
retry reuse the recorded issue. Unknown external outcomes do not authorize another
POST; trusted marker lookup or documented operator reconciliation is required.
Both `multiInstanceFeedback.test.ts` URL-prefix reproductions are now ordinary
passing tests. `feedbackTriage.test.ts`, `githubFeedback.test.ts`, `safeRetries.test.ts`
cover independent claims, lost responses, failure windows and recovery. Full API
suite: 2,658 passed. Real Atlas/GitHub permissions/recovery and hosted cutover
remain release checks; no unconditional exactly-once external transaction claimed.

### DEF-064 - Late feedback replies can overwrite another session's admin state

- Severity/state: P2, Fixed in code, 2026-10-25. Owner Codex; fix `b274cce` (US-A006).
- Reproduction at `5118eb5`: hold an admin inbox or triage promise, replace the
  signed-in account and set the new account's safe inbox/busy state, then resolve
  the old request. Old feedback or its error replaces the current state and clears
  its busy flag. `feedback-session.spec.ts` reproduced both failures before the fix.
- Expected: replies belong to the initiating account/token, with no stale state
  writes or cleanup affecting a different session.
- Resolution: use stable account/token and current-admin checks; same-account
  object refreshes can complete pending work. A separate red/green regression
  catches a loading flag stranded by object-identity guards after refreshed account
  details. Logout resets inbox state; composer responses have their own generation.
- Evidence: three session regressions pass; full app 551 passed. Synthetic TestBed
  sessions only. Hosted account switching/role refresh remains a release check.

### DEF-065 - Feedback responses omit explicit private cache protection

- Severity/state: P2, Fixed in code, 2026-10-25. Owner Codex; fix `b274cce` (US-A006).
- Reproduction: isolated HTTP GET /feedback and PATCH /feedback/:id/triage as an
  admin, also under /api, returned 200 with `cache-control=null` and `vary=Origin`.
  Personal submission bodies had no explicit private/no-store policy, contrary
  to the app's private-data contract. This was confirmed by the independent reviewer
  and failing `typedFeedbackRoutes.test.ts` assertions.
- Expected: feedback responses (including errors) are `private, no-store` and
  vary on Authorization.
- Resolution: feedback middleware applies the private headers before parsing and
  authentication for both aliases. HTTP regressions now pass; the admin browser
  archive response also returned `private, no-store`.
- Evidence: full API 2,658 passed. Local HTTP/browser only; verify hosted headers
  after deployment. No production feedback records were accessed.

## Findings resolved 2026-10-29

### DEF-064 — Paid return stays on "Confirming payment" after successful enrollment

P2 / Verified, Codex, 2026-10-29, `main`, discovered at `64439cb` during isolated US-P020
browser verification. Reproduction: a confirmed new learner buys the published demo course
through `FakePaymentService`; checkout and paid-confirm API replies succeed, and the account
repository includes the course, but `/courses/demo-course-1` remains on "Confirming payment..."
with Buy visible. [Before screenshot](history/verification/2026-10-29-header-signup/payment-return-before-fix.png).
The payment return starts in the route constructor before initial NavigationEnd and can overlap
same-account `/me` hydration. `courseResponseIsCurrent` rejects the result when the initial path,
generation or session object changes. This guard is unchanged from the frontend base `80aa541`.
Expected: the paid result completes for the same account and course after initial navigation;
another account or course must still reject stale replies. Regression:
`DEF-064 completes a paid return while initial navigation and account hydration settle`.
Resolution 2026-10-29, `a2e100b`: wait for query-cleanup navigation and use a return-specific
account/token/course/generation guard. Three DEF-064 regressions now pass, including rejecting
changed-account/course results. The isolated paid-session browser replay reaches Start learning
and "Payment received" ([after screenshot](history/verification/2026-10-29-header-signup/confirmed-purchase.png)).
No real Stripe, shared data or money involved.

Hosted verification 2026-10-30, frontend 0.1.536: the user completed real Stripe **test-mode**
checkout for ISTQB Foundation 4.0. Return showed "Payment received. The course is in My Learning"
and Start learning; access survived reload, and My Learning listed the course. The Stripe webhook
returned 200. The user performed the shared-store transaction; the agent observed read-only.
Fix remains `a2e100b`; no real-card/live-money charge was tested.
[Hosted evidence](history/verification/2026-10-29-header-signup/hosted-checks.md).

### DEF-065 — Notification preference can change while its save is in flight

P2 / Fixed, Codex, 2026-10-29, `main`, discovered at `64439cb` in independent review of
US-P019. Reproduction with the actual save method and a deferred account response: Organization
on → toggle off → Save → toggle back on before reply. Server persists off; the visible toggle is
on, dirty becomes false and the page claims saved. The new checkbox is enabled during save and
the existing profile save snapshots current values after awaiting. Expected: users cannot make
an unsaved preference appear saved. Regression: the role-specific Notifications-tab cases assert
all toggles are disabled while `profileSaving` (labeled DEF-065).
Resolution 2026-10-29, `a2e100b`: disable preference controls during the existing profile save.
The three role cases failed before and pass after; profile round-trip/dirty-state tests pass.
Together with DEF-064, focused tests are 19/19 and the full app suite is 612/612.
The [verification record](history/verification/2026-10-29-header-signup/README.md) records remaining hosted checks.


## Findings resolved 2026-10-30

### DEF-066 — Null milestone revision fields break hosted career reads

P2 / Verified, Codex, 2026-10-30; implementation base `177d48f`, `main`; hosted discovery on
production `dpl_CXTpjqJY7vnXvmXdJ1jxuotDSvYL`,
frontend 0.1.536 (also seen in the previously open 0.1.532 tab). During the user's real signup
walkthrough, a new learner's Home showed **Career path Unavailable — Career path could not be
loaded**. Read-only request logs showed `GET /api/career-paths` → 400 and
`GET /api/users/me/careers` → 500 at 2026-10-30 15:02 UTC. A separate unauthenticated GET to
the public route reproduced 400 `Invalid request body`, with issues on
`steps[0..3].requirementVersion` (expected number, received null) and
`steps[0..3].requirementHistory` (expected array, received null).

Expected: valid public career definitions and new-account guidance load; malformed stored data
must not be reported as an invalid caller request (career and reliability specs). Cause evidence:
`careerPath.ts` defaults these fields for missing values but rejects explicit null; the Mongo
repository returns stored documents directly. The writer/migration that introduced null is not
established. No production records were changed. Impact: published-career browsing and learner
career context fail, independently of Turnstile/email confirmation.

Original next action: reproduce with isolated stored milestone documents containing those nulls; determine the
backward-compatible normalization boundary or required data repair, then add a permanent
regression. At discovery, fixing commit: none; no fix or shared-data repair had been performed.

Resolution 2026-10-30: fixed locally in `99cb544` (0.1.538). Both repository read adapters
normalize only null/missing requirement versions/history in draft and published snapshots to
`1`/`[]`, without saving records. Real history, criteria, document revision/timestamp and learner
achievements remain intact; request bodies still reject nulls. No data repair was needed.

Regression: six cases failed before; eight DEF-066 cases now pass. Focused suites 137/137;
full API 2,916/2,916; release journeys 20/20; API and Pages builds passed. Isolated browser
Home, career comparison, follow and return-to-Home passed with a null-metadata fixture. Review
found no blocking issues; the memory-record preservation assertion was tightened (repository
suite 19/19). [Detailed evidence](history/verification/2026-10-30-def-066/README.md).

Hosted verification 2026-10-30: released in 0.1.542 (`9610f47`), Vercel production
`dpl_4uaGy3jLhWefkts5idrydJu2TfDY`. Public list and all three detail routes return 200
with valid requirement metadata; the original learner and real teacher now have normal Home
career guidance. No stored records were repaired.
[Hosted evidence](history/verification/2026-10-30-release/walkthrough.md).
DEF-067 remains a separate later-deployment release check.


### DEF-067 — An open Pages tab cannot load routes after a newer deployment

P2 / Fixed, Codex, 2026-10-30; implementation base `4a2db58`, `main`;
observed 0.1.532 tab across the 0.1.536 Pages deployment.
Reproduction: keep Home open on the older release, then after the new deployment click
**Browse courses** or header **Catalog**. Both leave the page on Home without a usable recovery
message. The tab still references `/qi-education/main-2OHAS6IG.js` and displays Version 0.1.532;
current Pages HTML references `main-QJYHBIJ2.js`. The old bundle's Courses route imports
`./chunk-QJUHZA7H.js`; a read-only GET of that asset returns **404 text/html**. Full navigation
to `/courses` loads 0.1.536 and restores navigation.

Expected: a lazy-route asset removed by a release offers a safe reload/recovery path; existing
editor drafts must remain protected. Cause evidence: Pages replaces hashed assets, while the
running old bundle retains its old dynamic-import URLs. Documentation-only releases still
change asset hashes through aligned app-version metadata. No unrelated code changed during
the reproduction; the user's account and form state were preserved on the reload.

Original next action: isolated two-build browser reproduction and a regression for failed lazy imports, then
implement safe route recovery that respects unsaved work. At discovery, fixing commit: none; reload was the
verified workaround. No source fix had been made at discovery.

Resolution 2026-10-30: fixed locally in `5e4683a` (0.1.540). A router error handler recognizes
failed dynamic imports and exposes a root recovery message without removing the current page.
Reload page explicitly calls native location.reload(), including on fragment-bearing addresses;
there is no automatic reload or redirect. Unsaved course changes disable it and are checked
again at activation. Existing guards and browser-departure recovery remain unchanged.
Successful navigation clears the message; unrelated exceptions retain normal error reporting.

Regression: seven initial cases failed before implementation. Review caught same-URL fragment
navigation in the first anchor-based action; four strengthened/new activation and initial-entry
cases failed against that action before it became a native reload button. Final frontend suite
620/620, UI-foundation checks and Pages builds pass. Isolated browser build swap 0.1.539 →
0.1.540 proved reload at a fragment URL and restored Catalog. A separate unsaved editor kept
its title, honored Cancel, and disabled Reload after an accepted departure hit a missing chunk.
[Detailed evidence](history/verification/2026-10-30-def-067/README.md).

Remaining: after authorized deployment, keep a tab containing this fix across a later Pages
release and verify its cache/CDN recovery. Tabs already running older code need one manual
browser reload to acquire the fix. Fixed locally, not Verified on production; no deployment,
shared data changes, asset retention policy or service worker was added.
