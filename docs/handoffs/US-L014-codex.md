# US-L014 email confirmation at signup — Codex handoff

Assigned 2026-10-19 by Claude Code (lead). Story, decisions and scenarios US-L014-AC01..AC03:
[user_stories.md, US-L014](../user_stories.md). Read `AGENTS.md` (shared-tree rules) first. Claude
builds the app side in this same working tree at the same time.

## Codex scope: the API

1. **Flag.** `AuthUser` gains optional `emailConfirmed?: boolean`. New signups store `false`.
   A missing value means confirmed, so existing accounts (memory demo users and MongoDB) need no
   migration. Every response that returns the signed-in user (signup, login, `/me` / `/auth/me`)
   includes `emailConfirmed: boolean`, `true` when the stored value is missing.
2. **Tokens.** Like password reset: 32 random bytes, base64url, only the SHA-256 hash stored,
   valid 24 hours, single use. Storage: memory when isolated, MongoDB
   `<MONGODB_COURSE_CONTENT_COLLECTION>_email_confirmations` in shared/hosted mode. At most three
   mails per account per rolling hour, counted across instances; failed or uncertain sends count.
   Reuse or generalize the password-reset repository and `sendPasswordResetLink` pattern rather
   than writing a second one from scratch, without changing reset behavior.
3. **Signup mail.** After a successful signup, send "Confirm your QI Academy email address" with
   `${APP_PUBLIC_URL}/confirm-email#token=<token>` and "This link works for 24 hours." A failed
   send must not fail the signup (still 201 with the same body).
4. **`POST /auth/email-confirmation/confirm`** `{ token }`, no sign-in needed: 204 and the account
   becomes confirmed. Unknown, expired or used token, or a disabled account: 410
   `{ message: 'This confirmation link is no longer valid. Request a new one.', code: 'confirm-link-invalid' }`.
   A malformed token is also 410. Storage failure: the existing 503 handling.
5. **`POST /auth/email-confirmation/resend`**, Bearer required: already confirmed → 204, no mail.
   Otherwise the per-network limit first (`ClientLimit` purpose `confirmation`, 10 per hour, same
   429 body as US-P008), then the per-account limit: over three mails →
   429 `{ message: 'You have asked for several links in a short time. Try again in N minutes.', code: 'too-many-requests' }`
   with `Retry-After`. Mail settings missing or the send fails → 503 with the reset route's
   "We could not send email right now. Please try again later." Sent → 202
   `{ message: 'We have sent a new link to <email>. It works for 24 hours.' }`.
6. A read-only account freeze (`USER_STORE_READ_ONLY=1`) refuses confirm with the existing 503
   maintenance answer.

Tests (in-process, isolated): signup stores unconfirmed and sends one mail with a working link;
signup still succeeds when mail fails; confirm 204 then 410 on reuse; expired after 24 hours;
disabled account 410; existing account without the flag reports `emailConfirmed: true`; resend
202 / 204 when confirmed / 429 on the fourth mail in an hour with `Retry-After`; per-network 429;
only hashes stored; the Mongo repository against a double, including parallel resends not
exceeding three. `verify:journeys` must keep passing.

Done when `npm run api:test`, `npm run api:build` and `npm run verify:journeys` pass.

## Contract Claude's side relies on

- User objects from signup, login and `/me` carry `emailConfirmed: boolean`.
- Confirm: 204 | 410 `confirm-link-invalid` | 503, each non-204 with `{ message }` as final text.
- Resend (Bearer): 202 `{ message }` | 204 | 429 `{ message, code: 'too-many-requests' }` | 503
  `{ message }`; messages are final user-facing text.
- Paths exactly `/auth/email-confirmation/confirm` and `/auth/email-confirmation/resend`; link
  path `/confirm-email#token=…`.

## Files Claude owns (do not edit)

`app/**` (except the version line), `docs/**` except your row in `docs/work_queue.md`,
`scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`. If you need one of these, finish everything
else first, then name the exact file and line in your summary instead of stopping.
