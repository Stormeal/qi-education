# User stories

Updated: 2026-10-09. Priority order chosen by the user: **teachers, learners,
platform reliability**, with confirmed defects before enhancements. Story status
and evidence distinguish desired changes from delivered behavior. Current behavior
is documented in [architecture.md](architecture.md).
Use [work_queue.md](work_queue.md) for the next item and active handoff.

## Backlog

| ID | Story | State | Priority | Dependencies | Defects |
| --- | --- | --- | --- | --- | --- |
| US-T007 | Publish an authored instructor description | Proposed | P2 | T001 | GitHub #41 |
| US-T014 | Add an image to a quiz question | Proposed | P3 | T013; image contract decisions | None |
| US-A001 | Administer teaching access | Proposed | P2 | None | GitHub #20 |
| US-A002 | Warn about missing category before publication | Proposed | P2 | T002; warning/blocking decision | DEF-012 prevention |
| US-L001 | Enroll and learn through authorized access | Proposed | P1 | T001, T002 | DEF-003, DEF-004, DEF-010 |
| US-L003 | Keep profile details across devices | Proposed | P3 | None | None |
| US-L004 | Recover account access | Proposed | P2 | None | None |
| US-L007 | Present the primary recommendation first | Proposed | P3 | L002 | GitHub #45 |
| US-P001 | Verify complete role journeys before release | In progress | P2 | Teacher/learner contracts | None |
| US-P002 | Return useful, consistent API errors | Proposed | P2 | None | DEF-008 |
| US-P003 | Retry account/feedback operations safely | Proposed | P2 | None | Investigations INV-003, INV-004 |
| US-P004 | Recover career guidance safely across failures and sessions | In progress | P2 | L006, L009; per-increment checks | DEF-016 fixed in this delivery |
| US-P005 | Recover uncertain course operations safely | In progress | P2 | Lifecycle access | DEF-P005-LOCK; operator tooling remains Proposed |
| US-P006 | Keep courses available when a class uses them together | In progress | P1 | Lifecycle access | DEF-P006-01–04; hosted budget/AC06 pending |
| US-P008 | Limit repeated sign-in attempts | Proposed | P2 | Attempt-limit decision | Investigation INV-014; AC01/AC03 recorded in safe-operation spec |

Priorities describe impact, while the queue describes delivery sequence. P1 is a
high-impact access or release concern; P2 affects a core journey; P3 improves
convenience.

This file lists open work only. A story is removed once it is delivered, and a delivered
scenario is removed from a story that stays open; IDs are never reused, so gaps in the
numbering are delivered work. Their contracts and evidence remain in `specs/`,
`verification/` and Git history. Resolved defects are different: they stay in
[defect_management.md](defect_management.md).

## Teacher journey

### US-T007 — Publish an authored instructor description

**As a teacher, I want to write my public instructor description in my profile,
so that catalog visitors see an accurate introduction rather than course tags.**

State: Proposed. Dependency: US-T001 for stable instructor association.
Source: [GitHub #41](https://github.com/Stormeal/qi-education/issues/41).
Decisions: public profile fields, persistence, and approval rules for public changes.

```gherkin
Feature: Instructor introduction
  Scenario: US-T007-AC01 Display an authored description
    Given I have saved an approved public instructor description
    When a learner sees my instructor card in the catalog
    Then the card uses that description rather than career goal tags

  Scenario: US-T007-AC02 No public description exists
    Given an instructor has no public description
    When their card is displayed
    Then it uses an agreed empty fallback without inventing biographical details
    And private profile data is not disclosed
```

### US-T014 - Add an image to a quiz question

**As a teacher, I want an optional image on a question,
so that I can assess understanding of visual material.**

State: Proposed, not selected or implemented. Source: Alex's 2026-10-11 feedback.
Depends on US-T013. Outstanding decisions: accepted formats/size, image storage
and access, author removal, accessible alternative text and learner presentation.

```gherkin
Feature: Question images
  Scenario: US-T014-AC01 Author an optional image
    Given an editable question and the agreed image limits
    When I attach an allowed image with accessible alternative text
    Then it is retained with the question after saving and reopening
    And text-only questions keep working

  Scenario: US-T014-AC02 Present and remove the image safely
    Given an entitled learner and a question image
    When the learner opens the quiz
    Then the permitted image and alternative text are available
    When the author removes the image under the agreed lifecycle
    Then the question and its answers are retained without the removed image
    And unauthorized users cannot retrieve private image data
```

### US-A001 — Administer teaching access

**As an admin, I want to view users and manage their roles and account status,
so that teachers can receive the right access through a supported workflow.**

State: Proposed. Source: [GitHub #20](https://github.com/Stormeal/qi-education/issues/20).
Decisions: supported changes, last-admin protection, auditing, and account search privacy.

```gherkin
Feature: User access administration
  Scenario: US-A001-AC01 Grant teacher access
    Given I am an admin viewing an active student account
    When I grant teacher access through the agreed administration flow
    Then the persisted role becomes teacher
    And subsequent authenticated requests use the new permissions

  Scenario: US-A001-AC02 Deny unauthorized administration
    Given I am a student or teacher
    When I request the user list or a role/status change directly
    Then the API denies access without disclosing the user list or changing permissions
```

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

### US-L004 — Recover account access

**As a user, I want a working recovery path when I forget my password, so that
I can regain access without creating a duplicate account.**

State: Proposed. Current recovery link is `mailto:support@qi-education.local`;
there is no password-reset API. Decision: real support contact versus automated
reset delivery. The scenarios below propose automated reset, pending selection.

```gherkin
Feature: Password recovery
  Scenario: US-L004-AC01 Request a reset
    Given I cannot remember my password
    When I request recovery for an email address
    Then the response does not reveal whether an account exists
    And an existing active account receives the agreed recovery instructions

  Scenario: US-L004-AC02 Use a reset token safely
    Given I have a valid, unused reset token
    When I choose a password meeting the account policy
    Then I can sign in using it and cannot reuse the reset token
    And expired or invalid tokens produce a useful recovery state
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

State: Proposed. Investigations: INV-003, INV-004. Decisions: uniqueness strategy
for Sheets, retry/idempotency contract, and auth abuse controls.

```gherkin
Feature: Safe account and feedback writes
  Scenario: US-P003-AC01 Concurrent signup
    Given two requests use the same normalized email address
    When signup requests overlap
    Then at most one account is created and the other request receives a conflict

  Scenario: US-P003-AC02 Concurrent enrollment
    Given I enroll in two different courses concurrently
    When both operations complete
    Then both enrollments persist without duplicates or lost updates

  Scenario: US-P003-AC03 Retried feedback triage
    Given feedback is marked for work and issue creation succeeds before persistence fails
    When triage is retried
    Then it links the existing GitHub issue instead of creating a second one
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

State: Proposed (remaining AC02). Checks on pushes to `main` are delivered and removed
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
```

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
