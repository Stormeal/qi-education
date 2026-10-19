# US-P005 — Inspect course operation locks

Started 2026-10-19. Codex: API; Claude: Admin page panel. Handoff:
[US-P005-lock-inspection-codex.md](../handoffs/US-P005-lock-inspection-codex.md).

## Decisions (taken by the lead from the story defaults — Alex: confirm or change)

- **Operator:** admins only, on the Admin page. No new role.
- **Assisted, not automatic, recovery:** the tool only shows locks. It has no release button.
  A lock with a valid timestamp already frees itself on the next write after 31 minutes
  (`courseLockExpiryMs`), and AC03 forbids releasing one earlier. A lock with a malformed or
  missing timestamp never frees itself; the tool marks it and points to the manual runbook
  ([course operation recovery](../course_operation_recovery.md)).
- **Evidence shown:** course ID and title, owner, acquired-at as stored, when it frees itself,
  and a state (`held`, `expired`, `needs-recovery`). The owner is shown because the runbook
  deletes by course ID and owner together.
- Course locks only. The career-path publication lock (`_career_path_locks`) is out of scope.

## Scenarios

```gherkin
Feature: Inspect course operation locks
  Scenario: US-P005-AC01 An admin sees held locks with evidence
    Given a course write holds the course lock
    When an admin opens the course locks list
    Then the course, owner, acquisition time and automatic release time are shown as "held"

  Scenario: US-P005-AC02 Only admins can inspect locks
    Given I am anonymous, a student or a teacher
    When I request the course locks list
    Then I am refused (401 anonymous, 403 otherwise) and nothing is disclosed

  Scenario: US-P005-AC03 Avoid unsupported recovery
    Given the owner has a malformed timestamp or has not reached the host bound
    When recovery is requested
    Then ownership remains in place with a concrete investigation action
    And the operator can use the verified manual recovery procedure

  Scenario: US-P005-AC04 Expired locks are told apart
    Given a lock's timestamp is older than the 31-minute expiry
    When an admin opens the list
    Then it is shown as "expired", released by the next write to that course
```
