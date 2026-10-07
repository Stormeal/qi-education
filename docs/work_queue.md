# Work queue

Updated: 2026-10-07. Working branch: `main`. Original audited base: `6e19213`.

## Active work

**DEF-005 — unfinished work preserved for the next batch.** Owner: Codex.
Branch: `main`. Resumable base: `a6767f6`, delivery of DEF-002/003/004.
State: In progress; readiness patch preserved, not applied. Next: read
[the handoff](handoffs/DEF-005.md), check/apply the patch when resuming, review
LC-05, and verify before delivery. Next batch candidates: DEF-005, DEF-006, DEF-010.
No Proposed career feature is selected.

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

**DEF-005 — Publish answerable quizzes.** Owner: Codex. Branch: `main`.
Originally selected 2026-10-04; preserved on 2026-10-07 for the next batch.
State: In progress, unresolved. Read [the handoff](handoffs/DEF-005.md) and LC-05
in [the lifecycle spec](specs/DEF-002-005-course-lifecycle.md). The adjacent patch
preserves readiness gates and tests without activating them in this three-defect
delivery. It passed `git apply --check` on the selected batch's working tree;
apply/review it only when DEF-005 resumes, then rerun tests and browser checks.
Trusted scoring rejects invalid quizzes but does not prevent their publication.
The historical invalid-review screenshot belongs to the unfinished prototype.

## Completed delivery

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

**Next batch of three: DEF-005, DEF-006, DEF-010.** Resume unfinished DEF-005,
then the unsaved teacher navigation defect and direct learner URL verification.
DEF-006 needs the narrow navigation-warning contract versus broader local recovery
scope recorded before implementation. DEF-010 has incidental route-loading changes
in the access batch, but needs its own spec and direct URL/error/session checks
before closure. No Proposed career feature is selected.

Career progress/activity DEF-007/DEF-009/DEF-014 and unavailable controls DEF-011
remain Open. Their audit delivery order remains a recommendation.

## Defect order

| Order | Defect / related story | Current state | Next prerequisite |
| --- | --- | --- | --- |
| 1 | DEF-002 / US-T002 admin field restrictions | Fixed | Shared release verification |
| 2 | DEF-003 / US-T002, US-L001 private drafts/content | Fixed | Shared release checks; broader entitlement decisions remain Proposed |
| 3 | DEF-006 / US-T003 unsaved authoring | Open | Navigation warning versus local recovery scope |
| 4 | DEF-005 / US-T004 impossible published quizzes | In progress | Final readiness/grading verification |
| 5 | DEF-004 / US-L001 unpublished enrollment | Fixed | Shared release verification |
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
