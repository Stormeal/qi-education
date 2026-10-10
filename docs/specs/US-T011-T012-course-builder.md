# US-T011 / US-T012: Quiz authoring and moving lessons

## Record

- Stories: US-T011 and US-T012. State: Done (local implementation; browser/release checks remain below).
- Owner: Codex. Selected 2026-10-10. Initial base: main / baf852c; resumed on main / 853c249.
- Required assignment commit: a61771f, present in the first 15 history entries.
- Contract: [teacher feedback handoff](../handoffs/teacher-feedback-builder-codex.md).
- Related confirmed defect: DEF-T012-CALLBACK, reproduced in isolated API tests.
- Route exception granted on continuation: only the moved binding at line 101
  is now owned by Codex. Required continuation commit 853c249 is present.

## Problem and outcome

Teachers need to add and review quiz questions without losing their place, and
reorganize lessons between chapters without recreating their content or media.
The current quiz scroll uses `block: 'nearest'` and does not focus the new question
field. Its header only opens a question. Dragging currently rejects another
chapter; the state handler only reorders inside one chapter.

The initial documentation-only stop is resolved by 853c249 and the user's route
exception. Implementation and isolated checks are complete; local delivery is
being recorded. No additional outside-scope file is needed.

## Scope and ownership

Keep all CourseBuilder inputs and outputs. Extend only the moved-event payload
with optional `toSectionIndex`; absence preserves today's same-chapter behavior.
Owned implementation areas are the builder, moved-event model type, only the
state move handler, their tests, and API/media tests and fixes for US-T012-AC05.
Keep existing API routes and response shapes. No new dependency, shared provider
mutation, deployment, push, or work on Claude's guided form is included.

## Behavior contract

```gherkin
Feature: Quiz authoring without losing my place
  Scenario: US-T011-AC01 Add and focus a question
    Given an editable quiz with existing questions
    When I add a question
    Then only the new question is open
    And its header is aligned to the top of the visible editor area
    And its question text field receives focus without changing that scroll position

  Scenario: US-T011-AC02 Understand a collapsed question
    Given a collapsed quiz question
    When I inspect its header
    Then a keyboard-usable expand control exposes aria-expanded false
    And one summary line shows its text, points, answer count and correct-answer status
    And the open question has a visibly distinct state

  Scenario: US-T011-AC03 Collapse the open question
    Given an open quiz question
    When I activate its header with a pointer or keyboard
    Then it collapses and aria-expanded becomes false
    And its contents are preserved

  Scenario: US-T011-AC04 Identify a question needing attention
    Given a collapsed question that fails existing review readiness rules
    When I inspect the collapsed question
    Then it is marked as needing attention
    And the reason is available without opening it

  Scenario: US-T011-AC05 Use the quiz editor on a narrow screen and with a keyboard
    Given a 375px-wide screen or keyboard-only operation
    When I add, expand, collapse and edit questions and answers
    Then labels and controls remain usable without horizontal page overflow
    And focus is visible and follows the requested add-question behavior

Feature: Moving a lesson to another chapter
  Scenario: US-T012-AC01 Drag between chapters
    Given an editable lesson and another chapter
    When I drag it onto a destination position or the end of that chapter
    Then it moves to that position
    And an empty chapter also accepts it

  Scenario: US-T012-AC02 Move without dragging
    Given a lesson and at least one other chapter
    When I choose another chapter using its keyboard- and touch-usable move control
    Then the lesson moves to the end of the chosen chapter

  Scenario: US-T012-AC03 Preserve content and save behavior
    Given a lesson with an ID, text, video, attachments or quiz
    When I move it to another chapter
    Then all its content and identifiers are retained
    And it becomes an unsaved change
    And saving, local draft recovery and save conflicts preserve the move as for a reorder

  Scenario: US-T012-AC04 Refuse moving during protected states
    Given a read-only builder or an upload in progress for that lesson
    When a drag or move-control action is attempted
    Then no move is emitted or applied

  Scenario: US-T012-AC05 Retain media operations after saving a move
    Given a saved lesson moved to another chapter
    When its video is loaded or a pending video callback arrives
    Then its retained video and matching upload still resolve to that lesson
    When I download, add or remove its attachments
    Then those operations target the moved lesson and retain existing access rules
```

## UI and accessibility design

Use existing builder colours, typography and corner radius. Reduce nested quiz
boxes; use a compact question header and plainly labelled answer rows. Visible
copy has no emoji or em dashes. Use semantic buttons, labelled inputs and visible
focus. Collapsed summaries wrap at narrow widths rather than clipping important
readiness information. Opening one question closes the others; all may be closed.
After adding, wait for the new question to render before aligning its header and
focusing the text input with scroll prevention. Trailing scroll space prevents
the browser from clamping alignment for a short final question in a tall editor.
Opening, toggling or removing questions resets it. Existing content remains intact.

Readiness must match `api/src/quizAssessment.ts`: question text, all four answer
texts and exactly one correct answer. Existing duplicate-ID checks remain valid;
no new submit restriction is introduced. The quiz-wide pass-mark and empty-quiz
checks remain quiz-level concerns. Summary reasons must be readable while closed.

Each lesson has a labelled control listing other chapters. The selected chapter
receives it at the end, expands that chapter and restores keyboard focus to the
moved lesson's control. Drag destinations include positions and the chapter end,
including empty chapters. Disable and guard moves during read-only, save/submit,
and uploads affecting the source lesson. Preserve same-chapter reorder behavior.

## Event, state, API and storage contract

The moved payload is `{ sectionIndex, fromIndex, toIndex, toSectionIndex? }`.
`sectionIndex` remains the source chapter; `toSectionIndex` defaults to it.
Cross-chapter insertion uses the destination index, retaining the full component
object and stable ID. Validate indices and protected states before changing state.
Use the existing content signal, dirty tracking, recovery and save/conflict path.

The page already passes the event through and declares the optional property.
The authorized one-line route change now calls:

```typescript
state.moveCourseComponent($event.sectionIndex, $event.fromIndex, $event.toIndex, $event.toSectionIndex)
```

The state handler accepts that optional fourth argument. The routed page-output
regression verifies the destination reaches state; legacy three-argument calls
remain same-chapter reorders. No existing field encodes a new meaning.

No API shape or migration is proposed. Save retains lesson and asset IDs. Before
changing media code, reproduce behavior with isolated stores: chapter-scoped
upload/remove routes, asset ownership/downloads, and callbacks containing an old
chapter ID. A callback must not attach an old upload to a replacement video.
DEF-T012-CALLBACK was reproduced before fixing: a matching ready callback carrying
the former chapter ID left the moved video processing. The callback now locates
the stable component ID across chapters in each live/working snapshot, retaining
upload/asset identity checks and existing coordination. Attachment routes and
response shapes are unchanged.

## Implementation checklist

1. Codex forwards the optional destination argument in the one authorized route binding.
2. Re-read the shared-tree state and version; resume within the assigned files.
3. Write and run failing builder tests for adding/focus/scroll, toggle, summaries
   and readiness; implement quiz interaction and responsive layout changes.
4. Write and run failing builder/state tests for drag and control moves, empty
   destinations, retained content, invalid indices and upload/read-only guards.
5. Exercise save, recovery and conflict behavior with moved outlines; retain
   compatibility tests for legacy same-chapter calls.
6. Reproduce AC05 using memory API stores, ephemeral ports and stub media
   providers; fix only proven owned-layer failures and preserve route shapes.
7. Run the handoff's full checks, update the architecture and evidence, commit
   explicitly owned files with the current aligned version bump, and record the
   delivery hash. Do not push.

## Verification and delivery

| Scenario | Required evidence | Current result |
| --- | --- | --- |
| US-T011-AC01 | Builder add event, render, header scroll and field focus test | Passing, including modeled browser scroll clamping; real layout pending |
| US-T011-AC02/03 | Semantic expand controls, summaries and toggle tests | Passing DOM interactions; actual Enter/Space walk pending |
| US-T011-AC04 | Existing readiness-rule examples in collapsed DOM | Passing invalid and valid collapsed examples |
| US-T011-AC05 | Label/control/focus tests and Claude's 375px browser walk | DOM labels/focus pass; browser width, overflow and keyboard walk pending |
| US-T012-AC01/02 | Builder drag/drop, empty chapter and move-control tests | Passing, including destination focus after rerender |
| US-T012-AC03 | State preservation, dirty/save/recovery/conflict tests | Passing, including real route binding and legacy reorder |
| US-T012-AC04 | UI and state guards for read-only and both upload types | Passing, including a captured drag that becomes locked |
| US-T012-AC05 | Memory API save, playback, old-chapter callback and attachment tests | Passing seven API tests; live providers pending |

Initial stop, 2026-10-10: source inspection confirmed the missing fourth route argument at
`app/src/app/routes/course-editor-route.html:101`. The route is outside Codex's
ownership. No feature tests, full suites or builds were run for this documentation
handoff; no product behavior is claimed verified. Delivery commit will be recorded
in the Codex queue row (6928646/43f480b). That initial delivery changed only
documentation and required aligned version strings.

Continuation evidence, 2026-10-10, main/base 853c249:

- `course-builder-authoring.spec.ts`: 15 passing builder interactions, semantic
  summaries, guards, focus and scroll cases. Review identified scroll clamping
  and loss of focus after a move; both were reproduced as failing tests and fixed.
- `course-move.spec.ts`: 12 passing state, real-route binding, complete-object
  retention, save, local recovery, conflict, guards and compatibility cases.
- `api/src/courseMove.test.ts`: seven passing isolated API cases. Three matching
  callback regressions failed before the fix. Existing playback, replacement
  upload guards, attachment access/download/upload/removal were retained.
- Full requested checks pass: `npm run api:test` (425 tests), `npm run app:test`
  (215 tests), `npm run verify:journeys` (six scenarios), `npm run api:build`,
  `npm run app:build:pages`. Pages build emits stylesheet budget warnings:
  builder 15.91 kB, career path 14.98 kB, course learning 14.00 kB against 12 kB
  warning thresholds; the build succeeds. Existing jsdom window-scroll warnings
  do not fail the frontend suite.
- Tests use disposable in-memory repositories, ephemeral API ports and stub
  provider/SDK boundaries. No servers on 3001/4200, shared Sheets, MongoDB, Mux
  or GitHub mutations, push or deployment. No further outside-scope dependency.
- Not verified: actual browser geometry at 375px or tall desktop heights,
  native keyboard interaction/drag layout, live Mux callbacks, Mongo durability,
  shared Sheets and hosted behavior. These are release/browser checks below.
- Implementation delivered locally in `a8595d6` (version 0.1.96). This subsequent
  delivery record includes the hook's aligned patch bump, removes the delivered
  stories from the open backlog and records DEF-T012-CALLBACK as Fixed. Codex stops
  after this record; Claude owns the browser checks below. No push.

After implementation, Claude should inspect the actual routed teacher editor:
add several questions on both a tall desktop and a short viewport and confirm
each new header aligns at the top and its text field receives focus; collapse/reopen using
Enter/Space; see text/points/answers/correct status and attention reasons while
closed; repeat at 375px. Drag a lesson before another lesson and to the end of a
different or empty/collapsed chapter; use the move control with a keyboard and
confirm the destination opens and focus follows the moved lesson; save/reopen and
check content, video and attachments. Try a move during an upload and in read-only
preview. Check a save conflict and local recovery retain the moved outline.
These browser checks remain pending; the route wiring and implementation are delivered.
