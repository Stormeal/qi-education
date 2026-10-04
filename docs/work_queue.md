# Work queue

Updated: 2026-10-04. Working branch: `main`. Audited base: `6e19213`.

## Active work

None. The application audit and documentation setup are complete. Application
defects have been recorded, not fixed by this documentation task.

## Next candidate

**US-T001 — Enforce course ownership.** Status: Ready. Owner: unassigned.
Spec: [course ownership](specs/US-T001-course-ownership.md). Defect: DEF-001.

The user has selected the policy: teachers edit their own courses; admins edit
all courses. Start this item when instructed to implement the next teacher story.
First implementation step: add a failing API test with two distinct teachers,
then introduce stable owner IDs and enforce the policy on every authoring route.
Existing courses without an owner remain admin-editable until explicitly mapped.

## Following order

| Order | Item | Current state | Prerequisite |
| --- | --- | --- | --- |
| 1 | US-T001 ownership | Ready | User requests implementation |
| 2 | US-T002 review and publishing | Proposed | Ownership; confirm review/return policy |
| 3 | US-T003 protect unsaved authoring | Proposed | Confirm recovery scope |
| 4 | US-T004 valid assessments | Proposed | Confirm single-choice assessment policy |
| 5 | US-T005 reliable saves | Proposed | Define revision and partial-save contract |
| 6 | US-T006 media operations | Proposed | Define removal and signed playback policy |
| 7 | US-T007 instructor description | Proposed | Public fields/persistence and T001 |
| 8 | US-A001 teaching access administration | Proposed | Supported role changes and admin safeguards |
| 9 | US-L001 protected enrollment and learning | Proposed | Teacher access/lifecycle contracts |
| 10 | US-L002 trustworthy progress | Proposed | Define completion and persistence policy |
| 11 | US-L003 account profile persistence | Proposed | Select storage and fields |
| 12 | US-L004 account recovery | Proposed | Select real support/reset delivery channel |
| 13 | US-L005 unavailable controls | Proposed | Implement versus hide/disable choice |
| 14 | US-L006 career path previews | Proposed | Confirm imported fixture/API scope |
| 15 | US-L007 recommendation ordering | Proposed | Real activity and primary recommendation |
| 16 | US-L008 catalog card integrity | Proposed | Reproduce reported metadata/layout defects |
| 17 | US-P001 repeatable flow verification | Proposed | Teacher and learner contracts |
| 18 | US-P002 useful API errors | Proposed | Select error contract |
| 19 | US-P003 resilient account and feedback writes | Proposed | Select uniqueness/idempotency strategy |

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
