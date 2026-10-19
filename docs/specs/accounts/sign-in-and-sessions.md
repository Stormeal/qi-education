# Sign-in and sessions

## Purpose

Anyone can create a student account; everyone signs in with email and password and stays
signed in across page loads.

## Behavior

- **Signup** creates a `student` account. Display name 2–120 characters; email is trimmed and
  lower-cased; password at least 8 characters with one capital letter and one number. One account
  per normalized email (duplicate signup answers 409).
- **Login** answers a signed session token (12-hour lifetime) and the user. A wrong password, an
  unknown address and a disabled account all get the same generic 401.
- **Remember me** stores the session in `localStorage`; otherwise `sessionStorage`. Logout clears both.
- **Opening the app** renders from the stored session at once. `GET /auth/me` runs in the
  background: same user and permissions → nothing changes; changed → state is reset and reloaded;
  401 → signed out with "Please log in again."; any other failure → the session is kept.
  A stored token whose own expiry has passed is cleared without a request.
- **Every protected request** re-reads the account, so a role change or a disabled account takes
  effect on the next request without a new token.
- **Sign-in limit**: ten failed attempts for one address within 15 minutes lock that address for
  15 minutes (429 `too-many-attempts`, with `Retry-After`). Success clears the count; a completed
  password reset lifts the lock. If the attempt store fails, login still works (fail-open, warning logged).
- **Per-client limit** (US-P008): one network address may send at most 20 valid signups per
  clock hour. A client is the first `x-forwarded-for` entry on the hosted API (set by Vercel) and
  the connection address elsewhere; only a hash of address and purpose is stored, in
  `<collection>_client_limits`, and it deletes itself after the hour. Over the limit: 429
  `too-many-requests` with `Retry-After` and "Too many requests from your network. Try again in N
  minutes." It is checked after the body validates and before any account lookup or write. If the
  limit store fails, the request goes ahead (fail-open, warning logged).
- **Read-only accounts**: during a store maintenance freeze (`USER_STORE_READ_ONLY=1`) signup,
  enrollment, password changes and admin account changes answer 503 with a maintenance message;
  sign-in keeps working.
- **No demo accounts in production**: hosted runs without a configured user store answer 503
  on auth routes instead of falling back to demo users.

## Code

- API: `auth.ts` (schemas, scrypt hashing, token), `authRepository.ts`, `mongoAuthRepository.ts`,
  `authStore.ts`, `signInLimit.ts`, `signInAttemptRepository.ts`, `clientLimit.ts`; routes in `server.ts`
  (`/auth/login`, `/auth/signup`, `/auth/me`, also without `/auth`).
- App: `pages/login-page/`, `services/auth.service.ts`, `services/session.service.ts`,
  session start-up in `AppStateService.restoreStoredSession`.

## Limits

- Sign-in has no per-client limit, only the per-address one.
- Existing sessions survive a password change until their token expires.
- Email addresses are not confirmed at signup (US-L014).
