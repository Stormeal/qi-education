# Work queue

Updated: 2026-10-09. Working branch: `main`. Original audited base: `6e19213`.

## Active work

No active implementation. DEF-007, DEF-009 and DEF-014 were delivered locally
on 2026-10-09; see Completed delivery. Follow the user's next selection before
starting another batch. No Proposed career feature is selected.
No push/deployment is authorized.

## Latest audit

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

**Next confirmed defects: DEF-011 and DEF-008.** DEF-011 needs a focused
implement-versus-hide/disable decision; full path, Q&A and Notes features remain
Proposed. DEF-008 has a defined HTTP 400/413 contract. Only two confirmed defects
remain Open. A third item requires reproducing DEF-012/DEF-013 or an investigation,
or a different user selection. Do not silently turn an unconfirmed report into a
confirmed defect or start another batch automatically.

## Defect order

| Order | Defect / related story | Current state | Next prerequisite |
| --- | --- | --- | --- |
| 1 | DEF-002 / US-T002 admin field restrictions | Fixed | Shared release verification |
| 2 | DEF-003 / US-T002, US-L001 private drafts/content | Fixed | Shared release checks; broader entitlement decisions remain Proposed |
| 3 | DEF-006 / US-T003 unsaved authoring | Fixed | Hosted/browser release verification; recovery remains Proposed |
| 4 | DEF-005 / US-T004 impossible published quizzes | Fixed | Shared release verification; legacy invalid quizzes need correction |
| 5 | DEF-004 / US-L001 unpublished enrollment | Fixed | Shared release verification |
| 6 | DEF-010 / US-L001 direct learning refresh | Fixed | Shared-store and hosted direct URL/refresh release checks |
| 7 | DEF-007, DEF-009, DEF-014 / US-L002 false progress/activity | Fixed | Hosted/browser release checks; cross-device progress remains Proposed |
| 8 | DEF-011 / US-L005 inactive controls | Open | Implement versus hide/disable choice |
| 9 | DEF-008 / US-P002 parser errors | Open | Preserve 400/413 contract with regression cases |

Enhancement-only stories remain in [user_stories.md](user_stories.md) for later
selection. DEF-012/DEF-013 and INV-001–INV-004 remain investigations, not confirmed
fixes; reproduce them before prioritizing implementation.

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
