# Organization billing setup (US-O002)

What has to happen before organizations pay through QI Academy. The code is in `main` (delivered
locally 2026-11-02, `1f04a13`); behavior is in [organizations](../specs/organizations/organizations.md).
Sections 1–3 are done in Stripe **test mode** now; section 5 repeats them in live mode at release 2.

## Until billing is wanted (from the first push)

- Pushing is safe: organizations approved before US-O002 stay free, and nothing changes for them.
- **Approve** now makes a *paid* organization, whose courses stay closed until an owner sets up
  billing. While billing is not in use (release 1, internal), approve with **Approve free**. An
  organization approved by mistake as paid: Admin → Organizations → **Make free**.

## 1. Stripe dashboard settings (test mode)

Open https://dashboard.stripe.com with **Test mode** on.

1. Settings → Billing → **Subscriptions and emails**:
   - Under failed payments, when all retries fail: choose **leave the subscription past due**
     (not cancel, not mark unpaid).
   - Under invoices sent to customers, when an invoice is past due: choose **leave the
     subscription as-is**, and turn **reminders** on.
   - Save. QI Academy closes courses itself 14 days after the due date and reopens them on payment;
     a subscription Stripe cancelled could not be reopened.
2. Settings → Billing → **Customer portal**: invoice history and payment method updates on. Save.
3. Search the dashboard for **Tax rates** → **Create tax rate**: name `Moms`, Denmark, 25%,
   **exclusive**. Copy its ID (`txr_…`).
4. Developers → Webhooks → **Add destination**: endpoint
   `https://qi-education.vercel.app/api/webhooks/stripe-billing`, events
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`,
   `invoice.marked_uncollectible`. Name it `qi-academy-billing-vercel`. Copy its signing secret
   (`whsec_…`). Keep the existing `qi-academy-vercel` destination as it is (course purchases).

You know it is finished when the four settings are saved and you have a `txr_…` ID and a
`whsec_…` secret.

## 2. Vercel environment variables

Vercel → project → Settings → Environment Variables, Production:

- `STRIPE_ORG_TAX_RATE_ID` = the `txr_…` ID
- `STRIPE_BILLING_WEBHOOK_SECRET` = the `whsec_…` secret

Added variables are picked up by the next push. Afterwards
https://qi-education.vercel.app/api/health/config shows
`"organizationBilling": { "configured": true, "webhookConfigured": true, "taxRateConfigured": true }`.

## 3. Hosted check in test mode (not done yet)

Not yet verified against real Stripe: customer, subscription, invoice, proration, tax line,
portal and webhook delivery. With a test organization approved as paid and a career with a seat
price:

1. Owner sets up **Invoice**: Stripe shows a customer with the address and `DK<cvr>`, and a
   subscription with the base line and the seat line; the first invoice has a 25% moms line.
2. Owner assigns a second member the same career: the seat quantity becomes 2 and the next
   invoice preview has a proration.
3. Owner switches to **Card** with test card `4242 4242 4242 4242`: back on the page it says
   "Card saved", and the subscription charges automatically.
4. In Stripe, mark an invoice paid or void it: the webhook delivery shows 200 and the warning on
   the Billing section goes away.
5. **Manage billing** opens Stripe's portal with the invoices and the card.

## 4. Product decisions still open for release 3

None blocking. The defaults Alex accepted on 2026-11-02 are in the organizations spec (no trial,
prices excl. moms, cancel at period end, Make free without refund, Danish companies only).

## 5. Live mode (release 2, with Stripe live mode for course purchases)

Live key, Stripe business verification, then steps 1–2 again with **Test mode** off (new tax rate,
new webhook destination and secret), and a real first invoice checked before inviting customers.
