# US-T010 guided course form, and DEF-020 published course looks uneditable

## Record

- Source: feedback from the first teacher who built a course on the live site, relayed by
  Alex on 2026-10-10.
- State: delivered locally 2026-10-10 (version 0.1.92). Owner: Claude Code. Hosted check pending.
- The quiz editor and moving lessons between chapters from the same feedback are US-T011 and
  US-T012, see [the builder spec](US-T011-T012-course-builder.md) once Codex has written it.

## Story

**As a teacher, I want the course form to lead me through one step at a time, so that I know
what is required, what is done, and what comes next.**

```gherkin
Feature: Guided course form
  Scenario: US-T010-AC01 Steps with checkmarks
    Given I am creating or editing a course
    When I look at the form
    Then I see its steps in order, one step open at a time
    And a step shows a checkmark once its required fields are filled
    And I can go to the next or the previous step, or straight to any open step

  Scenario: US-T010-AC02 Required fields are marked
    Given a field must be filled before the course can be saved
    When I see that field
    Then it is marked with an asterisk and the form explains the mark

  Scenario: US-T010-AC03 Bullet lists look like lists while I type
    Given I am typing in Requirements or What you'll learn
    When I start a new line
    Then the line shows its bullet before I type any text
    And my cursor stays where I am typing
    And an empty bullet is not saved as an item
```

## Decisions taken by the implementer (confirm or change)

- Step order is Essentials, Learner fit, Thumbnail, Course content, Publishing. Publishing
  moved from third to last, because sending the course for review is the last thing a teacher
  does. "Career goals" moved from Publishing to Learner fit.
- Thumbnail, Course content and Publishing need a saved course, as before. In a new course
  they are shown locked, and the form says they open once the course is created.
- A saved course opens on its first step without a checkmark.
- In a new course the main button is "Next" until the last open step, where it becomes
  "Create course". In a saved course "Save changes" is always available.
- Required marks follow the existing save rules: title, teacher, level, description.

## DEF-020 — A published course looks impossible to edit

Severity P2. Reported by the teacher as "it's not possible to edit the course once it's
published". Editing is possible: US-T002 lets a teacher start a private revision. But the
form opened with every field disabled and no explanation, and "Start revision" was a small
outline button inside the third section. Reproduced 2026-10-10 with the in-memory API: a
published course opened in the editor showed disabled fields and no reason.

Fix: a notice at the top of the form says the course is published (or archived, or waiting
for review) and what that means, with a primary "Start revision" button when that is the way
forward. The button in the Publishing step remains.

## Checks

| Scenario | Check |
| --- | --- |
| US-T010-AC01 | `course-form-steps.spec.ts`; browser: checkmarks appear as fields are filled, Next and Back move one step, creating the course continues at Thumbnail |
| US-T010-AC02 | Browser: asterisks on the four required fields and the "* Required" note |
| US-T010-AC03 | `bullet-list.spec.ts`; browser: Enter gives "• " on the new line with the cursor after it |
| DEF-020 | `course-form-steps.spec.ts`; browser: published course shows the notice, "Start revision" unlocks the form |

188 frontend tests and the frontend build pass. Steps are hidden with the `hidden` attribute,
not removed, so the lesson builder keeps its state and uploads continue across step changes.
Checked at 375px: no horizontal scroll, action buttons on one line.
Not verified: a screen reader, the hosted environment.
