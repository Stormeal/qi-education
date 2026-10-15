# US-L015, US-L016, US-L017, US-T015: Learning view backend

## Record

- Stories: US-L015 (private lesson notes), US-L016 (lesson feedback), US-L017 (enrolled
  learner count), US-T015 (exercise lesson type). Part 2 of 3 of the learning view
  redesign; part 1 is US-P013 (shared UI), part 3 is the learning page itself.
- State: Done locally (2026-10-15), delivery `feat(US-L015): add the learning view backend` (0.1.175); no push/deployment.
- Owner: Codex (API and storage only). Claude builds the screens in part 3 against this
  contract.
- Related defects: none
- Branch/base: `feat/US-L015-learning-backend` / `ee1b660` (0.1.173)
- Product decisions, confirmed by Alex on 2026-10-15:
  - Notes are private to the learner, belong to one lesson, and carry the video time when
    written on a video lesson. They work on every lesson type.
  - Lesson feedback goes into the existing admin feedback triage, tagged with course and
    lesson; "report a problem" has categories. A teacher-facing summary is a later story.
  - The learning view shows only course facts the data can back. The enrolled count is
    new; the admin-set rating is not shown to learners.
  - Hands-on exercises become their own lesson type. Learners do them outside the app and
    mark them complete.
- Defaults taken by the lead (confirm or change):
  - Thumbs up or down is one vote per learner per lesson, stored separately and changeable.
    Only "report a problem" creates a triage entry, so admins are not flooded with votes.
  - Limits: a note is 1–2000 characters; at most 500 notes per learner per course.
  - The enrolled count counts active accounts and is cached for 5 minutes.
  - An exercise needs instructions before its course can be published, like a text lesson.

## Problem and outcome

The redesigned learning page needs four things the API cannot give it today:

- US-L015: As a learner, I want to write private notes on a lesson, linked to the moment
  in the video, so that I can find and replay what mattered.
- US-L016: As a learner, I want to say whether a lesson helped and to report a problem
  with it, so that teachers and admins can fix what is broken.
- US-L017: As a learner, I want to see how many people take a course, so that I can judge
  it on real data.
- US-T015: As a teacher, I want an exercise lesson type with instructions, files and a link,
  so that learners know a hands-on task comes next and can mark it done.

Observed on `ee1b660`: lesson types are `video`, `text`, `quiz` and `resources`
(`api/src/courseContent.ts`); feedback has `page`, `rating` and `message` only
(`api/src/feedback.ts`); enrolment lives in the users sheet's `enrolledCourseIds` and no
count is exposed; there is no note storage. Account lesson progress already exists
(US-L002, `api/src/learningProgress.ts`) and is the pattern to follow.

## Scope

Included: the routes, validation, storage (MongoDB in production, in-memory locally and in
tests) and tests below. Existing routes and response shapes stay unchanged; every change
is additive, because a push deploys the API before the frontend.

Not included: any file under `app/`, the teacher feedback summary, notes shared with
others, notes export, ratings on the catalog.

## Behavior contract

```gherkin
Feature: Learning view backend

  Scenario: US-L015-AC01 Save a note at the current video time
    Given a learner enrolled in a published course with a video lesson
    When they create a note on that lesson with a body and the video time 754 seconds
    Then the API answers 201 with the note, its id, lesson, video time and timestamps
    And listing the course's notes returns it

  Scenario: US-L015-AC02 Notes are private
    Given two learners enrolled in the same course
    When one lists, edits or deletes notes
    Then they only ever see or change their own notes
    And another learner's note id answers 404

  Scenario: US-L015-AC03 Notes need access and a real lesson
    Given a learner
    When they write a note on a course they cannot learn, on an unknown lesson, with an
      empty or over-long body, or with a video time on a non-video lesson
    Then the API answers 403, 400 or 404 with a message
    And nothing is stored

  Scenario: US-L015-AC04 Edit and delete a note
    Given a learner with a note
    When they change its body, then delete it
    Then the edit answers 200 with the new body and a later updatedAt
    And the delete answers 204 and the note is gone from the list

  Scenario: US-L016-AC01 Vote on a lesson
    Given a learner who can learn a course
    When they vote up on a lesson, then vote down on the same lesson
    Then their vote for that lesson is down
    And reading their votes for the course returns one vote for that lesson

  Scenario: US-L016-AC02 Report a problem with a lesson
    Given a learner who can learn a course
    When they report a problem on a lesson with category "video" and a message
    Then a feedback entry with rating needs-work, the course id, lesson id and category is
      stored in the admin triage
    And the admin feedback list shows those fields

  Scenario: US-L016-AC03 Existing feedback still works
    Given the existing feedback dialog
    When it sends feedback without course or lesson fields
    Then it is stored and listed exactly as before

  Scenario: US-L017-AC01 Show how many learners take a course
    Given a published course with three active enrolled accounts and one disabled one
    When anyone reads the course's stats
    Then the API answers with an enrolled count of 3

  Scenario: US-L017-AC02 Stats only for visible courses
    Given a draft course
    When someone who cannot see it reads its stats
    Then the API answers 404

  Scenario: US-T015-AC01 Save an exercise lesson
    Given a teacher editing their course
    When they save a lesson of type exercise with instructions, a link and files
    Then it is stored and returned like any other lesson
    And a learner can mark it complete with the existing progress route

  Scenario: US-T015-AC02 An exercise needs instructions to publish
    Given a course whose exercise lesson has no instructions
    When it is submitted or published
    Then the existing publication readiness check reports the empty exercise
```

## API, storage, and compatibility

All new learner routes answer `Cache-Control: private, no-store` and `Vary: Authorization`,
require a bearer token, and use `canLearnCourse` from `api/src/courseAccess.ts` (404 for an
unknown course, 403 without access). Lessons are checked against the course's current
content. Error bodies are `{ message }`.

### Notes (US-L015) — new module `api/src/lessonNotes.ts`, repository `lessonNotesRepository.ts`

```ts
type LessonNote = {
  id: string;            // server-generated UUID
  courseId: string;
  componentId: string;   // lesson id
  body: string;          // trimmed, 1–2000 characters
  videoSeconds: number | null; // integer ≥ 0; only allowed on video lessons
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
};
```

| Route | Body | Answer |
| --- | --- | --- |
| `GET /users/me/courses/:courseId/notes` | — | 200 `{ notes: LessonNote[] }`, newest first; notes on lessons no longer in the course are left out |
| `POST /users/me/courses/:courseId/notes` | `{ componentId, body, videoSeconds? }` | 201 `LessonNote`; 400 bad input, unknown lesson, `videoSeconds` on a non-video lesson, or 500 notes already in this course |
| `PATCH /users/me/notes/:noteId` | `{ body }` | 200 `LessonNote`; 404 when the note is not the caller's; 403 when the caller lost access to its course |
| `DELETE /users/me/notes/:noteId` | — | 204; 404 when not the caller's |

Storage: MongoDB collection `${MONGODB_COURSE_CONTENT_COLLECTION}_lesson_notes`, documents
keyed by note id with `userId`; queries always filter by `userId`.

### Lesson votes and problem reports (US-L016) — new module `api/src/lessonFeedback.ts`

| Route | Body | Answer |
| --- | --- | --- |
| `GET /users/me/courses/:courseId/lesson-votes` | — | 200 `{ votes: { componentId: string; vote: 'up' \| 'down' }[] }` |
| `PUT /users/me/courses/:courseId/lessons/:componentId/vote` | `{ vote: 'up' \| 'down' \| null }` | 200 `{ componentId, vote }`; `null` removes the vote |

Votes: MongoDB collection `${MONGODB_COURSE_CONTENT_COLLECTION}_lesson_votes`, one
document per user, course and lesson (idempotent upsert, like learning progress).

Problem reports reuse `POST /feedback`, extended additively in `api/src/feedback.ts`:

```ts
createFeedbackSchema = z.object({
  page, rating, message, userAgent,            // unchanged
  courseId: z.string().trim().min(1).max(120).optional(),
  componentId: z.string().trim().min(1).max(120).optional(),
  category: z.enum(['video', 'content', 'file', 'other']).optional(),
}) // componentId and category require courseId; when courseId is present the caller
   // must be able to learn the course and componentId must be one of its lessons (400/403/404)
```

`FeedbackEntry` gains `courseId?`, `componentId?`, `category?`; the sheet gains three
columns after `GitHub Issue URL` (`Course ID`, `Lesson ID`, `Category`), the default range
becomes `Feedback!A:P`, and old rows without them read as undefined. `GET /feedback`
returns the new fields. The GitHub issue body names the course and lesson when present.
The frontend sends a problem report as `{ page: 'learning', rating: 'needs-work', message,
courseId, componentId, category }`.

### Enrolled count (US-L017)

`GET /courses/:id/stats` with optional authentication answers 200
`{ courseId, enrolledCount }`, counting accounts with status `active` whose
`enrolledCourseIds` contain the course. 404 when `canSeeCourse` is false. The count is
cached per process for 5 minutes and recomputed after an enrolment through
`POST /users/me/courses/:id`. `Cache-Control: public, max-age=60` for published courses.

### Exercise lesson type (US-T015)

`api/src/courseContent.ts`: add `baseCourseContentComponentSchema.extend({ type:
z.literal('exercise') })` to the discriminated union. `content` holds the instructions,
`resourceUrl` the optional external link, `attachments` the files, all as for other
lessons. Learners complete it with the existing
`PUT /users/me/learning-progress/:courseId/lessons/:componentId`. Publication readiness
(`courseReview.ts`) treats an exercise with empty `content` as not ready, with the message
"Add instructions to the exercise "<title>"." Anonymous and outline projections treat it
like a text lesson.

## Implementation checklist

1. Exercise type in the schema, readiness, projections and progress (tests first).
2. Feedback schema, sheet columns, access checks and GitHub issue body (tests first; old
   rows and old clients covered).
3. Notes repository (in-memory and Mongo) and routes.
4. Votes repository and routes.
5. Course stats route with cache and invalidation.
6. Journey test extended: a learner writes a note, votes and reports a problem.

## Verification and delivery

| Scenario | Test or manual check | Result/evidence |
| --- | --- | --- |
| US-L015-AC01–AC04 | `api/src/lessonNotes.test.ts` | PASS: 38 cases across normal and `/api` paths; create/list/edit/delete, privacy/ownership, denial and validation, deleted lessons, private parser errors, concurrent 500-note boundary |
| US-L016-AC01 | `api/src/lessonFeedback.test.ts` | PASS: one changeable/removable vote, repeat/concurrent writes, private/error headers, per-account data, current lesson validation |
| US-L016-AC02–AC03 | `api/src/lessonFeedback.test.ts`, `feedback.test.ts`, `githubFeedback.test.ts`, existing server feedback tests | PASS: lessonFeedback 32, feedback 6, GitHub 1; lesson context reaches admin triage and issue text; old rows/clients preserved; Sheets mapping columns N:P; no real service calls |
| US-L017-AC01–AC02 | `api/src/courseStats.test.ts` | PASS: 8 cases; 3 active plus 1 disabled yields 3, visibility checked before cached reads, five-minute expiry/status refresh, immediate enrollment invalidation and idempotency |
| US-T015-AC01–AC02 | `api/src/exerciseLesson.test.ts`, `courseReview.test.ts` | PASS: 2 exercise tests (HTTP content save, attachment upload/download, learner/outline projections and completion); 4 new readiness cases within 44 review tests |
| All API | `npm run api:test -- -- --maxWorkers=2` | PASS: `Test Files 56 passed (56)`; `Tests 1373 passed (1373)`; 92 added cases. Default-concurrency run: 1372 passed, 1 unchanged sign-in deadline failure; see handoff |
| Journey | `npm run verify:journeys` | PASS: 7 cases including learner note, vote change and problem report; isolated HTTP stores |
| API build | `npm run api:build` | PASS: TypeScript compilation, exit 0 |
| Frontend | `npm run app:test` | PASS: `Test Files 36 passed (36)`; `Tests 283 passed (283)`. Initial concurrent run: 282 passed, 1 unchanged AC07 timeout (5000 ms); standalone rerun green. Existing test-setup/jsdom warnings remain |

Isolated in-memory stores only. Real MongoDB, Sheets and hosted behaviour are recorded as
not verified.

Delivery notes: the handoff contains RED evidence, review findings/fixes, environment
limitations and deviations. The original checkout was dirty, so the exact requested branch
was checked out in `C:/Users/ast/.codex/worktrees/learning-backend/qi-education` without
stashing or altering existing work. Course stats refresh on the next read after enrollment;
obsolete notes may be deleted by their owner with course access, while edits on removed
lessons are rejected. The existing course mutation lock serializes note quota checks and
inserts across workers. Exercise projections required no implementation changes because
the existing generic non-quiz mapping already gives the required behavior.
