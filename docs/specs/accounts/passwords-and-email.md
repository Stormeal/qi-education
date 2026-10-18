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
- **Change password** (`POST /users/me/password`, every role): checks the current password first
  (wrong answers 400 `current-password-incorrect`, never 401), then the policy and that the new
  password differs. On success (204) unused reset links are cancelled and a notice is sent;
  a failed notice does not fail the change.
- **Admins** can send an ordinary reset link to another account (see [admin/users](../admin/users.md)).
  It shares the same three-mail limit.
- **Mail delivery**: Brevo in production; locally and in tests the complete message is printed to
  the API's console instead. Missing production mail settings make reset requests answer 503.

## Rules

- Only SHA-256 hashes of reset tokens are stored. Tokens, passwords and provider details never
  appear in responses or logs.
- A link issued before a password change is refused after it (credential fingerprint check).

## Code

- API: `passwordResetRoutes.ts`, `passwordResetDelivery.ts`, `passwordResetRepository.ts`,
  `changePasswordRoutes.ts`, `mailSender.ts`.
- App: `pages/password-reset-page/`, the password section of `pages/profile-page/`.
- Settings: `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `APP_PUBLIC_URL`.

## Limits

- No per-client or confirmation-mail limits yet (US-P008-AC05).
- No current-password attempt limit on password change.
