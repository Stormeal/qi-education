# US-L024: Paid courses for individuals

## Record

- Story: US-L024 in the [backlog](../user_stories.md). Release 1 of three; organizations and their
  billing are [US-O001 and US-O002](US-O001-organizations.md).
- Design agreed with Alex in chat on 2026-10-20 (brainstorming). Approach: Stripe runs payment
  pages and billing; our API keeps the record of who may open what, changed by signed webhooks.
- Goal: revenue. A learner buys a priced course once with a card and keeps it.

## Decisions

- A priced course (`priceDkk` > 0) is bought once at that price and kept for good. Empty or 0 = free.
- A purchase is an enrollment that is never taken away, so `canLearnCourse` does not change in this
  release. Revocable access (organization seats) arrives with US-O002.
- Never pay: the course's author, admins, and everyone enrolled before the course was priced or
  before launch. Changing a price never touches existing enrollments.
- Teachers are hired by TestHuset: no payouts, no Stripe Connect. Teachers pay like any learner.
- "Payment method on the profile" = a **Payment and receipts** button opening Stripe's hosted
  customer portal. A card is saved at the first purchase. No card form of our own.
- Refunds are made in the Stripe dashboard and do **not** remove access (confirm or change).
- No discount codes, no VAT receipt fields beyond Stripe's own settings.

## Behavior

**Course page** (`/courses/:id`):

- Free course: **Enroll**, as today.
- Priced, not enrolled: **Buy for N DKK** → Stripe Checkout (hosted) → back to the course page.
- Enrolled (paid or not): **Open course**, as today.
- The note "Price for information only. Enrolling is free." is removed.
- No Stripe key configured: clicking the buy button shows "Purchases are temporarily unavailable."
  (the checkout's 503), so the page needs no separate configuration check.

**Return from Stripe.** The success URL carries `{CHECKOUT_SESSION_ID}`. The page calls
`POST /users/me/courses/:id/checkout/confirm` with it; the API asks Stripe whether the session is
paid. No polling. Three outcomes:

| Outcome | Message | Action |
| --- | --- | --- |
| Paid | "Payment received" | **Open course** |
| Not paid (abandoned, declined) | "The payment was not completed. You have not been charged." | **Try again** |
| Stripe or API unreachable | "We could not confirm your payment yet. Do not pay again: if you were charged, the course appears in My Learning within a few minutes." | none |

Cancel at Stripe returns to `?payment=cancelled`: nothing charged, buy button shown.

**Profile.** New section **Payment and receipts**: one button opening the Stripe customer portal
(saved card, receipts). Clicking it before any purchase shows "No payments yet."

**Admin.** Price is set in catalog settings as today; its hint says learners pay this to enroll.

## API

| Route | Rule |
| --- | --- |
| `POST /users/me/courses/:id/checkout` | Signed-in active account. 404 unknown course; 403 not published; 400 free course; 409 already enrolled. Creates a Checkout session (mode `payment`, DKK, inline price read on the server now, metadata `userId` + `courseId`, existing Stripe customer reused) and answers `{ url }`. Stripe failure → 503 "Purchases are temporarily unavailable", logged as `Stripe checkout creation failed`. |
| `POST /users/me/courses/:id/checkout/confirm` | Body `{ sessionId }`. Reads the session from Stripe; it must belong to the caller and the course. Paid → record + enroll, answer the user. Not paid → `{ paid: false }`. Stripe unreachable → 503. |
| `POST /users/me/courses/:id` (enroll) | Unchanged for free courses. Priced course → **402** "This course must be bought", unless the caller is its author or an admin. |
| `POST /webhooks/stripe`, `/api/webhooks/stripe` | Raw body; signature checked with `STRIPE_WEBHOOK_SECRET`, bad → 400. On `checkout.session.completed` with `payment_status: paid`, or `checkout.session.async_payment_succeeded`: record + enroll. Storage failure → 500 so Stripe retries. Other events → 200, ignored. |
| `POST /users/me/billing-portal` | Answers `{ url }` of a portal session; no payment yet → 404 "No payments yet". |

Record + enroll is one shared function used by `confirm` and the webhook. It is idempotent: the
payment is keyed by the checkout session id, so whichever arrives first writes and the other does
nothing. A second paid session for a course the account already has is stored and logged as
`Duplicate course purchase` (refunded by hand in the dashboard).

## Storage and code

- MongoDB collection `payments`: `{ _id: checkoutSessionId, userId, courseId, amountDkk,
  stripeCustomerId, paidAt }`, plus an in-memory repository; the existing repository pattern,
  wired in `server.ts`. The Stripe customer id is read from the account's latest payment, so the
  account document does not change.
- `paymentService.ts` wraps Stripe (`createCheckout`, `readCheckout`, `createPortal`,
  `readWebhookEvent`), built like `muxService.ts`. New dependency: the official `stripe` package in
  `api/` only, pinned to API version `2026-09-30.endive` (the version of the webhook destination).
- Isolated local runs and tests use a fake payment service: checkout leads straight back to the
  success URL and `readCheckout` reports paid. No Stripe account or network is needed.
- Config: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. `/health/config` and `npm run doctor`
  report whether each is set and whether the key is test or live; the doctor warns about a live key
  in a local run.

## Edge cases

- Price changed during checkout: the learner pays the price fixed when the session was created.
- Course archived or unpublished during checkout: payment still enrolls; archived keeps access.
- Disabled accounts cannot start checkout; a payment completed before disabling still enrolls.

## Scenarios

```gherkin
Feature: Paid courses for individuals
  Scenario: US-L024-AC01 Buy a priced course
    Given a published course priced 499 DKK and a signed-in learner not enrolled
    When the learner buys it and Stripe reports the session paid
    Then one payment is stored and the course is in the learner's My Learning

  Scenario: US-L024-AC02 Free and existing access is kept
    Given a learner enrolled before the course was priced, and the course's author
    When either opens the priced course
    Then they open it without paying

  Scenario: US-L024-AC03 Priced course cannot be enrolled for free
    When a learner calls the enroll route for a priced course
    Then the answer is 402 and no enrollment is stored

  Scenario: US-L024-AC04 Confirm and webhook do not double up
    Given a paid checkout session
    When confirm and the webhook both arrive, in either order, and the webhook arrives twice
    Then exactly one payment and one enrollment exist

  Scenario: US-L024-AC05 Unpaid and unreachable returns are honest
    When the session is not paid, the page offers Try again and says nothing was charged
    When Stripe cannot be reached, the page says not to pay again

  Scenario: US-L024-AC06 Forged webhook is refused
    When a webhook arrives with a wrong signature
    Then the answer is 400 and nothing is stored

  Scenario: US-L024-AC07 Payment and receipts
    Given a learner with a payment, the profile button opens the Stripe portal
    Given a learner without one, the profile says "No payments yet"
```

## Checks

- `api:test`: AC01–AC07 on the fake service, plus 400/403/404/409 checkout refusals.
- `app:test`: course page states (Enroll / Buy / Open course), the three return messages, profile
  section with and without payments.
- `verify:journeys`: admin prices a course, a learner buys and opens it, a learner enrolled before
  the price keeps access.
- Browser check on the isolated servers (3001/4200).
- Hosted, after push (Alex): buy a priced course with test card `4242 4242 4242 4242`, see it in
  My Learning and the receipt under **Payment and receipts**.

## Hosted setup and go-live

Done by Alex on 2026-10-20: Stripe test-mode destination `qi-academy-vercel` →
`https://qi-education.vercel.app/api/webhooks/stripe`, the two checkout events, API version
`2026-09-30.endive`; `STRIPE_SECRET_KEY` (test) and `STRIPE_WEBHOOK_SECRET` in Vercel Production.
Still to do: switch on the Customer Portal in Stripe settings.

While Production runs on test keys, anyone can "buy" with a test card: priced courses stay
effectively free on the hosted site. Go-live (a business decision): live secret key, a new
**live-mode** webhook destination with its own signing secret, both replacing the Vercel values,
and Stripe business verification.

## Docs on delivery

`business_rules.md` (prices are real), `specs/catalog/course-details-and-enrollment.md`,
`specs/accounts/profiles.md`, the storage table in `specs/platform/storage-and-run-modes.md`
(`payments`), and a new `specs/payments/` area; this contract is then deleted.
