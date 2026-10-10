# US-T013: Simple quiz questions

## Record

- State: Done, API increment. Owner: Codex; frontend owner: Claude Code.
- Selected 2026-10-11; main/base `5bfda0d` (required assignment present).
- Decisions: Alex's reference and the [agreed handoff](../handoffs/US-T013-simple-quiz-codex.md).
- Related defects: none confirmed at selection. US-T014 question images stay Proposed.

## Problem and scope

Teachers need simple question authoring: every question counts one point, two to
six answer options, one or more correct choices and one optional explanation.
Learners earn the point only by selecting exactly the correct set. Codex owns
API models, validation, learner projection, grading and account passing evidence;
Claude owns all editor and learner UI changes. Keep permissions, review/revision
coordination, route names, deployed legacy requests and stored quizzes working.
No migration, images, provider mutations, deployment or push is included.

## Behavior contract

```gherkin
Feature: Write simple quiz questions
  Scenario: US-T013-AC01 Save simple questions
    Given an editable quiz with two to six answer options per question
    When the author saves question text and an optional explanation
    Then each saved question has points 1 and explanation defaulting to an empty string
    And explanation is at most 1000 characters and legacy answer descriptions are retained
    And fewer than two or more than six answers returns 400 with a message

  Scenario: US-T013-AC02 Require answerable questions for review
    Given a draft quiz with incomplete questions
    When the author saves it
    Then incomplete text and missing correct choices may remain in the draft
    When the author submits for review
    Then every question needs text, two to six nonblank answers and at least one correct choice
    And the pass mark is between one and the number of questions
    And existing unique identity checks and Question N messages remain

  Scenario: US-T013-AC03 Grade an exact selected set
    Given a question with one or more correct answers
    When an entitled learner submits answerIds on either attempt route
    Then order and duplicate choices do not affect grading
    And exactly the correct set earns one point with no partial credit
    And unknown IDs, empty selections or duplicate question submissions return 400

  Scenario: US-T013-AC04 Protect learner question data and feedback
    Given an entitled learner reading a quiz
    Then questions expose points 1 and multiple indicating more than one correct choice
    And answers expose only id, text and description empty
    And question explanation and correct-answer identities are withheld
    When the learner submits an attempt
    Then feedback contains only submitted selections, correctness and the question explanation
    And legacy description falls back to the first selected answer when explanation is empty

  Scenario: US-T013-AC05 Keep deployed and stored quizzes working
    Given an existing four-answer quiz with old points and a high stored pass mark
    When it is read or graded without a migration
    Then every question counts one and grading clamps the pass threshold to question count
    And legacy answerId submissions and points in content saves remain accepted
    And permissions and both existing attempt routes are retained

  Scenario: US-T013-AC06 Save completion only after a verified passing attempt
    Given an account with no passing proof for the current quiz
    When it saves quiz completion without passing or after an incorrect selection set
    Then completion is refused
    When its account attempt route persists passing proof
    Then Finish can save completion for that same unchanged quiz
    And changed questions invalidate that proof and another account cannot use it
```

## API and storage contract

Stored/author question:
`{ id, question, points, explanation, answers: [{ id, text, description, isCorrect }] }`.
Save always stores points 1, regardless of sent points. Optional explanation defaults
to `""`; maximum 1000 characters. Accept and return legacy answer descriptions.
Answers contain 2..6 items; incomplete text and no correct choice remain valid drafts.
Review requires nonblank question/options, at least one correct choice, unique IDs,
at least one question and passPoints in 1..question count.

Learner question:
`{ id, question, points: 1, multiple: boolean, answers: [{ id, text, description: "" }] }`.
No isCorrect, correct choice IDs, rubric or pre-attempt explanation. Other existing
learner document fields remain. Legacy author reads supply explanation `""` and
points 1 without writing a migration.

Both POST routes (also their existing `/api` aliases):

- `/courses/:id/content/components/:componentId/quiz-attempts`
- `/users/me/learning-progress/:courseId/components/:componentId/quiz-attempts`

Request: `{ sectionId, answers: [{ questionId, answerIds: string[] }] }` or legacy
`answerId: string`. If both occur, answerIds takes precedence; an explicitly empty
answerIds is rejected rather than falling back. Normalize duplicate choices in
first-selection order. Preserve skipped questions (`answers: []` yields score 0)
and reject duplicate question entries, unknown questions/options and empty choices.
Retain existing size/ID bounds and cap a submitted selection list at 50 entries.

Response:
`{ score, totalPoints, passPoints, passed, feedback: [{ questionId, answerIds, answerId, correct, explanation, description }] }`.
score counts correct questions; totalPoints counts questions. Keep stored passPoints
in the response; passed compares score to `min(passPoints, totalPoints)`. Grading
uses the same question readiness rules but tolerates a legacy high pass mark;
author submission continues to require an attainable pass mark. Feedback answerId
is first submitted choice; description is explanation or first-choice legacy
description. Never disclose unselected correct choices.

Existing account proof persistence and Finish remain separate. Fingerprints must
agree between grading parsed legacy data and finishing stored data, while any
grading-relevant content change still invalidates proof. Preserve existing proofs
where possible without broadening entitlement. Live and private revisions remain
separate; no shared storage writes are required for this work.

## Implementation and review focus

1. Test failing schema/readiness/set-scoring boundaries in `api/src/simpleQuiz.test.ts`,
   then update `courseContent.ts`, `quizAssessment.ts`, learner and author projections.
2. Test both real Express attempts, saves/readiness, learner privacy and legacy
   fixtures on ephemeral ports with all dependencies isolated in memory. Update
   both attempt handlers and account proof only where needed.
3. Replace existing exactly-one-correct rejection tests with rejection of no
   correct choice and explicitly retain multiple-correct submission coverage.
4. Run API suite, journeys, API build, frontend suite and Pages build; report
   Claude-owned failures, never fix them. Review owned changes before commit.
5. Stage owned paths and required version lines only; local hook-aligned commit,
   then delivery hash/evidence in the queue. No push.

Review focus: subset/superset and all-correct sets; unknown/empty/duplicate IDs;
legacy raw points/pass marks/explanations and progress fingerprints; pre-attempt
privacy with arbitrary stored fields; invalid save/readiness without data loss.
Frontend layout, accessibility and image implementation belong to Claude/later work.

## Verification and delivery

| Criteria | Evidence | Result |
| --- | --- | --- |
| AC01/02 | Schema bounds, real save and submit/publish readiness | Passing schema and API save/submit cases; existing lifecycle rules retained |
| AC03 | Exact-set scoring, errors, both routes and aliases | Passing selection, subset/superset, order/duplicates, all-correct, malformed alias and error cases |
| AC04 | Learner projection and attempt feedback privacy | Passing explicit whitelist and complete feedback assertions; forbidden access retained |
| AC05 | Legacy raw storage and deployed payloads without migration | Passing weighted raw quiz, high pass mark, legacy answerId and description fallback; raw store unchanged on reads/grades |
| AC06 | Account pass, Finish, stale proof and account isolation | Passing raw legacy/default proof, failed attempts, changed quiz and entitlement cases; existing proof-store failure tests retained |

2026-10-11 evidence, main/base 5bfda0d plus the owned API changes:

- `simpleQuiz.test.ts`: 33 schema, grading, privacy and real Express route cases;
  the first 30 produced 27 expected failures before implementation. Existing full
  suite failures for weighted points, omitted learner description and exactly-one
  correct choice were updated to the agreed new contract; identity/access/invalid
  assessment protections remain.
- Independent read-only review found no Critical/Important issue and exhausted
  5,213 exact-set combinations for two to six options, reversed/duplicate choices,
  weighted raw questions and legacy pass marks. One Minor malformed-unused-alias
  mismatch was reproduced as a failing regression and fixed before delivery.
- Full checks: `npm run api:test` passed 458 tests after the final alias fix;
  `npm run verify:journeys` passed all six scenarios; `npm run api:build` passed;
  `npm run app:test` passed 221 tests on the concurrent combined tree;
  `npm run app:build:pages` passed with stylesheet warning budgets (builder
  15.95 kB, career path 14.98 kB, course learning 14.15 kB against 12 kB warnings).
  Existing jsdom window-scroll warnings did not fail frontend tests.
  Claude's intervening `1e6506b` frontend commit (0.1.100) was preserved; frontend
  tests and Pages build were repeated after it with the same passing test count.
- Every mutation probe uses disposable in-memory repositories and ephemeral API
  ports; provider services are disabled/stubbed. No servers on 3001/4200 and no
  shared Sheets, MongoDB, Mux or GitHub mutations, push or deployment.
- No existing broken behavior was confirmed as a new defect in this increment;
  the authoring/grading rules intentionally replace the previous contract. No
  outside-scope file is needed by the API work.
- Not verified: real Mongo persistence/durability, shared-provider or hosted
  behavior, actual combined editor/learner browser walk, keyboard/accessibility
  and frontend release compatibility against a hosted old frontend. The deployed
  request shapes are exercised against isolated Express handlers instead.
- Declined review items remain separate: Claude's frontend implementation, existing
  completion visibility after edits and concurrent Finish/edit behavior, arbitrary
  fields outside questions (preserved existing document contract), live durability.

API implementation delivered locally in `1808432` (version 0.1.101). This subsequent
delivery-record commit includes the hook's aligned patch bump. The Codex queue
row records the same commit and checks. Delivered API AC01..AC06 are removed from
the open backlog; US-T013 remains open there for Claude's AC07/08 frontend acceptance
record, with frontend code already committed in `1e6506b`. US-T014 remains Proposed
with no implementation. No outside-scope dependency, provider mutation or push.
Codex stops after the delivery record; combined browser/release checks remain separate.

## Frontend acceptance by the lead (2026-10-11)

Frontend delivered in `1e6506b` (0.1.100). Story Done locally; removed from the open backlog.

| Scenario | Check |
| --- | --- |
| US-T013-AC07 | `course-builder-authoring.spec.ts` (answer rows, add and delete, two-to-six limits, optional explanation), `course-quiz.spec.ts` (loading keeps five answers, two correct answers and the explanation; edits through the routed editor). Browser, in-memory API: added a fifth answer, ticked a second correct answer, wrote an explanation, saved (PATCH 200); the stored question had 5 answers, 2 correct, the explanation and 1 point |
| US-T013-AC08 | `course-view-page.spec.ts` (ticks for a question with several correct answers, all selected IDs sent, result and explanation shown, no single answer painted wrong). Browser as the demo learner on the published course: five tick boxes and "Select all that apply"; one tick gave "Not correct" and Score 0 / 1; both correct ticks gave "Correct", the quiz lesson was saved as complete to the account and the view moved to the next lesson |

Combined tree: 458 API and 221 frontend tests, six journeys, API and Pages builds pass.
Decisions taken by the lead: a wrong attempt shows the explanation too, as the per-answer
explanations did before; the editor edits only the per-question explanation, and existing
per-answer explanations stay stored and are still shown to learners when a question has no
explanation of its own. Not verified: keyboard-only walk of the new editor rows, a screen
reader, hosted behavior. The lesson builder stylesheet is at 15.95 of its 16 kB limit.
