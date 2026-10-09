# Career path journey audit — 2026-10-05

Owner: Codex. Branch: `main`. Base: `9a2f30b`. The working tree also contains
unfinished DEF-002–DEF-005 changes; the local walkthrough uses those changes.
Those defects are not declared resolved by this audit. See the
[handoff](../../work_queue.md) for their remaining work.

## Assessment

The application supports course discovery, enrollment, and a learning workspace,
but the career path is currently a presentation of fixtures. There is no path
entity, selected path on an account, persisted curriculum, or path progression
service. A learner cannot complete an end-to-end career path journey today.

Improve trust first: remove invented activity, make unavailable actions honest,
and reconcile learning progress. Then introduce a small, curated path model and
one useful next action. Personalization and switching should follow that
foundation. A visual redesign alone would leave the main failures intact.

This audit records one new confirmed defect, DEF-014, and extends the evidence for
DEF-007, DEF-009, and DEF-011. Existing feature foundations US-L002, US-L003,
US-L006, and US-L007 are reused. New ideas are Proposed stories US-T008,
US-L009–US-L012, and US-P004 in [user_stories.md](../../user_stories.md).
No Proposed feature was implemented. Existing resolved defect records remain.

## Journey coverage

| Stage | Current behavior and evidence | Improvement / record |
| --- | --- | --- |
| Enter / create account | Signup asks name, email, password; it has no goal or path selection. Home immediately assumes an advanced analyst goal. | US-L009: offer goal/path selection or a truthful undecided state; allow exploration before commitment. |
| Understand the goal | `StudentSummary` derives its target role from the permission role; all students see the same target. A saved test-management goal does not change Home. | Separate permission roles from career goals. US-L009; goal storage depends on US-L003. This missing connection is a feature gap, not a new authorization defect. |
| Discover and compare paths | No path route, repository, service, or API endpoint exists. Catalog search includes free-text `partOfCareer` / `careerGoals`, but those strings do not define sequences. | US-L006 provides the read model; US-L009 provides comparison by outcome, steps, estimated effort, and availability. |
| Choose / adjust a track | Home has an enabled Adjust track button with no binding. No account field holds a path ID. | Existing DEF-011; make availability honest first, then US-L009 / US-L011. |
| Understand the next step | Home shows one completed chapter, one current chapter, and a specialization suggestion. All are fixtures. Recommendation count is always two. | Existing DEF-009; US-L002 supplies real activity, US-L007 emphasizes the actual primary action. |
| Act on a recommendation | Home action rows are plain articles without links/buttons. Their `NextAction` type has no course, lesson, or destination ID. | US-L010: an actionable next step linked to actual eligible content, with a reason and alternatives. Missing navigation is a Proposed capability, not another copy of DEF-011. |
| Preview / enroll | Catalog and course detail routes exist. Paths cannot map their steps to course IDs. Access/lifecycle fixes are still unfinished. | Finish DEF-002–DEF-005 before connecting paths to content. US-L010 must reuse entitlement checks, not grant access merely because a course is recommended. |
| Learn / resume | Workspace completes text/resources manually, videos on ended, quizzes on pass. Completion uses localStorage keyed by email and course ID; the next incomplete component is restored on the same browser. | US-L002: a shared account progress source, stable user IDs, explicit completion rules, and cross-device resume. Preserve this useful same-browser behavior. |
| Measure progress | My Learning renders literal 0%; Home renders fixed 38% path / 62% active course for students. An untouched one-question quiz renders 100% complete. | Existing DEF-007 / DEF-009; new DEF-014. Define question position, attempt progress, course completion, and path completion as separate quantities. |
| Finish / reach a milestone | Completing both seeded components stores both IDs. No course/path completion message or next milestone follows, and Home remains unchanged. | US-L012: honest completion and the next available step. Course completion must not imply an external certification or job qualification. |
| Change goals | Profile has free-text learning goals saved explicitly on this device. No goal-driven recommendation or switch policy exists. | US-L003, US-L009, US-L011: account goal storage, explicit switch confirmation, and retained learning history. |
| Maintain the curriculum | Teachers can edit course career labels. There is no curator, path lifecycle, revision, alternative-course relation, or structural validation. | US-T008: governed, versioned path curation with explicit role permissions. Course ownership alone must not authorize editing every path. |
| Recover / trust the system | Home fixtures require no API data, so they mask empty, unavailable, and loading states. Path failure/privacy handling is not implemented. | US-P004: distinguish missing path, no selection, inaccessible course, temporary failure, and stale saved state; protect private account data. |

## Confirmed defects and narrower observations

| ID | Result in this audit | Priority rationale |
| --- | --- | --- |
| DEF-009 | Home shows 38% career progress, 62% active course, and a completed chapter without corresponding account activity. After completing a real seeded course, these values stay the same. | P2: the central learning summary misrepresents the learner's position. |
| DEF-007 | Both components of Retained archived course are completed in local storage; My Learning still shows 0%. | P2: progress contradicts the workspace. |
| DEF-011 | Pointer activation of Adjust track changes neither route nor view; there is no dialog. Template has no output binding. | P3 currently; the path-selection feature itself requires a separate story. |
| DEF-014 | At Question 1 of 1, before selecting/submitting an answer, text and the accessibility tree both report 100% quiz completion. | P2: the displayed result confuses question position with completed work. |

Do not duplicate these as new defects for each page. Saved profile goals not
affecting guidance, absent path selection, absent milestone handling, and absent
curation are feature gaps because the corresponding behavior is not implemented.
Access risks DEF-003/DEF-004 remain governed by their existing records.

## Recommended contract and data boundaries

The following is a proposal, not an approved schema or implementation plan.

- A path has a stable ID, revision, title, target career role, outcomes, availability,
  ordered steps, and required/optional classification. Steps reference stable
  course IDs and explicitly modeled alternatives. Preview-only entries are marked
  as such and cannot enroll learners into nonexistent courses.
- An account selection records user ID, path ID/revision, and an explicitly chosen
  goal. Teaching/admin permissions do not determine career aspirations. Path
  selection, course enrollment, and paid entitlement remain separate operations.
- Account progress records course/component identity and verified outcomes needed
  by the selected completion policy. Existing stateless quiz scoring is not a
  persisted assessment record. Store enough evidence to support the displayed
  milestone without inventing an exam certification.
- Define a stable denominator for path completion. Decide how optional steps,
  alternative courses, prior learning, archived courses, and curriculum revisions
  affect it before implementation. Completing both alternatives must not count a
  required step twice. Editing a live path must not silently erase past work.
- Keep a curated, explainable recommendation rule first: eligible incomplete step,
  relevant goal, and prerequisites. Decide whether prerequisites are guidance or
  enforced gates. Do not infer job readiness from a progress percentage.
- Add focused path/progress services and a distinct API repository when selected.
  Avoid adding another large responsibility to `AppStateService`. Validate IDs,
  references, invalid dependency cycles, ordering, and availability at the boundary.
  Share or explicitly map DTO contracts between API and Angular consumers.
- Use permission-aware course read contracts for path previews. Private drafts,
  answer keys, and other learners' progress must not appear in path responses.
  Preserve the project's Sheets/demo compatibility; US-L006 fixtures need no
  changes to shared Sheets. Storage and migration choices remain open.

## Delivery order within the career path scope

| Order | Work | Outcome / dependency |
| --- | --- | --- |
| 0 | Finish the already selected DEF-002–DEF-005 batch | Verified content, enrollment, and assessment boundaries; currently unfinished, no fix commit. |
| 1 | DEF-007 / DEF-009 with US-L002; DEF-011 availability; DEF-014 labeling | Honest progress and controls before new guidance is exposed. Do not wait for a full path feature to stop showing fictional activity. |
| 2 | US-L006 and US-T008 | Explicit path/course references and a defined curator; governance can be scoped after agreeing roles and revision policy. |
| 3 | US-L003 and US-L009 | Persist an explicit selection/goal and compare available paths. Server profile storage need not block read-only path previews. |
| 4 | US-L010 and US-L007 | One real primary action with direct resume/enrollment behavior and useful alternatives. |
| 5 | US-L012, then US-L011 | Completion/milestones and safe goal/path switching using persisted progress. |
| Cross-cutting | US-P004 and accessibility checks | Exercise failure, session changes, privacy, retry, and keyboard/mobile behavior for each increment. |

This is an audit recommendation, not permission to start any Proposed item. The
user's next selected scope takes precedence over this sequence.

## Decisions to settle when selecting implementation

1. Which career roles and real course sequences are approved? The five tracks in
   US-L006 are imported preview scope, not verified production curricula.
2. Who authors, reviews, and publishes paths? Can teachers propose associations
   for their own courses while admins govern the whole sequence?
3. Are prerequisites advisory or enforced, and what evidence counts as completion
   for each component/course/milestone? Prior certification recognition is separate.
4. How should revisions, substitutions, withdrawn courses, optional steps, and
   existing learners affect the progress denominator and selected path revision?
5. May an account have multiple active paths? The suggested first increment uses
   one primary path, while keeping historical progress independent of selection.
6. What does switching retain, and how are profile goal edits related to switching?
   Recommend explicit selection rather than silently changing the path from prose.

## Verification and evidence

Environment: Windows, Node 22, Angular development server on 127.0.0.1:4200,
explicitly injected in-memory API repositories on 127.0.0.1:3001, no Mux service,
GitHub stub. The browser API override is pinned to that local API before mutations.
Disposable seed code is `.playwright-mcp/def002-005-server.mjs` (ignored local
harness from the unfinished defect batch); reproductions below describe the
required data so they do not rely on the untracked file being delivered.

| Check | Evidence / result |
| --- | --- |
| Student Home | [Desktop capture](career-home-desktop.png): assumed analyst target, 38% / 62%, two recommendations, invented completed/current chapters. |
| New account | Signup created a disposable learner; Home immediately showed the same fixture activity. [Its empty library](career-new-account-library.png) confirms no courses were enrolled before the separate enrollment probe. |
| Adjust track / destinations | Route remained `/`, zero dialogs after activation, zero links/buttons inside `.db-action-row`; template corroborates the result. |
| Actual component completion | Seed an enrolled course with one text and one valid one-question quiz. Mark text complete, answer/pass/finish quiz. Storage contained `text` and `quiz`; no course-complete or next-milestone message followed. |
| Library contradiction | [After-completion capture](career-library-after-completion.png): the completed seeded course still shows 0%. |
| Goal mismatch | Save job title QA Engineer and goal Move into test management in Profile; saving is labeled device-local. Home still shows Student to ISTQB Advanced Test Analyst. |
| Mobile Home | [390 × 844 capture](career-home-mobile.png): content fits horizontally and cards stack. The three summary cards push all useful steps below the initial viewport; prioritize an actionable next step when it exists. |
| Progress semantics | DOM inspection found no progressbar role/value on Home's path/action bars. The main percentage is readable as text, but action bars expose no numeric value. Recommend named semantic values or equivalent text in US-L010; this is not a complete accessibility conformance audit. |
| API / source inventory | Route/repository/model search finds no career path entity/endpoints or server learning-progress persistence. Current course metadata has free-text career labels; current account has enrollments only. |
| Untouched assessment / path API | [Quiz capture](career-quiz-before-answer.png) and [sanitized observations](observations.json): zero checked answers, no completed IDs, 100% complete; local GET `/career-paths` and `/career-paths/technical-tester` both returned 404. These absent endpoints are US-L006 scope, not a newly broken released API. |
| API compilation | `npm.cmd run api:build` passed against the working tree used for the walkthrough. This does not verify or close the unfinished lifecycle fixes. |
| Documentation checks | Seven documentation entry points/report files have no broken local links; the backlog has 25 unique story IDs and 74 unique scenario IDs. Saved quiz observations match the reported untouched state; `git diff --check` passed. |

Relevant source entry points:

- [Dashboard template](../../../app/src/app/pages/dashboard-page/dashboard-page.html)
  and [page contract](../../../app/src/app/pages/dashboard-page/dashboard-page.ts).
- [Shared state](../../../app/src/app/services/app-state.service.ts): `student`,
  `courses`, `nextActions`, `activeCourse`, `recommendedCourses`, and role label/progress helpers.
- [Frontend models](../../../app/src/app/app.models.ts),
  [route table](../../../app/src/app/app.routes.ts),
  [catalog search](../../../app/src/app/pages/courses-page/courses-page.ts).
- [Learning workspace](../../../app/src/app/pages/course-view-page/course-view-page.ts):
  `activeQuizProgressPercent`, completion storage, initial active component, and quiz finish.
- [Library template](../../../app/src/app/pages/library-page/library-page.html),
  [profile storage](../../../app/src/app/services/profile.service.ts).
- [API routes](../../../api/src/server.ts), [course model](../../../api/src/course.ts),
  and [account model](../../../api/src/auth.ts).

No shared Sheets, MongoDB, Mux, or GitHub data was mutated. No push/deployment
was performed. No real curriculum, external certification, payment flow, live
provider durability, assistive technology, or cross-device backend persistence
was verified. Absent career path flows cannot be verified end to end until their
contracts are selected and implemented. No product fixes were made by this audit.

Delivery scope: documentation, captures, sanitized observations, and the required
aligned version bump from 0.1.41 to 0.1.42. The staged `AppStateService` change is
only its version line; existing lifecycle code/tests and draft lifecycle documents
remain uncommitted. Full unit suites were not rerun for this documentation-only
delivery. Their earlier results remain historical handoff evidence, not a claim
that the unfinished fixes now pass final verification.
