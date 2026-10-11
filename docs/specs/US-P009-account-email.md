# US-P009: Account email

## Record and outcome

- Selected 2026-10-11; API increment implemented locally, delivery hash pending, owner Codex, main/base be57a77.
- Spec written before implementation; [handoff](../handoffs/account-email-password-reset-codex.md).
- Related defects: none reproduced; new feature, not a defect repair.
- Alex chose Brevo without a domain, sender xqiacademy@gmail.com; spam risk is
  accepted for the proof of concept and Alex owns the real delivery check.

One injectable sender lets password recovery send plain-text account messages
without coupling routes to Brevo. No dependency, real mail, deployment or other
account features are included. Claude owns the frontend.

## Decisions (confirm or change)

Lead decisions: fetch to Brevo's transactional email endpoint; API key header;
plain-text body; local recording/complete stdout message outside production;
production without settings fails closed. Keys, recipient data, provider errors,
passwords and reset tokens never enter diagnostic logs/error responses. The
explicit local mail stdout display is the handoff's deliberate exception for
following a local reset link; it is never used in production.

Settings: optional BREVO_API_KEY, MAIL_FROM_ADDRESS, APP_PUBLIC_URL; MAIL_FROM_NAME
defaults to QI-Education. Credential configuration requires key, sender and app URL.
GET /health/config adds only mail `{ configured, provider: "brevo" | "local" }`;
configured describes those settings, with no values disclosed. Outside production
the factory always selects local even if real credentials exist. A local sender
can record/print without credentials, using a loopback app URL fallback. Production
selects Brevo only with complete settings, otherwise an unavailable sender.

## Contract and scenarios

```gherkin
Feature: Account email
  Scenario: US-P009-AC01 Send a message
    Given a configured production sender
    When a feature sends recipient, subject and text
    Then fetch posts sender, to, subject and textContent to Brevo
    And accepted or refused delivery is reported without provider details
  Scenario: US-P009-AC02 Keep tests and local runs isolated
    Given a test or local process even with real settings
    When a feature sends mail
    Then only the local message record and deliberate local stdout are used
    And production never prints a message
  Scenario: US-P009-AC03 Fail privately
    Given missing production settings or a failed/timeout/refused fetch
    When a reset mail is requested
    Then the API returns its safe 503 and leaves no usable token
    And keys, passwords and tokens are not logged or returned
  Scenario: US-P009-AC04 Report configuration
    Given complete or incomplete settings
    When configuration health is read
    Then only configured/provider are added and existing fields stay unchanged
```

## Current Brevo reference check

Checked 2026-10-11 against the official
[endpoint reference](https://developers.brevo.com/reference/send-transac-email)
and [transactional guide](https://developers.brevo.com/docs/send-a-transactional-email).
Confirmed POST /v3/smtp/email, api-key header, sender email/name, to recipient array,
subject and textContent, and 201 acceptance. The guide explicitly allows one of
htmlContent, textContent or templateId and gives a plain-text-only curl example.
Its plain-text guidance includes password resets. The reference's htmlContent
paragraph inconsistently calls HTML required without a template; the explicit
guide example confirms the handoff's textContent-only shape. Real API acceptance,
sender verification, spam placement and
mailbox delivery are unverified and must be checked by Alex after deployment.
No API request or real email was used to resolve that documentation inconsistency.

## Plan and verification

Plan lives in the owned spec; implement inline in the requested shared checkout.
- [x] Spec first and own queue row selected.
- [x] Test-first mail sender request/config/failure/local tests with stub fetch/stdout.
- [x] Add config and mailSender.ts; inject through createServer and add health field.
- [x] Deliver [password reset](US-L004-password-reset.md) using this interface.
- [x] All five checks, read-only review, architecture/local settings/backlog/queue.
- [x] Fresh aligned version bump and scoped staging; local commit/delivery hash record follows.

| Scenario | Evidence | Result |
| --- | --- | --- |
| P009-AC01..04 | Stub-fetch sender/factory and isolated HTTP health/error tests | Pass |

Required checks: api:test, verify:journeys, api:build, app:test, app:build:pages.
No real provider, hosted/browser, spam or delivery claim; no push authorized.

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
