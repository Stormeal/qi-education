# US-O001 and US-O002: Organizations

Decisions agreed with Alex on 2026-10-20 (brainstorming). Not designed in detail yet: each release
gets its own design pass after [US-L024 paid courses](US-L024-paid-courses.md).

## Why

Customers want one place for their QA staff to train individually, and an overview of their
employees' training goals. Revenue for TestHuset.

## US-O001: Organizations without billing (release 2)

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
