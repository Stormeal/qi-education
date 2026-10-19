# User stories

Updated: 2026-10-19. Open work only. Priority order chosen by Alex: **teachers, learners,
platform reliability**, with confirmed defects before enhancements. What the app already does is
in [specs/](specs/README.md); use [work_queue.md](work_queue.md) for the next item and active work.

A story is removed once it is delivered, and a delivered scenario is removed from a story that
stays open. Its behavior is then folded into the matching area spec; the old contract and its
evidence stay in Git history. IDs are never reused, so gaps in the numbering are delivered work.

## Backlog

| ID | Story | State | Priority | Dependencies | Contract |
| --- | --- | --- | --- | --- | --- |
| US-A004 | Curriculum review and changed milestone criteria | In progress | P2 | Curriculum owner | [stories/US-A004](stories/US-A004-curriculum-review.md) |
| US-P001 | Verify complete role journeys before release | In progress | P2 | Browser test runner decision | Below |
| US-P003 | Safe writes across API instances | In progress | P2 | Distributed coordination decision | Below, INV-003/004 |

Priorities describe impact; the queue describes delivery order. P1 is a high-impact access or
release concern; P2 affects a core journey; P3 improves convenience.

## Teacher and admin journey

### US-A004 — Curate career milestone graphs and map TestHuset courses

**As an admin, I want to curate job routes using milestones, learning options and explicit
requirements, so learners see a credible route through our courses.**

State: In progress. Milestone curation, requirement routes, graph validation and permissions are
delivered (see [career curation](specs/career-paths/curation.md)). Open: the curriculum review
(AC04, Alex / curriculum owner) and changed criteria (AC06). Details and the candidate course map:
[stories/US-A004-curriculum-review.md](stories/US-A004-curriculum-review.md).

```gherkin
Feature: Credible career milestone curation
  Scenario: US-A004-AC04 Map real catalogue offerings honestly
    Given the current TestHuset course inventory and the three proposed routes
    When the curriculum mapping is reviewed for publication
    Then every inventoried course is mapped or explicitly deferred with a reason
    And equivalent formats are not confused with different qualifications
    And external courses are distinguished from available Academy courses
    And planned on-demand courses are labelled unavailable until published

  Scenario: US-A004-AC06 Revise content without losing achievements
    Given learners follow a published route and have recorded achievements
    When I publish a material change to milestone criteria
    Then changed criteria use explicit requirement versions and an update explanation
    And historical evidence, goals and enrollments remain stored
```

## Platform reliability

### US-P001 — Verify complete role journeys before release

**As a maintainer, I want repeatable journey verification, so that changes do not pass unit tests
while breaking teaching or learning.**

State: In progress. Delivered: the API-level release journey (`npm run verify:journeys`, also part
of `npm run api:test`). Remaining: a repeatable check of the screens themselves and the live
rehearsal in the [teacher rehearsal checklist](release/teacher-rehearsal-checklist.md). Open
decision: whether to add a browser test runner (new dependency and CI browser install).

```gherkin
Feature: Journey verification
  Scenario: US-P001-AC01 Exercise a release candidate
    Given a clean checkout with isolated test data
    When I run the journey checks
    Then teacher authoring, admin review, learner enrollment, and progress are exercised
    And cross-user and forbidden-role access are checked
    And a failed behavior prevents a successful verification result

  Scenario: US-P001-AC02 Keep verification safe and actionable
    Given a check fails
    When I inspect its result
    Then the failing scenario, tested commit, and useful evidence are recorded
    And no shared user data or real GitHub issue has been created
```

### US-P003 — Safe writes across API instances

**As a maintainer, I want concurrent or retried operations to have one intended outcome, so that
duplicate accounts, lost enrollment, or duplicate issues do not result.**

State: In progress. Single-instance protection (keyed queues) is delivered; see
[reliability](specs/platform/reliability.md). MongoDB accounts (cut over 2026-10-18) already give a
unique email index and atomic enrollment across instances. Decision for Alex: confirm that this
closes the account part, and choose durable issue lookup or idempotency for feedback triage after a
restart or on another instance.

```gherkin
Feature: Safe account and feedback writes
  Scenario: US-P003-AC04 Safe writes across API instances
    Given several API instances or an instance restart
    And a shared uniqueness, update and retry strategy has been agreed
    When account operations overlap or a failed triage is retried on another instance
    Then at most one account exists for a normalized email
    And both requested enrollments persist without duplicates or lost updates
    And triage links the already-created issue
```

## Adding a story

Allocate the next unused ID in the journey (T teacher, A admin, L learner, P platform). Add a table
row and a section with actor/goal/benefit, state, scope, dependencies, source, decisions and
uniquely numbered Given/When/Then scenarios. When the work needs a detailed contract, write it in
`stories/<story-id>-<topic>.md` from the [template](templates/feature_spec.md). New ideas start as
Proposed. Do not mark behavior Done because it has only been documented.

## Existing issue reconciliation

[GitHub #30](https://github.com/Stormeal/qi-education/issues/30) requests a catalog carousel. A
carousel exists; the issue is still open. Verify its original intent before changing its status.
