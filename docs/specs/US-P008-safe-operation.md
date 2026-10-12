# US-P008 - Safe authentication configuration and local mutations

State: Done 2026-10-10 in `e7afd6d` (version 0.1.84), hosted verification pending. Owner: Codex; completed by Claude Code as lead. Branch: main. Base: 0435029.
Selected 2026-10-10. Contract: AC01 / INV-013 and AC03 / INV-015.
Related defects: DEF-017 and DEF-018 (reproduced before implementation).

## Problem and outcome

As a maintainer, I want missing production settings to disable authentication,
and local mutations to stay local, so that demo credentials and development
requests cannot compromise live accounts or data. Current source selects demo
users without Sheets settings in every environment and retries failed local
fetches against the hosted API regardless of method.

## Scope and decisions

- Production means exactly `process.env.NODE_ENV === 'production'`, matching
  the existing session-secret policy. This includes any preview run in that
  mode. Development, an unset NODE_ENV, and NODE_ENV=test keep demo accounts;
  test mode continues to ignore provider configuration and api/.env.
- Complete user-store configuration means the resolved Sheets spreadsheet ID
  (including its existing legacy alias), service account email and private key.
  A complete production configuration still selects GoogleSheetsAuthRepository
  first; no new setting, host allowlist or credential format is required.
- Without that configuration, the production factory returns an unavailable
  repository containing no accounts. Login, signup and authenticated requests
  return HTTP 503 with a clear `{ message }`. `/health/auth` reports unavailable
  with a non-secret explanation; `/health/config` marks auth unconfigured.
  An explicit injected test repository remains usable; it is never the default
  production fallback.
- From localhost, its subdomains, IPv4 loopback (127/8), or IPv6 loopback,
  only GET and HEAD retain the current network-error fallback. Every other
  method, case-insensitively, attempts only a local API. Network failures give
  a client-generated 503 JSON message without replaying credentials or request
  bodies elsewhere. Existing callers display these non-ok response messages;
  throwing would lose the guidance in their generic network-error catch blocks.
  Explicit remote API overrides are also rejected for these mutations before
  sending. Local API overrides remain supported. Deployed hosts are unchanged.
- HTTP error responses are returned as today, including 401 session handling;
  a network error does not log bodies, credentials or tokens. Drafts remain
  under the existing callers' error handling. No page/UI edits are needed.
- AC02 attempt limits, direct provider integration, new routes, response-shape
  changes and deployment are excluded. No migrations or shared-store probes.

## Behavior contract

```gherkin
Feature: Safe operation
  Scenario: US-P008-AC01 No demo accounts in production
    Given production has a session secret but missing user-store settings
    When anyone signs in using any documented demo account or signs up
    Then authentication responds 503 with a clear message and no session
    And no demo account exists in the selected repository
    And health reports missing configuration without secrets

  Scenario: US-P008-AC01-COMPAT Preserve configured and demo environments
    Given production has complete user-store settings
    Then the configured user repository is selected without making a probe
    Given development or test mode has no user-store settings
    Then demo student, teacher and admin sign-in and signup still work

  Scenario: US-P008-AC03 Local development never writes to production
    Given the frontend runs on loopback and its local API is unreachable
    When I sign up, save, enroll or use any method other than GET or HEAD
    Then the request fails locally with a clear message
    And nothing is sent to the hosted API
    And GET and HEAD retain read fallback

  Scenario: US-P008-AC03-OVERRIDE Reject remote mutation overrides locally
    Given a loopback frontend is configured with a remote API URL
    When I attempt a mutation
    Then the client rejects it before sending any request
    And a local API override and deployed frontend requests still work
```

## API, storage and compatibility

Keep every existing route, alias, success DTO and error response structure.
Unavailability uses the existing 503 and `{ message }` conventions, and the
existing health `{ status, message? }` structure. Health checks verify settings,
not provider connectivity. The production factory never constructs the demo
store as a fallback. Existing in-memory stores and journey fixtures are retained.

## Implementation checklist

1. Reproduce both investigations with isolated regression tests before fixing.
2. Record confirmed defects and add the unavailable auth repository/route guards.
3. Restrict loopback mutation targets and network-error fallback in ApiClientService.
4. Verify compatibility, all suites/builds and an independent code review.
5. Update architecture/backlog/defects, commit with aligned version, record delivery.

## Verification and delivery

| Scenario | Test or check | Evidence |
| --- | --- | --- |
| AC01 / COMPAT | api/src/safeOperation.test.ts; existing auth/journey tests | 26 regressions pass; original 15 failures reproduced on base |
| AC03 / OVERRIDE | api-client.service.spec.ts, real service with fetch stubs | Original eight failures reproduced; final 30 client tests pass, including real auth/enrollment message propagation |
| Existing contracts | API/frontend suites, six journeys, API/Pages builds | 378 API tests, six journeys and both builds pass; frontend fixture compatibility pending |

Final independent review is clear after preserving local guidance through the
existing non-ok JSON response path. The full frontend run exposed seven failures
in the existing learning-progress fixture, whose fully mocked API override is
`http://isolated.test/api`. The new guard rejects it as remote. A single URL
substitution to `http://127.0.0.1:4307/api` would keep the fixture isolated and
compatible; user approval is pending because that spec is outside assigned files.
No exception for test domains is added to production behavior. Delivery commit
and aligned version bump remain pending full frontend verification.

No shared Sheets, MongoDB, Mux or GitHub data will be touched. Tests use disposable
memory repositories, ephemeral HTTP ports, and browser fetch stubs. Hosted
configuration, provider reads/writes, actual deployment and browser UI messages
remain release checks. Claude's concurrent page/spec changes are outside this work.

## Lead completion 2026-10-10

Codex stopped before committing, waiting for approval of one fixture change. The lead
approved and applied it: `learning-progress.spec.ts` now points its stubbed API at a loopback
URL, because a localhost test page may no longer send changes to a remote host. With it, 378
API and 179 frontend tests, six journeys and the API and Pages builds pass on the combined
tree. Consequence for developers: `npm run app:dev:frontend` without the local API can
browse public pages but cannot sign in or save.

## AC02 sign-in attempt limit — decisions 2026-10-12

Selected by Alex on 2026-10-12: after 10 wrong passwords for one account within 15 minutes,
sign-in for that account is refused for 15 minutes; counted per account only (a class behind
one school network is not locked out together); enforced in the API. Accepted cost: someone
who knows an email address can lock that account for 15 minutes.

Lead decisions, confirm or change: counted per normalized email whether or not an account
exists, with the same refusal for both; a locked attempt is refused before the users sheet is
read and does not extend the lock; a successful sign-in clears the count; a password set
through a reset link lifts the lock; stored in MongoDB when hosted and in memory locally; if
the store fails, sign-in is not limited. Refusal: 429 with `code: "too-many-attempts"`. The
full list and the contract are in the
[handoff](../handoffs/US-P008-sign-in-limit-codex.md). Owner: Codex. Scenarios and evidence
follow below.

## AC02 contract and implementation plan — 2026-10-12

Owner Codex, main/base b646366; DEF-033 reproduces INV-014 for login only.
The handoff's lead decisions are adopted for this increment. Every existing 401
(unknown address, wrong password, disabled account) counts. Invalid input (400),
unavailable authentication (503), and other operational errors do not count.
Normalization trims surrounding spaces and lowercases email before validation.
The rolling window is `(now - 15 minutes, now]`; the tenth completed failure
starts a fixed 15-minute lock. The tenth response stays the generic 401.
Locked requests return 429 before user reads/password checks, never extend the
lock, and carry `{ message: "Too many sign-in attempts. Try again in 15 minutes.",
code: "too-many-attempts" }`, `Retry-After` seconds rounded up and
`Cache-Control: no-store`. Remaining minutes round up; one uses `1 minute`.
All four routes (`/auth/login`, `/login`, `/api/auth/login`, `/api/login`) share
the same per-normalized-address state and preserve existing request, 200 DTO,
400, 503 and generic 401 contracts. The deployed AuthService displays the message.

Storage uses a SHA-256 email key, failure timestamps, expiring attempt tickets,
lock deadline, unique CAS revision and TTL expiry; never email/password/user data.
Atomic reservations bound failures plus outstanding checks to ten across API
instances. Capacity occupied by outstanding requests waits for their outcomes
instead of counting those requests as failures. Expiring tickets reclaim capacity
after a crashed worker; cleared tickets cannot later relock a reset account.
Mongo uses the existing collection prefix and acknowledged conditional writes,
with a TTL index. Memory implements the same transitions with lazy expiry.
Limit/window/lock duration/clock are injected. No new configuration or dependencies.
Store failures or a five-second storage deadline allow ordinary login and emit one fixed, personal-data-free
warning for the failed operation; no silent memory fallback for hosted instances.
This fail-open policy is a known protection limitation. Password-reset confirmation
clears attempts after a successful credential write; failure to clear is harmless
to the password write and logged safely. No cross-store transaction is possible.
Storage-call deadlines are injectable for tests. Mongo operations carry a five-second
driver timeout and cancellation signal checked between read/write/CAS stages;
already-issued write outcomes can be uncertain. Late successful reservations are
cancelled, and aborted clears cannot start a new write or retry over newer state.
Waiting for outstanding capacity polls at 100 ms and stops on HTTP disconnect.
Retry-After uses the clock after the storage read; a lock expired during that read
retries admission.

```gherkin
Feature: Per-account sign-in attempt limit
  Scenario: US-P008-AC02-01 Ten failures then refusal
    Given one address has no failures
    When ten failed sign-ins complete within 15 minutes
    Then each responds 401 with Invalid email or password
    And the next sign-in responds 429 with too-many-attempts, Retry-After and no-store
  Scenario: US-P008-AC02-02 Fixed lock and exact expiry
    Given the tenth failure has started a 15-minute lock
    When a correct or wrong password is submitted during the lock
    Then no user is read and no password is checked and the deadline stays unchanged
    And remaining seconds and minutes round up, including 1 minute
    When exactly 15 minutes have passed since the tenth failure
    Then a correct password works and the count begins from zero
  Scenario: US-P008-AC02-03 Address privacy and isolation
    Given known, unknown and disabled addresses each receive ten failed sign-ins
    Then their 401 and locked 429 bodies and headers are identical
    And an unrelated account on the same client can still sign in
  Scenario: US-P008-AC02-04 Normalize address across aliases
    Given sign-ins vary email case and surrounding spaces
    When requests use all four login routes
    Then they share one count and lock
    And invalid input still responds 400 without consuming an attempt
  Scenario: US-P008-AC02-05 Successful login clears failures
    Given nine failures for an address
    When a correct password signs in successfully
    Then ten subsequent failures are needed to start a new lock
  Scenario: US-P008-AC02-06 Recovery lifts lock
    Given an account is locked
    When a valid reset link successfully writes a new password
    Then the lock and failures are cleared and the new password can sign in
    And invalid links and unsuccessful writes do not clear the lock
  Scenario: US-P008-AC02-07 Rolling window
    Given failures become exactly 15 minutes old before the tenth failure
    When another failed sign-in completes
    Then expired failures do not contribute toward the limit
  Scenario: US-P008-AC02-08 Overlapping requests and stale outcomes
    Given API instances share an atomic attempt store
    When many wrong-password requests overlap for one address
    Then at most ten user/password checks occur and the rest receive 429
    And crashed checks expire and cleared checks cannot recreate old failures
  Scenario: US-P008-AC02-09 Store failure preserves authentication
    Given attempt storage cannot read or write
    When someone signs in or completes recovery
    Then ordinary authentication/recovery still works and a fixed safe warning is logged
    And unavailable authentication still returns its existing 503 without counting
  Scenario: US-P008-AC02-10 Storage privacy and expiry
    When attempts are reserved and completed in memory or the Mongo adapter
    Then only hash keys, opaque tickets and timing/revision data are stored
    And expired records are reclaimed without requiring live provider probes
```

Implementation order (native execution authorized by the handoff): reproduce and
append DEF-033; write scenarios and failing HTTP/storage tests; implement
`signInAttemptRepository.ts` (atomic CAS/TTL/factory), `signInLimit.ts` (safe
fail-open coordination), integrate server login and successful reset; run focused
and all five required checks; review scope/contracts; update documentation and
commit locally with aligned versions. No shared provider, push or fixed-port server.

### AC02 verification and release limits — 2026-10-12

| Scenarios | Local regression evidence |
| --- | --- |
| 01, 02, 04 and deployed contract | `signInLimit.test.ts`: DEF-033 first failed with twelve 401s/twelve reads; now ten 401s then 429; all four routes, exact lock expiry, rounded seconds/singular minutes, normalized aliases, unchanged 200/400/401 |
| 03, 05, 06, 07 | Same HTTP suite: unknown/disabled/known equality, other-account success, success reset, invalid/failed reset does not unlock, successful recovery unlocks, rolling-window boundary |
| 08 | HTTP: 24 overlapping requests/two servers/shared memory yield ten 401s, fourteen 429s and ten user reads; disconnected capacity wait makes no subsequent user read. `signInAttemptRepository.test.ts`: memory and Mongo CAS doubles reserve ten out of thirty; crash expiry, cancellation, stale/duplicate completion and TTL delete/recreate protection |
| 09, 10 | HTTP and adapter tests: unavailable auth remains 503 without counting; reserve/complete/clear rejections and hangs plus collection read/insert/replace/index failures fail open with fixed safe logs; completed recovery still returns 204 if clear stalls; late reservation cleanup and aborted clear preserve newer state; hashed records, majority CAS, Date TTL, retry after initialization failure, isolated/shared/hosted factory selection |

Required checks pass locally: `npm run api:test` (1,097 tests / 48 files),
`npm run verify:journeys` (6), `npm run api:build`, `npm run app:test`
(273 tests / 35 files), `npm run app:build:pages`. New focused coverage: 42 cases.
An initial API compile found generic union inference; the explicit reservation
result type fixed it and the required build passed. Three focused test fixture
errors (a probe retained its pending slot; a hashed address used a different
document) were corrected without changing production transitions. Existing
frontend stylesheet budgets, test-setup compilation and jsdom scrollTo warnings
remain. The concurrent lead commit ff23981 and its frontend work are preserved.

Independent review identified disconnect polling, stalled store calls, stale-clock
Retry-After and post-timeout operation races. Each received a failing regression
before correction: capacity waits now cancel, deadlines abort repository stages,
late reservation tickets are released and clears cannot retry after cancellation,
and lock timing is computed after reading storage. Final review and verification
are recorded with the delivery commit below.

No shared Sheets/Mongo/Mux/GitHub/Brevo probes, mail sends, deployment or push.
Real Mongo majority durability/TTL permissions/concurrency, hosted user-store
quotas, distributed clock skew and deployed browser messages remain release
checks. Store outage bypasses protection by the selected policy; a failed or
crashed clear after a committed Sheets password reset can leave the old lock
until expiry. Outstanding requests on crashed workers occupy capacity until
their 15-minute tickets expire. Account lockout by someone who knows an email
is the accepted cost. INV-014 signup and AC05 per-client/confirmation limits
remain open. No outside-file change is needed.

Mongo design references: [single-document atomicity and expected-value filters](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)
and [absolute Date TTL and asynchronous cleanup](https://www.mongodb.com/docs/manual/core/index-ttl/).
The installed Node driver supports [operation timeouts](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/csot/).

Final independent review: no Important findings remain; 42 focused cases pass,
including delayed reservation and delayed clear after a storage timeout. AC02 is
Done locally in implementation `4199948` (0.1.160), 2026-10-12; this delivery
record bumps the aligned version again for the hook. DEF-033 is Fixed locally. AC05 and hosted
release verification remain open. No outside-file change is needed.
