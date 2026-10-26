# US-A007: Course reviewers

Design agreed with Alex on 2026-10-26 (brainstorming, design A). Not built yet.

**As an admin, I want to assign one or more colleagues to review a course before I publish it, so
content is checked by someone other than its authors.**

## Decisions (Alex, 2026-10-26)

- Reviewers are picked from active **teacher and admin** accounts. A course's own assigned teachers
  cannot review it.
- Feedback is a **verdict** (Approve / Request changes) with one comment.
- Publishing is blocked **until every assigned reviewer has approved** the submitted revision.
- Reviewers find their courses in a **"To review" list on Home, plus an email**.
- Built as defaults, confirm or change: up to 20 reviewers per course (same limit as teachers); a
  comment is required for Request changes and optional for Approve; admins cannot override the gate
  (remove the reviewer instead).

## Behavior

### Assignment

- An admin sets a course's reviewers (0–20) from active teacher and admin accounts, like assigning
  teachers (US-A005). Only admins can change reviewers.
- An account that is an assigned teacher of the course is refused as a reviewer, and assigning
  someone as a teacher who is already a reviewer of that course is refused too.
- Every newly assigned reviewer gets an email with a link to the course. A failed email does not
  undo the assignment; the admin sees a warning.

### Reviewing

- A reviewer can open the read-only review preview of the course's submitted revision (lessons,
  quizzes, media, files) and its review history. They cannot edit, submit, return, publish,
  archive, or change price or catalog settings.
- While the revision is `ready-for-review`, a reviewer sends **Approve** or **Request changes**.
  Each verdict is a review-history event (actor, date, comment), visible to owner teachers and
  admins like other history. A newer verdict from the same reviewer replaces the older one for the
  gate; history keeps both.
- Home shows signed-in reviewers a "To review" list: course title, revision status and their own
  verdict (Waiting for you / Approved / Changes requested).

### Publish gate

- An admin can publish only when every currently assigned reviewer's latest verdict since the most
  recent Submit is Approve. Otherwise Publish is disabled with the count ("Waiting for 2 of 3
  reviewers") and the API refuses with 409 and no change.
- Return and Archive are never blocked by reviewers.
- After a Return and a new Submit, all verdicts reset and every reviewer is emailed again.
- Removing a reviewer removes them from the gate. A course with no reviewers publishes exactly as
  today.
- A disabled reviewer, or one demoted to student, still counts in the gate (shown as "inactive")
  until an admin removes them, so nothing is published without its review.
- A live published course stays live while its next revision waits; only that revision's publish
  is blocked.

## Build notes (design A)

- Store reviewer IDs on the course beside its teacher IDs; no new collection. Route
  `PUT /courses/:id/reviewers` modelled on `courseTeachersRoutes.ts`, plus its row (and `/api`
  alias) in `routePermissions.test.ts`.
- Verdicts are two new actions on `POST /courses/:id/review` in `courseReview.ts`: `approve` and
  `request-changes` (reason = comment). The gate check lives in the `publish` branch there.
- Reviewer read access to the working revision goes in `courseAccess.ts`.
- Mail through `mailSender.ts` (Brevo); in-memory/fake sender locally.
- App: reviewer picker in the admin course panel (next to teachers), verdict buttons and gate
  message in `ui/course-review-panel/`, "To review" list on Home.

Not in scope: per-lesson comments, review deadlines, admin override of the gate.

## Acceptance

```gherkin
Feature: Course reviewers

  Scenario: US-A007-AC01 Admin assigns reviewers
    Given an admin and a course with assigned teacher T
    When the admin assigns reviewers R1 (teacher) and R2 (admin)
    Then both are saved as the course's reviewers and each is emailed a link
    And assigning T or a student as reviewer is refused
    And a teacher cannot change the course's reviewers

  Scenario: US-A007-AC02 Reviewer reads and gives a verdict
    Given the course's revision is ready for review and R1 is assigned
    When R1 opens the course
    Then R1 sees the read-only preview and review history but no edit or publish actions
    When R1 sends "Request changes" with a comment
    Then the verdict appears in the review history for the owner teachers and admins
    And sending "Request changes" without a comment is refused

  Scenario: US-A007-AC03 Publishing waits for every approval
    Given reviewers R1 and R2, and only R1 has approved since the last Submit
    Then the admin's Publish is disabled with "Waiting for 1 of 2 reviewers"
    And a publish request is refused with 409 and nothing changes
    When R2 approves
    Then the admin can publish

  Scenario: US-A007-AC04 Resubmitting resets verdicts
    Given both reviewers approved and the admin returned the revision
    When the teacher submits again
    Then no reviewer counts as approved and both are emailed again

  Scenario: US-A007-AC05 Reviewer list on Home
    Given R1 is assigned to two courses
    When R1 opens Home
    Then "To review" lists both with R1's own verdict for each

  Scenario: US-A007-AC06 No reviewers, unchanged publishing
    Given a course with no reviewers
    Then submit, return and publish work exactly as before
```
