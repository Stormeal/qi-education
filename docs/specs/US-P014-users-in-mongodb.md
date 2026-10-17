# US-P014: Keep accounts in MongoDB instead of Google Sheets

## Record

- Story: US-P014 ([backlog](../user_stories.md#us-p014--keep-accounts-in-mongodb-instead-of-google-sheets))
- State: In progress (selected by Alex 2026-10-17: "start US-P014")
- Owner: Codex (all code: `api/**`, `scripts/doctor.mjs`; see the
  [handoff](../handoffs/US-P014-users-in-mongodb-codex.md)); Claude Code (cutover runbook,
  local development docs, lead check); Alex runs the hosted cutover
- Related: INV-005 (Sheets read volume), US-P006 (class load), US-P003 (multi-instance retries),
  DEF-023, DEF-024, DEF-026, DEF-027, DEF-032. Plan:
  [Sheets to MongoDB](../superpowers/plans/2026-10-17-sheets-to-mongodb.md)
- Product decisions (Alex, 2026-10-17): users move first, courses second, feedback stays in
  Google Sheets. **No account data may be lost during the migration, including a rollback.**
- Defaults taken by the lead (confirm or change):
  - Nobody edits the Users sheet by hand; after the cutover it is a read-only backup.
  - A hosted setting `USER_STORE` chooses the store and defaults to `google-sheets`, so the
    release that ships the code changes nothing until Alex flips it.
  - No dual writes. Account writes are frozen while data moves between stores
    (`USER_STORE_READ_ONLY=1`): signing in and every read keep working, writes answer 503
    with a retry message, so no change can happen between the copy and the switch.
  - The forward copy never writes to the sheet; the sheet stays a complete backup until
    US-P016. A rollback copies MongoDB back into the sheet while frozen, so changes made
    after the cutover survive it.
  - Two sheet rows with the same normalized email stop the copy: the dry run lists them and
    a person decides which account to keep. Nothing is merged automatically.
  - Local runs and tests keep the in-memory demo users. `USER_STORE` applies wherever shared
    services are on (hosted, or local with `USE_SHARED_SERVICES=1`); isolated runs always use
    the demo users.
  - The copy script refuses to run unless shared services are on, so it can never copy into
    an isolated in-memory store by mistake, and it creates the indexes before copying.

## Problem and outcome

As a learner, teacher or admin, I want signing in and every signed-in page to keep working
when several people use the platform at once, so that a class session does not fail
because a spreadsheet's read limit ran out.

Observed: every authenticated request reads the whole Users sheet fresh (DEF-027 requires
revoked accounts to lose access at once). On 2026-10-17 one admin's visit exhausted the
Sheets read quota and most hosted routes answered 500 for about two minutes (work queue,
hosted log). Account writes depend on per-instance queues (DEF-023, DEF-024, DEF-026) that
do not protect two server instances writing at once.

Outcome: accounts and enrollments live in a MongoDB collection. An authenticated request
reads one document by id. Email uniqueness and enrollment are enforced by the database, so
they hold across instances. Hosted account traffic makes no Sheets reads.

## Scope

Included:

- `MongoAuthRepository` implementing the existing `AuthRepository` interface, with every
  current method: find by email or id, list for admin search, create, enroll, update role
  or status (with the existing user change records), update password hash.
- Store selection through `USER_STORE` on the hosted API; health and doctor output name the
  store in use.
- The learner count (`GET /courses/:id/learners/count`) counts enrolled accounts in MongoDB
  instead of listing all users.
- A copy script with dry run and apply, and a written cutover and rollback runbook.

Excluded: course metadata (US-P015), feedback (stays in Sheets), removing the Sheets user
code (US-P016), any frontend change, new account features.

## Behavior contract (no data loss: AC09 to AC12)

```gherkin
Feature: Accounts stored in MongoDB
  Scenario: US-P014-AC01 Signed-in requests make no Sheets reads
    Given the hosted API runs with USER_STORE=mongodb
    When a learner opens the catalog, My Learning and a course's learning page
    Then no request reads the Users sheet
    And each authenticated request reads the account once, by id

  Scenario: US-P014-AC02 A revoked account loses access on its next request
    Given a learner is signed in on one server instance
    When an admin disables the account or changes its role on another instance
    Then the learner's next request on the first instance uses the new status or role

  Scenario: US-P014-AC03 One account per email across instances
    Given no account exists for "Ada@Example.test"
    When two signups for " ada@example.test " arrive at the same time on different instances
    Then exactly one account exists and the other request receives the existing 409 answer

  Scenario: US-P014-AC04 Enrollments and password changes never overwrite each other
    Given a learner enrolls in a course while their password is being reset on another instance
    When both writes finish
    Then the account has the new password hash and both the old and new enrollments

  Scenario: US-P014-AC05 The copy moves every account unchanged
    Given the Users sheet has N valid rows with distinct normalized emails
    When the copy script runs with --apply twice
    Then MongoDB holds exactly N accounts with the same id, email, name, password hash, role,
      status, created date and enrollments as the sheet
    And the script never prints a password hash

  Scenario: US-P014-AC06 The dry run stops on duplicates and bad rows
    Given two sheet rows normalize to the same email, or a row has no id or email
    When the copy script runs with --dry-run or --apply
    Then it lists those rows by sheet row number and writes nothing

  Scenario: US-P014-AC07 Shipping the code changes nothing until the switch flips
    Given the release with US-P014 is deployed and USER_STORE is unset
    When anyone signs in
    Then the API still uses the Users sheet exactly as before

  Scenario: US-P014-AC09 Account writes are refused, not lost, while frozen
    Given USER_STORE_READ_ONLY=1
    When someone signs up, enrolls, resets or changes a password, or an admin changes a role
      or status
    Then the request answers 503 "Accounts are briefly read-only for maintenance. Try again in
      a few minutes." and nothing is written to either store
    And signing in, reading courses and learning progress keep working

  Scenario: US-P014-AC10 Copies only run frozen and in the right direction
    Given the pulled settings
    When the copy script runs --apply with USER_STORE_READ_ONLY unset, or with USER_STORE=mongodb
    Then it refuses and writes nothing
    And --restore-sheet refuses unless USER_STORE=mongodb and USER_STORE_READ_ONLY=1

  Scenario: US-P014-AC11 Verify proves the stores match before any switch
    Given a copy has run
    When the copy script runs --verify
    Then it compares every account field by field in both directions (sheet to MongoDB and
      MongoDB to sheet) and prints "Verified: N accounts identical" or each difference by
      account id and field name, never the field values, and exits 1 on any difference

  Scenario: US-P014-AC12 A rollback keeps changes made after the cutover
    Given USER_STORE=mongodb and a learner enrolled in a course after the cutover
    When the operator freezes writes, runs --restore-sheet, then --verify, then switches back
    Then the sheet holds that enrollment and every other MongoDB change
    And existing sheet rows are updated in place, new accounts are appended, nothing is deleted

  Scenario: US-P014-AC08 Health names the store
    When an operator opens /health/auth or runs npm run doctor
    Then the answer says whether accounts come from mongodb, google-sheets or memory
```

## API, storage, and compatibility

- Collection `${MONGODB_COURSE_CONTENT_COLLECTION}_users`, one document per account:
  `{ _id: id, email, displayName, passwordHash, role, status, createdAt, enrolledCourseIds }`.
  `email` is stored normalized (trimmed, lower case) exactly as `auth.ts` does today, with a
  unique index. An index on `enrolledCourseIds` serves the learner count.
- Writes: create uses `insertOne` (duplicate key becomes the existing 409); enroll uses
  `$addToSet`; password, role and status updates `$set` only their own field, so concurrent
  writes cannot restore old values. Majority write concern, as in the other Mongo
  repositories.
- Reads: `findById` and `findByEmail` read MongoDB on every call (no in-process cache), which
  keeps DEF-027/DEF-032 true without the `fresh` option. `authenticateRequest(auth, true)`
  for the learner count is replaced by a count query.
- Every route keeps its paths, status codes and bodies. No frontend change.
- `USER_STORE` unset or `google-sheets`: today's behavior. `mongodb` without MongoDB settings
  on the hosted API: the existing "user store unavailable" behavior, never the demo users.

## Operator contract (the runbook relies on this exactly)

- Setting: `USER_STORE` = `google-sheets` (default when unset) or `mongodb`. Any other value
  stops API start-up with a message naming the allowed values.
- `GET /health/config`: `auth.storage` reports the store actually in use: `mongodb`,
  `google-sheets` or `memory`.
- `GET /health/auth`: the success body is `{ status: 'ok', store, readOnly }` with the same
  store value and `readOnly` true while `USER_STORE_READ_ONLY=1`.
- `USER_STORE_READ_ONLY`: `1` freezes account writes (AC09); unset or `0` does not; any other
  value stops start-up with a message.
- `npm run doctor`: names the user store, passes for `mongodb` when the MongoDB settings are
  complete, and fails when `USER_STORE=mongodb` but `MONGODB_URI`, `MONGODB_DB_NAME` or
  `MONGODB_COURSE_CONTENT_COLLECTION` is missing.
- Copy script, run from the repo root with the Vercel settings pulled (`npm run env:pull`):
  `npm --prefix api run users:migrate -- <mode>` with mode `--dry-run` (any time, writes
  nothing), `--apply` (sheet to MongoDB; only when `USER_STORE=google-sheets` and
  `USER_STORE_READ_ONLY=1`), `--verify` (any time, writes nothing; AC11) or `--restore-sheet`
  (MongoDB to sheet for a rollback; only when `USER_STORE=mongodb` and
  `USER_STORE_READ_ONLY=1`; updates rows in place by id, appends new accounts, never deletes).
  Every mode needs `USE_SHARED_SERVICES=1` (refuses otherwise). `--apply` upserts by id and
  never deletes a MongoDB document. Output is one summary line per step, then
  `Sheet rows: N; valid: N; invalid: N; duplicate emails: N` and, for `--apply`,
  `inserted: N; updated: N; unchanged: N`, plus one line per invalid or duplicate row with its
  sheet row number and reason (never a password hash or other account field beyond the email
  of a duplicate). Exit code 0 when nothing blocks, 1 when invalid or duplicate rows exist
  (apply then writes nothing).
- Collection `${MONGODB_COURSE_CONTENT_COLLECTION}_users`; unique index on `email`, index on
  `enrolledCourseIds`; `--apply` creates both before copying.

## Cutover runbook (outline; exact commands in `docs/release/US-P014-cutover.md`, Claude)

1. Deploy the release; `/health/auth` says `store: google-sheets`, `readOnly: false`.
2. `--dry-run`; decide on every listed duplicate or invalid row before going on.
3. Freeze: `USER_STORE_READ_ONLY=1` in Vercel, redeploy, `/health/auth` says `readOnly: true`.
4. `--apply`, then `--verify` until it prints "Verified: N accounts identical".
5. Switch: `USER_STORE=mongodb`, `USER_STORE_READ_ONLY=0`, redeploy; `/health/auth` says
   `store: mongodb`, `readOnly: false`.
6. Check: sign in as a learner and an admin, enroll in a course, search users; the hosted log
   shows no Sheets reads on account routes.
7. Rollback at any time, nothing lost: freeze (`USER_STORE_READ_ONLY=1`, redeploy),
   `--restore-sheet`, `--verify`, then `USER_STORE=google-sheets`, `USER_STORE_READ_ONLY=0`,
   redeploy.

## Implementation checklist

To be written when the story is selected (handoff split per the start routine).

## Verification and delivery

Not started.
