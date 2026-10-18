# Account email and password reset — Codex handoff (API and storage)

Assigned 2026-10-11 by Claude Code (lead). Items: US-P009 (send account email), the API side
of US-L004 (forgot password) and US-P008-AC05 (limit reset mail). Runs in parallel with
Claude's frontend part (forgot-password form on the login page, reset page) under `app/` in
this same working tree. Read `AGENTS.md` (including "Two agents in one working tree") first.

## Decisions

By Alex, 2026-10-11: automated reset by email; Brevo's free plan; no own domain; the sender
address is `xqiacademy@gmail.com`. Mail from it may be filed as spam; that is accepted for
the proof of concept and checked by Alex in a real delivery test after deployment.

By the lead (record in the specs as "confirm or change"):

- The reset link is valid for 60 minutes and for one use. Requesting a new link does not
  have to cancel older unused ones.
- The token is random (at least 32 bytes), stored only as a hash, per user, in MongoDB in
  production and in memory locally and in tests, following the instructor profile
  repository. It is never written to the users spreadsheet, a log or an error response.
- The new password follows the signup rules and is hashed as signup hashes it. It is
  written to the user store through a new `AuthRepository` method implemented for Google
  Sheets and memory; the unavailable repository keeps failing closed.
- US-P008-AC05: at most 3 reset mails per account per rolling hour, counted from the stored
  tokens so that it holds across API instances. Further requests get the same 202 and send
  nothing. A limit per client address is not built now; record it as open.
- A browser that is already signed in stays signed in after a reset (signed tokens). Known
  limit, recorded in US-L004; do not build session revocation.

## Scope

Write `docs/specs/US-P009-account-email.md` and `docs/specs/US-L004-password-reset.md`
first. Then deliver the mail sender, the reset API and the limit. Claude delivers all of the
frontend against the contract below.

## Mail sender (US-P009)

One interface, injectable through `createServer` dependencies like the GitHub feedback
service, with:

- A Brevo implementation that calls `POST https://api.brevo.com/v3/smtp/email` with `fetch`
  (header `api-key`, JSON `sender`, `to`, `subject`, `textContent`). No new dependency.
  Confirm the request shape against Brevo's current API reference before relying on it, and
  note in the spec what you confirmed and what you could not.
- A local implementation that only records the message. Outside production it also prints
  the complete message, link included, to standard output, so the lead can follow a reset
  link in a local browser check. Tests never call Brevo.
- Production without mail settings does not pretend to send: the sender reports
  "not configured" and the reset request route answers 503.

Settings, added to `api/src/config.ts` (all optional there):

| Name | Meaning |
| --- | --- |
| `BREVO_API_KEY` | Brevo API key |
| `MAIL_FROM_ADDRESS` | Sender address |
| `MAIL_FROM_NAME` | Sender name, default `QI-Education` |
| `APP_PUBLIC_URL` | Public address of the frontend without a trailing slash, for links in mail |

Mail is "configured" when the first, second and fourth are present. `GET /health/config`
gains `mail: { configured: boolean, provider: 'brevo' | 'local' }`; nothing else in that
response changes and no key or address is shown.

## Contract Claude's frontend is built against (do not change without recording it)

All new routes; no existing route, response or status code changes. Errors are `{ message }`.

`POST /auth/password-reset/request` — public. Body `{ "email": string }`.

- 202 `{ "message": "If an account exists for this address, we have sent a reset link." }`
  for every well-formed address: existing, unknown, inactive, or over the limit.
- 400 `{ message }` when the body has no well-formed email address.
- 503 `{ "message": "We could not send email right now. Please try again later." }` when
  mail is not configured, or the provider refused or could not be reached. In that case no
  usable token is left behind. Record in the spec that a provider failure answers 503 only
  for an existing account, which is a rare existence signal the lead accepted.
- The mail: plain text, subject `Reset your QI-Education password`, with the link
  `<APP_PUBLIC_URL>/reset-password#token=<token>` and the 60 minutes stated. The token is in
  the fragment so that it is not sent to any server when the page is opened.

`POST /auth/password-reset/check` — public. Body `{ "token": string }`.

- 204 when the token is valid and unused. Checking does not use the token up.
- 410 `{ "message": "This reset link is no longer valid. Request a new one.", "code": "reset-link-invalid" }`
  when it is unknown, expired, used or malformed.

`POST /auth/password-reset/confirm` — public. Body `{ "token": string, "password": string }`.

- 204 when the password was changed. The token is used up in the same step, so two
  simultaneous confirms change the password at most once.
- 400 `{ message }` with the signup rule's own message when the password breaks the rules;
  the token stays usable.
- 410 as above for an invalid token.
- After a change, a notice goes to the account's address: subject
  `Your QI-Education password was changed`, no password and no link. A notice that cannot
  be sent does not undo or fail the change.
- Signing in with the new password works and with the old one does not; the existing
  `/auth/login` route is not changed.

`Cache-Control: no-store` on all three.

Tests must cover: every status above; an unknown address sends nothing and stores nothing;
the fourth request within an hour sends nothing; expiry at 60 minutes with an injected
clock; single use, including two simultaneous confirms; the stored value is not the token;
no token in any log line or error body; the Sheets and memory implementations of the
password update; the health field; production without settings.

## Requirements

- A push deploys the API before the frontend, and before Alex has added the settings in
  Vercel. Until then the request route answers 503 and everything else works as today.
- Never send real mail and never call Brevo from a test or a local run.
- Reproduce any existing behavior you find broken as a defect before fixing it.

## Files

Yours: `api/src/**`, `docs/specs/US-P009-account-email.md`,
`docs/specs/US-L004-password-reset.md`, `docs/user_stories.md`, `docs/architecture.md`,
`docs/local_development.md` (the new settings), your row in `docs/work_queue.md`, and the
version lines the commit hook requires (`package.json`, `app/package.json`,
`package-lock.json`, the `appVersion` line of `app/src/app/services/app-state.service.ts`).
`docs/defect_management.md`: append only, as bytes (the file is not valid UTF-8).

Not yours (Claude is editing them now): everything else under `app/`, including the rest of
`app/src/app/services/app-state.service.ts`, `CLAUDE.md`, `docs/handoffs/**`.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset, restore or check out changes you did not make. Read the version from
`package.json` right before committing; the later committer bumps again. Isolated in-memory
stores and stubs only: never the shared spreadsheet, MongoDB, Mux, GitHub or Brevo. No
servers on ports 3001 or 4200. Run `npm run api:test`, `npm run verify:journeys`,
`npm run api:build`, `npm run app:test` and `npm run app:build:pages`. A frontend failure
caused by Claude's unfinished files under `app/` is reported, not fixed, and does not block
your commit. If you need a file outside your list, do NOT stop: finish and commit everything
that does not depend on it, then describe the exact change you need in your queue row. Do
not push. Update your queue row with your commits, what you verified and what you could
not, then stop and summarize, starting with your commit ID.
