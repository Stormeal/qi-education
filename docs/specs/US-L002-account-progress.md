# US-L002-AC02 / US-P004-AC03–04: account lesson completion

## Record

- Owner: Codex. Selected 2026-10-10. Branch/base: `main` / `5c2a4b5`.
- Initial guard passed. User approved preserving the later workflow commit
  `a81255d` and continuing on that base while this work was uncommitted.
- State: Delivered locally in `b66a8e1` (0.1.79). Contract: the increment-2 handoff and the user's ownership limits.
- Related resolved defects: DEF-007/009/014; their completion rules remain unchanged.
- User-authorized exception: change only the request URL in `CourseService.gradeQuiz`
  to the new grading route; keep its signature and assessment response unchanged.

## Problem and outcome

Completion currently lives in account/email-scoped browser arrays. A second device
cannot restore it. Save completion against the authenticated account, merge browser
records by union, and retain local completion during failures without allowing an
old session's reply to affect a new account.

## Scope and decisions

- Additive progress routes and a MongoDB/in-memory repository following the career
  path pattern. Verification uses isolated in-memory stores only.
- Non-quiz lessons retain explicit/video-ended completion. A quiz requires passing
  evidence from the server's grading of the current quiz before the server accepts
  its completion. Passing alone does not complete it: Finish quiz still does that.
- Legacy quiz IDs have no grading proof. Keep them locally, but do not upload them
  as verified completion until the learner passes again. Other legacy lessons merge
  independently, so an unverifiable quiz cannot block them.
- Union writes never replace other devices' completion. Unknown lesson IDs are
  rejected. Current unique lesson IDs determine totals; empty courses stay at 0%.
- Existing career-selection routes and DTOs stay unchanged. Selection uses atomic
  last-committed-write-wins replacement, identified by `pathId`, path `revision`,
  and `selectedAt`; GET reads the currently saved outcome. A repeated PUT is a
  reassertion of that choice, including after an intervening different choice.
  There is no stale-write rejection or compare-and-swap promise in the existing
  client. A failed write leaves the saved selection untouched and can be retried.
- Public paths may contain curator-published reference labels and unavailable
  markers, but must not derive titles from private draft/archived metadata or
  expose lesson bodies, answer keys, assets, or other accounts' selections.
- Excludes revised/deleted-lesson policy changes, video enforcement, profile sync,
  career UI changes, and hosted/shared-provider verification.

## Behavior contract

```gherkin
Feature: Account progress
  Scenario: AP-01 / US-L002-AC02 Restore on another device
    Given my account has completed lessons
    When another device loads my learning views
    Then its synchronous progress signals include the account completion
    And browser completion is merged without losing either device's lessons

  Scenario: AP-02 Retain and retry local completion
    Given an account save fails
    When I navigate, reload, reconnect, or retry loading courses
    Then local completion is retained
    And transient failures retry without replacing server completion

  Scenario: AP-03 / US-P004-AC02 Ignore old sessions
    Given a progress request is pending
    When I log out, reset, or switch accounts
    Then the response cannot populate the new session's signals or storage
    And no retry uses the old account's credentials

  Scenario: AP-04 Reject forged progress
    Given a caller is unauthenticated, lacks course entitlement, or supplies an unknown lesson
    When completion is read or saved
    Then it is denied without storing that completion
    And account identity comes only from authenticated session data

  Scenario: AP-05 Verify quizzes
    Given a quiz has not passed server grading
    When its lesson ID is uploaded, including from legacy browser storage
    Then account completion is rejected and local records are retained
    When the learner passes server grading and finishes the quiz
    Then its completion can be restored on another device

  Scenario: CP-03 / US-P004-AC03 Path references grant no access
    Given a path references an unpublished course or another account is selected
    When public and private path routes are called
    Then private course metadata/content and other account selections remain private
    And choosing the path never enrolls the caller

  Scenario: CP-04 / US-P004-AC04 Reconcile concurrent selections and retries
    Given two devices PUT different selections, or a PUT is retried
    When atomic writes complete
    Then GET identifies the last committed selection with the unchanged response shape
    And a failed write does not erase the previously saved selection
```

## API, storage, and compatibility

- `GET /users/me/learning-progress`: `{ progress: [{ courseId, completedIds }] }`
  containing only courses the caller may learn from and current component IDs.
- `PUT /users/me/learning-progress/:courseId/lessons/:componentId`: idempotent
  union of one entitled current lesson; `{ courseId, completedIds }`. 401 for no
  session, 403 for no entitlement, 404 for missing course/lesson, 409 for an
  unverified quiz. Identity fields in body/query cannot select another account.
- `POST /users/me/learning-progress/:courseId/components/:componentId/quiz-attempts`:
  same `{ sectionId, answers }` and assessment DTO as the old grading route, with
  a passing fingerprint saved before returning a passing response. Failed attempts
  create no completion or passing evidence. Existing grading route is unchanged.
- New routes support `/api` prefix, `private, no-store`, and `Vary: Authorization`.
- Mongo collection `<MONGODB_COURSE_CONTENT_COLLECTION>_learning_progress`;
  one document per `(userId, courseId)` with a collision-free compound string `_id`,
  completed ID set and passing fingerprint set. Atomic `$addToSet` merges writes;
  concurrent initial upsert duplicate-key retries update the existing document.
  No account/course Sheets schema changes or data migration.
- LearningProgressService keeps all existing public signatures and synchronous
  readers/mutations (including the existing Promise-returning `loadCourses`).
  Background account loading starts with course loading or a direct `forContent`
  read (microtask deferred, so computed signals stay synchronous). Completion
  starts a background save. Off-page legacy IDs are validated by the save API
  without requiring a successful outline request. Session identity/token and
  reset context guard every reply;
  reset aborts owned requests and timers. No injection of AppStateService (cycle).
- Server responses merge into local cache/storage and update its revision signal.
  Retry transient network/5xx/429 failures with bounded backoff and on online/course
  loading; permission/validation denials wait for a new user/load trigger.

## Implementation checklist

- [x] Add isolated API authorization, merge, quiz, cross-device, and selection tests.
- [x] Add repository and new routes, preserving existing route implementations.
- [x] Add session-safe background progress loading/union/retries and service tests.
- [x] Change the authorized grading URL only; keep all career/dashboard files intact.
- [x] Run API/frontend suites, journeys, API and Pages builds; review; bump version.
- [x] Record delivery and unavailable hosted/provider checks in the queue.

## Verification and delivery

| Scenario | Evidence | Result |
| --- | --- | --- |
| AP-01/02/04/05 | `api/src/learningProgress.test.ts` | Pass; includes lost acknowledgement and failed proof persistence |
| AP-02/03; AP-01 UI signals | `app/src/app/services/learning-progress.spec.ts` | Pass; includes direct computed roadmap restoration, queued reset, legacy quiz re-Finish and off-page union |
| CP-03/04 | `api/src/careerPath.test.ts` | Pass; forced commit ordering, retry and failed write, private reference/account isolation |
| Atomic Mongo adapter operations | `api/src/learningProgressRepository.test.ts` | Pass; isolated collection double only |

Implementation commit: `b66a8e1` (0.1.79). The delivery-record commit (0.1.80,
required by the documentation hook) updates `docs/work_queue.md` with that hash.
Verified 2026-10-10 on `a81255d` plus this delivery: 352 API tests, 156 frontend
tests, all six journeys, API build and Pages build. Independent review found
direct-roadmap restoration and off-page outline dependency gaps; both gained
failing-to-passing regressions and the second review has no important findings.
Pages retains three existing SCSS budget warnings; frontend tests print existing
jsdom `scrollTo` notices. No unrelated styles or test fixtures were changed.
No shared Sheets/MongoDB/Mux/GitHub writes, push, or deployment are authorized.
Real Mongo durability/concurrency across processes, hosted compatibility, and a
two-device browser walk remain release checks; isolated tests do not prove them.
