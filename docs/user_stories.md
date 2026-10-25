# User stories

Updated: 2026-10-23. Open work only. Priority order chosen by Alex: **teachers, learners,
platform reliability**, with confirmed defects before enhancements. What the app already does is
in [specs/](specs/README.md); use [work_queue.md](work_queue.md) for the next item and active work.

A story is removed once it is delivered, and a delivered scenario is removed from a story that
stays open. Its behavior is then folded into the matching area spec; the old contract and its
evidence stay in Git history. IDs are never reused, so gaps in the numbering are delivered work.

## Releases

Roadmap agreed by Alex (product owner) on 2026-10-23; the management version is the
[QI Academy Roadmap](https://claude.ai/artifact/M5vCXNJZqTWmxhFcWQLVCJ) page; teachers and admins
see a copy at `/roadmap` in the app (`roadmap-page.ts`), so change both together. Release 1 scope may
grow after Alex's department interviews (week of 26 October: marketing, IT, sales, course
department); new requests enter here as Proposed stories.

| Release | Target | Goal | In scope |
| --- | --- | --- | --- |
| 1, internal | Mid-December 2026 | TestHuset colleagues learn and teachers build courses; no public sales | US-P018 (Must), US-O001 without the owner overview: requests, approval, owner invites, members, billed careers, add-on requests and prices shown but not charged (Must), US-A004-AC04 (Must), live-site checks in [work_queue.md](work_queue.md) (Must), US-A004-AC06 (Should), US-P003 feedback part / INV-004 (Should) |
| 2, public launch | Around Q2 2027 | Sell to individuals and organizations | US-O001 owner overview, Stripe live mode, external security test, accessibility review, US-P001, dependency majors (Angular 22) |
| 3, organization billing | After launch, 2027 | Paid organization seats | US-O002 |

Release 1 decisions (built as defaults, confirm or change): courses stay free during the internal
period and public prices are set at launch, so colleagues enrolled before then keep free access
(existing rule, no new feature); sign-up stays open and unannounced. Open for management: hosting
budget, curriculum owner, backup developer.

## Backlog

| ID | Story | State | Priority | Dependencies | Contract |
| --- | --- | --- | --- | --- | --- |
| US-O001 | Organizations: request, approval, invites, owner overview | Release 1 delivered 2026-10-24 (not live); owner overview in release 2 | P1 | — | [stories/US-O001](stories/US-O001-organizations.md) |
| US-O002 | Organization billing: career seats, course add-ons, card or invoice | Decided, not designed | P2 | US-O001 | [stories/US-O001](stories/US-O001-organizations.md) |
| US-A004 | Curriculum review (changed criteria delivered) | In progress | P2 | Curriculum owner | [stories/US-A004](stories/US-A004-curriculum-review.md) |
| US-A006 | Feedback, defect reports and change requests in MongoDB | In progress | P2 | INV-004 included | [stories/US-A006](stories/US-A006-feedback-mongodb.md) |
| US-P001 | Verify complete role journeys before release | In progress | P2 | Browser test runner decision | Below |
| US-P003 | Safe writes across API instances | In progress | P2 | Distributed coordination decision | Below, INV-003/004 |
| US-P018 | Ready for internal company use (release 1) | Proposed | P1 | Hosting budget (management) | Below |

Priorities describe impact; the queue describes delivery order. P1 is a high-impact access or
release concern; P2 affects a core journey; P3 improves convenience.

## Teacher and admin journey

### US-A004 — Curate career milestone graphs and map TestHuset courses

**As an admin, I want to curate job routes using milestones, learning options and explicit
requirements, so learners see a credible route through our courses.**

State: In progress. Milestone curation, requirement routes, graph validation and permissions are
delivered (see [career curation](specs/career-paths/curation.md)). Changed criteria (AC06) delivered
2026-10-24 (requirement versions and the learner notice, in the same specs). Open: the curriculum
review (AC04, Alex / curriculum owner). Details and the candidate course map:
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

### US-P018 — Ready for internal company use (release 1)

**As TestHuset, I want QI Academy hosted, secured and handling employee data properly, so that
colleagues can use it from mid-December without legal or operational risk.**

State: Proposed (Alex, 2026-10-23). Mostly configuration and agreements. AC04 delivered
2026-10-24: ip-address fixed; Zod and body-parser accepted with reasons in
[audits/2026-10-dependencies.md](audits/2026-10-dependencies.md#us-p018-ac04), to revisit before release 1.
Dependency: management approves about 450–700 DKK a month for hosting.

```gherkin
Feature: Fit for company use
  Scenario: US-P018-AC01 Paid hosting with backups
    Given the hosting budget is approved
    When the API runs on Vercel Pro and the database on a production MongoDB Atlas plan
    Then the hosting terms allow company use
    And a database backup runs on a schedule and a restore has been rehearsed

  Scenario: US-P018-AC02 Private source code
    Given the GitHub repository is private
    When main is pushed
    Then the site and the API still deploy as before

  Scenario: US-P018-AC03 Employee data handled correctly
    Given colleagues' accounts, progress and notes are personal data
    When release 1 starts
    Then the data is stored in an EU region
    And data processing agreements exist with Vercel, MongoDB, Mux, Brevo, Google and Stripe
    And the privacy notice describes what is stored and why

  Scenario: US-P018-AC04 No known high-severity finding in the running server
    Given the October dependency report
    When release 1 starts
    Then every high or critical finding in the API's production dependencies is fixed or accepted with a reason
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
