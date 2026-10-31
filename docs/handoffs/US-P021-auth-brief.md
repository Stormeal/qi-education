# US-P021 account lifecycle brief

Implement auth/system-account portion in api/src/auth.ts, authRepository.ts,
mongoAuthRepository.ts, authStore.ts, systemAccount.ts and matching tests/fakes.
Do not edit server, privacy*, other adapters, app or versions. Main only, preserve
others' edits, no subagents, no commits, no shared mutations.

Requirements: systemAccount exports SYSTEM_ACCOUNT_ID and ensureSystemAccount(auth)
awaited lazy seed, idempotent/concurrent safe, cannot login, role admin disabled,
nonpersonal reserved synthetic email, no usable password. Do not seed at startup.

AuthUser optional privacyErasure: { state:'pending'|'complete'; startedAt:string }.
Persist and whitelist this internal metadata in Mongo account conversion but
never expose it via toAuthenticatedUser (currently spreads all fields, fix that).
AuthRepository methods collectForExport(userId) (whitelist safe account fields,
never hash or erasure metadata), beginErasure(userId, expectedPasswordHash):
Promise<AuthUser|null> atomically compare active/password and disable, set pending
timestamp; idempotently return pending when correct expected password.
anonymizeForUser(userId):Promise<void> final tombstone, clear password, confirmed
email, direct identifiers; preserve opaque id and enrolledCourseIds for counts;
set complete, irreversible across admin status/role setters and password writes.
Keep email string compatibility using unique non-personal `${id}@erased.invalid`
instead of null (unique email index currently prevents multiple null tombstones).
Do not allow placeholder email authentication (disabled + erased permanent).
ReadOnly wrapper allows export but refuses erasure methods. Unavailable fails closed.
Prevent updateRole/updateStatus from reactivating/altering pending/complete rows.

Root handles special erase-route retry: valid signed old session + same password
may resume pending; normal middleware still refuses disabled. No normal auth for
pending/complete rows. Method names/shape above consumed by root service.
Expected failure: beginErasure wrong/stale password returns null without mutation.
Use majority Mongo writes. Test real memory+Mongo boundary fake two users,
begin-erasure and repeat, stale credential, final tombstones preserve enrollments,
non-revival, secrets excluded, concurrent system seeding.

TDD RED then GREEN, focused tests. Report methods/files, commands/results,
limitations in docs/handoffs/US-P021-auth-report.md. Return concise summary.
