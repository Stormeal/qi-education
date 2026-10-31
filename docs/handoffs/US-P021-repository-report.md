# US-P021 repository adapter report

Status: implemented, no commit, no push, no shared-service mutations. Root owns integration and delivery.

## Files changed by this agent

Production:
- api/src/accountProfileRepository.ts
- api/src/learningProgressRepository.ts
- api/src/lessonNotesRepository.ts
- api/src/accountCareersRepository.ts
- api/src/careerPathRepository.ts (additional legacy-selection scope assigned by root)
- api/src/instructorProfileRepository.ts
- api/src/notificationRepository.ts
- api/src/paymentRepository.ts
- api/src/passwordResetRepository.ts
- api/src/emailConfirmationRepository.ts

Tests and isolated collection doubles:
- api/src/repositoryPrivacyAdapters.test.ts (new)
- api/src/accountProfileRepository.test.ts
- api/src/accountCareersRepository.test.ts
- api/src/careerPathRepository.test.ts
- api/src/instructorProfileRepository.test.ts
- api/src/lessonNotesRepository.test.ts
- api/src/notificationRepository.test.ts
- api/test/fakeAccountMailTokenCollection.ts
- api/test/fakePaymentCollection.ts

## Methods and contracts

- Account profile, account careers: collectForExport(userId) returns a whitelisted document or null; removeForUser(userId) deletes that account's row.
- Learning progress: collectForExport(userId) returns every caller course progress record, including completedIds and passedQuizzes; removeForUser deletes all caller course records.
- Lesson notes: collectForExport(userId) returns flattened LessonNote[] across all caller courses; removeForUser deletes every caller course document.
- Notifications: collectForExport returns every caller notification, bypassing the normal 50-row list pagination; removeForUser deletes all caller notifications.
- Instructor profile: collectForExport returns {_id, description} or null; anonymizeForUser deletes the optional description-only profile row. There is no name/avatar field in this schema; the account tombstone/public author mapping owns the Former instructor label.
- Payments: collectForExport returns every caller purchase through a whitelist: _id, userId, courseId, amountDkk, stripeCustomerId, paidAt, optional refundedAt. anonymizeForUser retains exactly those accounting fields. The original userId becomes the account tombstone key; approved Stripe references remain. Mongo uses atomic updateMany with a $project aggregation stage, avoiding loss of a concurrent refund. No Stripe-side deletion.
- Password reset/email confirmation: removeForUser deletes the whole per-account token document, including pending, active and used links. Confirmation adapters inherit the reset implementation against their separate collection.
- Legacy career selections: collectForExport returns {_id, pathId, revision, selectedAt} or null; removeForUser deletes only career_selections for the caller. Public career definitions remain untouched.
- Interfaces, collection boundaries and unavailable fallbacks include the new methods. Mongo erasure writes request majority acknowledgement and reject unacknowledged results; missing rows are safe on retries.
- Export mappings return plain serializable objects and defensive nested snapshots, excluding unrecognized stored fields.

## RED/GREEN evidence

1. `npm run api:test -- src/repositoryPrivacyAdapters.test.ts`
   - RED: 18/18 failed with expected missing collectForExport/removeForUser methods in memory and Mongo adapters.
   - GREEN after implementation: 18/18 passed.
2. `npm run api:test -- src/careerPathRepository.test.ts`
   - RED: 2 new legacy privacy tests failed on missing collectForExport, 19 existing tests passed.
   - GREEN: 21/21 passed after adding selection-only methods.
3. `npm run api:test -- src/repositoryPrivacyAdapters.test.ts`
   - Additional RED: concurrent refund regression failed because read/replace anonymization lost refundedAt (18 other tests passed).
   - Replaced that implementation with an atomic Mongo projection; final focused run below includes its GREEN evidence.
4. Final focused command:
   `npm run api:test -- src/repositoryPrivacyAdapters.test.ts src/accountProfileRepository.test.ts src/learningProgressRepository.test.ts src/lessonNotesRepository.test.ts src/accountCareersRepository.test.ts src/careerPathRepository.test.ts src/instructorProfileRepository.test.ts src/paymentRepository.test.ts src/notificationRepository.test.ts src/passwordResetRepository.test.ts src/emailConfirmationRepository.test.ts src/refundRepository.test.ts`
   - GREEN: 12 files, 134/134 tests passed, 2026-10-31 12:52:58 local test output.
5. `npm run api:build`
   - Passed after the final atomic-payment implementation (exit 0).
6. `git diff --check -- <assigned production/test utility paths>`
   - Passed (exit 0).

Test cases exercise real memory repositories and real Mongo adapters against isolated collection semantics: two users, multi-course records, defensive snapshots, idempotent double erasure, 61 caller notifications, secret-free/legacy-extra-free exports, account-mail pending and active links, retained accounting history, concurrent refund preservation, and retained public career definitions.

## Full API suite / integration concerns

`npm run api:test` ran once while all agents were actively writing. Result: 117 passed / 6 failed files; 2,963 passed / 6 failed tests. This is not a final integrated GREEN result. Exact failures:

- privacyService.test.ts: suite could not import ./privacyService.js while root was creating it.
- clientLimitRoutes.test.ts: AC05/AC06 injectable policies can raise limits for isolated release journeys — 5-second timeout.
- signInLimit.test.ts: 03 makes unknown and disabled addresses indistinguishable and leaves another account usable — 5-second timeout.
- emailConfirmation.test.ts: AC01 confirms once without a session and updates login/me responses (mongodb) — exact Mongo filter expectation omitted new privacyErasure: {$exists:false}. Auth agent notified and reports expectation updated.
- organizationRepository.test.ts: US-P021 omits unexpected stored membership secrets from exports — in-progress retained-domain export implementation leaked tokenHash in that run.
- organizationRepository.test.ts: US-P021 historical ownership is anonymized after transfer without blocking or changing current owners — in-progress implementation used system instead of qi-academy-system.
- repositoryPrivacyAdapters.test.ts: US-P021 preserves a refund arriving during Mongo payment anonymization — intentionally introduced RED race regression; fixed and verified GREEN in final focused run.

Root requested no further full-suite execution while integration files change; root will run the stabilized suite serially. No unrelated failure was modified by this agent.

## Limitations and decisions

- Mongo behavior verified through isolated collection doubles; no real Mongo/Stripe/shared integration was mutated or contacted by adapter tests.
- New legacy-selection methods retain that repository's existing Mongo acquisition mechanism; test isolates getMongoDatabase at the driver boundary. Other assigned repositories inject narrow collection loaders.
- No whole-account coordination, routes, tombstone creation, ownership transfer or cross-domain ordering is in this agent's scope. Root must consume every new method, including legacyCareers.
- A new future accounting field must be deliberately added to both payment export and retained projection whitelists.
