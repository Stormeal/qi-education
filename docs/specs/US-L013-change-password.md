# US-L013: Change my password while signed in

## Record and outcome

- Story: US-L013-AC01/02; API owner Codex, frontend owner Claude Code.
- State: Implemented and verified locally 2026-10-11; main/base 673fd59, ancestor confirmed.
- Local delivery commit: pending the scoped implementation commit; recorded below afterwards.
- Spec first; [handoff](../handoffs/US-L013-change-password-codex.md).
- Related defects: none reproduced. Older reset links surviving a reset were an
  explicitly accepted US-L004 gap; this increment closes it as new behavior.

A signed-in user can replace a password from their profile, with proof of the
current password, the signup policy and an account notice. Existing login and
protected-route contracts stay unchanged; reset confirmation additionally cancels
the account's other unused links. No frontend edits, provider calls or real mail.

## Decisions (confirm or change)

Lead: require the current password for every role; signup policy, and a different
new password. A wrong current password is 400, never 401, because the frontend
treats 401 as an expired session. Check it before validating the new password.
Both profile changes and reset confirmations cancel every unused reset link.
Other signed-in browsers stay signed in until their signed tokens expire. Wrong
current-password attempt limits remain open under US-P008-AC02; no abuse controls.

Implementation: reuse protected authentication, AuthRepository.updatePasswordHash
(Sheets D-cell / memory) and the existing injectable sender. Share the exact
US-L004 notice subject/text through one helper, with failures ignored. Set no-store
before JSON parsing on both prefixes, including auth/parser/storage errors.

Token cancellation uses the existing per-user versioned CAS document. A new
invalidateAll operation marks pending/active tokens used, retaining their mail
slots. Reset consume claims its token and cancels the other pending/active tokens
in the same conditional replacement; overlapping different-token confirms cannot
claim two preexisting links. Profile change awaits invalidation before the password
write. On cancellation failure no password write occurs; on an uncertain password
write links stay canceled. Mongo and Sheets are separate stores, not a transaction.

New reset reservations also carry a SHA-256 fingerprint of the salted stored
credential, never the password or password hash itself. Check/confirm compare it
to the current account credential. This closes the late request/activation race:
mail issued from an old credential snapshot cannot survive a password change.
Legacy tokens without a fingerprint remain compatible until canceled; CAS cancels
them as well. Reset confirmation rechecks credential/status after claiming and
before writing, including the legacy preclaim credential. Security reads request
a fresh Sheets snapshot instead of joining an older in-flight lookup. This closes
a late-token confirm paused before claim while the profile password write finishes.
No migration, raw token or credential disclosure. Requests made after
the new credential is stored can issue new links under the existing hourly limit.
Already claimed password writes across stores cannot be retroactively canceled;
no distributed password-write transaction or session revocation is claimed.

## API and compatibility

POST /users/me/password (also /api/users/me/password), any active signed-in role,
body `{ currentPassword, newPassword }`, Cache-Control: no-store on every result.

| Condition | Response |
| --- | --- |
| Changed | 204, empty body; new login works, old login fails |
| Wrong/missing/non-string current password | 400 `{ message: "Your current password is not correct.", code: "current-password-incorrect" }` |
| Invalid new password after correct current proof | 400 `{ message }`, first signup-rule message; no mutation |
| Same new/current password | 400 `{ message: "Choose a password that differs from your current one." }` |
| Invalid/missing/expired session or disabled/deleted account | Existing protected 401 `{ message }` |
| Unavailable user or cancellation store / failed write | Safe 503 `{ message }`; no internal details logged/echoed |

Current-password verification precedes both policy and equality answers. The
current plaintext is never trimmed; no plaintext/hash is logged, returned or
stored in tokens. Notice subject: Your QI-Education password was changed; exact
existing US-L004 text, no password or link. Failed notice does not fail the change.
Reset check/confirm retain their exact 410 reset-link-invalid shape after either
change route. Existing paths, DTOs, health fields and other cache headers stay as
they are. The cancellation behavior is the one deliberate reset-contract extension.

## Behavior contract

```gherkin
Feature: Change password
  Scenario: US-L013-AC01 Change with the current password
    Given an active signed-in student, teacher or admin
    When the current password is correct and the new password is valid and different
    Then the route returns 204 and login accepts only the new password
    And wrong current-password proof returns the exact 400 without changing anything
  Scenario: US-L013-AC02 Hear about the change
    Given a successful profile password change
    When sending the shared account notice succeeds or fails
    Then one notice is attempted and the change stays successful
    And the notice contains neither password nor link
  Scenario: US-L013-AC03 Check proof before policy
    Given wrong current-password proof and an invalid or equal new password
    When changing the password
    Then only current-password-incorrect is returned
    And valid proof with invalid or equal new password preserves password and reset links
  Scenario: US-L013-AC04 Respect session and unavailable storage
    Given missing/invalid/expired session or unavailable user storage
    When changing the password
    Then existing 401 or safe 503 is returned with no-store and no private diagnostics
  Scenario: US-L013-AC05 Cancel unused recovery links
    Given active and pending reset links for this account and another account
    When either password-change route succeeds
    Then this account's unused links check/confirm as 410 and cannot be activated later
    And the other account's links and stored hourly mail slots remain unchanged
    And a late old-credential reservation cannot revive a canceled link
```

## Frontend and verification

Claude owns the profile section, validation display, preserved inputs, keyboard and
combined browser check. Wrong-password 400 keeps the frontend session; no API change
to the existing session-expiry path. Actual provider writes/mail are release checks.

- [x] Spec first and own queue row selected.
- [x] Isolated HTTP RED for new route and both change-route cancellation paths.
- [x] Repository RED for memory/Mongo CAS cancellation, pending activation and limits.
- [x] Implement route/shared notice/cancellation; retain Sheets/memory hash writer.
- [x] Run all five checks, read-only review, docs/backlog.
- [ ] Fresh version, scoped implementation commit and delivery record.
- [ ] Record commit/evidence in own queue row and append-only reset spec; stop, no push.

| Scenario | Evidence | Result |
| --- | --- | --- |
| AC01/03/04 | 62 isolated HTTP cases across normal and /api prefixes; roles, proof order, login, auth/storage/privacy | Pass |
| AC02 | Shared sender recorder, exact notice once and failed-notice success | Pass |
| AC05 | HTTP profile/reset cancellation, late mail/claims in memory and Sheets doubles; 17 CAS repository tests | Pass |
| Persistence | Six password-update cases including fresh Sheets reads bypassing older in-flight snapshots; 66 reset HTTP regressions | Pass |

Required: npm run api:test, npm run verify:journeys, npm run api:build,
npm run app:test and npm run app:build:pages. Isolated stores/stubs, ephemeral
loopback ports only. Real Sheets/Mongo/Brevo and hosted/browser flows unverified.

## Local verification evidence (2026-10-11)

Initial RED: 62 failures and 13 passes in the new HTTP/repository checks before
implementation. Review found a late reset claim that could overwrite a completed
profile change; four HTTP cases reproduced it in memory and Sheets doubles on both
prefixes. A separate fresh-read regression reproduced stale Sheets credentials.
Post-claim credential/status checks and fresh security reads close those cases.
The final focused run passed 151 cases across four files. Read-only review found
no remaining important findings after the repairs.

| Required check | Final result |
| --- | --- |
| npm run api:test | Pass: 813 tests, 39 files |
| npm run verify:journeys | Pass: six journeys |
| npm run api:build | Pass |
| npm run app:test | Pass: 252 tests, 32 files; jsdom scrollTo notices |
| npm run app:build:pages | Pass; three existing component style-budget warnings; Pages fallback created |

Claude's frontend commit 821a3dc is preserved. Test stores, Sheets/Mongo adapters
and sender use isolated doubles; no shared providers or real mail were contacted.
Real Sheets/Mongo/Brevo and the combined hosted profile/keyboard flow remain release
checks. No outside-file change is needed. Wrong-current-password attempt limits
remain open under US-P008-AC02, and existing signed sessions remain valid.

A password write already underway in the separate user store cannot be revoked
retroactively. A stale claim may cancel newer sibling links before the fresh
credential check rejects it; a new request follows the existing mail limit.
This implementation does not claim a cross-provider password-write transaction.
