# Work queue

Updated: 2026-10-09. Working branch: `main`. Original audited base: `6e19213`.

## Active work

**US-P001 — Role journey verification.** In progress. Owner: Claude Code.
Delivered: `npm run verify:journeys` and two manual walks of the teacher, admin and learner
screens ([record](verification/2026-10-09/teacher-walkthrough.md)). Remaining: the live
rehearsal in the [teacher rehearsal checklist](release/teacher-rehearsal-checklist.md)
before the first teacher session, and the browser-runner decision.

**Career paths, increment 2 — selected by the user 2026-10-10.** This lifts the feature pause
below for career paths only. Branch: `main`. Base: `35567db`. Split decided by Claude Code
as lead; the two owners touch no common file.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | Completed-step browser check (spec remaining 1); US-L010 next step on the roadmap and Home; US-L011 confirm before switching; US-P004-AC01–02 in the page and service | `app/src/app/pages/career-path-page/`, `app/src/app/pages/dashboard-page/`, `app/src/app/services/career-path.service.ts`, `app/src/app/utils/career-path-progress*` | Delivered locally: completed-step check, US-L010 (0.1.76), US-L011 and US-P004-AC01–02 (0.1.77). Next: merge Codex's part |
| Codex | US-L002-AC02 lesson completion saved to the account; US-P004-AC03–04 on the selection API | `api/src/**`, `app/src/app/services/learning-progress.service.ts` and its spec; authorized grading-URL-only exception in `course.service.ts` | Delivered locally: `b66a8e1` (implementation, 0.1.79); this delivery-record commit bumps to 0.1.80 for the hook. Initial guard `5c2a4b5`; `a81255d` preserved with user approval. [Spec](specs/US-L002-account-progress.md) written first. Verified: 352 API/156 frontend tests, six journeys, API/Pages builds; final independent review clear. Not verified: real Mongo durability/concurrency, hosted API/frontend, two-device browser walk. No shared-service mutations or push. Next: Alex's hosted Mongo/release check; Codex stopped |
| Alex | Hosted MongoDB check, then map real courses and publish the paths | Admin page, hosted | After both merge |

Decisions and the scenario map are in the [spec](specs/US-L009-L012-T008-career-paths.md).
User correction 2026-10-10: Codex works and commits here on `main`, with the hook's
aligned version bump, without pushing. Claude has finished editing.
Out of scope: CV analysis, teacher proposals, unpublishing a path, step reorder, US-L003.
Lead check 2026-10-10 on `190a3e8`: Codex stayed within its files plus the recorded
`course.service.ts` exception; existing routes are unchanged and the old quiz route remains.
352 API and 156 frontend tests, six journeys and the Pages build pass. Browser, in-memory API:
a lesson completed in one browser showed as 50% after all browser storage was wiped and the
learner signed in again. Open: the service's sync messages (`accountSyncError`) are shown on
no page yet, so a quiz passed before this change counts only in the browser that passed it
until it is passed again, without telling the learner. Not checked: keyboard-only walk.
Next: Alex decides on the push; then the hosted MongoDB check and publishing real paths.

**Session 2026-10-11 (3) — started by the user with "let's start working on the next".**
Branch: `main`. Base: `28cf2fa` (local, 0.1.108; five commits not pushed). Picked by Claude
Code as lead: DEF-022, the only open confirmed defect, for Claude. It is one component, so
Codex takes the next independent open item with no file in common: US-P003 (API only).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | DEF-022: the lesson editor dialog and the component picker take focus, close on Escape, keep Tab inside and return focus | `app/src/app/ui/course-builder/**`, the DEF-022 entry in `docs/defect_management.md` | In progress |
| Codex | US-P003 / INV-003, INV-004: reproduce, then make overlapping signup, enrollment and retried triage safe within one API instance | See the [handoff](handoffs/US-P003-safe-retries-codex.md) | Delivered locally: c13a800 (implementation, 0.1.111); this delivery-record commit also has the hook-required aligned patch bump. Owner Codex, main/base fc98679 (required ancestor confirmed), selected 2026-10-11. Spec written first; AC01/02/03 reproduced as DEF-023/024/025 before changing code (12 cases: 10 RED, 2 memory enrollment cases not reproduced), latest states Fixed appended. Instance-only email/user/feedback queues and pending-issue checkpoint; no repository/frontend or other-route wiring change. Verified: 34 focused HTTP cases, 534 API tests, six journeys, API build, 225 frontend tests, Pages build with existing stylesheet warnings/jsdom notices; read-only review clear. Claude's 35b45c2 preserved; defect records appended as bytes, DEF-022 untouched. Not verified: real Sheets/GitHub, hosted/browser, multiple instances/restart. AC01..03 removed; distributed/restart AC04 remains Proposed with Alex's shared coordination/durable issue recovery decision in the spec/backlog. No outside-scope file needed, branch/worktree, shared providers or push. Next: Alex's distributed/restart decision and separate release checks; Codex stopped |

**Session 2026-10-11 (2) — started by the user with "let's start working".** Branch: `main`.
Base: `18ae097` (pushed, 0.1.103). Picked by Claude Code as lead: the open check of the last
increment (US-T013 keyboard-only walk) for Claude; it is too small to split, so Codex takes
the next independent open item, US-P006-AC06 (P1 story, API only).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-T013 leftover: keyboard-only walk of the new quiz editor rows and the learner's tick boxes; fix what it finds | Everything under `app/` except the version lines, `docs/specs/US-T013-simple-quiz.md` | Delivered locally in `9a4d032` (0.1.105): focus kept after deleting an answer or a question, focus outline on learner answers; record in the [spec](specs/US-T013-simple-quiz.md) |
| Codex | US-P006-AC06 / INV-018: unchanged thumbnails are served from the browser cache | See the [handoff](handoffs/US-P006-thumbnail-cache-codex.md) | Delivered locally: f1aed61 (implementation, 0.1.106); this delivery-record commit also has the hook-required aligned patch bump. Owner Codex, main/base df556f0 (required ancestor confirmed), selected 2026-10-11. INV-018 reproduced first and promoted to DEF-021, now Fixed; exact asset-version 200s now private/immutable, access and all other responses unchanged. AC06 removed from the open backlog; contract/evidence in docs/specs/US-P006-class-load.md. Verified: 42 focused HTTP cases, 500 API tests, six journeys, API build, 222 frontend tests, Pages build (existing stylesheet warnings/jsdom notices); read-only review clear. Claude's 9a4d032 preserved. Not verified: actual browser cache-hit transfers, hosted API and real providers; hosted AC02 budget remains open. No outside-scope change needed. Shared working tree preserved; no branch/worktree, shared-service mutations or push. Next: separate hosted/browser release check; Codex stopped |

Lead check 2026-10-11 on `977bc0c`: Codex stayed within its files and the version lines; the
code change is three lines in the thumbnail read route and no other route changed. 500 API and
222 frontend tests, six journeys and the API and Pages builds pass. Browser, in-memory API: a
thumbnail requested with its asset id came back `private, max-age=31536000, immutable`; without
`v` it was `no-store`; a wrong `v` and an anonymous read of the draft were 404 `no-store`.
Not verified: that the second read is served from the browser cache (the browser reports no
transfer sizes across origins), real key presses in the quiz editor, hosted behavior.
New: DEF-022 (Open), the lesson editor dialog does not manage keyboard focus.
Next: Alex decides on the push; DEF-022 is the lead's recommended next item.

**Session 2026-10-11 — started by the user with a reference design for a simpler quiz editor.**
Branch: `main`. Base: `a79828f` (pushed and deployed, 0.1.98). Decided by Alex: 1 point per
question, 2 to 6 answers, one or more correct answers, optional explanation per question;
question images later.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-T013 frontend: quiz editor rebuilt after the reference (question, answer rows with a correct box and delete, Add answer, optional explanation, New question); learner quiz view for one or several correct answers | Everything under `app/` | Delivered locally in `1e6506b` (0.1.100); acceptance in the [spec](specs/US-T013-simple-quiz.md) |
| Codex | US-T013 API: quiz model, readiness rules and grading; US-T014 question image recorded as Proposed | See the [handoff](handoffs/US-T013-simple-quiz-codex.md) | API increment delivered locally: 1808432 (implementation, 0.1.101); this delivery record has the hook-aligned patch bump. Owner Codex, main/base 5bfda0d (required commit present), selected 2026-10-11. Spec/stories written first. One point, 2..6 answers, exact-set grading, optional explanation, learner multiple hint and question/answer whitelist; both attempt routes and legacy four-option/points/answerId requests retained, high old pass marks clamped for grading only, account proof aligned with raw stored quiz/Finish. Verified: 458 API tests including 33 simpleQuiz cases, six journeys, API build, 221 frontend tests and Pages build on concurrent combined tree (stylesheet budget warnings). Read-only review: no Critical/Important; malformed unused alias Minor reproduced and fixed; 5,213 independent set combinations pass. No newly confirmed existing defect or further outside-scope need. Not verified: hosted frontend/API, real Mongo durability/providers, combined browser/keyboard/accessibility; Claude owns frontend AC07/08. US-T014 Proposed only. app/ and CLAUDE.md preserved except required version lines; isolated memory stores and ephemeral ports only; no shared data, push or deployment. Claude frontend commit 1e6506b preserved; frontend suite/Pages build repeated after it and pass. Delivered API AC01..AC06 removed from the open backlog; Claude AC07/08 acceptance remains open, US-T014 stays Proposed. Next: Claude records the combined browser acceptance; hosted/provider checks require separate release authorization. Codex stopped |

Lead check 2026-10-11 on `becd1d6`: Codex stayed within its files and the version lines. 458 API
and 221 frontend tests, six journeys and both builds pass. The new editor and learner view
were exercised against the new API in the browser (in-memory); details in the spec. US-T013 is
Done locally and out of the open backlog; US-T014 (question image) stays Proposed.
Next: Alex decides on the push.

**Session 2026-10-10 (4) — started by the user with feedback from the first teacher who built
a course on the live site.** Branch: `main`. Base: `a2926e0` (pushed and deployed, 0.1.90).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-T010 guided course form: steps with checkmarks and Back/Next, required-field marks, bullet lists that show their bullets. DEF-020: a published course looks impossible to edit, because the form is locked and "Start revision" is a small button inside step 3 | `app/src/app/pages/**`, `app/src/app/ui/course-review-panel/**`, `docs/specs/US-T010-guided-course-form.md` | Delivered locally in `baf852c` (0.1.92); [spec](specs/US-T010-guided-course-form.md) |
| Codex | US-T011 quiz authoring; US-T012 move a lesson to another chapter | See the [handoff](handoffs/teacher-feedback-builder-codex.md) | Delivered locally: a8595d6 (implementation, 0.1.96); this delivery-record commit also has the hook-aligned patch bump. Owner Codex, main/base 853c249; prior spec 6928646/43f480b and route exception preserved. Quiz add/focus/top alignment, toggle/summaries/readiness and cleaner layout; cross-chapter drag/select with focus, full-content state/save/recovery/conflict and guards; DEF-T012-CALLBACK reproduced then fixed. Verified: 425 API/215 frontend tests, six journeys, API/Pages builds; 27 focused builder/state cases and seven media API cases. Review scroll-clamp and move-focus regressions fixed. Not verified: actual 375px/tall viewport, native keyboard/drag browser, live Mux/Mongo/Sheets/hosted behavior. Claude browser: add several questions on tall/short screens, header top and field focus, Enter/Space collapse/reopen, collapsed summaries and readiness at 375px; drag before/end/empty/collapsed chapter, keyboard select opens destination and retains focus; save/reopen text/video/quiz/attachments; busy/upload/read-only guards, conflict and local recovery. No additional outside-scope need; one authorized route line only; isolated stores, no shared mutations or push. DEF-T012-CALLBACK Fixed in a8595d6; completed stories removed from the open backlog, contract/evidence retained in docs/specs/US-T011-T012-course-builder.md. Pages build succeeds with stylesheet budget warnings. Next: Claude checks the browser checklist above; Codex stopped |

Lead decision 2026-10-10 on Codex's block: the lead missed that the route template passes the
move event's fields one by one. Codex now also owns line 101 of
`app/src/app/routes/course-editor-route.html` (the `courseComponentMoved` binding) and resumes
from its spec checklist. Claude's part is delivered locally in `baf852c` (0.1.92).
Lead check 2026-10-10 on `4e7793d`: Codex stayed within its files and the one route line.
425 API and 215 frontend tests, six journeys and the API and Pages builds pass. Browser,
in-memory API, as the demo teacher: "Move to chapter" moved a lesson into an empty chapter and
kept focus on it; a drag onto the end of another chapter moved a lesson (dispatched drag
events, not a hand drag); adding a quiz question collapsed the first, put the new one at the
top of the editor with the cursor in its text, and showed "Needs attention"; after Save and
reload the moved lesson and the second question were still there. Lead polish on top: the
"drop at end of chapter" targets are now invisible until a lesson is being dragged.
DEF-020 is in the defect log; US-T010 is delivered, so it is not in the open backlog.
Not verified: a hand drag with a mouse, a moved lesson with a real video or attachment,
hosted behavior. Next: Alex decides on the push.

**Session 2026-10-10 (3) — started by the user: the career path editor's Save buttons are cut
off, the Admin page is chaotic, and career paths need a UI overhaul.** Branch: `main`.
Base: `3dc9386` (pushed and deployed, version 0.1.85).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | Fix the clipped editor (Admin page has a fixed height that hides it); Admin page organized into sections; career path editor rebuilt with a path list, collapsible steps and an always-visible save bar; Withdraw and conflict handling in the editor against Codex's contract | `app/**`, `CLAUDE.md`, `docs/specs/US-L009-L012-T008-career-paths.md` | Delivered locally in `5278f7c` (0.1.87); record in the career path spec |
| Codex | US-A003: withdraw a published path; refuse a stale save | See the [handoff](handoffs/US-A003-career-path-withdrawal-codex.md) | Delivered locally: a889155 (implementation, 0.1.88); this delivery-record commit also has the hook's aligned bump. Owner Codex, main, base 5278f7c (required 9f716fa present). Story and [spec](specs/US-A003-career-path-withdrawal.md) written first; DEF-019 Fixed after mixed legacy/versioned race regression. Verified: 418 API/182 frontend tests, six journeys, API build, 58 focused path tests; final independent review clear. Not verified: actual Mongo durability/atomicity/instances, hosted/API-to-editor browser withdrawal/conflict flow. No outside-scope file needed, shared providers or push; Claude's app/docs preserved except authorized version lines. Next: Claude/Alex's editor and disposable-provider release checks; Codex stopped |

Lead check 2026-10-10 on `3d80100`: Codex stayed within its files and the four version lines;
existing routes and shapes are unchanged. 418 API and 182 frontend tests, six journeys and the
API and Pages builds pass. Browser, in-memory API, new editor against the new routes: a save
made after a second admin's save was refused with the conflict message and the edits kept;
"Load latest version" showed the other admin's text; Withdraw asked first, removed the path
from the public list and left it as a draft. Not verified: real MongoDB, hosted behavior.
Open question for Alex: what the overhaul of the learner's Career Path page should change.
Next: Alex decides on the push.

**Session 2026-10-10 (2) — started by the user with "let's start working".** Branch: `main`.
Base: this commit. Picked by Claude Code as lead: the leftovers of career paths increment 2
for Claude, and the next independent safety item for Codex, because career paths are about
to go live.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | Show the account progress sync message where learners see progress; keyboard-only walk of the career path page | `app/src/app/pages/**`, `docs/specs/US-L009-L012-T008-career-paths.md` | Delivered locally in `b5b284d` (0.1.83); record in the career path spec |
| Codex | US-P008-AC01 (INV-013) and US-P008-AC03 (INV-015) | See the [handoff](handoffs/US-P008-safe-operation-codex.md) | Delivered locally in `e7afd6d` (0.1.84). DEF-017 and DEF-018 reproduced, then Fixed. Codex stopped before committing, waiting on one fixture approval; the lead approved it, verified and committed. 378 API and 179 frontend tests, six journeys, API and Pages builds pass. Not verified: hosted behavior. AC02 remains Proposed. [Spec](specs/US-P008-safe-operation.md) |

Next: Alex decides on the push; then the hosted checks.

Delivered stories no longer appear here or in `user_stories.md`. Career paths (US-L006,
US-L009, US-L012, US-T008) are delivered; their open checks are a completed step seen in a
browser, real MongoDB, and an admin mapping real courses before publishing a path
([spec](specs/US-L009-L012-T008-career-paths.md)).

## Latest audit

**AUD-2026-10-09 — Whole-repo code audit.** Owner: Claude Code. Branch: `main`.
Audited tree: `96e9ff9` plus the US-T002 changes later delivered in `86196cf`. State:
Recorded (audit only). Report: [code audit](audits/2026-10-09/code_audit.md).
Added investigations INV-005–INV-018 and Proposed stories US-T009, US-P006–US-P008;
re-observed INV-002–INV-004. Nothing was reproduced or fixed. API/frontend builds
and 238 API/107 frontend tests passed on the audited tree. INV-011 and INV-017
concern the delivered US-T002 code. Documentation only; no product change.

**AUD-2026-10-05 — Career path journey audit, selected on 2026-10-05.**
Owner: Codex. Branch: `main`. Base: `9a2f30b` plus the preserved, uncommitted
DEF-002–DEF-005 implementation. Scope: discovery, goals, path selection,
recommendations, course navigation, progress, completion, persistence, and
availability/accessibility. State: Evidence captured (audit only). Report:
[career path audit](audits/2026-10-05/career_path_audit.md).
Completed: source/API inventory, disposable signup, goal/profile comparison,
enrollment and completion walkthrough, progress/accessibility DOM inspection, and
desktop/mobile captures. Reconfirmed DEF-007/DEF-009/DEF-011; added DEF-014 and six
Proposed stories. API build passed; no product fixes or shared-service mutations.
Documentation delivery: local `docs(career-path)` commit in this file's Git history;
audit base and evidence are recorded in the report. No push/deployment.
Next: follow the user's next selection; no Proposed path feature is authorized.

## Historical implementation handoff

DEF-005 resumed on 2026-10-08. Its preserved patch is now applied; do not reapply
it to current main. [The handoff](handoffs/DEF-005.md) keeps the original record
and links to current verification. Delivery commit: `3feeea4` (2026-10-08).

## Completed delivery

**US-T006 / INV-002 — Video operations; INV-016 / US-P008-AC04 — Main checks.**
Done (selected video scope and main CI trigger). Owner: Codex. Branch: `main`. Base: `f602307`. Isolated clone:
`qi-education-codex-media`; no shared environment or provider mutations.
Scope: Mux service/routes/webhook, upload/polling and builder video panel, CI main
trigger. Decisions: public playback; preserve assets referenced by published or
working content; cleanup failures must not block removal. Implemented and verified
with isolated stubs and stores. No push.
2026-10-10 continuation: user's instruction to proceed follows the requested
exception for the existing video-polling test fixture in `course-ownership.spec.ts`.
Only that fixture is corrected; no ownership implementation changes.
Spec: [video operations](specs/US-T006-video-operations.md).
Verified 2026-10-10: API build, 328 API tests, 135 frontend tests, Pages build,
all six journeys; independent review has no important outstanding findings.
Confirmed defects: DEF-T006-CLEANUP/PUBLIC/POLLING/UPLOAD-FAILURE. CI main trigger
implemented; Pages workflow untouched. Live provider gaps are listed in the spec.
Delivery: `cb38175` (version 0.1.65). Next: Claude reviews the combined result;
perform disposable live-provider/hosted rehearsal only under release authorization.
No push, deployment, or shared-service mutation.


**US-P006 API increment / US-P007 spreadsheet half / US-P005 expiry increment.** Delivered locally.
Owner: Codex. Selected/date: 2026-10-09. Branch/base: `main` / `f8d4c2f`.
Implementation commit: `67ec9f2a8da47c31a835ff1ffc430087520ab7a2` (version 0.1.62).
INV-005/007/011/012/009/006 reproduced before fixing; promoted as DEF-P006-01–04,
DEF-P007-SHEETS and DEF-P005-LOCK, now Fixed. Specs: [class load](specs/US-P006-class-load.md),
[spreadsheet text](specs/US-P007-spreadsheet-text.md), [lock recovery](specs/US-P005-lock-recovery.md).
Shared client; authenticated course reads 5 → 2 Sheets calls; concurrent-only
fetch sharing; 20 simultaneous readers; all five read routes remain available
under a held writer. Catalog uses one metadata-only batch; saving ten 4 MiB
attachment references reads zero binary bytes. Nine RAW writes preserve literal
`=1+1` and `007`. Alex approved 31-minute expiry beyond Vercel's 30-minute max;
owner/timestamp predicates protect successors, malformed timestamps fail closed.
Independent review's split author content/save-token race and timestamp parsing
findings fixed with RED-to-GREEN regressions. 319 API / 128 frontend tests,
six `verify:journeys` scenarios, API build and Pages build pass on the combined tree.
Claude's career-path routes/files and release journey were preserved. Only app edits:
package/rendered version strings at commit time, the exception recorded here before
editing; the docs-only delivery-record commit also requires an aligned bump.
Remaining: AC06 deferred as permitted; disposable-provider/cold-instance quota,
Mongo expiry/clock/durability and uncertain provider outcome checks before release.
Broader US-P005 operator tooling remains Proposed. No shared mutations, push or deployment.

**US-T003 / US-T005 — Local draft recovery and reliable saves.** Done.
Owner: Codex. Date: 2026-10-09. Branch: `main`. Base: `5211365`.
Delivery commit: `d674ee3a24c487923ca8f8586afefb27bd191753`. DEF-015 Fixed; DEF-006 remains Fixed.
Contracts: T003 AC01–03/DR-01–03; T005 AC01–02/RS-01–03.
Account/course scoped device-local metadata, outline and focused-text recovery,
separate document records with an explicit chooser, Restore/Discard and storage errors.
Versioned full saves reject stale edits, preserve local work and offer manual latest
comparison/reconciliation. Partial saves identify acknowledged details and unsaved
lessons; safe retries advance only confirmed baselines. Media refresh/busy guards.
276 API/122 frontend tests, API/frontend/Pages builds, isolated recovery/two-editor
browser checks and one final review's five RED-to-GREEN regressions pass.
[Verification](verification/2026-10-09/US-T003-T005.md). User authorized commit and push;
`main` push triggers Pages. Shared-provider and hosted verification remain separate.
Concurrent career-path/journey edits are preserved outside this delivery.

**US-T002 - Full review history and uninterrupted course revisions.** Done.
Owner: Codex. Date: 2026-10-09. Branch: `main`. Base: `96e9ff9`.
Delivery commit: `86196cfc088e32bed99a9435b0d3f31739b646a4`. Contract: AC01-08.
Private editable revisions, frozen submissions, required admin return reasons and
full chronological history. Atomic approval replaces live metadata/lessons/pointers;
existing learners retain access throughout review. Read-only reviewer preview,
versioned actions and retained live resource access. Final review's five findings
fixed with RED-to-GREEN regressions. 264 API/108 frontend tests, all builds and
isolated teacher/admin/learner browser pass. [Verification](verification/2026-10-09/US-T002.md).
Earlier Fixed records remain preserved. Shared-provider and hosted release checks
are separate. No push/deployment; unrelated audit changes excluded from delivery.

**DEF-008, DEF-011, DEF-012, DEF-013 - Remaining defect closure.** Fixed.
Owner: Codex. Date: 2026-10-09. Branch: `main`. Base: `797d55c`.
Fix/delivery record commit: `79c2ea5fd2721594f4b1f2c603982d80ef909bce`. Contract: RD-01-06.
Parser boundaries preserve safe 400/413/415 without reclassifying application
failures. Unfinished Home/workspace controls are hidden. Catalog cards display
full wrapping titles/badges without clipping at seven tested responsive widths.
DEF-012 was confirmed as missing category data; the user explicitly approved
seven category cell corrections. Applied and verified all other fields/headers
unchanged; fresh hosted API read returns the corrected categories.
222 API/101 frontend tests, API/frontend/Pages builds, isolated browser and
carousel/keyboard/filter checks, and fresh independent review pass.
[Verification](verification/2026-10-09/remaining-defects.md). US-L005/US-L008 Done;
US-P002 broader error DTO/dependency recovery remains Proposed. Category warning
prevention is Proposed as US-A002. Hosted application/provider release checks
remain separate. No application push/deployment.

**DEF-007, DEF-009, DEF-014 - Honest local learning progress.** Fixed (resolved in code).
Owner: Codex. Date: 2026-10-09. Branch: `main`. Base: `0a4b522`.
Fix commit: `6729b740e4b421b015ad9d1b97af1b44749f9707`. Contract: LP-01-05.
Workspace, library and Home share existing account/course completion records and
current lesson IDs. Home uses real enrollments and an honest empty/error/loading
state; quiz position is distinguished from completion. Storage-write failures
retain current-session completion across navigation. 100% requires all current
lessons completed. API 196/frontend 98 tests, API/frontend/Pages builds, isolated
browser completion/resume/refresh/account checks and final independent review pass.
[Verification](verification/2026-10-09/DEF-007-009-014.md).
US-L002 remains Proposed for cross-device progress and broader completion/revision
rules. Shared-service/hosted release checks remain pending. No push/deployment.

**DEF-005, DEF-006, DEF-010 — Assessment, navigation and direct learning batch.**
Fixed (resolved in code). Owner: Codex. Date: 2026-10-08. Branch: `main`.
Base: `159f45b`. Delivery: `3feeea4de8d056ba1e88789103a280df52c5d2f0`.
Contracts: LC-05, NW-01–05, DL-01–04. DEF-005 gates review/publication on answerable
quizzes and saves edited drafts before submission. DEF-006 warns before abandoning
metadata, outline and focused editor buffers; Stay preserves edits and Back history.
The user selected warnings only; local recovery remains Proposed. DEF-010's
runtime fix is `a6767f6`; dedicated direct URL/refresh/error/access checks pass.
API 196/frontend 82 tests, API/frontend/Pages builds, isolated browser journeys
and independent review pass. US-T004 is Done; US-T003/US-L001 retain broader
Proposed scope. [Verification](verification/2026-10-08/DEF-005-006-010.md).
Shared-service and hosted release checks remain pending. No push/deployment.

**DEF-002, DEF-003, DEF-004 — Lifecycle access batch.** Fixed (resolved in code).
Owner: Codex. Date: 2026-10-07. Branch: `main`. Base: `ff3d68a`.
Fix commit: `a6767f69e5254e01a47ca33b58dabe34925ea586`.
Scope: restricted teacher/admin fields, public/learner/author DTOs and asset
entitlement, trusted server grading, published-only enrollment, and private
response/session/coordination boundaries. API 185/frontend 55 tests, API/frontend/
Pages builds, isolated teacher/admin/enrollment/quiz browser checks, and independent
review pass. [Verification](verification/2026-10-07/DEF-002-004.md).
DEF-005 and broader US-T002/US-L001 story completion are excluded. Shared-store
and hosted release checks remain pending. No push/deployment.

**DEF-001 / US-T001 — Course ownership.** Defect: Fixed (resolved in code).
Story: Done. Owner: Codex. Date: 2026-10-04. Branch: `main`. Base: `ae9794a`.
Fix commit: `a9940ccd9fc13a149b5eb96017c5484796b0012d`.
Spec: [course ownership](specs/US-T001-course-ownership.md), AC01–AC05.

The user selected defects before enhancements on 2026-10-04. Start with the
confirmed teacher authorization defect, then work through confirmed defects in
teacher, learner, and platform order. Preserve completed defects with their
resolution date, evidence, and fixing commit; never remove their records.

Completed: owner persistence and all authoring gates, UI capabilities and denied
direct editor entry, API/frontend regression suites, builds, and isolated browser
walkthrough. Evidence: [DEF-001 verification](verification/2026-10-04/DEF-001.md).
Independent review found a forged asset-reference deletion bypass; ten additional
regressions reproduced it and the fix adds binding checks and course-scoped deletion.
Independent review found no remaining blocking ownership issue. All 111 API and
31 frontend tests and all builds pass. Release checks for disposable Sheets/MongoDB
and hosted behavior remain pending. No push, deployment, or legacy owner mapping.

## Next candidate

All documented confirmed defects remain Fixed. Feature work is paused until the first
teacher session is over; only fixes found in rehearsal go in.
Await the user's next selected story or investigation; no Proposed enhancement is authorized by
this delivery. Shared-provider/hosted release checks require a separate release.

## Defect order

| Order | Defect / related story | Current state | Next prerequisite |
| --- | --- | --- | --- |
| 1 | DEF-002 / US-T002 admin field restrictions | Fixed | Shared release verification |
| 2 | DEF-003 / US-T002, US-L001 private drafts/content | Fixed | Shared release checks; broader entitlement decisions remain Proposed |
| 3 | DEF-006 / US-T003 unsaved authoring | Fixed | Hosted/browser release verification; recovery delivered in US-T003 |
| 4 | DEF-005 / US-T004 impossible published quizzes | Fixed | Shared release verification; legacy invalid quizzes need correction |
| 5 | DEF-004 / US-L001 unpublished enrollment | Fixed | Shared release verification |
| 6 | DEF-010 / US-L001 direct learning refresh | Fixed | Shared-store and hosted direct URL/refresh release checks |
| 7 | DEF-007, DEF-009, DEF-014 / US-L002 false progress/activity | Fixed | Hosted/browser release checks; cross-device progress remains Proposed |
| 8 | DEF-011 / US-L005 inactive controls | Fixed | Hosted/provider release checks |
| 9 | DEF-008 / US-P002 parser errors | Fixed | Hosted/provider release checks |
| 10 | DEF-012 / US-L008 missing categories | Fixed | Approved repair verified; hosted browser release check |
| 11 | DEF-013 / US-L008 card clipping | Fixed | Hosted/provider release checks |
| 12 | DEF-015 / US-T005 stale authoring saves | Fixed | Hosted/provider and accepted-refresh release checks |

Enhancement-only stories remain in [user_stories.md](user_stories.md) for later
selection. DEF-012/013 are reproduced and resolved in `79c2ea5`. INV-001 is resolved
through DEF-015; INV-002–004 remain investigations; reproduce them before prioritizing implementation.

P1 access defects are release risks even while platform work is later in the
roadmap. Do not interpret this order as approval to release known access gaps.
Change priorities when the user selects a different item; update this file and
the story table together.

## Handoff record

When a story starts, replace Active work with one record containing:

- Item and linked defect IDs; implementation owner.
- Branch and base commit obtained from Git, not inferred from previous chats.
- Spec path and scenario IDs in scope.
- Completed work and verified checks, including date and environment.
- Remaining work, unresolved decision or blocker, and a concrete next command/action.
- Delivery commit once available.

Keep the active record across interrupted sessions. A fresh agent should not
have to reconstruct unfinished work from chat history.
