# US-P015: Keep course details in MongoDB instead of Google Sheets

## Record

- Story: US-P015 ([backlog](../user_stories.md#us-p015--keep-course-details-in-mongodb-instead-of-google-sheets))
- State: Delivered and cut over 2026-10-18: hosted course details run on MongoDB
  of the agreed plan; its code ships switched off, so it does not wait for the US-P014 cutover)
- Owner: Codex (all code: `api/**`, `scripts/doctor.mjs`; see the
  [handoff](../handoffs/US-P015-courses-in-mongodb-codex.md)); Claude Code (cutover runbook,
  local development docs, lead check); Alex runs the hosted cutover
- Related: INV-005, INV-017, DEF-045 (stopgap that shares recent Courses reads), US-P014 (same
  pattern). Plan: [Sheets to MongoDB](../superpowers/plans/2026-10-17-sheets-to-mongodb.md)
- Product decisions (Alex, 2026-10-17): users first, courses second, feedback stays in Google
  Sheets. **No data may be lost during the migration, including a rollback.** Nobody edits the
  Courses sheet by hand (confirmed 2026-10-17).
- Defaults taken by the lead (confirm or change):
  - Same shape as US-P014: `COURSE_STORE` (`google-sheets` default, `mongodb`) in shared and
    hosted mode only; isolated runs keep the in-memory demo course. `COURSE_STORE_READ_ONLY=1`
    freezes course-detail writes while data moves. The forward copy never writes to the sheet;
    a rollback copies MongoDB back first.
  - The cutovers stay separate: US-P014 first, US-P015 after it has run cleanly. Either order
    works technically; one change at a time keeps a rollback simple.
  - Only base course details move (the 21 sheet columns). Review revisions, content, assets
    and locks already live in MongoDB and do not change.
  - The catalog keeps today's order: oldest course first, as rows appear in the sheet. MongoDB
    sorts by `createdAt`, then id. The copy keeps every course's `createdAt` unchanged.
  - A sheet row whose id repeats an earlier row stops the copy; nothing is merged.

## Problem and outcome

As a learner or teacher, I want the catalog and course pages to load without depending on a
spreadsheet, so that they stay available in a class session.

Observed: course routes read the Courses sheet (DEF-045 now lets GET requests share one read
for up to 10 seconds; a learner session still costs about 24 Sheets reads, most of them course
reads). Reviewed titles and statuses already live in MongoDB, so the sheet goes stale (INV-017).

Outcome: course details live in a MongoDB collection; catalog and course routes make no Sheets
reads; nothing reads the stale sheet any more.

## Scope

Included: `MongoCourseRepository` implementing `CourseRepository` (list, create with seed,
update, price, catalog metadata, thumbnail); store selection and write freeze; health and
doctor naming the course store; a copy script with dry run, apply, verify and restore; a
runbook. Excluded: accounts (US-P014), feedback, review/content storage, removing the Sheets
course code (US-P016), any frontend change.

## Behavior contract (no data loss: AC05 to AC09)

```gherkin
Feature: Course details stored in MongoDB
  Scenario: US-P015-AC01 Course routes make no Sheets reads
    Given the hosted API runs with COURSE_STORE=mongodb
    When anyone opens the catalog, a course page, or a learning page
    Then no request reads the Courses sheet

  Scenario: US-P015-AC02 Behavior is unchanged on MongoDB
    Given the same courses in either store
    When the catalog, course routes, authoring, price, catalog settings, thumbnails and the
      review workflow run
    Then answers, order, permissions and published title and status are the same as with the
      sheet

  Scenario: US-P015-AC03 Shipping the code changes nothing until the switch flips
    Given the release with US-P015 is deployed and COURSE_STORE is unset
    When anyone uses courses
    Then the API still uses the Courses sheet exactly as before, including DEF-045's shared read

  Scenario: US-P015-AC04 Health names the store
    When an operator opens /health/config or runs npm run doctor
    Then they show whether course details come from mongodb, google-sheets or memory

  Scenario: US-P015-AC05 Course-detail writes are refused, not lost, while frozen
    Given COURSE_STORE_READ_ONLY=1
    When a teacher creates a course or changes its details or thumbnail, or an admin changes
      price or catalog settings
    Then the request answers 503 "Course details are briefly read-only for maintenance. Try
      again in a few minutes." and nothing is written to either store
    And reading the catalog, courses, content and learning keep working

  Scenario: US-P015-AC06 The copy moves every course unchanged
    Given the Courses sheet has N valid rows with distinct ids
    When the copy script runs --apply twice
    Then MongoDB holds exactly N courses with all 21 fields equal to the sheet, including owner,
      created date, price, flags, rating, category and languages

  Scenario: US-P015-AC07 Copies only run frozen and in the right direction
    When --apply runs unless COURSE_STORE=google-sheets and COURSE_STORE_READ_ONLY=1,
      or --restore-sheet runs unless COURSE_STORE=mongodb and COURSE_STORE_READ_ONLY=1
    Then it refuses and writes nothing
    And a row with no id, or an id that repeats an earlier row, stops --dry-run and --apply

  Scenario: US-P015-AC08 Verify proves the stores match before any switch
    When the copy script runs --verify
    Then it compares every course field by field in both directions and prints
      "Verified: N courses identical", or each difference by course id and field name without
      values, and exits 1 on any difference

  Scenario: US-P015-AC09 A rollback keeps changes made after the cutover
    Given COURSE_STORE=mongodb and a teacher created a course after the cutover
    When the operator freezes writes, runs --restore-sheet, then --verify, then switches back
    Then the sheet holds that course and every other MongoDB change
    And existing rows are updated in place by id, new courses are appended, nothing is deleted
```

## Operator contract (the runbook relies on this exactly)

- `COURSE_STORE` = `google-sheets` (default) or `mongodb`; `COURSE_STORE_READ_ONLY` = `0`
  (default) or `1`. Any other value stops API start-up with a message naming the allowed values.
- `GET /health/config` gains `courses: { storage, readOnly }` with `storage` = `mongodb`,
  `google-sheets` or `memory` (the store actually in use).
- `npm run doctor` names the course store and fails when `COURSE_STORE=mongodb` but
  `MONGODB_URI`, `MONGODB_DB_NAME` or `MONGODB_COURSE_CONTENT_COLLECTION` is missing.
- Copy script: `npm --prefix api run courses:migrate -- <mode>`, modes `--dry-run`, `--apply`,
  `--verify`, `--restore-sheet`, with the same guards as `users:migrate` (every mode needs
  `USE_SHARED_SERVICES=1`). Output: `Sheet rows: N; valid: N; invalid: N; duplicate ids: N`;
  for `--apply` `inserted: N; updated: N; unchanged: N`; for `--verify`
  `Verified: N courses identical`; refusals start with `Refused:` and configuration failures
  print `Migration failed: configuration could not be loaded. Check the allowed settings and
  required credentials.` Exit 0 when nothing blocks, 1 otherwise.
- Collection `${MONGODB_COURSE_CONTENT_COLLECTION}_courses`, one document per course:
  `{ _id: id, ...the other 20 Course fields }`; index on `{ createdAt: 1, _id: 1 }`. Writes
  `$set` only the fields of their input (single-document updates, majority write concern);
  create uses `insertOne`. Reads hit MongoDB on every call; the Mongo repository ignores the
  `recent` option.

## Cutover runbook

Exact commands in [docs/release/US-P015-cutover.md](../release/US-P015-cutover.md) (Claude),
written the same way as the US-P014 runbook: dry run, freeze, apply, verify, switch, check,
and a rollback that restores the sheet first.

## Implementation checklist

- [x] AC01–AC03 Mongo course repository, all fields/order, atomic partial updates, uncached reads and default store selection; representative authoring/review/catalog journeys
- [x] AC04 strict settings, exact courses health config and doctor checks
- [x] AC05 repository and HTTP freeze before every detail-write side effect, both prefixes; reads/content saves remain available; shared-content safety guards include Mongo metadata
- [x] AC06–AC09 guarded dry-run/apply/two-way verify/restore, complete row validation and fake-provider retry/round-trip tests, including lossless restore of rating precision and list separators/duplicates
- [x] Architecture, permitted INV-005/INV-017 notes, [handoff Outcome](../handoffs/US-P015-courses-in-mongodb-codex.md#outcome) and queue evidence
- [x] Required checks on `ba3ff83`: 1,589 API tests, API build, 12 journey checks, 343 app tests plus 23 UI guard tests and foundation scan pass; real-provider/hosted cutover remains unverified

## Verification and delivery

Lead check 2026-10-17 (Claude Code) on `3bd1dae`: Codex's commits `abc1958`, `ba3ff83`, `3bd1dae`
stay within the handoff's files; the accounts contract is unchanged. Reviewed: single-document
Mongo writes, the freeze at the HTTP boundary (both prefixes, before thumbnail and content side
effects) and around both course writers, copy guards and output lines (match the runbook), and
the lossless restore cells (`qi-course-cell:v1:`): used only by the restore when the sheet format
would lose a value (ratings with more than one decimal, list items containing the separator);
default sheet reads and writes are unchanged. The runbook now says not to roll the API code back
below this release after a course rollback. Checks: API 1589/63, journeys 12 (memory and fake
Mongo), app 343/45 with guards 23/23, API build, Pages build. Browser on 3001/4200 with an
isolated API and `COURSE_STORE_READ_ONLY=1`: an admin price change shows the read-only message,
keeps the dialog and value, and writes nothing (`docs/verification/2026-10-17/US-P015/`). Not
verified: real MongoDB and Sheets, the real catalog order, whether Vercel lets the production keys
be pulled, and the forward and rollback rehearsal. Pushed 2026-10-17 (`530a0a1`); the hosted
API reports `courses: { storage: google-sheets, readOnly: false }`.

Production dry run 2026-10-17 (Alex, from his machine): `Sheet rows: 11; valid: 11; invalid: 0;
duplicate ids: 0`. The production Google and MongoDB keys can be pulled (three other settings
are Sensitive and stay local; the copy does not use them). Found on the way: in Windows
PowerShell `npm` drops the `--` before the mode, so the runbooks now call `npm.cmd`. Not yet
known: whether MongoDB Atlas accepts a connection from Alex's machine (the dry run does not
connect; `--apply` will). Next: the [runbook](../release/US-P015-cutover.md) from step 4.

Cutover 2026-10-18 (Claude Code ran the steps with Alex's go-ahead; same method as US-P014): dry
run 11 valid, verify connected (0 in MongoDB); public catalog saved; freeze
`COURSE_STORE_READ_ONLY=1` and redeploy, courses health `readOnly: true`; `--apply` inserted 11 and
created the catalog index; `--verify` "Verified: 11 courses identical"; switch `COURSE_STORE=mongodb`,
`COURSE_STORE_READ_ONLY=0` and redeploy, courses health `storage: mongodb, readOnly: false`; the
public catalog is identical to the saved one (7 courses, same order, every field); an outline
answers 200; no errors in the hosted log; Alex confirmed the catalog, his enrolled courses and a
course details page. The Courses sheet is now a read-only backup; no data was lost (rollback in the
runbook, which needs this API version or later for any restored cells).
