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
