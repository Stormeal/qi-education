# US-P016 retire the Sheets code for accounts and courses — Codex handoff

Assigned 2026-10-19 by Claude Code (lead). Story and decisions:
[user_stories.md, US-P016](../user_stories.md). Accounts and courses were cut over to MongoDB on
2026-10-18 and Alex confirmed the release is clean. Read `AGENTS.md` (including the shared-tree
rules) first. Claude works in this same working tree at the same time.

## Codex scope: the API

Remove every code path that stores accounts or course details in Google Sheets. Feedback keeps
its Google Sheets store unchanged.

- `api/src/authRepository.ts`: delete `GoogleSheetsAuthRepository` and its sheet helpers. In
  shared and hosted mode, accounts use `MongoAuthRepository` when `hasMongoConfig()`, otherwise
  `UnavailableAuthRepository('mongodb')`. Isolated mode keeps `InMemoryAuthRepository`.
  `AuthStorageType` becomes `'mongodb' | 'memory'`.
- `api/src/courseRepository.ts`: delete `GoogleSheetsCourseRepository` and its sheet helpers.
  Shared and hosted: `MongoCourseRepository` when `hasMongoConfig()`, otherwise
  `UnavailableCourseRepository`. `storageType` becomes `'memory' | 'mongodb'`.
- `api/src/config.ts`: remove `USER_STORE`, `COURSE_STORE`, `GOOGLE_SHEETS_USERS`,
  `GOOGLE_SHEETS_USERS_RANGE`, `GOOGLE_SHEETS_COURSES`, `GOOGLE_SHEETS_COURSES_RANGE` and the
  derived ranges. Keep `USER_STORE_READ_ONLY`, `COURSE_STORE_READ_ONLY`, `hasGoogleSheetsConfig`
  and every feedback setting.
- `api/src/server.ts`: remove the Sheets-only branches for accounts and courses (for example the
  "when courses are stored in Google Sheets" messages and `auth.storageType === 'google-sheets'`
  in `authenticateWithUsers`). Keep the `/health/config` and `/health/auth` shapes (contract below).
- `api/src/authStore.ts`, `api/src/courseStore.ts`: only what the type changes need.
- Delete `api/src/usersMigration.ts`, `api/src/coursesMigration.ts`, `api/src/migrateUsers.ts`,
  `api/src/migrateCourses.ts`, `api/src/usersMigration.test.ts`, `api/src/coursesMigration.test.ts`,
  and the `users:migrate` / `courses:migrate` scripts in `api/package.json`. Change the
  `api/package.json` description to "QI Academy API".
- Tests that use the Sheets account or course repositories, or the removed settings: rewrite them
  onto the in-memory or Mongo-double repositories, or delete the case when it only proved Sheets
  behavior. Known ones: `adminUserChanges`, `adminUsers`, `authStatusRepository`, `catalogData`,
  `changePassword`, `courseRollback`, `courseStoreConfig`, `courseStoreRoutes`, `isolatedServices`,
  `lessonFeedback`, `passwordUpdate`, `platformLoad`, `safeOperation`, `safeRetries`,
  `spreadsheetText`, `userStoreConfig`, `userStoreRoutes` (all `api/src/*.test.ts`). Keep any case
  that protects feedback or a behavior that still exists (for example DEF-042 lock holds, read
  sharing, freezes).
- `googleapis` stays a dependency (feedback).

Done when `npm run api:test` and `npm run api:build` pass and
`grep -rlE "GoogleSheets|createSheetsClient|ensureWorksheetHeaders" api/src` lists only feedback
code, `googleSheets.ts`, `config.ts` and tests of those (US-P016-AC01).

## Contract Claude's side relies on

- `GET /health/config` keeps its shape. `auth.storage` and `courses.storage` are `'mongodb'` in
  shared and hosted mode (configured or not) and `'memory'` in isolated mode; never
  `'google-sheets'`. `auth.configured`, `courses.readOnly`, `mode`, `content`, `assets`,
  `corsOrigins` are unchanged. The `sheets` object keeps only feedback-related fields.
- `GET /health/auth` keeps `{ status, store, readOnly }`, `store` as above.
- `USER_STORE_READ_ONLY=1` and `COURSE_STORE_READ_ONLY=1` keep refusing writes with the same 503
  maintenance message.
- Shared or hosted mode without MongoDB settings: account and course routes answer
  "unavailable" (503), never demo users or demo courses.

## Files Claude owns (do not edit)

`scripts/**`, `.github/**`, `api/src/localScripts.test.ts` (doctor tests),
`api/src/categoryCorrection.test.ts` and `api/src/pagesWorkflow.test.ts` (Claude deletes or
changes them), `docs/**` except your row in `docs/work_queue.md`, `CLAUDE.md`, `AGENTS.md`,
everything in `app/`.

If you need a change in one of these, finish everything else first, then report the exact file
and line in your summary instead of stopping.
