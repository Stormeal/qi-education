# Learning progress

## Purpose

Progress is honest and follows the learner across devices.

## Behavior

- Completion is stored per account and course as a set of completed lesson IDs
  (`PUT /users/me/learning-progress/:courseId/lessons/:componentId`, add-only). The browser keeps a
  cache, merges the account's set on sign-in and never drops completion it already has.
- A failed write keeps the completion locally and retries with back-off. Logout cancels pending
  requests; a reply for an earlier account or session is ignored.
- **Percentages** count unique current lesson IDs only: lessons that no longer exist and duplicates
  are ignored, 100% needs every current lesson, and an empty course stays at 0%.
- **Resume** opens the first incomplete current lesson.
- Being on a quiz question is not completion; a quiz counts only after a verified pass and
  **Finish quiz** (see [quizzes](../authoring/quizzes.md)).
- The API refuses completion of lessons the account is not entitled to, and of quizzes without
  passing proof.

## Code

- App: `services/learning-progress.service.ts` (synchronous readers, local cache, retries,
  session boundaries).
- API: `learningProgress.ts`, `learningProgressRepository.ts` (MongoDB, in-memory without config).

## Limits

- Old quiz completions saved before passing proof existed stay local until a new pass.
- Career milestone states use this completion as one input (see
  [milestones and achievements](../career-paths/milestones-and-achievements.md)).
