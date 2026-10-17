# US-L015: Learning backend for notes, lesson feedback, learner count and exercises

## Record

- Story: US-L015 ([backlog](../user_stories.md#us-l015--keep-notes-rate-lessons-and-practise-in-a-course))
- State: In progress (selected by Alex 2026-10-17 after the first teacher session)
- Owner: Codex (API, storage and the frontend data service). Runs in parallel with
  US-L016 (Claude, the learning page), which builds on the contract below.
- Part 2 of 3 of the learning view redesign (part 1 was US-P013; decided with Alex on
  2026-10-15, see the end of the [US-P013 spec](US-P013-shared-ui-foundation.md)).
- Handoff: [US-L015-learning-backend-codex.md](../handoffs/US-L015-learning-backend-codex.md)
- Defaults taken by the lead (confirm or change):
  - Notes are private to the account that wrote them; nobody else, admins included, can
    read them through the API.
  - Notes, lesson feedback and the learner count need sign-in. Notes and lesson feedback
    need the same access as reading the course content (enrolled, or allowed to author).
  - A thumbs click is a feedback entry each time; the API does not keep one vote per
    learner. The page stops a second click on the same lesson.
  - Lesson feedback goes into the existing feedback store and triage with
    `page: 'lesson'`. Thumbs up maps to rating `great`; thumbs down and "report a
    problem" map to `needs-work`.
  - An exercise is a lesson with the same fields as a text lesson: instructions in
    `content` (rich text), files as attachments, an optional link in `resourceUrl`. It
    has no solution field (the approved mockup shows none) and is not graded; the learner
    ticks it complete.
  - At most 500 notes per account per course, 2,000 characters each.

## Problem and outcome

As a learner, I want to keep notes at a point in a lesson, tell the teacher when a lesson
helped or has a problem, see how many people take the course, and practise with
exercises, so that the learning page is somewhere I can work, not only watch.

Today none of these exist in the API: the feedback store only knows the site-wide dialog,
there is no per-course learner count, and the content API accepts only `video`, `text`,
`quiz` and `resources`.

## Contract (US-L016 relies on this exactly)

Every route is served on both prefixes (`/courses/...` and `/api/courses/...`), like the
existing course routes. Errors answer `{ message }`. 401 without a valid token. Bodies
are validated with Zod; a validation failure answers 400.

### Notes

`LessonNote = { id: string; courseId: string; componentId: string; text: string;
videoSeconds: number | null; createdAt: string; updatedAt: string }` (ISO timestamps).

| Route | Body | Success |
| --- | --- | --- |
| `GET /courses/:courseId/notes` | | 200 `{ notes: LessonNote[] }`, the caller's notes for the course, oldest first |
| `POST /courses/:courseId/notes` | `{ componentId: string (1-120), text: string (trimmed, 1-2000), videoSeconds: integer 0-86400 or null }` | 201 `{ note: LessonNote }` |
| `PATCH /courses/:courseId/notes/:noteId` | `{ text: string (trimmed, 1-2000) }` | 200 `{ note: LessonNote }` |
| `DELETE /courses/:courseId/notes/:noteId` | | 204 |

- 403 when the caller may not read the course content.
- 400 when `componentId` is not a lesson of the course, or the 500-note limit is reached.
- 404 when the note does not exist or belongs to another account (same answer for both).
- Storage: MongoDB in production, in-memory locally and in tests, chosen the same way as
  the other Mongo-backed repositories. Per-account data: not under the course lock.

### Lesson feedback

`POST /courses/:courseId/lesson-feedback`, body
`{ componentId: string (1-120), kind: 'helpful' | 'not-helpful' | 'problem',
category?: 'video' | 'content-error' | 'unclear' | 'files' | 'other', message?: string
(trimmed, max 2000, default '') }` → 201 `{ id: string }`.

- `category` is required when `kind` is `problem`, and refused (400) otherwise.
- 403 when the caller may not read the course content; 400 for an unknown `componentId`.
- Stored as a normal feedback entry (`page: 'lesson'`, rating as in the defaults above)
  with four new optional fields: `courseId`, `componentId`, `lessonFeedbackKind`,
  `problemCategory`. The existing feedback list for admins returns them. The Sheets
  feedback worksheet gets them as new columns appended after the existing ones, so old
  rows still read.
- The site-wide feedback dialog (`POST /feedback`) is unchanged.

### Learner count

`GET /courses/:courseId/learners/count` → 200 `{ enrolledLearners: number }`: the number
of accounts whose enrolled courses include this course.

- Any signed-in user for a published course; for other statuses, only users allowed to
  author it (403 otherwise). 404 for an unknown course.
- Must not add a Sheets read per request beyond what an authenticated request already
  reads (see INV-005): count from the users read the request already has.

### Exercise lesson type

The content schema accepts a fifth component type with only the base fields:
`{ ...base fields, type: 'exercise' }`. The instructions live in the base `content` field.

- Saving, review, publishing, learning progress (completing an exercise lesson id) and
  the outline accept exercise lessons like text lessons.

### Frontend data service

New file `app/src/app/services/lesson-extras.service.ts` (`providedIn: 'root'`), using
`ApiClientService` like the other services, exporting the types above and:

- `listNotes(courseId, token): Promise<LessonNote[]>`
- `addNote(courseId, { componentId, text, videoSeconds }, token): Promise<LessonNote>`
- `updateNote(courseId, noteId, text, token): Promise<LessonNote>`
- `deleteNote(courseId, noteId, token): Promise<void>`
- `sendLessonFeedback(courseId, { componentId, kind, category?, message? }, token): Promise<void>`
- `enrolledLearners(courseId, token): Promise<number>`

A failed request rejects with an `Error` whose message is the API's `message` (or a
plain fallback sentence).

## Scenarios

```gherkin
Feature: Learning backend
  Scenario: US-L015-AC01 Keep a private note at a video time
    Given I am enrolled in a course
    When I add a note on a video lesson at 95 seconds
    Then listing my notes returns it with videoSeconds 95
    And another learner listing notes for the course does not see it

  Scenario: US-L015-AC02 Edit and delete my own note only
    Given a note written by another account
    When I try to change or delete it
    Then the answer is 404 and the note is unchanged

  Scenario: US-L015-AC03 Notes need course access
    Given I am signed in but not enrolled and not allowed to author the course
    When I list or add notes for it
    Then the answer is 403

  Scenario: US-L015-AC04 Lesson feedback reaches triage tagged with the lesson
    Given I am enrolled in a course
    When I report a problem with category "video" on a lesson
    Then the admin feedback list contains an entry with page "lesson", the course id,
      the lesson id, kind "problem" and category "video"

  Scenario: US-L015-AC05 A problem report needs a category
    When I send kind "problem" without a category, or kind "helpful" with one
    Then the answer is 400

  Scenario: US-L015-AC06 Learner count
    Given three accounts are enrolled in a published course
    When any signed-in user asks for its learner count
    Then the answer is { enrolledLearners: 3 }

  Scenario: US-L015-AC07 Exercise lessons save and complete
    Given a teacher saves a section with an exercise lesson with instructions and a file
    When a learner opens the content and completes that lesson
    Then the exercise comes back as saved and progress counts it

  Scenario: US-L015-AC08 The frontend data service passes the contract through
    Given the API answers as in this spec
    When the page calls each lesson-extras service method
    Then it receives the documented values, and API errors as Error messages
```

## Checklist

- [ ] AC01–AC03 notes routes, repository (memory and Mongo) and tests
- [ ] AC04–AC05 lesson feedback route, feedback fields and Sheets columns, tests
- [ ] AC06 learner count route and tests
- [ ] AC07 exercise type in the content schema, review/publish, progress, tests
- [ ] AC08 `lesson-extras.service.ts` and its spec
- [ ] `docs/architecture.md` lists the new routes and storage
- [ ] API tests, API build, journeys pass
