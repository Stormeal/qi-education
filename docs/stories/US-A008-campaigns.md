# US-A008: Sales and discount campaigns

**As someone in marketing, I want time-boxed sales and discount codes, with a banner and results, so
that I can promote courses and careers and see whether a campaign worked.**

Designed with Alex on 2026-11-01 (brainstorming). Builds on [payments](../specs/payments/payments.md)
and [careers](../specs/career-paths/careers.md). Not started: Alex shows marketing the design on 2026-11-12 and brings their feedback
before the build begins. Release: built after that feedback and checked on Stripe test mode.
Release 1 courses are free, so campaigns change no price until public prices start at launch
(confirm or change).

## Decisions

Agreed by Alex:
- Campaigns are run by a new **`marketing`** role. Admins can do everything marketing can.
- In scope: automatic sales, discount codes, a sale ribbon and "On sale" catalog row, an optional
  site-wide banner, and campaign results with campaign links.
- Discounts never stack: the buyer gets the **single largest** discount.
- Parked as Proposed stories: free preview lesson (US-L030), career bundle price (US-A009), marketing
  email opt-in (US-A010), referral (US-A011).

Defaults, confirm or change:
- The sale price is rounded down to whole DKK and never below 3 DKK (today's lowest allowed price).
- Codes have no usage limit and no per-account limit; anyone with the code can use it until the
  campaign ends.
- Free courses ignore campaigns. Organization seat and add-on prices are untouched.
- A marketing account otherwise has the student's rights.
- Discounts are computed by the API and Stripe Checkout gets the final amount. Stripe coupons and
  promotion codes are not used.

## Roles and access

- `marketing` joins `student | teacher | admin` everywhere a role is listed (API schema, app types,
  admin Users role picker, privacy export). An admin sets it on the Users page.
- Marketing and admin accounts see a **Marketing** link in the header and open `/marketing`. Others
  get 403 from every campaign management route and are sent away from the page.
- Marketing cannot author, review, publish, see other accounts or any learner data. Results show
  counts and amounts only, never who bought.

## Campaign

| Field | Rule |
| --- | --- |
| `name` | 1–80 characters, shown to marketing only |
| `target` | `{ type: 'course', courseId }` or `{ type: 'career', careerId }` |
| `discount` | `{ kind: 'percent', value }` 5–90 whole percent, or `{ kind: 'fixed', valueDkk }` 1–999,999 whole DKK |
| `startsAt`, `endsAt` | ISO times; `endsAt` after `startsAt` |
| `code` | Optional, 3–24 letters, digits or `-`, stored upper case, compared case-insensitively, unique among campaigns that have not ended |
| `bannerText` | Optional, 1–140 characters of plain text |

- State is computed: **Scheduled** before `startsAt`, **Active** from `startsAt` until `endsAt`,
  **Ended** after. **End now** sets `endsAt` to now.
- Without a code the campaign is an **automatic sale**. With a code it applies only to a buyer who
  enters the code.
- A career target covers every course a published career links to (steps, milestone courses and
  requirement routes; preview placeholders without a course are skipped), read when the price is
  computed, so a course added to the career later is covered.
- A campaign with purchases can be edited (name, end time, banner) and ended, but not deleted, and
  its target and discount are locked. One without purchases can be edited freely or deleted.

## Price

For a priced course (`priceDkk` > 0) at a given moment, with an optional code:

1. Candidates: every active automatic sale whose target covers the course, plus the code's campaign
   when the code is valid, active and covers the course.
2. Each candidate's price: `floor(price × (100 − percent) / 100)` or `price − valueDkk`, then at
   least 3 DKK. If the list price is below 3 DKK nothing changes.
3. The lowest price wins; ties go to the campaign that ends first. No candidate means the list price.

The API computes this on every read and at checkout. The browser never sends a price.

## Scenarios

### AC01: Marketing role
- An admin changes an account to Marketing on the Users page; on its next request it sees the
  Marketing link. A student opening `/marketing` is sent to Home; its API calls answer 403.

### AC02: Create, edit, end, delete
- Marketing creates a 20% sale on one course from next Monday to Sunday; the list shows it as
  Scheduled with its dates.
- An invalid form (no target, 95%, end before start, duplicate active code) shows the reason by the
  field and saves nothing (API 400 `{ message }`).
- **End now** turns an Active campaign Ended. **Delete** is offered only without purchases (API 409
  "This campaign has purchases and cannot be deleted." otherwise).

### AC03: Automatic sale shown to buyers
- While a sale is active, the course card shows a **Sale** ribbon, the list price struck through
  and the sale price; the catalog shows an **On sale** row of those courses; the course page shows
  **Buy for 80 DKK**, "was 100 DKK" and "Sale ends 30 Nov".
- Course reads (`GET /courses`, `GET /courses/:id`) add `sale: { priceDkk, listPriceDkk, endsAt }`
  for a priced course with an active automatic sale, and no `sale` otherwise. Cached responses must
  not outlive `endsAt` by more than the existing cache time.
- Before the start and after the end nothing changes.

### AC04: Discount code
- The course page of a priced course shows **Have a code?**. Applying a code asks
  `GET /courses/:id/price?code=…` and shows "Code SPRING25 applied: 75 DKK" or "This code is not
  valid for this course." (unknown, ended, scheduled or other target all read the same).
- A code worse than the running sale shows "The sale price is already lower." and keeps the sale
  price.
- **Buy** sends `{ returnUrl, code?, campaignLink? }`; checkout recomputes the price, refuses an
  invalid code with 400 and the same message, and creates the Stripe session with the final amount.

### AC05: Best one wins
- A course with a 10% course sale, a 25% career sale and a 20% code: the buyer pays 75% of the list
  price with or without the code. Rounding: 20% off 99 DKK is 79 DKK; 50 DKK off a 40 DKK course is
  3 DKK.

### AC06: Banner
- An active campaign with banner text shows it in a strip under the header on every page, linking
  to the target course (or the career page). With several, the one that ends first shows. **Dismiss**
  hides that campaign's banner in this browser. Public read: `GET /campaigns/banner` (no sign-in,
  never reveals a code unless the banner text contains it).

### AC07: Payment record and results
- A payment also stores `listPriceDkk`, `campaignId` (the winning campaign or none), `code` (as
  entered and valid) and `campaignLink` (the campaign id from `?campaign=` when the buyer arrived
  through a campaign link in this browser session).
- The Marketing page shows per campaign: purchases, revenue (DKK paid), discount given (list minus
  paid) and purchases through its campaign link. Refunded payments are left out of all three sums.
- **Copy link** copies the target page address with `?campaign=<id>`.
- Confirm and webhook keep writing the same record once; the stored amount is the amount Stripe
  charged.

### AC08: Privacy
- A learner's export lists the code and list price on their payments. Erasure treats the new fields
  like the rest of the payment record. Campaigns hold no personal data.

## Not in scope

Usage-limited codes, per-account limits, sales on free courses, organization prices, Stripe
promotion codes, scheduled emails, A/B tests.
