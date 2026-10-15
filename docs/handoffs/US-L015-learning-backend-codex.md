# Codex brief — Learning view backend (US-L015, US-L016, US-L017, US-T015)

You are building the API and storage for four stories that the redesigned learning page
needs. Claude Code is the lead and builds the screens later against the contract below, so
keep the contract exactly; if you must deviate, say so in your report.

## Where to work

- Repository: `qi-education` (npm workspace: `app/` Angular, `api/` Express + Zod).
- Run `git fetch origin` and `git checkout feat/US-L015-learning-backend` (a branch made for
  this work from `main` at `ee1b660`). Its history must contain the commit that added this
  handoff. Work and commit only on this branch. **Commit locally, do not push.**
- Claude is working on another branch (`feat/US-P013-shared-ui-foundation`, frontend only).
  Never check it out, merge it or touch `app/`.
- Read first: `CLAUDE.md`, `AGENTS.md`, `docs/development_workflow.md`, and the full spec
  `docs/specs/US-L015-L016-L017-T015-learning-backend.md` (the binding contract; this
  brief summarises it).

## Work items and acceptance criteria

The spec's Gherkin scenarios are the acceptance criteria. Every one needs a test:

- US-L015-AC01 save a note at the current video time · AC02 notes are private ·
  AC03 notes need access and a real lesson (403/400/404, nothing stored) · AC04 edit and delete.
- US-L016-AC01 one changeable vote per learner per lesson · AC02 "report a problem" becomes a
  triage feedback entry with course, lesson and category · AC03 existing feedback unchanged.
- US-L017-AC01 enrolled count counts active enrolled accounts · AC02 404 for courses the
  caller cannot see.
- US-T015-AC01 exercise lessons save, return and complete like other lessons · AC02 an
  exercise without instructions blocks publication.

## Goal

Add the routes and storage the learning page needs: private notes, lesson votes and problem
reports, an enrolled count, and an `exercise` lesson type. Every change is additive; existing
routes and response shapes stay the same, because a push deploys the API before the frontend.

## API contract the frontend depends on

Copied from the spec's "API, storage, and compatibility" section; read it there in full.

- `GET /users/me/courses/:courseId/notes` → `{ notes: LessonNote[] }` newest first.
- `POST /users/me/courses/:courseId/notes` `{ componentId, body, videoSeconds? }` → 201 `LessonNote`.
- `PATCH /users/me/notes/:noteId` `{ body }` → 200 `LessonNote`.
- `DELETE /users/me/notes/:noteId` → 204.
- `LessonNote = { id, courseId, componentId, body, videoSeconds: number | null, createdAt, updatedAt }`;
  body trimmed 1–2000 chars; `videoSeconds` integer ≥ 0 and only on video lessons; max 500
  notes per learner per course.
- `GET /users/me/courses/:courseId/lesson-votes` → `{ votes: { componentId, vote: 'up' | 'down' }[] }`.
- `PUT /users/me/courses/:courseId/lessons/:componentId/vote` `{ vote: 'up' | 'down' | null }` →
  200 `{ componentId, vote }`.
- `POST /feedback` gains optional `courseId`, `componentId`, `category: 'video' | 'content' | 'file' | 'other'`
  (lesson fields require `courseId`, access and a real lesson); `FeedbackEntry` and
  `GET /feedback` return them; the sheet gets columns `Course ID`, `Lesson ID`, `Category`
  after `GitHub Issue URL`; default range `Feedback!A:P`; the GitHub issue body names course
  and lesson.
- `GET /courses/:id/stats` (optional auth) → `{ courseId, enrolledCount }`; active accounts
  only; 404 when `canSeeCourse` is false; 5-minute per-process cache, refreshed after
  `POST /users/me/courses/:id`; `Cache-Control: public, max-age=60` for published courses.
- Lesson type `exercise` in `courseContentComponentSchema` (`content` = instructions,
  `resourceUrl` = link, `attachments` = files); completes through the existing progress
  route; readiness message `Add instructions to the exercise "<title>".`
- Learner routes: bearer token, `Cache-Control: private, no-store`, `Vary: Authorization`,
  `canLearnCourse` (404 unknown course, 403 no access), errors as `{ message }`.

## Tasks (spec "Implementation checklist")

1. Exercise type: `api/src/courseContent.ts`, `api/src/courseReview.ts`, projections in
   `api/src/courseRequestReads.ts` or wherever anonymous/outline reads shape lessons.
2. Feedback: `api/src/feedback.ts`, `api/src/feedbackRepository.ts`, `api/src/githubFeedback.ts`,
   `api/src/config.ts` (range default), the `POST /feedback` handler in `api/src/server.ts`.
3. Notes: new `api/src/lessonNotes.ts` (routes) and `api/src/lessonNotesRepository.ts`
   (in-memory + Mongo, collection `${MONGODB_COURSE_CONTENT_COLLECTION}_lesson_notes`),
   following `learningProgress.ts` / `learningProgressRepository.ts`.
4. Votes: new `api/src/lessonFeedback.ts` and `api/src/lessonVotesRepository.ts`
   (collection `${MONGODB_COURSE_CONTENT_COLLECTION}_lesson_votes`, idempotent upsert).
5. Stats: new `api/src/courseStats.ts`, wired in `api/src/server.ts`; invalidate in the
   enrolment route.
6. Extend `api/src/journey.test.ts`: a learner writes a note, votes and reports a problem.

Wire new repositories through the `createApp` dependencies in `api/src/server.ts` the way
`learningProgressRepository` is wired, so tests inject in-memory stores.

## Tests first

For each task, write the failing tests before the code and keep the RED output for your
report: `api/src/exerciseLesson.test.ts`, `api/src/lessonNotes.test.ts`,
`api/src/lessonFeedback.test.ts`, `api/src/courseStats.test.ts`, plus additions to the
existing feedback and review tests. Cover denial, validation, unknown ids, another
learner's data, old feedback rows without the new columns, and the cache refresh.

## Constraints

- Files you own: everything under `api/src/**` and `api/package.json` only if needed; the spec,
  `docs/user_stories.md`, `docs/work_queue.md` and this handoff for status updates.
- Do not edit anything under `app/`, `scripts/`, `.github/`, or `api/dist/` (do not commit
  `api/dist`). If you need a file outside this list, finish everything else first and report it.
- **Isolated in-memory stores only.** Never call real Sheets, MongoDB, Mux, GitHub or mail.
- Follow existing patterns: Zod schemas, `{ message }` errors, repositories injected via
  `createApp`, no new dependencies.
- Version hook: every commit needs a version bump. Bump the patch version in root
  `package.json`, `app/package.json`, the two matching `package-lock.json` entries and
  `appVersion` in `app/src/app/services/app-state.service.ts` (that one line is the only
  `app/` edit allowed). Never use `--no-verify`. Stage files by path, never `git add -A`.
- Commit messages: `feat(US-L015): …`, `feat(US-T015): …`, etc.

## Done when

- Every scenario above has a passing test, and the spec's verification table names the
  tests and results.
- `npm run api:build`, `npm run api:test`, `npm run verify:journeys` and `npm run app:test` pass.
- Existing routes and responses are unchanged (existing tests untouched except feedback
  additions).

## Report back

Update your row in `docs/work_queue.md`, then stop and summarise: commits (SHA + subject),
files touched, test counts and the command output lines, RED evidence for each test file,
anything you could not verify (real MongoDB, Sheets, hosted), and every deviation from this
brief with the reason.
