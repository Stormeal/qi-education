# US-L004: Password reset by email

## Record and outcome

- Selected 2026-10-11; API increment Done locally in `9f87cb7` (0.1.127), Codex, main/base be57a77.
- API AC01/02/04/05 and US-P008-AC05 reset-account limit; Claude frontend AC03/form.
- Spec first; [handoff](../handoffs/account-email-password-reset-codex.md).
- Related defect: DEF-026, enrollment restoring the old password hash;
  [mail sender spec](US-P009-account-email.md).

Users recover an active account by mail without creating another account. All
existing routes, login responses and permissions stay unchanged. New routes also
work under /api and use Cache-Control: no-store, including parser errors.

## Decisions (confirm or change)

Lead: 32 random bytes minimum, hash-only per-user tokens; 60 minutes, single use;
new links need not invalidate older ones. Mongo production, memory local/tests;
signup password validation/hashing and a new Sheets/memory AuthRepository method.
Three reset mails per account per rolling hour, stored-token based across instances.
Per-client limits and confirmation-mail limits remain open; no session revocation.
Existing signed-in browsers remain signed in until their signed tokens expire.

Implementation decision: reserve pending tokens under a per-user atomic version
comparison so parallel instances cannot exceed three mail slots. Activate only
after provider acceptance; failed delivery retains the pending reservation for
the rolling hour because a timeout may follow actual delivery. A
pending token is never checkable or consumable, including after uncertain failure
or process crash. Count pending slots (including failed sends), plus active/used
tokens within the rolling hour; prune expired records when reserving another slot.

Confirmation atomically claims an active hash as used before writing the password,
so parallel/retried confirmations call the password writer at most once per token.
Mongo and Sheets cannot share a transaction: if that subsequent write fails or the
process stops, keep the claim consumed, report failure, and request a fresh link.
Do not reactivate an uncertain claim and risk a second password change. This is
the explicit fail-closed recovery boundary, not an all-store transaction claim.
Use injected clock/token generator in tests. Password update writes only the hash
cell in Sheets, preserving identity, role, status and enrollment columns. DEF-026
was reproduced with an isolated paused enrollment write restoring the old hash;
enrollment now updates only H so it cannot overwrite D. Its route, response and
existing instance-local enrollment sequencing stay unchanged. Distributed
enrollment union remains the open US-P003 decision.

## Route contract

| Route | Response |
| --- | --- |
| POST /auth/password-reset/request `{ email }` | Well-formed active/unknown/inactive/limited: 202 `{ message: "If an account exists for this address, we have sent a reset link." }`; malformed 400 message; unavailable/failed mail 503 `{ message: "We could not send email right now. Please try again later." }` |
| POST /auth/password-reset/check `{ token }` | Valid unused 204 without consumption; all invalid/malformed/expired/used 410 `{ message: "This reset link is no longer valid. Request a new one.", code: "reset-link-invalid" }` |
| POST /auth/password-reset/confirm `{ token, password }` | Valid token and signup-valid password 204; bad password 400 with signup's first validation message, token remains usable; invalid token 410 as above |

Missing mail configuration returns 503 for every well-formed address. With a sender
available, unknown/inactive addresses store nothing/send nothing and return 202.
A provider failure returns 503 only for a real active account: this rare existence
signal was accepted by the lead and qualifies the backlog's broader privacy wording.
Storage failures return safe 500 message-only errors without tokens/provider details.
If activation's acknowledgment is lost after accepted mail, it may have succeeded;
never resend/reactivate on that uncertain outcome. Checks and
confirms also reject accounts removed or disabled since issuance.

Reset subject: Reset your QI-Education password. Plain text states 60 minutes and
contains `<APP_PUBLIC_URL>/reset-password#token=<token>` (fragment, never query).
Successful change sends Your QI-Education password was changed, without password
or link; notice failure never undoes or fails the completed change.

## Behavior contract

```gherkin
Feature: Password recovery
  Scenario: US-L004-AC01 Request recovery
    Given a well-formed email
    When recovery is requested
    Then the accepted response is identical for active, unknown, inactive or limited accounts
    And only an active account with an available slot gets a 60-minute fragment link
  Scenario: US-L004-AC02 Use a token safely
    Given a valid unused token
    When checked repeatedly and then confirmed with a signup-valid password
    Then checks do not consume it and one confirmation changes the password
    And two overlapping confirms cause at most one password write
    And login accepts the new password and rejects the old one
    And invalid or exactly 60-minute-old tokens return reset-link-invalid
  Scenario: US-L004-AC03 Use the reset page
    Given a reset fragment link
    When the frontend page opens
    Then Claude provides password/confirmation and expired-link recovery states
  Scenario: US-L004-AC04 Hear about the change
    Given a successful reset
    When its notice is sent or fails
    Then the notice has neither password nor link and the reset remains successful
  Scenario: US-L004-AC05 Mail failure
    Given absent configuration or a failing provider
    When requesting recovery
    Then the safe 503 is returned and no usable token remains
  Scenario: US-P008-AC05 Limit account reset mail
    Given three recent stored mail slots for an account
    When a fourth request or overlapping requests on another instance arrive
    Then no fourth mail is sent and every well-formed request retains its 202 response
    And the account can request again after the rolling-hour boundary
```

## Storage, UI and compatibility

Mongo collection `<MONGODB_COURSE_CONTENT_COLLECTION>_password_resets`, one document
per user, version and bounded recent token records `{ hash, createdAt, expiresAt,
state }`. No raw token, password, email or link is stored there. Compare-and-replace
and first-insert collision retries use majority acknowledgment. Consumption uses
the same version predicate; memory replacements do not yield. Production missing
Mongo fails closed rather than persisting into temporary memory. Old consumed or
expired hashes remain invalid even after pruning; no TTL/index migration is needed.

Claude owns forms, reset route, keyboard/accessibility and combined browser walk.
No frontend edit, session invalidation, auth abuse control, email confirmation,
signed-in password change, new dependency or shared-provider mutation is included.

## Plan and verification

- [x] Both specs first; own queue row selected.
- [x] Isolated HTTP RED for all three routes/statuses/both prefixes, privacy,
  expiry, single-use/parallel servers, login, provider/notice errors and limits.
- [x] Repository tests first: memory and actual Mongo adapter over isolated CAS
collection for atomic reservation/activation/consumption and failure recovery.
- [x] Auth password-update tests using stub Sheets and memory; no real store.
- [x] Implement repository/service/routes; only new dependency/registration and
  requested health field in server.ts; targeted auth/config additions.
- [x] Required checks, read-only review, docs/backlog/queue; fresh version, scoped
  staging; local commit/delivery hash record follows, then stop without push.

| Scenario | Evidence | Result |
| --- | --- | --- |
| L004-AC01/02/04/05 | Isolated HTTP routes/expiry/retry/login/privacy | Pass |
| P008-AC05 | Shared isolated store with two API instances and injected clock | Pass |
| Storage/auth | Actual Mongo adapter with CAS double; stub Sheets hash-cell update | Pass |

Run npm run api:test, npm run verify:journeys, npm run api:build, npm run app:test,
npm run app:build:pages. Isolated stores/stubs, ephemeral loopback ports only.
Real Mongo contention/durability, Sheets writes, Brevo acceptance/delivery, hosted
reset/browser/accessibility remain unverified. No deployment or push authorized.

## Local verification, 2026-10-11

The specs were written first. Initial HTTP RED: all eight route/health assertions
failed for missing routes/field. Sender/repository imports and four missing auth
method assertions then failed before implementation. Expanded HTTP RED: 62 cases
failed before route wiring. New-feature absence was not labeled as an old defect.
The additional paused Sheets enrollment case reproduced DEF-026 before its H-cell
fix. Review caught configured local Mongo selection and an uncertain-send limit
bypass; their isolated RED cases failed before correction and now pass. The final
read-only recheck has no remaining important code findings.

Final local checks: npm run api:test (744 tests, 38 files); npm run verify:journeys
(six role journeys); npm run api:build; npm run app:test (248 tests, 31 files);
npm run app:build:pages all pass. Existing frontend jsdom scrollTo notices and
three stylesheet budget warnings remain. The 95 focused sender/repository/auth/HTTP
cases include 66 HTTP cases over both normal and /api prefixes, two API instances,
actual Mongo CAS adapter over a shared isolated collection, missing production
mail, provider/network/refusal/uncertain-send errors, disabled/unknown accounts,
exact expiry, password validation, new/old login, notice failure and DEF-026.
Existing Sheets stubs now accept single-cell ranges; the diagnostic snapshot adds
only mail. No existing route contract changed. No real provider or mail was used.

No shared provider durability/write, Brevo acceptance/mailbox/spam check, hosted
frontend/API, combined browser/keyboard flow or session revocation was verified.
Alex owns the real sender/settings/delivery checks; Claude owns frontend AC03.
The account reset-mail limit is delivered; client-address and confirmation-mail
limits remain open. No outside-owned file is required. Nothing was pushed.

Local implementation commit: `9f87cb741d8942ffc4b98f97bddc01ec07a0e815` (2026-10-11, 0.1.127).
This delivery-record commit preserves that hash and carries another aligned patch
bump for the hook. The API increment is complete; frontend/hosted acceptance and
the explicitly open limits remain with their owners. Codex stopped; no push.
