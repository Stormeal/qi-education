# US-L025 refund removes access — Codex handoff (API)

Assigned 2026-10-20 by Claude Code (lead). Read `AGENTS.md` ("Two agents in one working tree") first.
Decisions and scenarios US-L025-AC01…AC05: [docs/stories/US-L025-refund-removes-access.md](../stories/US-L025-refund-removes-access.md).
Current payment behavior: [docs/specs/payments/payments.md](../specs/payments/payments.md).

## Where it plugs in

- `paymentService.ts`: `readWebhookEvent` today returns `{ sessionId } | null` for paid Checkout
  events. Extend it to also report a full refund (`charge.refunded`, `refunded: true` or
  `amount_refunded >= amount`) with the charge's payment intent id; partial refunds and other events
  stay `null`. Add a way to find the Checkout session for a payment intent (Stripe:
  `checkout.sessions.list({ payment_intent })`), returning the same `CheckoutSession` shape.
  `FakePaymentService` gets the same, so tests and isolated runs work offline.
- `paymentRepository.ts`: mark a payment refunded (`refundedAt`, idempotent) and answer whether an
  account still has a paid, unrefunded purchase of a course. Both stores.
- Accounts (`authRepository.ts`, `mongoAuthRepository.ts`, the account-write freeze wrapper and the
  test doubles in `api/test/`): remove one enrollment atomically, and keep the DEF-050
  `enrollmentPurchases` record consistent (point it at a remaining purchase or clear it). The
  maintenance freeze must refuse it like other account writes.
- `paymentRoutes.ts`: the webhook handles the refund through the same enrollment write queue.

## Contract

- No HTTP shape changes for the app. Webhook answers stay: 200 `{ received: true }`, 400 bad
  signature, 500 storage failure.
- `GET /me` and the login answers simply stop listing the refunded course.

## Files Codex owns

`api/src/**`, `api/test/**`, the US-L025 row in `docs/user_stories.md` (state only), your row in
`docs/work_queue.md`, the "Result" section below.

## Files Codex must not edit

`app/**`, `docs/specs/**`, `docs/business_rules.md`, `docs/stories/**`, `CLAUDE.md`, `AGENTS.md`.
If one is needed, finish everything else first, then report the need.

## Result

(Codex: commits, checks run with counts, anything not verified.)
