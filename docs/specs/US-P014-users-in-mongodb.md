# US-P014: Keep accounts in MongoDB instead of Google Sheets

## Record

- Story: US-P014 ([backlog](../user_stories.md#us-p014--keep-accounts-in-mongodb-instead-of-google-sheets))
- State: Proposed (written 2026-10-17 at Alex's request; not selected for implementation yet)
- Owner: to be split at selection (default: Codex for `api/src/**` and the copy script,
  Claude for the cutover runbook, docs and review; Alex runs the hosted cutover)
- Related: INV-005 (Sheets read volume), US-P006 (class load), US-P003 (multi-instance retries),
  DEF-023, DEF-024, DEF-026, DEF-027, DEF-032. Plan:
  [Sheets to MongoDB](../superpowers/plans/2026-10-17-sheets-to-mongodb.md)
- Product decisions (Alex, 2026-10-17): users move first, courses second, feedback stays in
  Google Sheets.
- Defaults taken by the lead (confirm or change):
  - Nobody edits the Users sheet by hand; after the cutover it is a read-only backup.
  - A hosted setting `USER_STORE` chooses the store and defaults to `google-sheets`, so the
    release that ships the code changes nothing until Alex flips it.
  - No dual writes. The copy runs right before the flip in a quiet moment; changes made in
    between are an accepted risk.
  - Two sheet rows with the same normalized email stop the copy: the dry run lists them and
    a person decides which account to keep. Nothing is merged automatically.
  - Local runs and tests keep the in-memory demo users.

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

## Behavior contract

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

## Cutover runbook (Claude writes the exact commands at implementation time)

1. Deploy the release; confirm `/health/auth` still says `google-sheets`.
2. `users:migrate --dry-run` against production credentials; fix or decide on every listed row.
3. In a quiet moment: `users:migrate --apply`, compare the printed count with the sheet.
4. Set `USER_STORE=mongodb` in Vercel and redeploy; `/health/auth` says `mongodb`.
5. Sign in as a learner and an admin, enroll in a course, search users; read the hosted log
   for Sheets reads on account routes (there should be none).
6. Rollback within the window: set `USER_STORE=google-sheets` and redeploy. After the window,
   fix forward (MongoDB has writes the sheet does not).

## Implementation checklist

To be written when the story is selected (handoff split per the start routine).

## Verification and delivery

Not started.
