# US-O002 organization billing: Codex part

Owner: Codex. Branch: `main`. Started: 2026-11-02. Lead: Claude. History must contain `af09fad`.
Story and the API ↔ app contract: `git show c2afba2:docs/stories/US-O002-organization-billing.md`
(defaults 1–9, scenarios AC01–AC12, the Contract section). Background only, not agreed scope:
[US-O001-api-draft.md](US-O001-api-draft.md) §7 and §9.
Isolated in-memory stores and the fake billing service only; no hosted, shared-service or Stripe calls.

## Split

| Owner | Scope | Files |
| --- | --- | --- |
| Codex | Billing service, billing state in the organization store, access rule, billing routes, webhook, admin Free/Paid, sync, config, tests, journey | `api/src/organizationBilling.ts` (new: schemas, `OrgBillingView`, pure access/state functions, desired lines), `api/src/organizationBillingService.ts` (new: `StripeOrganizationBillingService` + `FakeOrganizationBillingService`), `api/src/organizationBillingRoutes.ts` (new, or extend `organizationRoutes.ts`), `api/src/organization.ts`, `api/src/organizationService.ts`, `api/src/organizationRepository.ts`, `api/src/organizationRoutes.ts`, `api/src/organizationTestSupport.ts`, `api/src/server.ts` (wiring and the raw-body webhook only), `api/src/config.ts`, `scripts/doctor.mjs`, `api/src/routePermissions.test.ts`, `api/src/journey.test.ts`, new/existing `api/src/organization*.test.ts`, `api/test/**` |
| Claude | App models, `organization.service.ts`, organization page, admin organizations, price labels, docs specs | everything in `app/`, `docs/specs/**`, `docs/stories/**` |

Do not edit `paymentRoutes.ts`, `paymentService.ts` or `paymentRepository.ts`: personal purchases
stay as they are (AC11). Importing a helper from them is fine; if you need one exported, finish
everything else first and report it.

## Contract Claude relies on

Exactly the Contract section of the story: `OrgBillingView`, `billingState` on
`GET /users/me/organization` and on each `GET /admin/organizations` row, the optional `billing` on
approve, and the seven routes with their bodies, answers and status codes. Card success URL:
`<returnUrl>?billing=card&session_id={CHECKOUT_SESSION_ID}`, cancel URL `<returnUrl>?billing=cancelled`
(validate `returnUrl` against allowed origins the same way `paymentRoutes.ts` does).

## Implementation notes (yours to change if a better way keeps the contract)

1. **Storage.** Add an optional `billing` to the stored organization:
   `{ mode: 'free' | 'paid'; method: 'card' | 'invoice' | null; customerId; subscriptionId;
   status: 'none' | 'active' | 'cancelling' | 'cancelled'; periodEnd; endsAt;
   unpaid: { id, amountDkk, dueAt, url }[]; syncPending: boolean }`. Missing `billing` = free
   (organizations approved before US-O002). Approve with `billing: 'paid'` (default) stores
   `{ mode: 'paid', status: 'none', … }`. Stripe product ids per career/course may live on the
   price rows in `_organization_prices`.
2. **State** (pure, unit-tested with a fixed clock): free → `free`; paid and status `none` →
   `setup-needed`; `cancelled` → `cancelled`; any unpaid with `dueAt + 14 days <= now` → `blocked`;
   other unpaid → `overdue`; `cancelling` → `cancelling`; else `active`. `blocksAt = dueAt + 14 d`.
   For card invoices `dueAt` is the finalization time (no due date). `openCourseIds` returns `[]`
   for `setup-needed`, `blocked` and `cancelled`, evaluated on every call (no scheduled job).
3. **Desired lines.** Base line `{ kind: 'base', id: 'organization', title: 'QI Academy organization', unitDkk: 0, quantity: 1 }`;
   one `seat` line per published career with a seat price that active members have (quantity =
   those members); one `course` line per published course with an add-on price and approved
   add-ons of active members, skipping an add-on whose course is in that member's career. Unpriced
   careers/courses are not billed. More than 20 lines → 409 "Contact us to bill more different
   careers and courses." and the owner change is not stored. The view's lines are the desired lines.
4. **Stripe.** One customer per organization (name = company name, email = billing email, address
   with country `DK`, tax id `dk_vat` `DK<cvr>`), one monthly DKK subscription; `items` with
   `price_data` (product per career/course, created lazily; øre = DKK × 100), metadata
   `{ orgId, kind, id }` on items so a sync can match them; `default_tax_rates` from
   `STRIPE_ORG_TAX_RATE_ID` when set. Invoice: `collection_method: 'send_invoice'`,
   `days_until_due: 14`. Card: Checkout `mode: 'setup'`, then on confirm/webhook set the customer's
   default payment method and `collection_method: 'charge_automatically'`. Cancel/resume:
   `cancel_at_period_end`. Portal: billing portal session for the organization customer. Admin Free:
   cancel the subscription now (no proration). Pinned API `2026-09-30.endive`: check where period
   ends live (item level) before reading `nextInvoiceAt`.
5. **Sync.** After the local commit of: career set/changed/cleared, add-on approved, member
   removed or left, set the subscription items to the desired lines (`create_prorations`). After an
   admin price change, sync every subscribing organization with `proration_behavior: 'none'`. A
   Stripe failure keeps the local change, sets `syncPending`, and the next `GET …/billing` or change
   retries. Never hold the organization lock across a Stripe call longer than the existing lock
   allows; syncing the full desired state makes retries safe.
6. **Webhook** `POST /webhooks/stripe-billing` (+ `/api`), raw body, own secret
   `STRIPE_BILLING_WEBHOOK_SECRET`. For any event with a customer: find the organization by
   customer id (unknown → 200, ignored), re-read the subscription and the customer's open/unpaid
   invoices from Stripe and store them; `checkout.session.completed` in setup mode finishes card
   setup like confirm. Paid or voided invoices leave `unpaid`; uncollectible ones stay. Storage
   failure → 500. Events to list in the doc for Alex: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.finalized`,
   `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`.
7. **Fake** (isolated runs and tests): card setup returns the success URL with a fake session id
   that confirms; invoice setup is active at once; portal returns `returnUrl`; tests can add/clear
   unpaid invoices and move the clock. No Stripe key and not isolated → 503 "Billing is temporarily
   unavailable." on setup, confirm, cancellation and portal (the billing view still answers).
8. **Config.** `/health/config` and `npm run doctor` report the two new variables like the
   existing Stripe ones.

## Done when

- AC01–AC12 covered by API tests on both path prefixes, with a fixed clock for AC08 just before,
  at and after `blocksAt`; personal purchase tests unchanged and green.
- A billing pass in `npm run verify:journeys`: paid approval, setup-needed closes courses, invoice
  setup opens them, an approved add-on adds a line, an unpaid invoice past `blocksAt` closes them,
  payment reopens.
- Permission table entries for every new route; `npm run api:test` and `npm run api:build` pass.
- Your row in `docs/work_queue.md` updated. Commit locally, do not push.
