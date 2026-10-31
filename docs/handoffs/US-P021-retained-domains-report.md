# US-P021 retained domain adapter report

Implemented on `main`, base `195d7fc`, 2026-10-31. No commits, push, deployments,
or shared-service mutation probes. Changes are limited to assigned repository
files and matching isolated tests.

## Methods and decisions

- `OrganizationRepository.collectForExport(userId, email?)` returns a whitelisted
  caller membership, current owned organization references (`id`, `displayName`),
  caller organization/course requests, and invitations matching the normalized email
  or recorded `acceptedBy`. Tokens, token hashes, joining state, and other member
  details are excluded.
- `erasureBlockers(userId)` reports current owner organizations. Ownership with
  another member always blocks. Because the current model has no separate billing
  state, active current ownership conservatively blocks even when no other member
  exists. A suspended sole owner can erase. Historical `originalOwnerId` does not
  block after ownership transfer.
- `removeForUser(userId, email?)` holds `join:<userId>` and sorted organization
  locks, rechecks blockers before its first write, deletes related invitations
  before membership, removes caller requests, clears matching billing contact
  emails, and replaces historical original ownership with `SYSTEM_ACCOUNT_ID`
  (`qi-academy-system`). All steps tolerate repeats. Invitation deletion uses
  immutable ID, so a token rotation cannot silently retain a matching old row.
- Feedback memory, MongoDB and legacy Sheets expose `collectForExport(userId)` and
  `anonymizeForUser(userId)`. General feedback text is retained and submitter email
  cleared (there is no display-name field in the current feedback model).
  Lesson feedback retains anonymous kind/rating but clears message and, where
  present, summary/reproduction/expected-behavior text. Mongo also removes legacy
  submitter name fields. Mongo queries are user-scoped and acknowledged by majority.
  Sheets writes only email/message cells, preserving concurrent triage columns.
- Feedback freeze permits scoped export but refuses anonymization with
  `FeedbackReadOnlyError`. Unavailable stores fail closed.
- `UserChangeRepository.anonymizeForUser(userId)` clears target email and sets
  matching target/actor names to `Deleted user`, preserving opaque identifiers,
  actions, timestamps and unrelated snapshots. Mongo updates the complete matching
  history, independent of the 50-entry recent view.
- `recordErasure(userId, at)` uses existing `field: status`, `from: erasing`,
  `to: erased` fields. Deterministic ID `account-erasure:<userId>` and Mongo
  `$setOnInsert` upsert retain exactly one marker and its first timestamp across
  hosts. The actor is the system account; no email or personal name is retained.

## RED / GREEN evidence

All tests use in-memory stores or injected driver/Sheets doubles; no shared data.

1. RED: `npm --workspace api test -- src/organizationRepository.test.ts src/userChangeRepository.test.ts src/feedbackStorage.test.ts`
   — 16 privacy tests failed because the new methods did not exist; 33 existing
   tests passed.
2. GREEN after implementation: same command — 49/49 passed across three files.
3. RED: `npm --workspace api test -- src/organizationRepository.test.ts src/feedbackPrivacySheets.test.ts`
   — new stored-membership secret regression failed (unexpected `tokenHash`
   leaked); 19 other tests passed. Fixed by projecting membership fields.
4. RED: `npm --workspace api test -- src/organizationRepository.test.ts`
   — new billing-contact regression failed (erased user's email retained on an
   organization originally created by somebody else); 21 other tests passed.
   Fixed by scoped billing-email lookups and conditional email cleanup.
5. Final focused GREEN:
   `npm --workspace api test -- src/organizationRepository.test.ts src/organizationRecovery.test.ts src/organizationInvitations.test.ts src/organizationMembers.test.ts src/userChangeRepository.test.ts src/feedbackStorage.test.ts src/feedbackPrivacySheets.test.ts src/feedbackMigration.test.ts src/lessonFeedback.test.ts`
   — 9 files, 103/103 tests passed. Includes both-user isolation, repeat erasure,
   half-complete invitation deletion, owner block before mutation, historical
   ownership cleanup, scoped Mongo reads, secret projection, retained feedback,
   lesson text deletion, freeze behavior, Sheets cell isolation and two-host audit
   marker idempotency.
6. `npm --workspace api run build` passed after initial implementation and system
   account alignment; final build rerun recorded below.
7. Scoped `git diff --check` passed.

## Files

- `api/src/organizationRepository.ts`
- `api/src/organizationRepository.test.ts`
- `api/src/feedbackRepository.ts`
- `api/src/feedbackStorage.test.ts`
- `api/src/feedbackPrivacySheets.test.ts`
- `api/src/userChangeRepository.ts`
- `api/src/userChangeRepository.test.ts`

## Integration concerns and limits

- Root owns account-level serialization and fresh status checks. Organization
  request approval currently locks `request:<requestId>` and an admin's actor
  account, rather than the target account; coordinate target-account mutation
  locking to prevent an already-started approval recreating membership.
- `OrganizationService.invite/resend/cancel` do not currently acquire org locks.
  Root was notified. Erasure deletes selected matching invitations by immutable
  ID, but a new concurrent invitation written after the scoped read needs service
  locking to guarantee complete point-in-time cleanup. A brand-new invitation to
  an erased email is a separate later owner action.
- Erasure acquires join then sorted org locks. Existing joins hold `join:<userId>`,
  while owner/member mutations hold org locks, so selected rows are protected from
  joins and cooperating organization mutations. Production Mongo lock provider is
  shared; driver tests inject isolated lock instances unless explicitly shared.
- MongoDB and Sheets behavior was verified at real adapter query boundaries using
  synthetic doubles; no live integration claim is made. Legacy Sheets row-index
  writes assume no administrator inserts/reorders sheet rows during erasure.
- Root runs the complete API suite/integration verification to avoid concurrent
  heavy suites; this worker ran only its assigned focused checks.
- No frontend, route, privacy-service, auth or release/version files were edited.

Final verification: final API build exited 0 after the billing-contact fix; focused 103/103 tests and scoped whitespace checks passed. No commits created.

## Follow-up: cross-user organization mutation admission

Root review reproduced an admin approval paused at `createOrganization` while
its target erased, followed by late membership/billing-email recreation.
Authorized additional scope: `organizationService.ts` and matching tests.

- Added optional generic `withUserMutation(userId, operation)` dependency.
  A single helper freshly checks the target account is active inside admission.
- Organization request decisions acquire the requester's admission before the
  existing request lock and retain it through all writes and notifications.
- Owner promotions and career changes acquire the member's admission before
  the organization lock. Invite/resend acquire existing recipients' admission
  before the organization lock; unknown-email invitations use the org lock.
- Invite/resend/cancel now hold the organization lock and re-read relevant
  owner/invitation state inside it.
- Additional files: `api/src/organizationService.ts` and
  `api/src/organizationPrivacyMutations.test.ts`.

RED: `npm --workspace api test -- src/organizationPrivacyMutations.test.ts`
failed all six tests before production changes: approval lacked target admission,
member/invitation mutations bypassed closed admission, and stale target status was
accepted. GREEN: `npm --workspace api test -- src/organizationPrivacyMutations.test.ts src/organizationService.test.ts src/organizationMembers.test.ts src/organizationInvitations.test.ts src/organizationRecovery.test.ts`
passed 42/42 tests across five files. The paused-write test uses a distinct target
account from the admin actor and verifies admission remains held until completion.

Root owns coordinator injection and the integrated erasure race test. Root will
disable the account, drain admitted operations, recheck owner blockers, and restore
active status only when a newly materialized blocker is found before any cleanup.
A durable cleanup-start marker prevents restoring after a partial erasure. This
supersedes the request-approval and invitation-lock integration gaps above.

Follow-up verification: API build exited 0; scoped diff whitespace checks passed. No commits created.
