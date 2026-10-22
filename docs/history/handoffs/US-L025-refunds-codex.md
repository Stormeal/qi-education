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

API completed 2026-10-22 on `main` from `208fe29` (required ancestor verified). Delivery:
the commit containing this Result, `feat(US-L025): revoke bought course access after a full refund`.
Committed locally only; no push, deployment or provider mutation.

Implemented:

- Both webhook adapters recognize full `charge.refunded` events (including expanded payment
  intents), ignore partial refunds, and resolve the original Checkout using the payment intent.
  Stripe uses `checkout.sessions.list({ payment_intent, limit: 1 })`; the fake works entirely offline.
- Both payment stores retain records and mark `refundedAt` once. Refund retries still finish
  account reconciliation after a failed earlier write. Active-purchase queries protect duplicate
  purchases and exclude refunded purchases from duplicate warnings.
- Both account stores atomically update one enrollment and its internal `enrollmentPurchases`
  source: transfer to another unrefunded session, or remove the enrollment and clear its source.
  Maintenance freeze refuses this write. Other enrollments, credentials, progress, notes and
  achievements remain stored; author/admin access is unchanged.
- Refunds and paid grants use the existing per-account write queue. Reconciliation rechecks durable
  purchases after the account write, with bounded retries for concurrent changes. Paid-event and
  checkout-confirm replays cannot regrant access from an already-refunded purchase.
- Unknown refunds answer the existing 200 and log `Refund for unknown payment` with only the
  session or payment-intent ID. Existing webhook response shapes and signature checks are preserved.

Scenario evidence (all store fixtures isolated, root and `/api` aliases covered):

| Scenario | Permanent regression |
| --- | --- |
| US-L025-AC01 | `refundRoutes.test.ts`: full refund removes access, `/me`/login omit it, learning records/other enrollments survive; storage failures retry, maintenance freeze refuses removal; author/admin access; refund during an in-flight paid grant |
| US-L025-AC02 | `refundRoutes.test.ts`: partial refund keeps access until the remainder is refunded; `refundService.test.ts`: partial/zero amount ignored and invalid signature refused |
| US-L025-AC03 | `refundRoutes.test.ts`: refunding one of two purchases keeps access and transfers the source; refunding both, including overlapping refunds, removes it |
| US-L025-AC04 | `refundRoutes.test.ts`: repeated/late/unknown refunds and invalid signatures; `refundRepository.test.ts`: stable refund timestamp and retained payment records after repository restart |
| US-L025-AC05 | `refundRoutes.test.ts`: rebuy restores access and prior learning, old paid replay does not; repurchase during an earlier refund retains access without a false duplicate warning |

Test-first evidence: **24 HTTP acceptance/freeze cases and 15 adapter/repository cases failed before
implementation**. After implementation the expanded new suites pass **75 tests** (60 HTTP,
11 adapter, 4 storage). A later four-case concurrency regression exposed a false duplicate warning
during repurchase; it failed before the warning correction and passes afterwards. Existing DEF-050
distinct-session and same-session replay regressions remain green. Independent read-only review
reported no remaining actionable findings, including the warning correction.

Final verification after all API changes:

- `npm run api:test`: **88 files, 2,316 tests passed**, zero failures.
- `npm run verify:journeys`: **1 file, 16 tests passed**, memory and Mongo operation doubles.
- `npm run api:build`: passed (exit 0).
- `git diff --check`: passed.

Not verified: real Stripe delivery/Checkout lookup, real MongoDB durability/failover, hosted UI or
provider integrations. Stripe SDK webhook signatures were exercised locally with synthetic data;
SDK HTTP calls were replaced with injected stubs. All mutation tests used isolated memory stores
and Mongo operation doubles, ephemeral loopback ports, no shared services, no real secrets and no
ports 3001/4200. No Mux/Brevo/GitHub calls were made.

Claude's existing edit to the story's hosted-step note was preserved and left unstaged. Only the
four explicitly authorized version files were edited outside the assigned API/document ownership.
The backlog state is API complete pending Claude's review, payments spec/business-rule fold-in and
story cleanup; those files were not edited by Codex. The remaining release check is an actual test
refund and My Learning access check after a separately authorized push/deployment.
