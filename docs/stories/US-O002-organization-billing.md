# US-O002: Organization billing

**As an organization owner, I want to pay one monthly bill for my members' careers and extra
courses, by card or invoice, so that my team keeps learning without anyone buying courses.**

State: In design and build (started 2026-11-02, Claude lead). Planned for release 3. Builds on
US-O001 ([organizations](../specs/organizations/organizations.md)) and US-L024
([payments](../specs/payments/payments.md)). Decisions agreed with Alex on 2026-10-20 are in
[US-O001](US-O001-organizations.md#us-o002-organization-billing-release-3); the API draft
[US-O001-api-draft.md](../handoffs/US-O001-api-draft.md) §7 and §9 is background, not agreed scope.

The defaults below were chosen on 2026-11-02 and **accepted by Alex the same day**.
Nothing here blocks on Alex until Stripe live mode (release 2).

## Decided (Alex, 2026-10-20)

- The organization subscribes; it never owns content. Monthly bill = each member's career seat
  price + approved course add-ons. Stripe Billing subscription, prorated changes.
- Admins set a monthly seat price per career and an add-on price per course (already built).
- The owner chooses card (charged automatically) or invoice (14-day terms, Stripe reminders).
- Invoice unpaid 14 days past due: members lose organization access until paid; the owner sees a
  warning. Access returns on payment.
- Leaving or a cancelled subscription ends organization access; progress, notes, achievements and
  personal purchases stay with the account.

## Defaults (accepted by Alex, 2026-11-02)

1. **Free or paid per organization.** The admin chooses when approving: **Paid** (default) or
   **Free of charge**, and can switch later in Admin → Organizations. Organizations approved
   before US-O002 have no billing record and count as free, so TestHuset's internal organizations
   change nothing. Making an organization free cancels its subscription at once without a refund;
   the admin refunds in Stripe by hand if needed.
2. **No trial.** A paid organization's seats and add-ons open courses only once an owner has set
   up card or invoice. Before that, owners can invite and assign careers and see the monthly total.
3. **Prices exclude moms.** Every price shows "excl. moms"; Stripe adds 25% Danish moms through
   one tax rate (`STRIPE_ORG_TAX_RATE_ID`; without it no tax line, fine in test mode). Only
   Danish companies (the CVR is already required). Setup asks for the billing address.
4. **One subscription per organization**, monthly from the day billing is set up. It always has a
   0 DKK "QI Academy organization" line, so it can exist with no seats. Lines: one per billed
   career (quantity = members with that career and a seat price) and one per add-on course
   (quantity = approved add-ons for that course). Careers and courses without a price are free and
   not billed. An add-on whose course is also in the member's career is not billed twice.
5. **Owner changes are prorated** (Stripe `create_prorations`, settled on the next invoice):
   assigning, changing or clearing a career, approving an add-on, removing a member, a member
   leaving. **Admin price changes are not prorated**: they reach every subscribing organization
   from its next invoice.
6. **Cards: the same 14-day rule.** A failed card payment starts the clock at the invoice's
   finalization; Stripe retries meanwhile. Invoices: the clock starts at the due date. Access is
   blocked from due + 14 days while any such invoice is unpaid, checked on every request (no job).
   Paid or voided clears it; "uncollectible" does not.
7. **Cancel at period end.** An owner cancels; access continues to the end of the paid month and
   can be resumed until then. Afterwards members stay members, without organization courses, and
   an owner can set billing up again.
8. **Suspend is separate.** An admin suspension closes access as today and does not touch Stripe.
9. **At most 20 billed lines** (Stripe's limit per subscription). An owner change that would need
   a 21st line is refused with "Contact us to bill more different careers and courses."

Stripe dashboard settings Alex must keep (test mode now, live mode at release 2): failed card
payments and overdue invoices **leave the subscription as it is** (never cancel or mark unpaid),
invoice reminders on, customer portal allows invoices and payment methods.

Kept compatible with US-L033 (subscriptions) and US-T018 (language add-ons), not designed for
them: billed lines carry a `kind`, so a plan price on the base line or a `language` kind can be
added later without changing the subscription model.

## Scenarios

| ID | Scenario |
| --- | --- |
| AC01 | Admin approves a request as Paid or Free; Admin → Organizations shows each organization's billing state and switches Free ↔ Paid. Older organizations read as Free. |
| AC02 | A paid organization without setup: owner sees "Set up billing to open courses for your members" with the monthly total; members see that courses open once billing is set up; billed courses do not open. |
| AC03 | Owner sets up **invoice** (address): subscription with 14-day invoices; courses open at once. |
| AC04 | Owner sets up **card**: Stripe-hosted card form, then back to the page; courses open only after the API confirms the saved card (return or webhook), never on the redirect alone. |
| AC05 | Owner's Billing section: method, lines (career × count, course × count, unit price), monthly total excl. moms, next invoice date, Manage billing (Stripe portal). Members never see it. |
| AC06 | Owner changes update the subscription (prorated). If Stripe cannot be reached the change still stands, the owner sees "Billing update pending" and it is retried on the next billing read or change. |
| AC07 | An admin price change reaches subscribing organizations from their next invoice, without proration. |
| AC08 | Unpaid invoice: owner sees amount, due date and the date members lose access; from due + 14 days organization courses close for members and the owner sees "Members have lost access until the invoice is paid"; payment reopens them. |
| AC09 | Owner cancels (access to period end, resume possible); after the end organization access stops; progress and personal purchases stay. |
| AC10 | Billing webhook (own endpoint and secret) re-reads the customer's subscription and open invoices from Stripe, so duplicates and order do not matter; unknown customers are ignored; a storage failure answers 500. |
| AC11 | Without Stripe config billing setup answers 503 "Billing is temporarily unavailable."; isolated runs use a fake billing service. Personal course purchases and their portal are unchanged. |
| AC12 | A 21st billed line is refused with 409 and nothing changes. |

## Contract (API ↔ app)

All routes also answer under `/api`, `Cache-Control: private, no-store`, errors `{ message }`
as in the organizations spec. Amounts are whole DKK in the API (Stripe gets øre).

```ts
type BillingState = 'free' | 'setup-needed' | 'active' | 'overdue' | 'blocked' | 'cancelling' | 'cancelled';
type OrgBillingView = {
  state: BillingState;
  method: 'card' | 'invoice' | null;
  lines: { kind: 'base' | 'seat' | 'course'; id: string; title: string; unitDkk: number; quantity: number }[];
  monthlyTotalDkk: number;            // excl. moms; sum of unitDkk × quantity
  nextInvoiceAt: string | null;       // ISO; null when free, not set up or cancelled
  endsAt: string | null;              // cancelling: last day of access
  unpaid: { id: string; amountDkk: number; dueAt: string; blocksAt: string; url: string | null }[];
  syncPending: boolean;
};
```

- `overdue` = an unpaid invoice exists but none has passed `blocksAt`; `blocked` = one has.
  `blocked` and `setup-needed` and `cancelled` close organization courses (`openCourseIds` → []).
- `GET /users/me/organization` adds `billingState: BillingState` (members and owners).
- `GET /admin/organizations` adds `billingState` per organization.
- `POST /admin/organization-requests/:id/decision` approve accepts optional
  `billing: 'paid' | 'free'` (default `'paid'`).

| Route | Who | Body → answer |
| --- | --- | --- |
| `GET /organizations/:id/billing` | owner | → `OrgBillingView` (retries a pending sync first) |
| `POST /organizations/:id/billing/setup` | owner | `{ method: 'invoice', address }` → `OrgBillingView`; `{ method: 'card', address, returnUrl }` → `{ url }`. Also switches method when already set up. 409 when free. |
| `POST /organizations/:id/billing/card/confirm` | owner | `{ sessionId }` → `OrgBillingView`; 404 for another organization's session |
| `PUT /organizations/:id/billing/cancellation` | owner | `{ cancel: boolean }` → `OrgBillingView`; 409 unless active/overdue (cancel) or cancelling (resume) |
| `POST /organizations/:id/billing/portal` | owner | `{ returnUrl }` → `{ url }`; 409 before setup |
| `PUT /admin/organizations/:id/billing` | site admin | `{ free: boolean }` → admin organization row |
| `POST /webhooks/stripe-billing` | Stripe (signed, `STRIPE_BILLING_WEBHOOK_SECRET`) | raw body → 200 / 400 bad signature / 500 storage |

`address` = `{ line1: 1–120, postalCode: 4 digits, city: 1–60 }` (Denmark). `returnUrl` must be an
allowed origin, as for course checkout. Card return lands on
`/organization?billing=card&session_id=…` or `?billing=cancelled`; the page removes the
parameters and calls confirm.

## Not in scope

Owner overview (release 2), Stripe live mode (release 2), plans or language add-ons (US-L033,
US-T018), non-Danish companies, refunds or credit notes from the app, an audit log.
