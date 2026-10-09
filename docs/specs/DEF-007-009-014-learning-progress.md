# DEF-007, DEF-009, DEF-014 — Honest local learning progress

## Record

- Related story: [US-L002](../user_stories.md); selected defects only.
- State: In progress. Owner: Codex. Selected: 2026-10-09.
- Branch/base: `main`, `0a4b522`. No push or deployment.
- Existing completion rules and local persistence are retained. Cross-device
  storage, path selection/completion and revision recognition remain Proposed.

## Problem and outcome

My Learning renders 0% independently of workspace completion. Home shows invented
courses, chapters and role-based career progress. A quiz's question position is
labeled as completed work even before submission. These three defects must use
real account data and distinguish position from completion.

## Scope

Use one service for the existing account-email/course local storage keys and
completion reads/writes. Non-quiz components retain Mark complete or the existing
video-ended trigger;
quizzes retain trusted server passing results and Finish quiz. The denominator is
the unique current component IDs; ignore deleted, duplicate and unknown saved
IDs. An empty course is 0% with no lessons, never complete. Percentages round to
whole numbers, capped at 99% until every current component is complete. Use current title-only
outlines for Home/My Learning and current learner content in the workspace.

Home shows enrolled course activity and a working learning link, or an honest
empty state with Browse courses. It must not claim matched recommendations,
selected career progress, invented milestones or a role-derived career goal.
Keep the existing layout/style; no design overhaul. Unavailable career progress
is explicitly unavailable. Loading/errors do not become 0% or fabricated activity.
The inactive Adjust track control remains the separately recorded DEF-011.

## Behavior contract

```gherkin
Scenario: LP-01 Share completion and resume (US-L002-AC01)
  Given my enrolled course has two components and neither is complete
  When I mark its ordinary lesson complete
  Then the workspace, My Learning and Home show 50% from the same record
  And reopening selects the next incomplete component
  And completing the passing quiz changes all views to 100%

Scenario: LP-02 Restore only this account's current lessons
  Given local completion contains duplicate, deleted or unknown component IDs
  When I open my current course on this browser
  Then progress counts each current completed component once
  And another account or course cannot inherit that completion
  And malformed storage or an empty course cannot claim completion

Scenario: LP-03 Honest Home (US-L002-AC03)
  Given I have no enrolled courses
  When I open Home
  Then I see an empty learning state and a working Browse courses action
  And no invented course, chapter, recommendation or career progress is shown
  But enrolled accounts see their actual course titles and completion

Scenario: LP-04 Distinguish unavailable progress
  Given catalog or outline retrieval is pending or fails
  When I open Home or My Learning
  Then pending progress shows loading and failed progress shows unavailable
  And I can retry without losing completion
  And a late response from an old session cannot replace current activity

Scenario: LP-05 Quiz position is not completion (US-L002-AC04)
  Given an untouched one- or multi-question quiz
  When I open the first or final question
  Then visible and accessible indicators describe question position
  And reaching the last question alone does not mark the lesson complete
  And failed grading or retry does not add completion
```

## API, storage and compatibility

No API/schema migration. Reuse authenticated `/courses` and `/courses/:id/outline`
for enrolled-course summaries, with per-course loading/error state. Shared completion
service retains `qi-education:course-progress:<email>:<courseId>` arrays. Storage
failures retain current-session values; persistence across devices is not promised.
Clear in-memory summary/session caches on logout or identity replacement; ignore
late loads. The existing trusted quiz grading API remains unchanged.

## Implementation checklist

The repository workflow's spec checklist is the implementation plan. Work inline
on main within the user's authorized defect batch.

- [x] Reproduce LP-01/03/05 with rendered route/page regression tests (RED).
- [x] Add shared completion/outline service; verify storage boundaries and LP-02/04.
- [x] Connect workspace, library and Home; verify live navigation and resume.
- [x] Rename quiz position copy/accessibility; preserve trusted grading behavior.
- [x] Run frontend/API tests and builds, isolated browser checks and independent review.
- [ ] Record scenario evidence, resolved statuses, date and delivery commit.

## Verification and delivery

| Scenario | Planned evidence | Result |
| --- | --- | --- |
| LP-01 | Real route completion, Home/library progress and resume | Pass; [batch evidence](../verification/2026-10-09/DEF-007-009-014.md) |
| LP-02 | Storage/account/course isolation, unknown IDs and empty course regressions | Pass; [batch evidence](../verification/2026-10-09/DEF-007-009-014.md) |
| LP-03 | Empty/enrolled Home rendering and Browse courses/learning navigation | Pass; [batch evidence](../verification/2026-10-09/DEF-007-009-014.md) |
| LP-04 | Deferred/failed outline, retry and session replacement regressions | Pass; [batch evidence](../verification/2026-10-09/DEF-007-009-014.md) |
| LP-05 | One/multi-question DOM semantics plus failed/pass grading | Pass; [batch evidence](../verification/2026-10-09/DEF-007-009-014.md) |

Mutation walkthroughs use disposable memory API repositories only. Shared stores,
hosted URLs and live providers remain separate release checks.

Implementation verified locally 2026-10-09: 98 frontend/196 API tests and API,
frontend and Pages builds pass. Independent review has no remaining findings.
Delivery commit pending; shared/hosted release checks remain separate.
