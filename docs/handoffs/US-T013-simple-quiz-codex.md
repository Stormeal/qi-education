# US-T013 simpler quiz questions — Codex handoff (API and grading)

Assigned 2026-10-11 by Claude Code (lead). Alex showed a reference quiz editor and asked for
that simplicity. Runs in parallel with Claude's rebuild of the quiz editor and the learner's
quiz view in this same working tree. Read `AGENTS.md` (including "Two agents in one working
tree") first.

## Decisions by Alex (2026-10-11)

- Every question is worth 1 point. Teachers no longer set points.
- A question has 2 to 6 answers (it was always exactly four).
- A question has one or more correct answers (it was exactly one). The learner must select
  exactly the correct set to get the point.
- An explanation is optional, one per question.
- An optional image per question is wanted later, not now.

## Scope

Add **US-T013 — Write simple quiz questions** to `docs/user_stories.md` with numbered
scenarios for the rules above, and **US-T014 — Add an image to a quiz question** as Proposed
(not implemented). Write `docs/specs/US-T013-simple-quiz.md` before implementing. Then deliver
the API, validation and grading side of US-T013. Claude delivers all of the frontend.

## Contract Claude's frontend is built against (do not change without recording it)

Stored quiz question, in the content save and author read:

```
{ id, question, points, explanation, answers: [{ id, text, description, isCorrect }] }
```

- `answers`: 2 to 6 items. A save with fewer or more is a 400 with `{ message }`.
- `explanation`: optional string, at most 1000 characters, default `""`.
- `points`: still accepted so the deployed frontend keeps saving, but every question counts
  as 1. Store 1 whatever is sent.
- `description` on an answer: legacy per-answer explanation. Keep accepting and returning it
  unchanged; the new editor no longer edits it.
- `passPoints` on the quiz keeps its name and now means "questions that must be correct".

Learner read of a question (no correct answers disclosed):

```
{ id, question, points: 1, multiple: boolean, answers: [{ id, text, description: "" }] }
```

- `multiple` is true when the question has more than one correct answer. It is the only hint.
- Keep whatever the learner read returns today for the other fields.

Quiz attempt, on BOTH existing attempt routes
(`POST /courses/:id/content/components/:componentId/quiz-attempts` and
`POST /users/me/learning-progress/:courseId/components/:componentId/quiz-attempts`):

```
request  { sectionId, answers: [{ questionId, answerIds: string[] }] }
legacy   { sectionId, answers: [{ questionId, answerId: string }] }   // still accepted
response { score, totalPoints, passPoints, passed,
           feedback: [{ questionId, answerIds, answerId, correct, explanation, description }] }
```

- A question is correct only when the selected set equals the correct set. Order and
  duplicates do not matter; an unknown answer ID or an empty selection is a 400, as an
  unknown ID is today.
- `score` is the number of correct questions; `totalPoints` the number of questions;
  `passed` is `score >= min(passPoints, totalPoints)`.
- In `feedback`, `answerId` is the first selected ID and `description` is the question's
  `explanation`, or when that is empty the legacy description of the first selected answer.
  Both exist only so the deployed frontend keeps working.
- Do not return which answers are correct.

Readiness for review (`assessmentIssues`), replacing the four-answer and one-correct rules:
a question text; 2 to 6 answers, all with text; at least one correct answer; pass mark
between 1 and the number of questions. Keep the message style `Question N: ...`, because the
editor shows these messages.

## Requirements

- Stored quizzes with exactly four answers, one correct answer and points other than 1 keep
  working without a migration: they grade as 1 point per question, and a stored `passPoints`
  larger than the number of questions cannot make the quiz impossible to pass.
- A push deploys the API before the frontend. The deployed frontend sends four answers,
  `points`, and `answerId`; it must keep saving and grading correctly.
- The account-progress rule stays: a quiz lesson counts as complete only after the server
  graded a passing attempt.
- Reproduce any existing behavior you find broken as a defect before fixing it.

## Files

Yours: `api/src/**`, `docs/specs/US-T013-simple-quiz.md`, `docs/user_stories.md`,
`docs/defect_management.md`, `docs/architecture.md`, your row in `docs/work_queue.md`, and
the four version lines the commit hook requires.

Not yours (Claude is editing them now): everything else under `app/`, `CLAUDE.md`.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset or restore changes you did not make. Read the version from `package.json` right
before committing. Isolated in-memory stores only; no servers on ports 3001 or 4200. Run
`npm run api:test`, `npm run verify:journeys`, `npm run api:build`, `npm run app:test` and
`npm run app:build:pages`. A frontend failure caused by Claude's unfinished files under
`app/` is reported, not fixed, and does not block your commit. If you need a file outside
your list, do NOT stop: finish and commit everything that does not depend on it, then
describe the exact change you need in your queue row. Do not push. Update your queue row
with your commits, what you verified and what you could not, then stop and summarize.
