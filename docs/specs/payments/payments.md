# Payments

## Purpose

A learner buys a priced course once by card and keeps it (US-L024, 2026-10-20). Stripe hosts the
payment pages; the API keeps the record of who paid for what.

## Behavior

- A course with `priceDkk` > 0 shows **Buy for N DKK** instead of **Enroll** to anyone not yet
  enrolled. Free courses (empty or 0) enroll as before. Authors and admins open their courses
  without paying, and so does everyone enrolled before the course got a price.
- **Buy** sends the learner to Stripe Checkout (`POST /users/me/courses/:id/checkout`, body
  `{ returnUrl }`). The price is read on the server when the session is created. Stripe returns to
  the course page with `?payment=success&session_id=…` or `?payment=cancelled`.
- An unconfirmed account cannot start a new checkout (403 `email-not-confirmed`, before creating
  a provider session; US-P020 API). Legacy accounts without the flag pass. Paid returns and
  webhooks still record the purchase and enroll: confirmation is never checked after payment.
- On return the page removes those parameters from the address and calls
  `POST /users/me/courses/:id/checkout/confirm` with the session id. The API asks Stripe whether it
  is paid. The page then shows one of: "Payment received. The course is in My Learning." with
  **Start learning**; "The payment was not completed. You have not been charged." with **Try
  again**; "We could not confirm your payment yet. Do not pay again: …" when Stripe or the API
  cannot be reached; "Payment cancelled. You have not been charged."
- The Stripe webhook (`POST /webhooks/stripe`, also `/api/webhooks/stripe`, signed with
  `STRIPE_WEBHOOK_SECRET`) records the same purchase when the learner never comes back. Confirm and
  webhook share one write, keyed by the Checkout session id: whichever arrives first stores the
  payment and enrolls; the other changes nothing. A storage failure answers 500 so Stripe retries.
- `POST /users/me/courses/:id` (enroll) answers **402** "This course must be bought." for a priced
  course unless the caller is its author or an admin.
- Profile → **Purchases** lists the account's payments (`GET /users/me/payments`, newest first:
  course title, amount, paid time, refunded flag; a deleted course reads "Removed course").
  **Receipt** asks `GET /users/me/payments/:id/receipt` for Stripe's hosted receipt of that charge
  (404 "This receipt is not available." when Stripe has none, and for another account's payment;
  503 when Stripe cannot be reached). Stripe also emails the receipt in live mode.
- **Manage saved card** opens Stripe's customer portal (`POST /users/me/billing-portal`); before any
  purchase it says "No payments yet." Purchases create no invoices, so the portal shows the saved
  card only.
- No Stripe key: buying and the portal answer 503 "Purchases are temporarily unavailable."
- Isolated runs and tests use a fake payment service: checkout returns straight to the success
  address and the session reads as paid, and no receipt exists. Nothing calls Stripe.

## Rules

- A purchase is an enrollment kept until the payment is **fully** refunded (US-L025, 2026-10-22).
  Refunds are made in the Stripe dashboard; the webhook (`charge.refunded`, found through the
  payment intent's Checkout session) marks the payment `refundedAt` and removes the enrollment
  unless another unrefunded purchase of the same course remains. Partial refunds change nothing;
  repeated, late or unknown refund events change nothing (unknown ones are logged as
  `Refund for unknown payment`). A refunded purchase never grants access again, even if its paid
  event is replayed. Progress, notes and achievements are kept, so buying again continues where
  the learner left off.
- A price is free (empty or 0) or 3–999,999 whole DKK; checkout refuses a stored price outside that
  range with 400.
- A second distinct purchase of a course the account already has is detected atomically with the
  enrollment, also across API instances (DEF-050).
- `returnUrl` must be on an allowed CORS origin (400 "Return address is not allowed." otherwise).
- A confirm for a session that belongs to another account or course answers 404 and stores nothing.
- A second paid session for a course the account already has is stored and logged as
  `Duplicate course purchase`; an admin refunds it by hand.

## Code

- API: `paymentRoutes.ts` (routes, shared record-and-enroll), `paymentService.ts` (Stripe adapter
  pinned to API version `2026-09-30.endive`, `stripe@23.0.0`, and the offline fake),
  `paymentRepository.ts` (MongoDB collection `payments`, keyed by session id), the 402 guard in
  the enroll route in `server.ts`; `/health/config` reports `payments: { configured, keyMode }`.
- App: `startCoursePurchase`, `handleCoursePurchaseReturn` and `coursePurchaseStatus` in
  `AppStateService`; `startCheckout` / `confirmCheckout` in `course.service.ts`; return handling in
  `routes/course-view-route.ts`; the buy button and status in `pages/course-view-page/`; the portal
  button in `pages/profile-page/` with `openBillingPortal` in `profile.service.ts`.
- Tests: `api/src/payment*.test.ts`, `api/src/refund*.test.ts`, the paid purchase in `api/src/journey.test.ts`,
  `app/src/app/services/course-purchase.spec.ts`, the US-L024 cases in the course and profile
  page specs.
- Config: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; `npm run doctor` reports them and warns
  about a live key in a local run.

- Stripe test destination `qi-academy-vercel` sends `checkout.session.completed`,
  `checkout.session.async_payment_succeeded` and `charge.refunded` (added 2026-10-22).

## Limits

- The hosted site runs on Stripe **test** keys: anyone can "buy" with a test card, so priced
  courses are effectively still free there. Going live needs a live key, a new live-mode webhook
  destination with its own secret, and Stripe business verification.
- Stripe sends receipt emails only in live mode, when **Settings → Customer emails → Successful
  payments** is on; test-mode purchases get no receipt email.
- Customer portal activated in test mode on 2026-10-20 (Alex).
- Two first purchases opened in parallel create two Stripe customers; the portal then shows only
  the latest one's card and history. Rare; fixing it needs a stored customer per account.
- Not verified against real Stripe: hosted Checkout, webhook signatures from a real delivery, the
  portal, and real MongoDB.
