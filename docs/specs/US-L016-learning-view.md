# US-L016: A learning page to work in

## Record

- Story: US-L016 ([backlog](../user_stories.md#us-l016--learn-in-a-page-built-for-working-through-a-course))
- State: Done locally, not pushed (selected by Alex 2026-10-17 after the first teacher session). Commit `27ab0ec`;
  lead check with US-L015 on `5171341` recorded in the work queue.
- Owner: Claude Code (frontend pages, UI components, `AppStateService`, `app.models.ts`).
  Builds on the US-L015 contract (Codex, in parallel).
- Part 3 of 3 of the learning view redesign. Layout: the approved
  [draft mockup](https://claude.ai/artifact/DJrxgeqLsPg9AJVEaC3wVw).
- Defaults taken by the lead (confirm or change):
  - The learning page becomes its own page component; the course details page keeps the
    details view only. The URL does not change.
  - A video is complete at 90% watched, counted from the player's position (seeking to
    the end counts too; there is no anti-skip check).
  - "Up next" shows when a video ends, or when a lesson is completed with its button, its
    exercise check or a passed quiz, while a next lesson exists. Reaching 90% of a video
    marks it complete without interrupting it. The next lesson starts after 5 seconds
    unless the learner presses "Stay here" or Escape.
  - The sidebar can be hidden for a wider player; this is not remembered between visits.
  - Exercise steps are plain text in the builder's description field (a line starting with
    `-` becomes a list item), not the rich text editor, so the exercise reuses the
    resources lesson's editor with a link field added.
  - Course facts: length, lessons, level, enrolled learners, last updated, and caption
    languages when any video has ready captions. No rating.
  - "Report a problem" categories: Video does not play, Mistake in the content, Hard to
    understand, Files or links, Other.
  - In the admin feedback list a lesson report shows its course, lesson, kind and category.

## Problem and outcome

As a learner, I want one page where I see where I am, move between lessons, keep notes,
get the lesson's files and tell the teacher how a lesson went, so that I can work through
a course without hunting for controls.

Today the learning view is a branch of the course details page: a player, a short
overview and an outline. There is no Previous/Next, no notes, no per-section progress,
lesson files only inside text lessons, and a video is complete only when it ends.

## Scenarios

```gherkin
Feature: Learning page
  Scenario: US-L016-AC01 Progress leads the sidebar
    Given I have completed 7 of 24 lessons
    When I open the learning page
    Then the sidebar shows 29%, "7 of 24 lessons complete" and the time left
    And each section shows how many of its lessons are complete

  Scenario: US-L016-AC02 Previous and Next
    Given I am on the third lesson of a section
    When I press Next
    Then the fourth lesson opens, and Previous returns to the third
    And Previous is disabled on the first lesson and Next on the last

  Scenario: US-L016-AC03 A video completes at 90%
    Given I am watching a video lesson
    When the position passes 90% of its length
    Then the lesson is marked complete in the sidebar once

  Scenario: US-L016-AC04 Up next can be cancelled
    Given a lesson completes and a next lesson exists
    When the "Up next" panel counts down from 5
    Then the next lesson opens at 0, unless I press "Stay here" or Escape first

  Scenario: US-L016-AC05 Notes at the video time
    Given I am at 12:34 in a video lesson
    When I add a note from the action bar
    Then the Notes tab lists it with 12:34, and selecting 12:34 moves the video there
    And a note from another lesson opens that lesson when selected
    And I can edit and delete my notes

  Scenario: US-L016-AC06 Lesson feedback
    When I press thumbs up or thumbs down on a lesson
    Then it is sent once and the page thanks me
    When I report a problem with a category and an optional message
    Then it is sent and the form closes with a confirmation

  Scenario: US-L016-AC07 Lesson files and working tabs
    Given a lesson has two attachments
    Then the action bar shows "Lesson files 2" and the Lesson files tab lists both for download
    And the Overview tab shows the lesson, the course and the course facts with no rating

  Scenario: US-L016-AC08 Exercise lessons
    Given a teacher adds an "Exercise" lesson in the course builder
    When a learner opens it
    Then it shows the instructions, files and link, and a "I've completed this exercise" check

  Scenario: US-L016-AC09 Keyboard and small screens
    Given a keyboard-only learner or a 400px wide screen
    Then every control above is reachable and readable, and the sidebar stacks under the lesson
```

## Checklist

- [x] Learning page component (`pages/learning-page/`), route switch, details page cleaned of the learning branch
- [x] AC01 sidebar progress and per-section progress
- [x] AC02 Previous / Next
- [x] AC03 90% video completion (unit test; no Mux video in the isolated stores)
- [x] AC04 Up next countdown
- [x] AC05 notes (uses `LessonExtrasService` from US-L015; unit tests against the contract)
- [x] AC06 lesson feedback (unit tests against the contract)
- [x] AC07 lesson files, tabs, course facts with learner count
- [x] AC08 exercise type in models, builder, details page and learning page
- [ ] AC09 keyboard walk (400px checked: no sideways scroll, curriculum stacks under the lesson)
- [x] Admin feedback list shows lesson tags
- [x] Browser check against Codex's API: notes, lesson feedback, learner count, an exercise saved and completed

## Verification (2026-10-17, Claude Code)

- App tests 330 passed, UI guards 23/23, colour baseline check and development build pass, run in an
  isolated copy of `main` with my changes and a stub of the US-L015 service contract.
- Browser on 3001/4200 with in-memory stores (the frontend served from that copy): progress
  header and section rings, resume at the first unfinished lesson, Previous/Next, Mark complete
  then up next and the 5-second advance, resources files, problem form, quiz scoring and
  completion, 400px. Screenshots in `docs/verification/2026-10-17/US-L016/`.
- Fixed during the check: lesson text lists and headings were unstyled (scoped styles do not
  reach `innerHTML`; the old view had the same gap), and the up-next buttons were restyled for
  the dark panel.
- Lead check on `5171341` (US-L015 delivered): API 1326, journeys 6, app 338, guards 23/23, Pages build pass in
  `main`. Browser on 3001/4200 against the real isolated API: a note saved and still listed after a reload, a
  helpful rating shown in the admin feedback list with its course and lesson, learner count "1 learner", an
  exercise with a ZIP starter file saved by the API, shown, ticked complete (progress write 200) and followed by up
  next.
- Not verified: a real Mux video (90% and note timestamps are unit-tested only); a keyboard-only walk; hosted
  MongoDB and Sheets.
