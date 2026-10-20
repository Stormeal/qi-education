# Passwords and account email

## Purpose

People who forget their password can reset it by email; signed-in people can change it.
Both send a notice so the owner hears about the change.

## Behavior

- **Request a reset** (`POST /auth/password-reset/request`): always answers 202 whether or not
  the account exists. A real active account gets a mail with a single-use link
  (`/reset-password#token=…`) valid for 60 minutes.
- **Check and confirm** (`/check`, `/confirm`): an invalid, used or expired link answers 410
  `reset-link-invalid`. Confirming applies the signup password policy, sets the new password,
  cancels every other open link for that account and sends a "password changed" notice.
- **Mail limit**: at most three reset mails per account per rolling hour, counted across API
  instances. Failed or uncertain sends still use up their slot.
- **Per-client limit** (US-P008): one network address may send at most 10 valid reset requests per
  clock hour. A client is the first `x-forwarded-for` entry on the hosted API (set by Vercel) and
  the connection address elsewhere; only a hash of address and purpose is stored, in
  `<collection>_client_limits`, and it deletes itself after the hour. Over the limit: 429
  `too-many-requests` with `Retry-After` and "Too many requests from your network. Try again in N
  minutes." It is checked after the body validates and before any account lookup, so the answer is the same
  whether or not the account exists. If the
  limit store fails, the request goes ahead (fail-open, warning logged).
- **Change password** (`POST /users/me/password`, every role): checks the current password first
  (wrong answers 400 `current-password-incorrect`, never 401), then the policy and that the new
  password differs. On success (204) unused reset links are cancelled and a notice is sent;
  a failed notice does not fail the change.
- **Admins** can send an ordinary reset link to another account (see [admin/users](../admin/users.md)).
  It shares the same three-mail limit.
- **Email confirmation** (US-L014): the signup mail links to `/confirm-email#token=…`, valid
  24 hours and once. Opening it confirms without sign-in (`POST /auth/email-confirmation/confirm`,
  204; unknown, expired, used or disabled: 410 `confirm-link-invalid`) and the page offers a new
  link. Signed in, **Send a new link** (`POST /auth/email-confirmation/resend`) answers 202, or 204
  when already confirmed. At most three confirmation mails per account per rolling hour (the
  signup mail counts; 429 `too-many-requests` with the minutes to wait) and 10 resend requests per
  network per hour. Only token hashes are stored, in `<collection>_email_confirmations`.
- **Mail delivery**: Brevo when hosted (production or a Vercel marker); locally and in tests the
  complete message is printed to the API's console instead. A hosted API never prints mail; missing
  hosted mail settings make reset requests answer 503 (DEF-048).
- A reset link that was claimed before a password change cannot overwrite the newer password: the
  final write checks the current credential and the reset is refused (DEF-047). A storage outage
  during reset request, check or confirm answers the retryable 503 (DEF-053).

## Rules

- Only SHA-256 hashes of reset tokens are stored. Tokens, passwords and provider details never
  appear in responses or logs.
- A link issued before a password change is refused after it (credential fingerprint check).

## Code

- API: `passwordResetRoutes.ts`, `passwordResetDelivery.ts`, `passwordResetRepository.ts`,
  `clientLimit.ts`, `clientLimitRepository.ts`,
  `changePasswordRoutes.ts`, `mailSender.ts`.
- App: `pages/password-reset-page/`, `pages/confirm-email-page/`, the password section of `pages/profile-page/`.
- Settings: `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `APP_PUBLIC_URL`.

## Limits

- The admin reset link is not limited per client (admins only).
- No current-password attempt limit on password change.
