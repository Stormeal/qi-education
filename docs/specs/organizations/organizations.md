# Organizations

## Purpose

A company brings its QA staff into QI Academy: an approved owner invites colleagues, gives each a
billed career and approves extra courses, and members learn those courses without paying. The
organization pays one monthly bill for those seats and courses, by card or invoice (US-O002), unless
an admin made it free. Release 1 of US-O001 and US-O002; the owner progress overview comes in
release 2 ([decisions](../../stories/US-O001-organizations.md)).

## Behavior

- **Request** (`/organization`, linked from the profile): a signed-in user who is not in an
  organization and has no pending request sends display name, company name, CVR, billing contact
  email and an optional message. The request shows as Pending and every site admin gets an email.
  Owning an organization is not a role: the requester keeps theirs.
- **Decision** (Admin → **Organizations**): approve makes an active organization with the requester
  as original owner and emails them; decline needs a reason, which the requester sees and receives
  by email, and **Correct and resubmit** makes the request pending again.
- **Invite** (owner view → **Invitations**): an invitation goes to an email and expires after 14 days;
  owners resend (new link, new expiry) or cancel it. The mail links to
  `/join-organization#token=…`, which shows the organization name and "Joining shares your career and
  course progress with {Organization}"; the token is removed from the address once read.
  - An address without an account gets **Sign up** with the email filled in; the membership is
    "pending email" until the email is confirmed (sign-in and `/auth/me` retry that activation).
  - An existing account signed in with the invited email clicks **Accept and join** and is an
    active member at once; owners get a "member joined" email. Signed in with another email:
    "This invitation is for {email}. Sign in with that address."
  - A second link opened in the same tab replaces the first one.
  - An expired, cancelled or used link, or a person already in another organization, is refused
    with a plain explanation and nothing about the members.
- **Members** (owner view): name, email, role and a career picker showing the seat price. An owner
  removes a member (after a confirmation); the original owner promotes a member to owner. A member,
  or an owner while another owner exists, leaves; the last owner gets "Make another member an owner
  first". Removed or leaving people keep their account, progress and own courses.
- **Billed career**: an owner assigns a member a published career. Every published course linked
  from any of its milestones, optional ones included, opens to that member.
- **Add-on courses**: a member asks for another published course (**Request another course**); an
  owner approves (the course opens) or declines (nothing changes). Owners see the add-on price.
- **Course access**: on the course page an opened course shows **Enroll (included by
  {Organization})** instead of **Buy**; enrolling is free and records the course in the membership.
  While the membership is active and the organization is not suspended, those courses appear in
  My Learning and open on the learning page. After leaving, removal or suspension they disappear
  from My Learning; progress stays stored and returns on rejoining with access or buying the course.
- **Prices**: admins set a monthly seat price per career (career editor) and an add-on price per
  course (catalog settings), whole DKK excluding moms; every price shows "excl. moms". Unpriced
  careers and courses are free and not billed. They are never recorded as personal payments.
- **Paid or free** (Admin → Organizations): an admin approves a request with **Approve** (paid) or
  **Approve free**, and switches later with **Make free** / **Require billing**. Organizations
  approved before US-O002 have no billing record and are free. Make free cancels the subscription
  at once without a refund (refund in Stripe by hand). Each organization row shows its billing state.
- **Billing** (owner view → **Billing**, owners only; decided with Alex 2026-11-02):
  - A paid organization without setup shows "Set up billing to open courses for your members" and
    the monthly total; its seats and add-ons open no courses until an owner sets up billing. There
    is no trial.
  - Setup asks for the billing address (street, 4-digit postcode, city; Danish companies only) and
    the method. **Invoice** creates the subscription at once with 14 days to pay. **Card** goes to
    Stripe's card form and back to `/organization?billing=card&session_id=…`; the route removes the
    query and the page confirms the session with the API (or the webhook does), never trusting the
    redirect alone. **Change payment method** runs setup again.
  - One monthly Stripe subscription per organization from the setup day, with a 0 DKK "QI Academy
    organization" line, one line per billed career (members with that career and a seat price)
    and one per extra course (approved add-ons whose course is not already in that member's
    career). The page lists the lines, the monthly total excl. moms, the method and the next
    invoice date; Stripe adds 25% moms through `STRIPE_ORG_TAX_RATE_ID`.
  - Owner changes (career set, changed or cleared; add-on approved; member removed or leaving)
    update the subscription with proration on the next invoice. Admin price changes reach every
    subscribing organization from its next invoice, without proration. If Stripe cannot be reached
    the change still stands and the page says "Billing update pending"; it is retried, in order, on
    the next billing read or change. A change needing a 21st billed line (Stripe's limit) is
    refused with "Contact us to bill more different careers and courses."
  - An unpaid invoice (card: from finalization; invoice: from its due date) shows the amount, due
    date and the date members lose access. From 14 days after that date organization courses close
    for members ("Members have lost access until the invoice is paid"), checked on every request
    with no scheduled job; paying or voiding reopens them, "uncollectible" does not.
  - **Cancel subscription** ends it at the end of the paid month; **Keep subscription** undoes that
    until then, also while an invoice is overdue. Afterwards members stay members without
    organization courses and an owner can set billing up again. **Manage billing** opens Stripe's
    portal for the organization's customer (invoices, card).
  - Members see why courses are closed ("open once an owner has set up billing", "closed until an
    unpaid invoice is paid", "the subscription has ended"); they never see billing details.
- **Suspend** (Admin → **Organizations**): members lose access through the organization, owners
  cannot invite, and the organization page says so with the invite and course request forms
  disabled. **Reactivate** restores both.

## Rules

- One organization per person. Permissions are re-read from storage on each request, never taken
  from the token. Only the original owner promotes; the original owner cannot be transferred.
- CVR is 8 digits; names 1–120 characters; message up to 1,000; decline reason 1–1,000; prices
  0–999,999 DKK or not set.
- Invitation tokens are 32 random bytes, single use, stored as a SHA-256 hash, never logged or put in
  a URL query. `check` is rate limited.
- Every route also answers under `/api`, with `Cache-Control: private, no-store`. Errors are
  `{ message }`: 400 invalid body, 401 signed out, 403 not allowed, 404 unknown or foreign resource,
  409 conflicting state (for example "Organization is suspended"), 410 invalid invitation, 503 store
  or mail unavailable. A failed email shows "Not sent. Try again." with a resend where one exists.
- `GET /auth/me`, sign-in and the enroll reply list organization-started courses in
  `enrolledCourseIds` (computed when answering, never stored) and add `organization: { id, role }`.
- Billing states: `free`, `setup-needed`, `active`, `overdue`, `blocked`, `cancelling`, `cancelled`;
  `setup-needed`, `blocked` and `cancelled` close organization courses. `GET /users/me/organization`
  adds `billingState`; `GET /admin/organizations` adds it per row. Billing errors answer 503
  "Billing is temporarily unavailable." when Stripe is not configured or cannot be reached, 409 for
  a free organization or a state that does not allow the action, 400 for an address or return URL
  that is not allowed.
- The billing webhook (`POST /webhooks/stripe-billing`, also under `/api`, signed with
  `STRIPE_BILLING_WEBHOOK_SECRET`, separate from the course-purchase webhook) finds the organization
  by Stripe customer, re-reads its subscription and open invoices from Stripe and stores them, so
  duplicates and order do not matter. Unknown customers are ignored; a storage or Stripe failure
  answers 500 so Stripe retries. Card setup finished in the webhook counts like the page's confirm.
- Suspension does not touch Stripe.
- US-P019 adds private notices for requests/resubmissions (admins), decisions (requester),
  invitations (existing account only) and active joins (owners, including delayed confirmation).
  Preferences and failures are handled by the [notification service](../platform/notifications.md);
  the original operation still succeeds if notice delivery fails. The bell UI remains pending.

| Route | Who |
| --- | --- |
| `GET /users/me/organization`, `POST`/`PUT /users/me/organization-request`, `DELETE /users/me/organization` | signed-in user |
| `GET /admin/organization-requests`, `POST /admin/organization-requests/:id/decision` | site admin |
| `GET /admin/organizations`, `POST /admin/organizations/:id/suspend`, `/reactivate` | site admin |
| `GET /organization-prices`; `PUT /admin/organization-prices/careers/:pathId`, `/courses/:courseId` | anyone signed in; site admin |
| `GET /organizations/:id/members`, `DELETE …/members/:userId`, `PUT …/members/:userId/career` | owner |
| `POST /organizations/:id/members/:userId/promote` | original owner |
| `GET`/`POST /organizations/:id/invitations`, `POST …/:inviteId/resend`, `DELETE …/:inviteId` | owner (invite only while active) |
| `GET /organizations/:id/billing`, `POST …/billing/setup`, `POST …/billing/card/confirm`, `PUT …/billing/cancellation`, `POST …/billing/portal` | owner |
| `PUT /admin/organizations/:id/billing` (`{ free }`) | site admin |
| `POST /webhooks/stripe-billing` | Stripe (signed) |
| `POST /organization-invitations/check` | anyone |
| `POST /organization-invitations/accept` | signed in with the invited email |
| `GET`/`POST /organizations/:id/course-requests`, `POST …/:requestId/decision` | owner; member requests |

## Code

- Billing API: `organizationBilling.ts` (states, lines, 20-line limit), `organizationBillingService.ts`
  (Stripe adapter pinned to `2026-09-30.endive`, tax id `eu_vat` `DK<cvr>`, and the offline fake used
  in isolated runs and tests), `organizationBillingRoutes.ts` (routes and webhook); billing state is
  the optional `billing` field on the stored organization. `/health/config` reports
  `organizationBilling: { configured, webhookConfigured, taxRateConfigured }`.
- API: `api/src/organizationRoutes.ts`, `organizationService.ts`, `organizationRepository.ts`
  (memory and MongoDB: `_organization_requests`, `_organizations`, `_organization_memberships` keyed
  by user, `_organization_invitations`, `_organization_course_requests`, `_organization_prices`),
  `organization.ts`; tests `organization*.test.ts` and the organization pass in `npm run verify:journeys`.
- App: `app/src/app/services/organization.service.ts`, `pages/organization-page/`,
  `pages/join-organization-page/`, `ui/admin-organizations/`, `ui/organization-price-field/`,
  `ui/organization-billing/` (owner Billing section); card return in `routes/organization-route.ts`.

## Limits

- Not yet checked on the live site (AC01–AC12 with a second real email address).
- Billing is not verified against real Stripe (test mode): customer, subscription, invoice,
  proration, tax rate, portal and webhook deliveries. Before use, in the Stripe dashboard: failed
  card payments and overdue invoices must leave the subscription as it is (never cancel it),
  invoice reminders on, the portal allows invoices and payment methods, a 25% moms tax rate for
  `STRIPE_ORG_TAX_RATE_ID`, and a webhook destination for `/webhooks/stripe-billing` with its own
  secret sending `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`,
  `invoice.voided`, `invoice.marked_uncollectible`. Stripe live mode is release 2.
- No refunds or credit notes from the app, no billing for non-Danish companies, at most 20 different
  billed careers and courses per organization.
- No audit log, job queue or automatic email retries, paging, organization deletion or owner
  transfer.
