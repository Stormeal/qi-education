# User stories

Updated: 2026-10-13. Priority order chosen by the user: **teachers, learners,
platform reliability**, with confirmed defects before enhancements. Story status
and evidence distinguish desired changes from delivered behavior. Current behavior
is documented in [architecture.md](architecture.md).
Use [work_queue.md](work_queue.md) for the next item and active handoff.

## Backlog

| ID | Story | State | Priority | Dependencies | Defects |
| --- | --- | --- | --- | --- | --- |
| US-L001 | Enroll and learn through authorized access | Proposed | P1 | T001, T002 | DEF-003, DEF-004, DEF-010 |
| US-L007 | Present the primary recommendation first | Proposed | P3 | L002 | GitHub #45 |
| US-L014 | Confirm my email address at signup | Proposed | P3 | P009 | None |
| US-P001 | Verify complete role journeys before release | In progress | P2 | Teacher/learner contracts | None |
| US-P002 | Return useful, consistent API errors | Proposed | P2 | None | DEF-008 |
| US-P003 | Retry account/feedback operations safely | In progress | P2 | Distributed coordination decision | DEF-023/024/025; multi-instance/restart work remains |
| US-P004 | Recover career guidance safely across failures and sessions | In progress | P2 | L006, L009; per-increment checks | DEF-016 fixed in this delivery |
| US-P005 | Recover uncertain course operations safely | In progress | P2 | Lifecycle access | DEF-P005-LOCK; operator tooling remains Proposed |
| US-P006 | Keep courses available when a class uses them together | In progress | P1 | Lifecycle access | DEF-P006-01–04; hosted budget/AC06 pending |
| US-P008 | Limit client reset requests and confirmation mail | Proposed | P2 | Client/confirmation limit decision | AC02 per-account login delivered locally; INV-014 signup investigation remains; safe-operation spec |

Priorities describe impact, while the queue describes delivery sequence. P1 is a
high-impact access or release concern; P2 affects a core journey; P3 improves
convenience.

This file lists open work only. A story is removed once it is delivered, and a delivered
scenario is removed from a story that stays open; IDs are never reused, so gaps in the
numbering are delivered work. Their contracts and evidence remain in `specs/`,
`verification/` and Git history. Resolved defects are different: they stay in
[defect_management.md](defect_management.md).

## Teacher journey

No open teacher or admin story. US-A002 (category warning) was delivered 2026-10-13;
see its [spec](specs/US-A002-missing-category.md).

## Learner journey

### US-L001 — Enroll and learn through authorized access

**As a learner, I want to access published courses I have joined, so that my
learning library contains material I am authorized to use.**

State: Proposed. Dependencies: none open. Published-only enrollment, authorized content and
resources, the public outline and direct-URL resume are delivered and removed from this story.
Remaining decisions: public preview limits; access for already-enrolled users after archival;
whether prices are informational or require payment. No payment system currently exists.
The scenarios below stay as the contract those decisions may change.

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

### US-L007 — Present the primary recommendation first

**As a learner, I want my recommended next action first in the home list,
so that I can identify the next useful step quickly.**

State: Proposed. Dependency: US-L002 supplies real activity instead of fixtures.
Source: [GitHub #45](https://github.com/Stormeal/qi-education/issues/45).
Confirm which action is primary and the corner-ribbon treatment before UI implementation.

```gherkin
Feature: Home recommendation emphasis
  Scenario: US-L007-AC01 A recommendation exists
    Given my account has a primary recommendation
    When I view the home action list
    Then that recommendation appears first with the agreed corner ribbon
    And its text remains readable at supported screen sizes

  Scenario: US-L007-AC02 No recommendation exists
    Given my account has no recommendation
    When I view the home action list
    Then the page shows an honest starting state without a fabricated recommendation
```

### US-L014 — Confirm my email address at signup

**As a new user, I want to confirm that my email address is mine, so that recovery
mail reaches me and nobody can register with my address.**

State: Proposed, for later. Source: Alex, 2026-10-11 brainstorm on account email.
Depends on US-P009. Decisions: whether an unconfirmed account may sign in and enroll,
how long the confirmation link is valid, and what happens to existing accounts.

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

**As a maintainer, I want repeatable journey verification, so that changes do
not pass unit tests while breaking teaching or learning.**

State: In progress. Delivered: the API-level release journey (`npm run verify:journeys`,
also part of every `npm run api:test`) and two manual walks of the teacher, admin and
learner screens against in-memory stores
([record](verification/2026-10-09/teacher-walkthrough.md)). Remaining: a repeatable check
of the screens themselves and the live rehearsal in the
[teacher rehearsal checklist](release/teacher-rehearsal-checklist.md). Open decision:
whether to add a browser test runner (new dependency and CI browser install).

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

**As a user, I want errors to explain what I can correct or retry, so that I
can recover without losing my work.**

State: Proposed. Accurate 400/413/415 classification is delivered and removed from this
story. Remaining: recovery guidance when a dependency fails. Decisions: stable error codes
and a field-error DTO; preserve the current `message` field for compatibility.

```gherkin
Feature: API error feedback
  Scenario: US-P002-AC02 Recover from dependency failure
    Given a required storage or media integration is unavailable
    When I submit a valid action
    Then the UI gives actionable retry guidance and preserves my draft
    And it does not report the action as successfully saved
```

### US-P003 — Retry account and feedback operations safely

**As a maintainer, I want concurrent/retried operations to have one intended
outcome, so that duplicate accounts, lost enrollment, or duplicate issues do not result.**

State: In progress (remaining distributed/restart scope). Single-instance AC01,
AC02 and AC03 are delivered and removed; reproduction, contract and acceptance
are retained in the [safe-retries spec](specs/US-P003-safe-retries.md). INV-003/004
were reproduced as DEF-023/024/025. In-memory enrollment did not reproduce a
lost update and its repository behavior was preserved.

Across several API instances nothing new is guaranteed. Decision for Alex:
retain Sheets with shared uniqueness/atomic-update coordination, or move account
writes to a store providing those guarantees; choose durable feedback issue
lookup/idempotency for restart or cold-instance recovery. Auth abuse controls
and attempt limits remain US-P008-AC02, outside this increment.

```gherkin
Feature: Safe account and feedback writes
  Scenario: US-P003-AC04 Safe writes across API instances (Proposed)
    Given several API instances or an instance restart
    And a shared uniqueness, update and retry strategy has been agreed
    When account operations overlap or a failed triage is retried on another instance
    Then at most one account exists for a normalized email
    And both requested enrollments persist without duplicates or lost updates
    And triage links the already-created issue
```

### US-P004 — Recover career guidance safely across failures and sessions

**As a learner, I want guidance to stay honest and private during failures, so
that I can retry safely without seeing another account's path or false success.**

State: In progress. Source: [career path audit](audits/2026-10-05/career_path_audit.md).
Depends on US-L006 and US-L009; apply relevant checks to each delivered increment.
API boundaries and selection concurrency (AC03–04) are delivered and removed;
[account progress spec](specs/US-L002-account-progress.md) records the atomic
last-committed-write-wins/reassertion retry policy and verification. Claude delivered
AC01–02 in the career page/service; final story closure remains with the lead.
A last known selection must be labeled stale when freshness is unknown.

```gherkin
Feature: Reliable private career guidance
  Scenario: US-P004-AC01 Distinguish absence from failure
    Given career guidance is loading, unavailable, missing, or genuinely unselected
    When I open the page
    Then it presents the matching loading, retry, missing-path, or starting state
    And it does not replace those states with fictional progress or successful selection

  Scenario: US-P004-AC02 Ignore responses from an old session
    Given an account request is pending
    When I log out or switch accounts before it completes
    Then its response cannot overwrite the new account's selection or progress
    And private cached path data is not shown to the new account

```

### US-P005 — Recover uncertain course operations safely

**As an operator, I want to reconcile an interrupted course write safely, so that
learners regain access without a delayed operation overwriting the recovered course.**

State: In progress. Lock expiry after 31 minutes is delivered (Alex approved expiry beyond
the host maximum on 2026-10-09) and removed from this story. Spec:
[bounded lock recovery](specs/US-P005-lock-recovery.md); runbook:
[course operation recovery](course_operation_recovery.md). Remaining: operator tooling to
inspect and release a lock sooner than the expiry. Decisions: operator identity and
permissions, the evidence required before release, and manual versus assisted recovery.

```gherkin
Feature: Verified course operation recovery
  Scenario: US-P005-AC03 Avoid unsupported recovery
    Given the owner has a malformed timestamp or has not reached the host bound
    When recovery is requested
    Then ownership remains in place with a concrete investigation action
    And the operator can use the verified manual recovery procedure
```

### US-P006 — Keep courses available when a class uses them together

**As a learner, I want lessons to load when my whole class opens the same course,
so that a busy moment does not show errors or an "updating" message.**

State: In progress. Fewer Sheets reads per request, lock-free reads, a light course list and
ownership checks without file transfer are delivered and removed from this story. Spec:
[API class load](specs/US-P006-class-load.md). AC06 browser thumbnail caching (INV-018 /
DEF-021) is delivered locally with isolated HTTP regressions and removed from this
story; its contract and acceptance record remain in the spec. Remaining: hosted
AC02 check of the per-minute Sheets budget. Versioned thumbnails use private
browser caching only; public caching is outside the selected scope.

### US-P008 — Fail safely on misconfiguration, abuse, and unchecked releases

**As a maintainer, I want the live service to refuse unsafe states, so that a
missing setting, a guessing script, or an untested push cannot expose accounts or
reach users unnoticed.**

State: Proposed (remaining client/confirmation parts of AC05). Checks on pushes to `main` are delivered and removed
from this story. AC01 and AC03 are implemented with isolated regressions; their
delivery and release checks are in the [safe-operation spec](specs/US-P008-safe-operation.md).
Source: [2026-10-09 code audit](audits/2026-10-09/code_audit.md), INV-014.
Scope: client reset-request and confirmation-mail limits. Decisions: those limits
and where they are enforced. AC02 per-account sign-in limits are delivered locally
2026-10-12; the contract, DEF-033 regression and release checks are in the spec.

```gherkin
Feature: Safe operation of the live service
  Scenario: US-P008-AC05 Limit client reset requests and confirmation mail
    Given repeated recovery requests from one client or confirmation requests for one address or client
    When the agreed limit is exceeded
    Then no further mail is sent for the agreed period
    And the response still does not reveal whether the account exists
```

The reset-account part of AC05 is delivered: at most three mail slots per account
per rolling hour, including failed/uncertain sends, counted in shared token storage.
Its contract/evidence is in the [reset spec](specs/US-L004-password-reset.md).
Client-address limits and confirmation-mail limits remain open for Alex's decision.
Per-account sign-in now permits ten failures in a rolling 15-minute window,
then refuses that address for 15 minutes. Signup and per-client limits remain
outside that increment. Account email US-P009's
completed scenarios are recorded in its [spec](specs/US-P009-account-email.md).

## Adding a story

Allocate the next unused ID in the relevant journey. Add a table entry and a
section containing the actor/goal/benefit, state, scope, dependencies, source,
decisions, and uniquely numbered BDD scenarios. Link relevant defects and a spec
when the work needs a detailed contract. New audit ideas start as Proposed.
Do not reset IDs or mark behavior Done because it has only been documented.
When a story is delivered, record its commit and evidence in its spec and verification
file, then remove the story from this file.

## Existing issue reconciliation

[GitHub #30](https://github.com/Stormeal/qi-education/issues/30) requests a catalog
carousel. A carousel already exists at the audit baseline and recent commits
refine it; the issue remains open. Verify its original desired behavior before
changing its status externally. This audit has not created, edited, or closed any
GitHub issue. Use the linked items above instead of opening duplicate requests.
