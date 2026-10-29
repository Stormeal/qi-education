# US-P020 Signup Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Defend signup against bot/mass fake accounts with a Cloudflare Turnstile human check, and make unconfirmed accounts unable to enroll until they confirm their email.

**Architecture:** An injected `TurnstileVerifier` (Cloudflare impl in prod, null/always-pass in isolated+test) is called in the signup handler before the client-limit and account write. A shared `requireConfirmedEmail` rule gates both enrollment doors with `403 email-not-confirmed`. The frontend reads a runtime site key from `/health/config`, renders the widget only when present, and shows a confirm-first notice on enroll/buy — both ends degrade to today's behavior when Turnstile is unconfigured.

**Tech Stack:** Express + Zod + Vitest (api), Angular signals + Vitest (app), Cloudflare Turnstile.

**Spec:** [docs/stories/US-P020-signup-hardening.md](../../stories/US-P020-signup-hardening.md)

## Global Constraints

- Node/Express API and Angular 17+ signals app; follow existing file patterns.
- **Every commit bumps the patch version** (pre-commit hook): set the same value in `package.json`, `app/package.json`, all three `"version"` lines in `package-lock.json`, and `appVersion` in `app/src/app/services/app-state.service.ts`. Current value after the contract commit: **0.1.504** → next commit 0.1.505, and so on. Do not edit the historical entries in `release-notes.ts`.
- **Shared tree with Codex:** stage own files by path, never `git add -A`; never touch the other agent's files. API tasks (1–4) are Codex-owned (`api/src/**`); app tasks (5–7) are Claude-owned (`app/`). Root `package.json`/`package-lock.json` are shared — whoever commits later re-bumps.
- Isolated/test mode must never reach Cloudflare: the null verifier is selected when `apiConfig.mode === 'isolated'`.
- Turnstile is free; no paid dependency. Site key is public; secret key is server-only.
- A new API route would need a `routePermissions.test.ts` entry — **this plan adds no new routes**, so that table stays untouched.
- Message strings are exact: `human-check-failed`, `email-not-confirmed`.
- Load the `design-taste-frontend` skill before editing the signup form (Task 6) and enroll/buy surface (Task 7).

## Review Focus

- **Turnstile token is single-use:** a solved challenge followed by a failed signup (e.g. 409 duplicate email) must reset the widget so a retry gets a fresh token — otherwise the retry silently fails verification. (Task 6)
- **`/health/config` fetch failure:** must degrade to "no site key" so signup still works, never a dead form. (Task 5)
- **Grandfathered accounts (`emailConfirmed === undefined`):** must pass the enroll gate, never be blocked. (Task 4)
- **Unconfirmed org member via `startCourse`:** must still enroll — the gate sits below the org branch. (Task 4)
- **Cloudflare network/5xx during verify:** fail-closed (verify → `false` → signup `400`), never fail-open. (Task 1)

---

## Task 1: Turnstile verifier service + config

**Files:**
- Create: `api/src/turnstileService.ts`
- Modify: `api/src/config.ts` (env schema ~L38–57; strip-list regex L66; add `hasTurnstileConfig()`)
- Modify: `api/src/server.ts` (`ServerDependencies` ~L152; verifier instantiation near L212)
- Test: `api/src/turnstileService.test.ts`

**Interfaces:**
- Produces: `interface TurnstileVerifier { readonly configured: boolean; verify(token: string | undefined, remoteIp?: string): Promise<boolean>; }`; `class CloudflareTurnstileVerifier`; `class NullTurnstileVerifier`; `function createTurnstileVerifier(): TurnstileVerifier`; `function hasTurnstileConfig(): boolean`. `createServer` gains `turnstileVerifier?: TurnstileVerifier | null` in `ServerDependencies`, resolved as `dependencies.turnstileVerifier ?? createTurnstileVerifier()` into a local `turnstile`.

- [x] **Step 1: Write failing tests** in `api/src/turnstileService.test.ts`:
  - `NullTurnstileVerifier.verify()` returns `true` for any input and `configured === false`.
  - `CloudflareTurnstileVerifier.verify(undefined)` returns `false` **without** calling fetch (spy asserts 0 calls).
  - `CloudflareTurnstileVerifier.verify('tok')` with a stubbed fetch returning `{ success: true }` → `true`; `{ success: false }` → `false`.
  - `CloudflareTurnstileVerifier.verify('tok')` with fetch rejecting / returning 500 → `false` (fail-closed), and a warning is logged without the token value.

- [x] **Step 2: Run** `npm --prefix api test -- src/turnstileService.test.ts` — expect FAIL (module not found).

- [x] **Step 3: Implement** `api/src/turnstileService.ts` modeled on `api/src/muxService.ts`. Cloudflare impl POSTs form-encoded `secret`/`response`/`remoteip` to `https://challenges.cloudflare.com/turnstile/v0/siteverify` and returns `json.success === true`; empty token short-circuits to `false`; any throw/non-2xx → `false` + `logError`-style warning. Add `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` as `z.string().min(1).optional()` to the env schema; add `TURNSTILE_` to the isolated strip-list regex at config.ts:66; add `hasTurnstileConfig()` = both keys present. `createTurnstileVerifier()` returns Cloudflare impl when `apiConfig.mode !== 'isolated' && hasTurnstileConfig()`, else `new NullTurnstileVerifier()`. Wire `turnstileVerifier?` into `ServerDependencies` and resolve `const turnstile = dependencies.turnstileVerifier ?? createTurnstileVerifier();` next to the `muxVideo` line.

- [x] **Step 4: Run** `npm --prefix api test -- src/turnstileService.test.ts` — expect PASS.

- [x] **Step 5: Commit** (bump version per Global Constraints).
```bash
git add api/src/turnstileService.ts api/src/turnstileService.test.ts api/src/config.ts api/src/server.ts package.json package-lock.json app/package.json app/src/app/services/app-state.service.ts
git commit -m "feat(US-P020): Turnstile verifier service and config"
```

---

## Task 2: Turnstile check in the signup handler

**Files:**
- Modify: `api/src/auth.ts` (`signupSchema` L19)
- Modify: `api/src/server.ts` (signup handler; insert before `clientLimit.allow('signup', …)` at L698)
- Test: `api/src/*signup*` test (extend the existing signup/auth suite; add a dedicated describe if none fits)

**Interfaces:**
- Consumes: `turnstile` from Task 1.
- Produces: `signupSchema` gains `turnstileToken: z.string().min(1).optional()`; signup answers `400 { message: 'human-check-failed' }` when `turnstile.configured` and verification fails.

- [x] **Step 1: Write failing tests** (inject a stub `turnstileVerifier` into `createServer`):
  - verifier `{ configured: true, verify: async () => false }` + signup body → `400`, body `{ message: 'human-check-failed' }`, and **no** account created (a follow-up `findByEmail` / login is unauthorized).
  - verifier `{ configured: true, verify: async () => true }` → `201` as today.
  - default (isolated null verifier, no `turnstileToken`) → `201` (unchanged behavior).
  - the check runs **before** the client-limit: with the stub returning `false`, the client-limit budget is not consumed (a subsequent valid signup from the same client still succeeds).

- [x] **Step 2: Run** the signup test file — expect FAIL.

- [x] **Step 3: Implement.** Add `turnstileToken` to `signupSchema`. In the handler, after `signupSchema.parse(body)` and before `clientLimit.allow('signup', …)`, insert the guard from the spec returning `400 human-check-failed` when `turnstile.configured && !(await turnstile.verify(input.turnstileToken, clientAddress))`. Use the same client-address source `clientLimit` uses, or omit the arg if none is exposed.

- [x] **Step 4: Run** the signup test file — expect PASS.

- [x] **Step 5: Commit** (bump version). Stage `api/src/auth.ts`, `api/src/server.ts`, the test file, and the four version files.

---

## Task 3: Expose the site key on `/health/config`

**Files:**
- Modify: `api/src/server.ts` (`/health/config` handler, L561–587)
- Test: extend `api/src/securityHeaders.test.ts` or the health-config test that covers this route

**Interfaces:**
- Produces: `/health/config` response gains `turnstile: { configured: boolean, siteKey: string | null }`.

- [x] **Step 1: Write failing test:** `/health/config` in isolated mode returns `turnstile.configured === false` and `turnstile.siteKey === null`.

- [x] **Step 2: Run** the test — expect FAIL.

- [x] **Step 3: Implement.** Add `turnstile: { configured: hasTurnstileConfig(), siteKey: apiConfig.TURNSTILE_SITE_KEY ?? null }` to the `/health/config` body.

- [x] **Step 4: Run** the test — expect PASS.

- [x] **Step 5: Commit** (bump version).

---

## Task 4: Confirm-to-enroll gate (both doors)

**Files:**
- Modify: `api/src/auth.ts` (add `requireConfirmedEmail`)
- Modify: `api/src/server.ts` (enroll handler `POST /users/me/courses/:id`, after the org `startCourse` branch ~L771)
- Modify: `api/src/paymentRoutes.ts` (`POST /users/me/courses/:id/checkout`, L105, before `createCheckout`)
- Test: extend the enroll test suite and `api/src/*payment*`/checkout test

**Interfaces:**
- Produces: `function requireConfirmedEmail(user: { emailConfirmed?: boolean }): boolean` (`user.emailConfirmed !== false`). Both enroll doors answer `403 { message: 'email-not-confirmed' }` when it returns `false`.

- [x] **Step 1: Write failing tests:**
  - Free enroll with `emailConfirmed: false` → `403 { message: 'email-not-confirmed' }`, not enrolled.
  - Free enroll with `emailConfirmed: undefined` (grandfathered) → enrolls (200).
  - Free enroll with `emailConfirmed: true` → enrolls.
  - Unconfirmed **org member** whose org course is opened via `startCourse` → still enrolls (gate sits below the org branch).
  - `POST .../checkout` with `emailConfirmed: false` → `403 email-not-confirmed`, `createCheckout` not called.
  - `checkout/confirm` is **not** gated (a paid session still enrolls regardless of `emailConfirmed`).

- [x] **Step 2: Run** the enroll + checkout tests — expect FAIL.

- [x] **Step 3: Implement** `requireConfirmedEmail` in `auth.ts`; call it in the enroll handler after the org branch and before the free-enroll write, and in the checkout handler after course lookup and before `createCheckout`, returning `403 email-not-confirmed`. Do not touch `checkout/confirm`.

- [x] **Step 4: Run** the enroll + checkout tests — expect PASS.

- [x] **Step 5: Run** `npm run api:test` and `npm run verify:journeys` — expect PASS. **Commit** (bump version).

---

## Task 5: Frontend public-config read + signup model

**Files:**
- Modify: `app/src/app/services/api-client.service.ts` (add `getPublicConfig()`)
- Modify: `app/src/app/app.models.ts` (`SignupRequest.turnstileToken?`)
- Test: `app/src/app/services/api-client.service.spec.ts`

**Interfaces:**
- Consumes: `/health/config` `turnstile` section from Task 3.
- Produces: `ApiClientService.getPublicConfig(): Promise<{ turnstile: { configured: boolean; siteKey: string | null } }>` (memoized, single fetch); `SignupRequest` gains `turnstileToken?: string`.

- [ ] **Step 1: Write failing tests:** `getPublicConfig()` returns the `turnstile` section and fetches once across repeated calls; on a fetch error it resolves to `{ turnstile: { configured: false, siteKey: null } }` (degradation).

- [ ] **Step 2: Run** `(cd app && npx ng test --watch=false --include src/app/services/api-client.service.spec.ts)` — expect FAIL.

- [ ] **Step 3: Implement** `getPublicConfig()` (cache the promise) and add `turnstileToken?: string` to `SignupRequest`; include it in the `/signup` body in `auth.service.ts`.

- [ ] **Step 4: Run** the spec — expect PASS.

- [ ] **Step 5: Commit** (bump version). Stage the two `app/` files, the spec, and the four version files.

---

## Task 6: Turnstile widget on the signup form

**Files:**
- Modify: `app/src/app/pages/login-page/login-page.ts` + `.html` (signup form)
- Modify: the login route component that owns signup state (holds the `turnstileToken` signal and calls `auth.service.signup`)
- Test: `app/src/app/pages/login-page/*.spec.ts`

**Interfaces:**
- Consumes: `getPublicConfig()` (Task 5), `SignupRequest.turnstileToken` (Task 5).
- Produces: a signup form that renders the widget only when a site key exists and submits the token.

- [ ] **Step 1: Write failing tests:**
  - no site key → widget not rendered and submit enabled (today's behavior).
  - site key present → submit disabled until a token is set; once set, enabled and the token rides on the signup request.
  - after a failed signup, the widget is reset (a replaceable reset hook is invoked) so the next attempt gets a fresh token.
  - Use a **replaceable script loader** member on the component (do not `vi.mock` the Cloudflare script at module level — CI gotcha). Clear `localStorage`/`sessionStorage` in `beforeEach`.

- [ ] **Step 2: Run** the login-page spec — expect FAIL.

- [ ] **Step 3: Implement** (load `design-taste-frontend` first). Lazy-load `https://challenges.cloudflare.com/turnstile/v0/api.js` only when `authMode === 'signup'` and a site key is present; render the widget; store its token; extend `canSignupSubmit` with the token clause (vacuous when no key); reset the widget on failed signup.

- [ ] **Step 4: Run** the login-page spec — expect PASS.

- [ ] **Step 5: Commit** (bump version).

---

## Task 7: Confirm-first enroll/buy state

**Files:**
- Modify: `app/src/app/services/app-state.service.ts` (`mustConfirmEmail`; `enrollInCourse` 403 handling ~L2285; checkout starter)
- Modify: the course-details enroll/buy surface (template + component showing the enroll/buy control)
- Test: an `app/` spec covering enroll/buy state (extend the relevant existing spec)

**Interfaces:**
- Consumes: `403 email-not-confirmed` from Task 4; existing `auth.service.resendEmailConfirmation()` (US-L014).
- Produces: `AppStateService.mustConfirmEmail` computed (`loginState()?.user.emailConfirmed === false`); enroll/buy UI shows a confirm-first notice + resend when true; `enrollInCourse()` and the checkout starter map `403 email-not-confirmed` to that notice.

- [ ] **Step 1: Write failing tests:**
  - `mustConfirmEmail()` is `true` only when `emailConfirmed === false` (undefined/true → false).
  - with `mustConfirmEmail()`, the enroll and buy controls are disabled and show the confirm-first notice with a resend action; resend calls `auth.service.resendEmailConfirmation`.
  - a server `403 email-not-confirmed` from `enrollInCourse()` / checkout starter sets the confirm-first message (not the generic enrollment-failed text).
  - already-enrolled / confirmed / org-member cases are unaffected. Clear storage in `beforeEach`.

- [ ] **Step 2: Run** the spec — expect FAIL.

- [ ] **Step 3: Implement** (load `design-taste-frontend` first) `mustConfirmEmail`, the enroll/buy notice + resend, and the `403 email-not-confirmed` mapping in `enrollInCourse` and the checkout starter.

- [ ] **Step 4: Run** the spec — expect PASS.

- [ ] **Step 5: Run** `npm run app:test` and `npm run app:build:pages` — expect PASS. **Commit** (bump version).

---

## Done when

- `npm run api:test`, `npm run app:test`, `npm run verify:journeys`, `npm run app:build:pages` all pass.
- Spec behavior folded into `docs/specs/accounts/sign-in-and-sessions.md` (signup bot check) and the enrollment behavior in the catalog/payments specs; the `docs/stories/US-P020-*.md` contract deleted on delivery (per CLAUDE.md).
- Alex adds `TURNSTILE_SECRET_KEY` + `TURNSTILE_SITE_KEY` to Vercel and a release note before the push.
