# US-L024 Paid Courses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A learner buys a priced course once through Stripe Checkout and keeps it; the profile opens Stripe's customer portal.

**Architecture:** Stripe hosts the payment pages. The API creates Checkout sessions, and records a payment + enrollment when either the return page's `confirm` call or the signed webhook reports the session paid (idempotent by session id). Isolated runs and tests use a fake payment service, so nothing calls Stripe offline.

**Tech Stack:** Express + Zod + MongoDB (API), official `stripe` npm package (API only), Angular signals (app), Vitest.

**Spec:** [docs/stories/US-L024-paid-courses.md](../../stories/US-L024-paid-courses.md)

**Owners:** Tasks 1–4 Codex (`api/**`, `scripts/doctor.mjs`); Tasks 5–7 Claude (`app/**`, docs). Tasks 5–6 only depend on the HTTP contract below, so both owners start at once.

## Global Constraints

- Currency DKK; Stripe amounts are øre: `unit_amount = priceDkk * 100`. Priced means `priceDkk > 0`; `null` or `0` is free.
- Stripe API version pinned: `2026-09-30.endive` (install the `stripe` release whose default API version is this one).
- Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Real Stripe only when the services mode is not `isolated` and the key is set; isolated → fake service; hosted/shared without key → no service (503 on use).
- Webhook paths: `/webhooks/stripe` and `/api/webhooks/stripe`, raw JSON body, like Mux.
- Mongo collection: `payments`. Document `{ _id: checkoutSessionId, userId, courseId, amountDkk, stripeCustomerId, paidAt }`.
- Exact copy (API): 402 `This course must be bought.`; 503 `Purchases are temporarily unavailable.`; 404 `No payments yet.`; 400 `Return address is not allowed.`; log lines `Stripe checkout creation failed`, `Duplicate course purchase`.
- Exact copy (app): `Buy for {N} DKK`; `Payment received`; `The payment was not completed. You have not been charged.`; `We could not confirm your payment yet. Do not pay again: if you were charged, the course appears in My Learning within a few minutes.`; `No payments yet.`; section title `Payment and receipts`.
- Shared-tree rules from CLAUDE.md: stage own files by path, bump the version in all four places before each commit, never push.

## HTTP contract (Tasks 3 ↔ 5)

| Request | Success | Errors (`{ message }`) |
| --- | --- | --- |
| `POST /users/me/courses/:id/checkout` body `{ returnUrl }` | 200 `{ url }` | 400 free course / bad `returnUrl`, 403 not published, 404 unknown, 409 enrolled, 503 |
| `POST /users/me/courses/:id/checkout/confirm` body `{ sessionId }` | 200 `{ paid: true, user, permissions }` (same shape as enroll) or 200 `{ paid: false }` | 404 session not the caller's or not this course, 503 |
| `POST /users/me/billing-portal` body `{ returnUrl }` | 200 `{ url }` | 400 bad `returnUrl`, 404 `No payments yet.`, 503 |
| `POST /users/me/courses/:id` (enroll, existing) | unchanged for free | 402 `This course must be bought.` when priced and caller is not author/admin |

`returnUrl` must parse as a URL whose origin is in `getCorsOrigins()`. Checkout success URL = `returnUrl` + `?payment=success&session_id={CHECKOUT_SESSION_ID}`; cancel URL = `returnUrl` + `?payment=cancelled`.

## Review Focus

1. Webhook and `confirm` racing for one session → exactly one payment, one enrollment (Task 3 test `records once when confirm and webhook race`).
2. A `sessionId` from another user or another course passed to `confirm` → 404, nothing stored (Task 3 test `refuses a foreign session`).
3. `returnUrl` on a foreign origin (open-redirect via Stripe) → 400 (Task 3 test `refuses a foreign return address`).
4. Existing tests or the journey enrolling in a course an admin priced now get 402 → journey and tests updated to buy or use a free course (Task 4).
5. Course page reloaded with `?payment=success&session_id=…` after the course is already in My Learning → shows "Payment received", no second confirm side effect (Task 5 test `confirm on an enrolled course shows paid`).

---

### Task 1: Payments repository (Codex)

**Files:**
- Create: `api/src/paymentRepository.ts`, `api/src/paymentRepository.test.ts`

**Interfaces:**
- Produces:
  - `type CoursePayment = { _id: string; userId: string; courseId: string; amountDkk: number; stripeCustomerId: string; paidAt: string }`
  - `interface PaymentRepository { add(payment: CoursePayment): Promise<boolean>; latestCustomerId(userId: string): Promise<string | null> }` — `add` answers `false` when `_id` already exists.
  - `InMemoryPaymentRepository`, `MongoPaymentRepository`, `createPaymentRepository(): PaymentRepository` (Mongo when `hasMongoConfig()`, like `createLessonNotesRepository`).

- [ ] **Step 1: Write failing tests** in `paymentRepository.test.ts`, run for both implementations (follow `lessonNotesRepository.test.ts` for the Mongo fake/collection injection):
  - `add returns true then false for the same session id`, and only one stored.
  - `latestCustomerId returns null without payments and the newest paidAt's customer otherwise`.
- [ ] **Step 2: Run** `npm --prefix api test -- src/paymentRepository.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Mongo: collection `payments` from `getMongoDatabase()`; `add` = `insertOne` with `writeConcern: { w: 'majority' }`, duplicate key `11000` → `false`; `latestCustomerId` = `findOne({ userId }, { sort: { paidAt: -1 } })`; index `{ userId: 1, paidAt: -1 }`.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(US-L024): store course payments`.

### Task 2: Payment service, config and dependency (Codex)

**Files:**
- Create: `api/src/paymentService.ts`, `api/src/paymentService.test.ts`
- Modify: `api/src/config.ts` (env schema + `hasStripeConfig()`, `stripeKeyMode(): 'test' | 'live' | null`), `api/package.json` (+ `stripe`), `package-lock.json`

**Interfaces:**
- Produces:
  - `type CheckoutSession = { id: string; paid: boolean; userId: string; courseId: string; amountDkk: number; customerId: string | null }`
  - `type PaidCheckoutEvent = { sessionId: string } | null` (null = event we ignore)
  - `interface PaymentService { createCheckout(input: { userId: string; email: string; courseId: string; courseTitle: string; amountDkk: number; customerId: string | null; successUrl: string; cancelUrl: string }): Promise<{ url: string }>; readCheckout(sessionId: string): Promise<CheckoutSession | null>; createPortal(customerId: string, returnUrl: string): Promise<{ url: string }>; readWebhookEvent(rawBody: string, signature: string | undefined): PaidCheckoutEvent }` — `readWebhookEvent` throws `PaymentSignatureError` on a bad signature.
  - `class PaymentSignatureError extends Error`
  - `class FakePaymentService implements PaymentService` (exported for tests) and `createPaymentService(): PaymentService | null`.

- [ ] **Step 1: Write failing tests** in `paymentService.test.ts`:
  - `createPaymentService returns a FakePaymentService in isolated mode` (NODE_ENV=test).
  - Fake: `createCheckout` answers the success URL with `{CHECKOUT_SESSION_ID}` replaced by a `fake_cs_…` id; `readCheckout(thatId)` → `{ paid: true, userId, courseId, amountDkk, customerId: 'fake_cus_<userId>' }`; unknown id → `null`.
  - Fake: `readWebhookEvent` with signature `'fake-signature'` and body `{"type":"checkout.session.completed","data":{"object":{"id":"cs_1","payment_status":"paid"}}}` → `{ sessionId: 'cs_1' }`; same with `payment_status: 'unpaid'` → `null`; `checkout.session.async_payment_succeeded` → `{ sessionId }`; other type → `null`; wrong signature → throws `PaymentSignatureError`.
  - `stripeKeyMode` → `'test'` for `sk_test_x`, `'live'` for `sk_live_x`, `null` when unset.
- [ ] **Step 2: Run** `npm --prefix api test -- src/paymentService.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `npm --prefix api install stripe@<version for 2026-09-30.endive>`. `StripePaymentService`: Checkout `mode: 'payment'`, `currency: 'dkk'`, inline `price_data` (`product_data.name = courseTitle`), `metadata { userId, courseId }`, `client_reference_id: userId`, `customer` when known else `customer_creation: 'always'` + `customer_email`, `payment_intent_data.setup_future_usage: 'on_session'` (saves the card for the portal). `readCheckout` maps `payment_status === 'paid'`, `amount_total / 100`, metadata. Webhook via `stripe.webhooks.constructEvent`; its signature error → `PaymentSignatureError`. The fake shares the same event parsing after its signature check.
- [ ] **Step 4: Run** → PASS; `npm run api:build` passes.
- [ ] **Step 5: Commit** `feat(US-L024): add Stripe payment service with offline fake`.

### Task 3: Payment routes, enroll guard, health (Codex)

**Files:**
- Create: `api/src/paymentRoutes.ts`, `api/src/paymentRoutes.test.ts`
- Modify: `api/src/server.ts` (dependencies `paymentRepository?`, `paymentService?: PaymentService | null`; register routes next to `registerAccountProfileRoutes`; webhook registered before the JSON parser like Mux; enroll route ~line 683: 402 guard after the published check; `/health/config` + `payments: { configured: Boolean(paymentService), keyMode: stripeKeyMode() }`)

**Interfaces:**
- Consumes: Task 1 `PaymentRepository`, Task 2 `PaymentService`, `PaymentSignatureError`; `auth.enrollUserInCourse`, `enrollmentWrites`, `toAuthenticatedUser`, `getRolePermissions`, `canAuthorCourse`, `getCorsOrigins`.
- Produces: `registerPaymentRoutes(app, { authenticate, auth, courses, payments, paymentService, enrollmentWrites })`; the HTTP contract above.

- [ ] **Step 1: Write failing tests** in `paymentRoutes.test.ts` with `createServer` + in-memory stores + `FakePaymentService` (pattern: `journey.test.ts` request helper). Set a course price via admin `PATCH /courses/:id/price`.
  - `checkout answers a Stripe URL for a priced published course`.
  - `checkout refuses free (400), unpublished (403), unknown (404), enrolled (409)`.
  - `refuses a foreign return address` → 400 `Return address is not allowed.`
  - `confirm enrolls once and answers paid with user`; second `confirm` → paid, still one payment.
  - `confirm answers paid false for an unpaid session` (fake with a session marked unpaid).
  - `refuses a foreign session` → 404 for another user's or another course's session, nothing stored.
  - `records once when confirm and webhook race` (`Promise.all` of confirm + two webhooks) → one payment, one enrollment.
  - `webhook with a wrong signature answers 400 and stores nothing`; storage throwing → 500.
  - `enroll in a priced course answers 402`; author and admin → 200.
  - `learner enrolled before the price keeps access` (enroll free, then price, `GET` learner content still 200).
  - `billing portal answers 404 before a payment and a URL after`.
  - `no payment service: checkout and portal answer 503 Purchases are temporarily unavailable.`; `/health/config` reports `payments.configured`.
- [ ] **Step 2: Run** `npm --prefix api test -- src/paymentRoutes.test.ts` → FAIL.
- [ ] **Step 3: Implement** `registerPaymentRoutes`. One shared `recordPaidCheckout(session: CheckoutSession): Promise<AuthenticatedUser>`: `payments.add(...)`; if the add is new and the user was already enrolled, `console.error('Duplicate course purchase', { sessionId, userId, courseId })`; then `enrollmentWrites.run(userId, () => auth.enrollUserInCourse(userId, courseId))` (idempotent already). Webhook: `readWebhookEvent` → `readCheckout(sessionId)` → paid → `recordPaidCheckout`; `PaymentSignatureError` → 400; other failures → `next(error)` (500, Stripe retries); ignored events → 200 `{ received: true }`. Checkout creation failure → `console.error('Stripe checkout creation failed', error)` + 503. Bodies validated with Zod (`returnUrl: z.url()`, `sessionId: z.string().min(1)`).
- [ ] **Step 4: Run** the file → PASS, then `npm run api:test` → all pass (fix any existing test that enrolls in a priced course by expecting 402 or using a free course).
- [ ] **Step 5: Commit** `feat(US-L024): course checkout, confirm, webhook and billing portal`.

### Task 4: Journey and doctor (Codex)

**Files:**
- Modify: `api/src/journey.test.ts`, `scripts/doctor.mjs`

- [ ] **Step 1:** In the journey (both stores): admin sets `priceDkk: 100` on the journey course after publication; a second learner enrolled before the price keeps learner access; the main learner gets 402 on enroll, then `checkout` → `confirm` with the fake session → 200 paid → continues the existing learning steps.
- [ ] **Step 2: Run** `npm run verify:journeys` → PASS.
- [ ] **Step 3:** Doctor reports `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` set or missing and warns `Live Stripe key in a local run` when the key starts with `sk_live_` (follow its Mux lines).
- [ ] **Step 4: Run** `npm run doctor` → shows the Stripe lines, no crash.
- [ ] **Step 5: Commit** `test(US-L024): buy a course in the release journey; doctor checks Stripe`; update the Codex row in `docs/work_queue.md`.

### Task 5: App purchase flow (Claude)

**Files:**
- Modify: `app/src/app/services/course.service.ts` (+ `startCheckout`, `confirmCheckout`), `app/src/app/services/app-state.service.ts` (+ `startCoursePurchase`, `confirmCoursePurchase`, signal `coursePurchaseStatus`), `app/src/app/routes/course-view-route.ts` + `.html` (read `payment`/`session_id` query once; bind new input/output), `app/src/app/app.models.ts` (status type)
- Test: `app/src/app/services/course-purchase.spec.ts`

**Interfaces:**
- Consumes: the HTTP contract.
- Produces: `type CoursePurchaseStatus = 'idle' | 'redirecting' | 'confirming' | 'paid' | 'unpaid' | 'unreachable' | 'cancelled'`; `AppStateService.coursePurchaseStatus: Signal<CoursePurchaseStatus>`; `startCoursePurchase(courseId: string): Promise<void>` (redirects with `window.location.assign`, via a replaceable member for tests); `confirmCoursePurchase(courseId: string, sessionId: string): Promise<void>` (on paid: store login state like `enrollInCourse`).

- [ ] **Step 1: Write failing tests** (clear `localStorage`/`sessionStorage` in `beforeEach`): start → POSTs `returnUrl` = current course URL and assigns the answered URL; checkout error → `courseEnrollmentError` shows the API message; confirm paid → enrolled + status `paid`; `confirm on an enrolled course shows paid`; `{ paid: false }` → `unpaid`; network failure or 503 → `unreachable`; `?payment=cancelled` → `cancelled`.
- [ ] **Step 2: Run** `(cd app && npx ng test --watch=false --include src/app/services/course-purchase.spec.ts)` → FAIL.
- [ ] **Step 3: Implement**; remove the query params from the URL after reading them so a reload does not confirm again.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(US-L024): app checkout and return confirmation`.

### Task 6: Course page and profile UI (Claude)

Load `design-taste-frontend` first.

**Files:**
- Modify: `app/src/app/pages/course-view-page/course-view-page.{ts,html,scss,spec.ts}`, `app/src/app/pages/profile-page/profile-page.{ts,html,scss,spec.ts}`, `app/src/app/services/profile.service.ts` (+ `openBillingPortal(token, returnUrl): Promise<{ ok: true; url: string } | { ok: false; message: string }>`), admin price field hint in the catalog settings form.

- [ ] **Step 1: Write failing tests:** priced + not enrolled → button `Buy for 499 DKK` emitting `coursePurchaseStarted`; free → `Enroll` as before; the old "Price for information only…" note gone; each `coursePurchaseStatus` shows its exact message (`paid` also shows **Start learning**, `unpaid` shows **Try again**); profile section `Payment and receipts` → click with 404 shows `No payments yet.`, with a URL assigns it.
- [ ] **Step 2: Run** both spec files → FAIL.
- [ ] **Step 3: Implement** with existing `appButton` and status message styles; messages in an `aria-live="polite"` region.
- [ ] **Step 4: Run** `npm run app:test` → PASS; `npm run app:build:pages` → PASS.
- [ ] **Step 5: Commit** `feat(US-L024): buy button, payment status and receipts on the profile`.

### Task 7: Integration check and docs (Claude, after Codex commits)

- [ ] **Step 1:** Check routine from CLAUDE.md: review Codex's diff against the handoff; run `npm run api:test`, `npm run app:test`, `npm run verify:journeys`, `npm run app:build:pages`.
- [ ] **Step 2:** Browser check on isolated servers (3001/4200): admin prices a course; learner sees **Buy for N DKK**, fake checkout returns with "Payment received", course in My Learning; profile receipts button; phone width.
- [ ] **Step 3:** Fold behavior into `business_rules.md`, `specs/catalog/course-details-and-enrollment.md`, `specs/accounts/profiles.md`, `specs/platform/storage-and-run-modes.md`, new `specs/payments/payments.md`, CLAUDE.md storage table + keyword table row; delete the story contract, move the handoff to `docs/history/handoffs/`, this plan to `docs/history/plans/`.
- [ ] **Step 4: Commit** `docs(US-L024): fold paid courses into the specs`. Tell Alex: push, then the hosted test-card check from the spec.
