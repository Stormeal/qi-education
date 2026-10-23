# US-O001 and US-O002: Organizations

Decisions agreed with Alex on 2026-10-20 (brainstorming). Not designed in detail yet: each release
gets its own design pass. Paid courses (US-L024) are delivered: [payments](../specs/payments/payments.md).

## Why

Customers want one place for their QA staff to train individually, and an overview of their
employees' training goals. Revenue for TestHuset.

## Release split (Alex, 2026-10-23)

US-O001 moves into **release 1** (internal, mid-December 2026), except the owner overview.

**Release 1:**
- Any signed-in user (student or teacher) requests an organization; a site admin approves or
  declines with a reason. Owning an organization is not a role: the requester keeps their role.
- Organization owners invite by email. An email without an account gets a sign-up link and the new
  account joins once its email is confirmed (Alex). An existing account accepts the invitation in
  the app. Accepting is the consent to share progress.
- Invitations expire after 14 days and can be resent or cancelled (default, confirm or change).
- Members list; an owner removes a member; a member leaves. Progress and own courses stay with the
  account.
- Site admin view: organizations and pending requests, approve/decline, suspend an organization
  (suspend is a default, confirm or change).
- Emails: request received, approved, declined with reason, invitation, member joined.
- Billed career per member, course add-on requests (owner approves or declines) and prices: a
  monthly seat price per career and an add-on price per course, set by admins. **Shown only,
  nothing is charged** until US-O002 (Alex).

**Release 2:** owner overview of members' careers, milestones and completion.

Release 1 contract (approved 2026-10-23): [US-O001-release-1.md](US-O001-release-1.md).
**Release 3:** US-O002 billing, unchanged.

Open for the design pass: whether a seat or add-on opens a *priced* course during release 1 (the
API draft's question 1). Default: courses stay free during the internal period, so no access change
is needed in release 1. Note: ISTQB Foundation repetition is published at 1,999 DKK today; set it to
0 before colleagues enroll if the free-access default holds.

## US-O001: Organizations without billing (original plan)

- Any user fills in an organization request form; it is **pending** until a site admin approves.
- The owner invites people by email. The invite says "Joining shares your career and course
  progress with {Organization}"; accepting is the consent.
- The owner assigns each member one **billed career**. The member's own focus stays theirs and
  never changes the bill.
- A seat opens the courses on the billed career. A course outside it is requested by the member;
  the owner sees the added monthly cost and approves or declines. Approval adds only that course.
- Owner overview, per member: billed career, own focus career, milestones achieved/ready/locked,
  completion % of career and add-on courses. No quiz scores, notes or lesson feedback.
- Until US-O002, an approved organization runs as a free trial.
- A person belongs to at most one organization (Alex, 2026-10-20).
- An invite to an email without an account sends a mail that opens sign-up; the person joins the
  organization once their email is confirmed (Alex, 2026-10-20).
- An organization can have several owners. The original owner (the one who requested it) can
  promote members to owners (Alex, 2026-10-20).
- A site admin declines a request only with a reason. The requester gets it by email, sees it on
  the request, and can correct the details and request again (Alex, 2026-10-20).

## US-O002: Organization billing (release 3)

- The organization **subscribes**; it never owns content. Monthly bill = sum of each member's
  career seat price + approved course add-ons. Stripe Billing subscription, prorated changes.
- Admins set a monthly seat price per career (career editor) and a monthly organization add-on
  price per course (catalog settings).
- The owner chooses card (charged automatically) or invoice (14-day terms, Stripe reminders).
- Invoice unpaid 14 days past due: members lose organization access until paid; the owner sees a
  warning. Access returns on payment.
- A member leaving or a cancelled subscription ends organization access. Progress, notes and
  achievements stay with the account; courses the person bought themselves stay theirs.
- This is where `canLearnCourse` gains an entitlement check (purchase, seat, add-on).
