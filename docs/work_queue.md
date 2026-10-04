# Work queue

Updated: 2026-10-04. Working branch: `main`. Audited base: `6e19213`.

## Active work

**DEF-001 / US-T001 — Course ownership.** In progress. Owner: Codex.
Branch: `main`. Implementation base: `ae9794a`. Spec:
[course ownership](specs/US-T001-course-ownership.md), AC01–AC05.

The user selected defects before enhancements on 2026-10-04. Start with the
confirmed teacher authorization defect, then work through confirmed defects in
teacher, learner, and platform order. Preserve completed defects with their
resolution date, evidence, and fixing commit; never remove their records.

Completed: owner persistence and all authoring gates, UI capabilities and denied
direct editor entry, API/frontend regression suites, builds, and isolated browser
walkthrough. Evidence: [DEF-001 verification](verification/2026-10-04/DEF-001.md).
Independent review found a forged asset-reference deletion bypass; ten additional
regressions reproduced it and the fix adds binding checks and course-scoped deletion.
Current step: independent code review, then commit and record the exact delivery
hash. Release checks for disposable Sheets/MongoDB and hosted behavior remain pending.

## Next candidate

**DEF-002 — General authoring bypasses admin publication/pricing controls.**
Defect status: Open. Related story: US-T002 (Proposed). Owner: unassigned.

Next action: define a narrow defect spec for restricted fields on POST/PATCH and
the teacher Status control, including unchanged-price/status compatibility during
ordinary authoring saves. Keep review comments and revision workflow separate
from this fix. Resolve any boundary affecting behavior before marking the work Ready.

## Defect order

| Order | Defect / related story | Current state | Next prerequisite |
| --- | --- | --- | --- |
| 1 | DEF-002 / US-T002 admin field restrictions | Open | Narrow restricted-field contract |
| 2 | DEF-003 / US-T002, US-L001 private drafts/content | Open | Author/learner read DTOs and preview/entitlement policy |
| 3 | DEF-006 / US-T003 unsaved authoring | Open | Navigation warning versus local recovery scope |
| 4 | DEF-005 / US-T004 impossible published quizzes | Open | Scoring and publication validation contract |
| 5 | DEF-004 / US-L001 unpublished enrollment | Open | New-enrollment eligibility; archived access separate |
| 6 | DEF-010 / US-L001 direct learning refresh | Open | Narrow route-loading regression spec |
| 7 | DEF-007, DEF-009 / US-L002 false progress/activity | Open | Shared progress source and empty account behavior |
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
