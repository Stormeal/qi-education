# US-L025: A full refund removes access

## Record

- Story: US-L025 in the [backlog](../user_stories.md). Follows US-L024 ([payments](../specs/payments/payments.md)).
- Design agreed with Alex on 2026-10-20 (option A): refunds stay in the Stripe dashboard; the
  existing webhook learns about them and the API removes the enrollment. No new screen.
- Owner: Codex (API). Claude reviews and updates the specs and business rules.

## Decisions

- Only a **full** refund removes access (Stripe `charge.refunded` with the whole amount refunded).
  A partial refund changes nothing.
- The purchase is found from Stripe's own data: the refunded charge's payment intent leads to the
  Checkout session, whose id is our payment record's id and whose metadata names the account and
  course. Nothing new is stored before a refund.
- The payment record is marked refunded (a `refundedAt` date). The record is never deleted.
- The enrollment is removed only if the account has no other paid, unrefunded purchase of the same
  course (the duplicate-purchase case keeps access). Authors and admins keep author access anyway.
- Progress, notes, achievements and other enrollments are kept. Buying again restores access and
  the learner continues where they left off.
- Repeated or late refund events change nothing. A refund for a payment we do not know is ignored
  (200, logged as `Refund for unknown payment` with the session or payment intent id only).
- Storage failure answers 500 so Stripe retries, as for paid events.
- Business rule changes from "a purchase is never taken away" to "removed only by a full refund".

## Scenarios

```gherkin
Feature: A full refund removes access
  Scenario: US-L025-AC01 Full refund removes the course
    Given a learner who bought a course
    When Stripe reports the payment fully refunded
    Then the payment is marked refunded and the course leaves the learner's enrollments
    And the learner's progress and notes for that course are still stored

  Scenario: US-L025-AC02 Partial refund keeps access
    When Stripe reports a partial refund
    Then nothing changes

  Scenario: US-L025-AC03 Duplicate purchase keeps access
    Given a learner who bought the same course twice
    When one of the two payments is fully refunded
    Then the learner keeps the course

  Scenario: US-L025-AC04 Repeated and unknown refunds are harmless
    When the same refund event arrives twice, or a refund for an unknown payment arrives
    Then the second changes nothing and the unknown one is ignored with 200

  Scenario: US-L025-AC05 Buying again after a refund
    Given a learner whose purchase was refunded
    When they buy the course again
    Then they are enrolled again and see their earlier progress
```

## Hosted step (Alex, after the push)

Stripe (Test mode) → **Developers** → **Webhooks** → `qi-academy-vercel` → **Edit destination** →
add the event `charge.refunded` → **Save**. Then refund a test purchase in Stripe → **Payments** and
check that the course leaves My Learning.
