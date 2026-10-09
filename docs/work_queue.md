# Work queue

Updated: 2026-10-09. Working branch: `main`. Original audited base: `6e19213`.

## Active work

**US-L009 / US-L012 / US-T008 (with the US-L006 read foundation) — Career paths.** In progress.
Owner: Claude Code. Selected by user 2026-10-09. Branch: `main`. Base: `5211365`.
Spec, decisions and scenario map: [career paths](specs/US-L009-L012-T008-career-paths.md).
Done locally: path model/validation, read/selection/admin APIs, admin editor, learner
compare/choose/roadmap flow, Home tile; 14 API + 5 progress tests and isolated browser walk.
First increment committed and pushed on `main` (version 0.1.59), on top of `150e701`.
296 API/126 frontend tests and all builds pass. Next: browser-check a completed step,
hosted MongoDB check, then an admin maps real courses and publishes paths.

**US-P001 — Role journey verification.** In progress. Owner: Claude Code. Selected by user
2026-10-09. First increment in the same delivery: `api/src/journey.test.ts`, run by
`npm run verify:journeys` and every `npm run api:test`. Open decision: browser runner.
Second increment 2026-10-09: the teacher journey walked in the real UI against in-memory
stores; four defects fixed, five items open. Record:
[teacher walkthrough](verification/2026-10-09/teacher-walkthrough.md).

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

US-T002, US-T003 and US-T005 are Done. All documented confirmed defects remain Fixed.
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
