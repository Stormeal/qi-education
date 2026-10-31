# US-P021 account lifecycle implementation

2026-10-31; `main`; no commits, pushes, deployment or shared-service mutations.

## Implemented

- `auth.ts`: optional internal `privacyErasure` metadata; explicit safe session
  projection excludes password, lifecycle metadata and future unknown fields.
- `authRepository.ts`, `mongoAuthRepository.ts`: caller-account export;
  `beginErasure(userId, expectedPasswordHash)` compares credential and active
  status atomically, closes immediately, and permits same-credential pending
  retries without changing the original timestamp. Wrong/stale credentials and
  unrelated disabled accounts are refused without mutation.
- Final anonymization uses unique `erased:${id}`, `Deleted user`, empty
  password, disabled status, student role and unconfirmed email. It preserves the
  opaque ID, creation time and enrollment IDs/counts. Pending/complete accounts
  refuse role, status, password and confirmation writes. Mongo lifecycle writes
  request majority acknowledgement.
- `authStore.ts`: read-only export forwarding; begin/final erasure refused.
  Unavailable storage refuses all three privacy methods.
- `systemAccount.ts`: `SYSTEM_ACCOUNT_ID = 'qi-academy-system'`;
  `ensureSystemAccount(auth): Promise<AuthUser>` seeds lazily and awaits storage.
  Concurrent calls, including distinct Mongo adapter instances, converge using
  unique ID/email constraints. Reserved synthetic email field is the non-email
  sentinel `system:qi-academy-system`; disabled admin, empty password. Account writers
  cannot activate, change role/password, confirm or erase this system account.
  No startup seed was added.
- `api/test/fakeAuthCollection.ts`: isolated Mongo boundary supports dotted
  filters and `$exists` required by lifecycle guards.

## Verification

- RED: `npm run api:test -- authPrivacy.test.ts` failed 11/11 as expected before
  implementation (missing lifecycle/system behavior and session-field leakage).
- GREEN: `npm run api:test -- authPrivacy.test.ts mongoAuthRepository.test.ts`
  passed 19/19, including real memory and Mongo adapters with isolated collection
  boundary, two-user scoping, stale-password race defense, pending retries,
  enrollment preservation, irreversible tombstones and concurrent lazy seeding.
- `npm run api:build` passed.
- Extended auth run over authPrivacy, mongoAuthRepository, userStoreConfig,
  userStoreRoutes, authStatusRepository, changePassword, emailConfirmation and
  adminUsers: 242/243 initially passed. Sole failure was the existing exact
  email-confirmation Mongo filter expectation, updated to include the new
  `privacyErasure: { $exists: false }` guard. New unavailable/read-only privacy
  assertions in userStoreConfig passed in this run.
- Reran emailConfirmation: 34/34 passed after the expectation update. The command
  was `npm run api:test -- emailConfirmation.test.ts -t "confirms once without a
  session"`; npm consumed `-t`, so Vitest ran the whole emailConfirmation file.
- Scoped `git diff --check` passed (only existing Windows line-ending notices).

Full API verification is coordinated by the root/repository worker to avoid
parallel full suites. No live Mongo/provider integration was exercised; Mongo
coverage uses the real repository with the isolated collection boundary fake.
Root owns route-level login/session refusal, pending-erasure retry and privacy
service integration.

## Review follow-up: concurrent mutations and cleanup admission

- `AuthUser.privacyMutations?: Record<string, number>` records per-request UUID
  lease expiry timestamps. `beginPrivacyMutation` atomically requires active
  status and absence of erasure metadata, then sets only its UUID field;
  `finishPrivacyMutation` removes only that field, including while pending.
  Concurrent mutations remain admitted together. Pending erasure preserves all
  leases so root can drain live requests before cleanup; final anonymization
  clears the map. Mongo writes use majority acknowledgement, and account mapping
  preserves internal leases without exposing them in session/export DTOs.
- Lease IDs are checked with Zod UUID validation before becoming Mongo paths.
  Read-only and unavailable adapters refuse admission/release as account writes.
- `privacyErasure.cleanupStarted?: boolean` is internal durable admission state.
  `cancelErasure(userId, expectedPasswordHash)` is a CAS requiring disabled,
  pending, same credential, and no cleanup marker; it restores active status and
  removes only the erasure metadata. `markErasureCleaning(userId)` sets the marker
  for a pending disabled account and throws if no pending account matches. Once
  marked, cancellation fails permanently. Pending retries preserve the marker.
  Root owns draining leases and the second organization blocker check before
  cleanup admission, so a newly admitted owner can receive 409 with a usable
  account instead of being left disabled.
- Signup rejects all `.invalid` domains. Per root's review correction, system
  and tombstone email fields now use impossible-signup non-email sentinels
  `system:qi-academy-system` and `erased:${id}` instead of the original synthetic
  `.invalid` email proposal. This also prevents existing pre-change users who
  claimed those former reserved addresses from blocking seeding/finalization;
  no live migration is needed.
- The Mongo test boundary now replaces the updated document so top-level
  `$unset` actually removes fields, matching real Mongo semantics.
- TDD follow-up RED: `authPrivacy.test.ts` had 16 expected failures before lease
  methods/sentinel correction. GREEN: authPrivacy, mongoAuthRepository and
  userStoreConfig passed 42/42. Cleanup admission RED: authPrivacy plus
  userStoreConfig had eight expected failures for missing cancel/mark methods.
  GREEN: the same three focused files passed 46/46.
- Fresh API build passed after follow-up. Extended eight-file auth run: 255/261
  passed. Two same-role admin tests expected zero writes globally; their meaningful
  assertion now checks unchanged target account and no role write, allowing
  caller lease bookkeeping. Two change-password repository snapshots exposed an
  empty lease map after final release; memory now removes the optional field and
  Mongo account mapping omits empty maps. Two disabled-session checks found the
  new root admission middleware's early 401 lacked `Cache-Control: no-store`;
  reported to root for its middleware fix.
- After the adapter snapshot and admin expectation fixes, authPrivacy,
  adminUsers, changePassword and userStoreConfig rerun passed 199/201. The only
  remaining failures are the two disabled-session no-store middleware cases
  reported above; no adapter or admin regression remains in that run.

## Files

`api/src/auth.ts`, `api/src/authRepository.ts`, `api/src/mongoAuthRepository.ts`,
`api/src/authStore.ts`, `api/src/systemAccount.ts`, `api/src/authPrivacy.test.ts`,
`api/src/userStoreConfig.test.ts`, `api/src/emailConfirmation.test.ts`, `api/src/adminUsers.test.ts`,
`api/test/fakeAuthCollection.ts`, this report.
