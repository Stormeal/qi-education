# User stories

Updated: 2026-10-11. Priority order chosen by the user: **teachers, learners,
platform reliability**, with confirmed defects before enhancements. Story status
and evidence distinguish desired changes from delivered behavior. Current behavior
is documented in [architecture.md](architecture.md).
Use [work_queue.md](work_queue.md) for the next item and active handoff.

## Backlog

| ID | Story | State | Priority | Dependencies | Defects |
| --- | --- | --- | --- | --- | --- |
| US-A002 | Warn about missing category before publication | Proposed | P2 | T002; warning/blocking decision | DEF-012 prevention |
| US-L001 | Enroll and learn through authorized access | Proposed | P1 | T001, T002 | DEF-003, DEF-004, DEF-010 |
| US-L003 | Keep profile details across devices | Proposed | P3 | None | None |
| US-L007 | Present the primary recommendation first | Proposed | P3 | L002 | GitHub #45 |
| US-L014 | Confirm my email address at signup | Proposed | P3 | P009 | None |
| US-P001 | Verify complete role journeys before release | In progress | P2 | Teacher/learner contracts | None |
| US-P002 | Return useful, consistent API errors | Proposed | P2 | None | DEF-008 |
| US-P003 | Retry account/feedback operations safely | In progress | P2 | Distributed coordination decision | DEF-023/024/025; multi-instance/restart work remains |
| US-P004 | Recover career guidance safely across failures and sessions | In progress | P2 | L006, L009; per-increment checks | DEF-016 fixed in this delivery |
| US-P005 | Recover uncertain course operations safely | In progress | P2 | Lifecycle access | DEF-P005-LOCK; operator tooling remains Proposed |
| US-P006 | Keep courses available when a class uses them together | In progress | P1 | Lifecycle access | DEF-P006-01–04; hosted budget/AC06 pending |
| US-P008 | Limit repeated sign-in attempts and reset requests | Proposed | P2 | Attempt-limit decision | Investigation INV-014; AC01/AC03 recorded in safe-operation spec |

Priorities describe impact, while the queue describes delivery sequence. P1 is a
high-impact access or release concern; P2 affects a core journey; P3 improves
convenience.

This file lists open work only. A story is removed once it is delivered, and a delivered
scenario is removed from a story that stays open; IDs are never reused, so gaps in the
numbering are delivered work. Their contracts and evidence remain in `specs/`,
`verification/` and Git history. Resolved defects are different: they stay in
[defect_management.md](defect_management.md).

## Teacher journey

### US-A002 - Warn about missing category before publication

**As an admin, I want missing category metadata called out before publication,
so that learners can find released courses using category filters.**

State: Proposed. Discovered through DEF-012's confirmed data cause on 2026-10-09.
Depends on US-T002's publication contract. Decisions: warning versus blocking;
when Uncategorized is an intentional approved category; legacy course handling.
The criteria below propose a warning; no publication behavior is changed now.

```gherkin
Feature: Explicit catalog category review
  Scenario: US-A002-AC01 Missing category
    Given a course is otherwise ready to publish and has no assigned category
    When I prepare to confirm publication
    Then I see a missing category warning and can edit its category
    And the course remains unchanged until I confirm an action

  Scenario: US-A002-AC02 Assigned category
    Given I have selected and saved a valid course category
    When I publish the course
    Then its card displays that category
    And the course is included by the matching category filter
```

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

### US-L003 — Keep profile details across devices

**As a learner, I want my profile details saved to my account, so that my goals
and bio are available wherever I sign in.**

State: Proposed. Current limitation: `ProfileService` stores details in localStorage.
Decisions: approved profile fields/limits, storage choice, and privacy scope.

```gherkin
Feature: Account profile persistence
  Scenario: US-L003-AC01 Save and restore my profile
    Given I am signed in
    When I save valid profile details and sign in on another device
    Then the saved details are restored for my account

  Scenario: US-L003-AC02 Preserve edits on failure
    Given I have changed my profile details
    When saving fails or validation rejects a field
    Then I see a useful error and my edits remain available
    And another account cannot read or change my private profile details
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

State: Proposed (remaining AC02 and the client/confirmation parts of AC05). Checks on pushes to `main` are delivered and removed
from this story. AC01 and AC03 are implemented with isolated regressions; their
delivery and release checks are in the [safe-operation spec](specs/US-P008-safe-operation.md).
Source: [2026-10-09 code audit](audits/2026-10-09/code_audit.md), INV-014.
Scope: sign-in attempt limits. Decisions: attempt limits and where they are enforced
(host firewall or API). The attempt-limit behavior was not changed by AC01/AC03.

```gherkin
Feature: Safe operation of the live service
  Scenario: US-P008-AC02 Limit repeated sign-in attempts
    Given repeated failed sign-ins for one account or from one client
    When the agreed limit is exceeded
    Then further attempts are refused for the agreed period
    And other users can still sign in

  Scenario: US-P008-AC05 Limit client reset requests and confirmation mail
    Given repeated recovery requests from one client or confirmation requests for one address or client
    When the agreed limit is exceeded
    Then no further mail is sent for the agreed period
    And the response still does not reveal whether the account exists
```

The reset-account part of AC05 is delivered: at most three mail slots per account
per rolling hour, including failed/uncertain sends, counted in shared token storage.
Its contract/evidence is in the [reset spec](specs/US-L004-password-reset.md).
Client-address limits and confirmation-mail limits remain open for Alex's decision;
no sign-in attempt or other abuse controls were added. Account email US-P009's
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
