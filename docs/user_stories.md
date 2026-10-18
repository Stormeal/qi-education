# User stories

Updated: 2026-10-18. Open work only. Priority order chosen by Alex: **teachers, learners,
platform reliability**, with confirmed defects before enhancements. What the app already does is
in [specs/](specs/README.md); use [work_queue.md](work_queue.md) for the next item and active work.

A story is removed once it is delivered, and a delivered scenario is removed from a story that
stays open. Its behavior is then folded into the matching area spec; the old contract and its
evidence stay in Git history. IDs are never reused, so gaps in the numbering are delivered work.

## Backlog

| ID | Story | State | Priority | Dependencies | Contract |
| --- | --- | --- | --- | --- | --- |
| US-A004 | Curriculum review and changed milestone criteria | In progress | P2 | Curriculum owner | [stories/US-A004](stories/US-A004-curriculum-review.md) |
| US-L001 | Enroll and learn through authorized access | Proposed | P1 | Product decisions | Below |
| US-L014 | Confirm my email address at signup | Proposed | P3 | None | Below |
| US-P001 | Verify complete role journeys before release | In progress | P2 | Browser test runner decision | Below |
| US-P002 | Return useful, consistent API errors | In progress | P2 | None (defaults recorded) | Below |
| US-P003 | Safe writes across API instances | In progress | P2 | Distributed coordination decision | Below, INV-003/004 |
| US-P005 | Operator tooling for course lock recovery | Proposed | P2 | Operator permissions decision | Below |
| US-P008 | Limit client reset requests and confirmation mail | Proposed | P2 | Limit decision | Below, INV-014 |
| US-P016 | Retire the Google Sheets code for accounts and courses | Proposed | P3 | One clean hosted release | Below |

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

## Learner journey

### US-L001 — Enroll and learn through authorized access

**As a learner, I want to access published courses I have joined, so that my learning library
contains material I am authorized to use.**

State: Proposed. Published-only enrollment, authorized content and resources, the public outline
and direct-URL resume are delivered. Remaining decisions: public preview limits; access for
already-enrolled users after archival; whether prices are informational or require payment. No
payment system exists. The scenarios stay as the contract those decisions may change.

```gherkin
Feature: Enrollment and learning access
  Scenario: US-L001-AC01 Join a published eligible course
    Given I am signed in and the course is published and meets the agreed access policy
    When I enroll twice
    Then one enrollment exists and the course appears once in My Learning

  Scenario: US-L001-AC02 Deny unpublished enrollment
    Given a course is draft, ready-for-review, or archived
    When I attempt a new enrollment directly through the API
    Then the action is denied and my library is unchanged

  Scenario: US-L001-AC03 Protect full course content
    Given I am anonymous or not entitled to the course
    When I request its learning content or resources
    Then only the agreed public preview is available
    And draft lesson content and quiz scoring answers are not disclosed
```

### US-L014 — Confirm my email address at signup

**As a new user, I want to confirm that my email address is mine, so that recovery mail reaches me
and nobody can register with my address.**

State: Proposed, for later. Source: Alex, 2026-10-11. Decisions: whether an unconfirmed account may
sign in and enroll, how long the link is valid, and what happens to existing accounts.

```gherkin
Feature: Email confirmation
  Scenario: US-L014-AC01 Confirm a new address
    Given I signed up with an email address
    When I open the confirmation link sent to it
    Then the account is marked as confirmed
    And an expired or used link offers to send a new one

  Scenario: US-L014-AC02 An unconfirmed account
    Given I have not confirmed my address
    When I use the site
    Then the agreed limits for unconfirmed accounts apply
    And I can ask for the confirmation mail again
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

### US-P002 — Return useful, consistent API errors

**As a user, I want errors to explain what I can correct or retry, so that I can recover without
losing my work.**

State: In progress. Accurate 400/413/415 classification is delivered. Remaining: the UI half of
AC02 (retry guidance, draft kept). API part delivered 2026-10-18 (`2848ad5`, see
[reliability](specs/platform/reliability.md)):
store outages (`AuthUnavailableError`, `CourseStoreUnavailableError`, MongoDB connection, server
selection and network-timeout errors) answer 503 `{ message, code: 'STORE_UNAVAILABLE',
retryable: true }`; read-only freezes (`AuthReadOnlyError`, `CourseReadOnlyError`) answer 503
`{ message, code: 'READ_ONLY', retryable: false }`; `message` and existing codes stay, everything
else stays a plain 500. Field names `code`/`retryable` are defaults: confirm or change. The UI half
(retry guidance, draft kept) follows on top of these codes. Field-level DTO: not needed now (Zod
`issues` already answer 400).

```gherkin
Feature: API error feedback
  Scenario: US-P002-AC02 Recover from dependency failure
    Given a required storage or media integration is unavailable
    When I submit a valid action
    Then the UI gives actionable retry guidance and preserves my draft
    And it does not report the action as successfully saved
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

### US-P005 — Recover uncertain course operations safely

**As an operator, I want to reconcile an interrupted course write safely, so that learners regain
access without a delayed operation overwriting the recovered course.**

State: Proposed. Lock expiry after 31 minutes is delivered. Runbook:
[course operation recovery](course_operation_recovery.md). Remaining: operator tooling to inspect
and release a lock sooner. Decisions: operator identity and permissions, the evidence required
before release, and manual versus assisted recovery.

```gherkin
Feature: Verified course operation recovery
  Scenario: US-P005-AC03 Avoid unsupported recovery
    Given the owner has a malformed timestamp or has not reached the host bound
    When recovery is requested
    Then ownership remains in place with a concrete investigation action
    And the operator can use the verified manual recovery procedure
```

### US-P008 — Limit client reset requests and confirmation mail

**As a maintainer, I want the live service to refuse abuse, so that a guessing script cannot flood
mailboxes or exhaust the service.**

State: Proposed. Per-account sign-in limits and the three-mails-per-hour reset limit are delivered
(see [sign-in and sessions](specs/accounts/sign-in-and-sessions.md) and
[passwords and email](specs/accounts/passwords-and-email.md)). Remaining: per-client reset limits,
confirmation-mail limits and signup limits. Decisions: the limits and where they are enforced.

```gherkin
Feature: Safe operation of the live service
  Scenario: US-P008-AC05 Limit client reset requests and confirmation mail
    Given repeated recovery requests from one client or confirmation requests for one address or client
    When the agreed limit is exceeded
    Then no further mail is sent for the agreed period
    And the response still does not reveal whether the account exists
```

### US-P016 — Retire the Google Sheets code for accounts and courses

**As the team maintaining QI Academy, I want accounts and courses to have one storage path, so that
there is less code to keep correct and nothing reads the old sheets by mistake.**

State: Proposed (2026-10-17). Accounts and courses were cut over on 2026-10-18; start after one
release with a clean hosted log. Removes the Sheets repositories for users and courses, the
`USER_STORE`/`COURSE_STORE` switches with their health and doctor checks, the migration scripts, and
updates [storage and run modes](specs/platform/storage-and-run-modes.md) and
[local development](local_development.md). Feedback keeps its Google Sheets store; the old sheets
stay in Google Drive as a read-only backup.

```gherkin
Feature: One storage path for accounts and courses
  Scenario: US-P016-AC01 Only feedback uses Google Sheets
    Given the API source after this story
    When a reviewer searches it for Google Sheets clients
    Then only the feedback repository and its configuration use them
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
