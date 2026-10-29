# US-P020: Signup hardening — bot defense and a confirm-to-enroll gate

Designed with Alex on 2026-10-28 (brainstorming). Builds on the existing sign-in, client-limit and
email-confirmation infrastructure: [sign-in and sessions](../specs/accounts/sign-in-and-sessions.md),
[passwords and email](../specs/accounts/passwords-and-email.md).

## Why

Anyone can register, so the platform is open to scripted/mass fake signups (spam accounts, skewed
numbers, throwaway-address noise). We defend against that threat with two prongs:

- **(a)** a human check at signup so an automated flood can't create accounts, and
- **(b)** a confirm-to-enroll gate so any account that still slips through with a fake address is
  worthless until its email is confirmed.

Chosen threat (Alex, 2026-10-28): **bot / mass fake signups**. Not credential stuffing, not
breached-password checks, not invite-only R1 gating — those stay as their own backlog rows
(US-P021+ and the sign-in/credential items).

## Already in place (not part of this story)

Re-grounded on current `main` (0.1.503): these exist and are out of scope here.

- HTTP security headers (`x-powered-by` off; `nosniff`, `Referrer-Policy: no-referrer`,
  `X-Frame-Options: DENY`) — set on every response, covered by `api/src/securityHeaders.test.ts`.
- Per-client signup cap (20 valid signups / clock hour / network) and per-address sign-in lockout
  (10 fails / 15 min) — `clientLimit.ts`, `signInLimit.ts`.
- Password policy (≥8 chars, one capital, one number) and generic 401 on bad sign-in.
- Email confirmation flow end to end (link, resend, 24h single-use token) — US-L014. Today
  "confirming unlocks nothing yet"; this story gives confirmation a job.

## Release

Suggested **release 1** (internal, mid-December 2026) — confirm or change. The design is
backward-compatible and safe to land before the Cloudflare keys exist (see Rollout), so the release
assignment does not block the merge.

## Prong (a): Cloudflare Turnstile at signup

Mechanism: **Cloudflare Turnstile** (Alex). Free, no puzzle for most users, privacy-friendly (helps
the R2 GDPR story). Not reCAPTCHA (Google data transfer) or a honeypot-only scheme.

### API

- New `api/src/turnstileService.ts`, modeled on `muxService.ts`:
  - `interface TurnstileVerifier { readonly configured: boolean; verify(token: string | undefined, remoteIp?: string): Promise<boolean>; }`
  - `CloudflareTurnstileVerifier` — POSTs `{ secret, response: token, remoteip }` to
    `https://challenges.cloudflare.com/turnstile/v0/siteverify`, returns `result.success`. An
    empty/missing token returns `false` with no network call. A network or 5xx failure from
    Cloudflare returns `false` — **fail-closed**: a bot defence that can't verify rejects. (This is
    the opposite of the rate-limiters, which fail-open so a store outage never blocks real users.)
    Failures are logged without the token value.
  - `NullTurnstileVerifier` — `configured = false`, `verify()` always returns `true`. Selected in
    isolated/test mode so Vitest, `verify:journeys` and the 3001/4200 browser checks never reach
    Cloudflare and need no keys.
  - `createTurnstileVerifier()` returns the Cloudflare impl when `apiConfig.mode !== 'isolated'` and
    `hasTurnstileConfig()`, else the null verifier. Injected into `createServer` as
    `turnstileVerifier`, so tests can pass a stub.
- Config (`config.ts`): add `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` as
  `z.string().min(1).optional()`; `hasTurnstileConfig()` = both present. Add the pair to the
  `/^(GOOGLE_|MONGODB_|…)/` strip list so isolated mode clears them. The site key is public (it
  ships to the browser); it lives here so one place owns the pair.
- Signup handler (`POST /auth/signup`, `/signup`): add `turnstileToken: z.string().min(1).optional()`
  to `signupSchema`. **After** `signupSchema.parse` and **before** `clientLimit.allow('signup', …)`:

  ```
  if (turnstile.configured && !(await turnstile.verify(input.turnstileToken, clientAddress))) {
    response.status(400).json({ message: 'human-check-failed' });
    return;
  }
  ```

  (`clientAddress` is the caller's network address, derived the same way `clientLimit` already does
  it — first `x-forwarded-for` entry on the hosted API, the connection address elsewhere; it is the
  optional `remoteip` Turnstile accepts, so passing nothing is acceptable if no helper is exposed.)

  Order: cheap local body validation first, then the bot check (before spending the per-client
  budget or touching the account store), then the existing client-limit and duplicate logic
  unchanged. When the verifier is not configured (`configured === false`) signup behaves exactly as
  today — which is also the isolated/test path.

### Frontend

- Site-key delivery is **runtime, not build-time** (the app is one static Pages build against a
  hosted API). Extend `/health/config` with `turnstile: { configured: boolean, siteKey: string | null }`.
  Add a cached `getPublicConfig()` to `ApiClientService` (one memoized fetch).
- Signup form lives in the presentational `login-page` component; the route owns state;
  `auth.service.signup()` POSTs to `/signup`.
  - Load `https://challenges.cloudflare.com/turnstile/v0/api.js` lazily, only when
    `authMode === 'signup'` **and** a site key is present. No key → no script, no widget.
  - Render the widget in the signup form; on solve, store the token in a `turnstileToken` signal and
    include it as `turnstileToken` on `SignupRequest` (app.models).
  - `canSignupSubmit` gains one clause: with a site key present, submit stays disabled until a token
    exists; with no key the clause is vacuous and submit works as today.
  - Reset the widget after any failed signup (Turnstile tokens are single-use) so a retry gets a
    fresh token.
- Graceful degradation: if `getPublicConfig()` fails, treat it as "no site key" — signup still
  works. This matches the backend's "null verifier → skip," so both ends agree: either both enforce
  or neither does.
- The widget placement, spacing and error copy are a real `app/` UI change: load the
  `design-taste-frontend` skill before touching the form.

## Prong (b): confirm-to-enroll gate

Until a new account confirms its email, it may sign in and browse but **cannot enroll** (free or
paid) (Alex). Not "cannot sign in" (locks real users out of their own resend) and not merely an
expiry sweep.

- Shared rule `requireConfirmedEmail(user)`: `user.emailConfirmed !== false`. Only accounts that
  explicitly carry `emailConfirmed: false` are gated; `undefined` (pre-2026-10-19, grandfathered)
  and `true` pass. No repository change — `emailConfirmed` already exists and flips via the existing
  `confirmEmail` flow.
- Enforced at **two doors**, each at the *start* of the flow:
  1. Free / self-serve enroll — `POST /users/me/courses/:id` (server.ts): insert after the
     `published` check and after the org `startCourse` branch, before the free-enroll write. An
     unconfirmed **org member** must still get org courses (that path is already confirmation-driven
     via `activatePendingMembership`), so the gate sits below the org branch and blocks only plain
     student self-enroll.
  2. Paid checkout start — `POST /users/me/courses/:id/checkout` (paymentRoutes.ts): after
     `authenticate`/course lookup, before `createCheckout`. No point sending someone to Stripe if
     they can't enroll on return.
- **Do not** gate `checkout/confirm` (the Stripe return): if money was taken, enroll them. The gate
  is at the entrance, never after payment.
- Response contract: blocked requests answer **`403 { message: 'email-not-confirmed' }`**. 403 (not
  402/401) because the user is authenticated and the course may be free — the refusal is about
  account state, and the code lets the frontend show the right prompt. No new routes, so
  `routePermissions.test.ts` is unchanged.

### Frontend

- `AppStateService.mustConfirmEmail = loginState()?.user.emailConfirmed === false`
  (`undefined` → confirmed, matching the backend).
- Pre-emptive UX (don't make them click into a 403): on the course-details enroll/buy control, when
  `mustConfirmEmail()`, show an inline notice — "Confirm your email to enroll" — with a **Resend
  confirmation link** action wired to the existing `auth.service.resendEmailConfirmation()` (US-L014;
  reuse, no new endpoint). The enroll/buy button is disabled while unconfirmed; the "Buy" button
  shows the same notice instead of starting checkout.
- Defensive fallback: if the server still answers `403 email-not-confirmed` (state went stale),
  `enrollInCourse()` and the checkout starter map that code to the same confirm-first message in
  `courseEnrollmentError` + resend, rather than the generic enrollment-failed text. The server stays
  the real gate; the UI is the convenience.
- Scope boundary: nothing changes for already-enrolled courses, confirmed users, or org members. The
  learning page, library and progress are untouched — the gate is strictly on *acquiring* a course,
  not consuming one already held.

## Testing

### Backend delivery (Codex, 2026-10-29)

API Tasks 1–4 are implemented on `main` (`5c92bb8`, `3fffe4a`, `1390473`, `083edf6`).
Frontend Tasks 5–7 and browser verification remain open; keep this contract until those ship.

| Contract area | Regression evidence |
| --- | --- |
| API-01 verifier/config/isolation | `turnstileService.test.ts` (12 tests) |
| API-02 signup aliases, validation and budget order | `signupHardeningRoutes.test.ts` |
| API-03 public key/config, no secret | `signupHardeningRoutes.test.ts` |
| API-04 free/paid gate and exceptions | `enrollmentConfirmation.test.ts`, updated email-confirmation test |

Each new behavior was observed failing before implementation. API: 2,878/2,878; release journeys:
20/20; API build passed. No shared-service mutations. Optional provider `remoteip` is omitted;
verification has a ten-second timeout and a 2,048-character token limit. Already-held enrollment
remains idempotent. Live Turnstile and combined frontend/API behavior remain unverified.

- Isolated/test mode uses `NullTurnstileVerifier` (always pass); tests inject a stub returning
  `false`/`true` to assert reject/pass — no network mocking.
- API (`api/src/**`): signup with configured verifier + missing/invalid token → `400
  human-check-failed`, no account created, client-limit budget untouched; valid token → 201;
  unconfigured verifier → 201 without a token. Verifier unit: `success:false` → false; network/5xx →
  false (fail-closed); empty token → false with no fetch. Enroll gate: `emailConfirmed:false` → `403
  email-not-confirmed` on both doors; `undefined` and `true` proceed; unconfirmed org member via
  `startCourse` still enrolls. `/health/config` exposes `turnstile.configured` + `siteKey`.
- Frontend (`app/`): clear `localStorage`/`sessionStorage` in `beforeEach` (CI isolation). Do not
  `vi.mock` the Cloudflare script at module level (the CI gotcha) — give the component a replaceable
  loader. Assert: widget hidden with no site key; submit disabled until token when a key exists;
  `mustConfirmEmail` drives the enroll/buy notice; a `403 email-not-confirmed` maps to the
  confirm-first message + resend.

## Rollout and config

- Backward-compatible: null verifier = today's behavior, so API-before-frontend deploy ordering is
  safe.
- Alex adds to Vercel (hosted only): `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` from a free
  Cloudflare Turnstile widget; picked up on the next push. Until set, production runs the null
  verifier — signup open, `/health/config` showing `turnstile.configured: false` — so the deploy is
  safe to land before the keys exist (the phased fallback is built in).
- Read-only maintenance freeze (`USER_STORE_READ_ONLY=1`) still 503s signup/enroll upstream of the
  new checks (the existing account-write guard in `server.ts`), unchanged — the freeze wins.
- `/auth/me` keeps returning `emailConfirmed`, so the gate stays correct across devices and reloads.
- Release note (plain, at push): "New accounts now pass a quick human check at sign-up and confirm
  their email before enrolling."

## Open decisions (confirm or change)

- Release assignment: suggested R1 (above).
- Production-without-Turnstile behavior: signup stays **open** (null verifier skips), with
  `/health/config` surfacing `turnstile.configured: false` — recommended over a hard 503, matching
  the platform's fail-soft posture. Change to a hard block if bot defence must be mandatory in prod.

## Codex split (at implementation)

- Codex (`api/src/**`): `turnstileService.ts`, `config.ts`, the signup verify step and
  `signupSchema`, the enroll-gate on both doors, `/health/config` `turnstile` section, API tests.
- Claude (`app/`): `getPublicConfig()` on `ApiClientService`, the widget on the signup form,
  `SignupRequest`/user-model wiring, `mustConfirmEmail` and the enroll/buy notice + resend, frontend
  tests. Trace: `app.models.ts` (`SignupRequest`, `emailConfirmed`), `login-page` component + its
  route, `app-state.service.ts` (`enrollInCourse`, `mustConfirmEmail`), the course-details enroll/buy
  surface and the checkout starter.
