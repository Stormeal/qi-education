# Work queue

Updated: 2026-10-05. Working branch: `main`. Original audited base: `6e19213`.

## Active work

No new implementation was started by the career path audit. Unfinished
DEF-002–DEF-005 work is recorded below; new path stories remain Proposed.

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

## Unfinished implementation handoff

**DEF-002–DEF-005 — Publication, content access, enrollment, and quiz validity.**
Owner: Codex. Branch: `main`. Base: `9a2f30b`. Selected by the user on 2026-10-04.
Working spec: `docs/specs/DEF-002-005-course-lifecycle.md` (uncommitted local draft).
State: In progress; interrupted by the selected career path audit. No delivery
commit and no Fixed status. Preserve all local API/frontend edits and new tests.
Implemented locally: restricted teacher fields, private course/content reads,
outline and learner DTOs, published-only enrollment, quiz readiness and server
grading, and per-course mutation coordination. Recovery notes are in the
uncommitted `docs/course_operation_recovery.md`. These files and the implementation
do not travel with the independent audit documentation commit; preserve the local
checkout when resuming and reconcile its draft story references before delivery.
Working assumptions (not confirmed product decisions): title-only public outlines,
retained access for existing archived enrollments, and one correct quiz answer.

Last verification: 182 API tests and API build passed before the latest ambiguous
write recovery changes; the focused lock suite then passed 5 tests. Frontend full
suite passed 37 tests before two additional regressions; the focused ownership
suite passed 11 tests afterward. Frontend build passed before the latest polling
guard; Pages build and final complete rerun are outstanding. Isolated browser
checked invalid review feedback and unpublished thumbnail access. These checks do
not constitute final delivery verification.
On 2026-10-05 the career audit rebuilt the current API successfully and exercised
published enrollment and quiz grading against the disposable store. Final complete
tests, session-race regression coverage, and hosted release checks are still pending.

Resume first: reproduce and guard late authoring responses after logout/navigation
in `AppStateService.submitCourse` and attachment/Mux response handlers; an old
author save can overwrite content in a newer learner session. Review ambiguous
mutation failures that throw directly rather than calling `next(error)`, finish
browser enrollment/grading, rerun full checks, update scenario evidence and all
statuses together, then deliver on `main` with the required aligned version bump.

## Completed delivery

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

**DEF-002–DEF-005 — Resume the selected defect batch if continuing defect delivery.**
Defect status: In progress, unfinished. Related stories: US-T002, US-T004, US-L001
(Proposed broader scope). Owner: Codex. Next action: follow the handoff above,
starting with late authoring response/session guards and final verification.

Career path findings DEF-007/DEF-009/DEF-014 belong to US-L002; DEF-011 has a narrow
availability fix before broader selection/switching. They remain Open. The audit
delivery order is a recommendation and does not supersede the user's next choice.

## Defect order

| Order | Defect / related story | Current state | Next prerequisite |
| --- | --- | --- | --- |
| 1 | DEF-002 / US-T002 admin field restrictions | In progress | Finish selected defect batch and guards |
| 2 | DEF-003 / US-T002, US-L001 private drafts/content | In progress | Finish session guards; verify working entitlement assumptions |
| 3 | DEF-006 / US-T003 unsaved authoring | Open | Navigation warning versus local recovery scope |
| 4 | DEF-005 / US-T004 impossible published quizzes | In progress | Final readiness/grading verification |
| 5 | DEF-004 / US-L001 unpublished enrollment | In progress | Final eligibility checks; verify archived access assumption |
| 6 | DEF-010 / US-L001 direct learning refresh | Open | Narrow route-loading regression spec |
| 7 | DEF-007, DEF-009, DEF-014 / US-L002 false progress/activity | Open | Shared progress source, honest empty account, quiz position wording |
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
