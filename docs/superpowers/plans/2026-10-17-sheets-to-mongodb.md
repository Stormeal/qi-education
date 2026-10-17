# Plan: move users and courses from Google Sheets to MongoDB

Decided with Alex on 2026-10-17: users move first, then courses. Feedback stays in Google
Sheets for now. Nobody edits the Users or Courses sheet by hand as part of normal work
(confirm or change). Stories: [US-P014](../../specs/US-P014-users-in-mongodb.md) (users, P1),
US-P015 (courses, P2), US-P016 (retire the Sheets code for users and courses, P3), in
[user_stories.md](../../user_stories.md).

## Why

- **Quota.** Every signed-in request reads the whole Users sheet fresh (DEF-027 needs a
  fresh check of revoked accounts), and course routes read the Courses sheet up to twice.
  Google's default is about 60 reads per minute per service account. On 2026-10-17 one
  admin's visit used it up, and most routes answered 500 between 15:21 and 15:23 (hosted
  log; work queue).
- **Correctness.** Sheets has no atomic row update or unique column. DEF-023 (duplicate
  signup), DEF-024 (lost enrollment) and DEF-026 (old password restored) are fixed only
  inside one server instance; US-P003 still lists the multi-instance case as open. A unique
  index and single-document updates close them across instances.
- **One database.** Hosted course content, locks, progress, notes, profiles, career paths,
  sign-in limits and user change records already live in MongoDB, and shared course
  operations refuse to run without it.

## Where the data lives today

| Data | Sheets code | Readers and writers |
| --- | --- | --- |
| Users: id, email, displayName, passwordHash, role, status, createdAt, enrolledCourseIds (columns A:H) | `GoogleSheetsAuthRepository` (`api/src/authRepository.ts`), row mapping in `auth.ts` | Every authenticated route (`authenticateRequest`), login, signup, enrollment, password reset and change, admin user search/role/status, learner count |
| Courses: 21 columns of base metadata | `GoogleSheetsCourseRepository` (`api/src/courseRepository.ts`), row mapping in `course.ts` | Catalog, course routes, price/catalog metadata, thumbnail id; review status and reviewed title already in MongoDB through `courseReview.ts` |
| Feedback | `GoogleSheetsFeedbackRepository` | Stays in Sheets |

## Approach (both migrations)

1. **New repository behind the existing interface.** A `Mongo…Repository` implements
   `AuthRepository` (then `CourseRepository`) in the same style as the other Mongo
   repositories (`accountProfileRepository.ts`): collection named after
   `MONGODB_COURSE_CONTENT_COLLECTION`, majority write concern, in-memory locally and in
   tests. Route handlers do not change.
2. **Explicit switch.** A new setting picks the store on the hosted API
   (`USER_STORE=google-sheets|mongodb`, later `COURSE_STORE`). It defaults to
   `google-sheets`, so the deploy that ships the code changes nothing. The API deploys
   before the frontend, so every step stays backward compatible.
3. **Copy script.** `npm --prefix api run users:migrate -- --dry-run|--apply` reads the
   sheet once, maps rows with the existing row parser, and upserts by id. It is idempotent
   and prints counts, skipped rows and conflicts (for users: two rows with the same
   normalized email are reported, never merged). Only the rollback copy writes to the sheet.
4. **Cutover with a write freeze (no data loss, Alex 2026-10-17).** Dry run; freeze account
   (later course) writes with a read-only setting, so reads keep working and writes answer
   503 with a retry message; apply; verify field by field in both directions until identical;
   switch the store and lift the freeze. Nothing can change between the copy and the switch.
5. **Rollback without loss.** Freeze, copy MongoDB back into the sheet (rows updated in place,
   new ones appended, nothing deleted), verify, switch back. Copies refuse to run unfrozen or
   in the wrong direction, so a stray rerun cannot overwrite newer data.
6. **Retire later.** After one release with the switch on `mongodb` and a clean log, US-P016
   removes the Sheets users/courses code, the switch and their health/doctor checks. The
   sheets stay in Google Drive as a read-only backup.

## Order

| Step | Story | Owner split (start routine default) | Done when |
| --- | --- | --- | --- |
| 1 | US-P014 users repository, switch, copy script, tests | Codex: `api/src/**`, scripts. Claude: spec, cutover runbook, health/doctor text, review | Merged with the switch on `google-sheets`; all suites pass |
| 2 | US-P014 cutover | Alex runs the copy and flips the switch (only Alex has the hosted credentials); Claude writes the exact commands | Hosted sign-in, enrollment and admin user search work on MongoDB; Sheets reads per request drop to the course reads only |
| 3 | US-P015 courses repository, switch, copy script | Same split | Merged with the switch on `google-sheets` |
| 4 | US-P015 cutover | Alex | Catalog and course routes make no Sheets reads; INV-017 (stale sheet titles) closed |
| 5 | US-P016 retire Sheets for users and courses | Codex (API), Claude (docs) | Only feedback uses Google Sheets |

The frontend does not change in steps 1 to 4. The quota session started on 2026-10-17
(`cut-sheets-reads-behind`) measures reads per page; its numbers become the before
figures for the cutover checks, and any cheap read reduction it makes is a stopgap until
step 2.

## Risks

- **Password hashes** copy as stored (scrypt strings); nobody has to reset. The copy must
  never log them.
- **Email case.** Users are found by normalized email today; the unique index must be on the
  same normalization, and the dry run must list sheet duplicates before apply.
- **Free-tier limits** (connections, size) are far above a few hundred users and courses.
- **DEF-027/DEF-032 freshness** must stay true: read the user by id from MongoDB on every
  authenticated request, no in-process cache.
