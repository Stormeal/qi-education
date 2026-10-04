# User stories

Updated: 2026-10-04. Priority order chosen by the user: **teachers, learners,
platform reliability**. This file records desired changes, not implemented
capabilities. Current behavior is documented in [architecture.md](architecture.md).
Use [work_queue.md](work_queue.md) for the next item and active handoff.

## Backlog

| ID | Story | State | Priority | Dependencies | Defects |
| --- | --- | --- | --- | --- | --- |
| US-T001 | Enforce course ownership | Ready | P1 | None | DEF-001 |
| US-T002 | Submit, review, and publish courses safely | Proposed | P1 | T001 | DEF-002, DEF-003 |
| US-T003 | Protect unsaved authoring work | Proposed | P2 | None | DEF-006 |
| US-T004 | Publish valid, answerable quizzes | Proposed | P2 | T002 | DEF-005 |
| US-T005 | Save authoring work without silent overwrites | Proposed | P2 | T001 | Investigation INV-001 |
| US-T006 | Manage media with clear operational states | Proposed | P2 | T001 | Investigation INV-002 |
| US-T007 | Publish an authored instructor description | Proposed | P2 | T001 | GitHub #41 |
| US-A001 | Administer teaching access | Proposed | P2 | None | GitHub #20 |
| US-L001 | Enroll and learn through authorized access | Proposed | P1 | T001, T002 | DEF-003, DEF-004, DEF-010 |
| US-L002 | See trustworthy progress across learning views | Proposed | P2 | L001 | DEF-007, DEF-009 |
| US-L003 | Keep profile details across devices | Proposed | P3 | None | None |
| US-L004 | Recover account access | Proposed | P2 | None | None |
| US-L005 | Make unavailable controls understandable | Proposed | P3 | None | DEF-011 |
| US-L006 | Retrieve consistent career path previews | Proposed | P3 | None | GitHub #22, #23, #24 |
| US-L007 | Present the primary recommendation first | Proposed | P3 | L002 | GitHub #45 |
| US-L008 | Keep catalog metadata and badges readable | Proposed | P2 | Reproduce reported cases | DEF-012, DEF-013 |
| US-P001 | Verify complete role journeys before release | Proposed | P2 | Teacher/learner contracts | None |
| US-P002 | Return useful, consistent API errors | Proposed | P2 | None | DEF-008 |
| US-P003 | Retry account/feedback operations safely | Proposed | P2 | None | Investigations INV-003, INV-004 |

Priorities describe impact, while the queue describes delivery sequence. P1 is a
high-impact access or release concern; P2 affects a core journey; P3 improves
convenience. An item is not Done without scenario evidence and a delivery commit.
No story below is currently implemented as a result of this audit.

## Teacher journey

### US-T001 — Enforce course ownership

**As a teacher, I want only myself and admins to edit my courses, so that my
authoring work is protected from changes by unrelated teachers.**

State: Ready. Owner: unassigned. Policy confirmed by the user on 2026-10-04.
Scope: stable owner IDs, all authoring routes, and role-appropriate editor access.
Spec: [US-T001-course-ownership.md](specs/US-T001-course-ownership.md).
Legacy policy: courses without a verified owner remain editable by admins only;
never infer ownership from a teacher display name. Collaboration is out of scope.

```gherkin
Feature: Course ownership
  Scenario: US-T001-AC01 Creation establishes ownership
    Given I am signed in as a teacher
    When I create a course
    Then the persisted owner is my authenticated user ID
    And a client-supplied owner cannot assign the course to another teacher

  Scenario: US-T001-AC02 An unrelated teacher cannot mutate a course
    Given a course belongs to another teacher
    When I attempt any metadata, content, thumbnail, attachment, or video mutation
    Then the API returns 403
    And no storage or external media operation is performed

  Scenario: US-T001-AC03 Authorized authoring
    Given I own a course or I am an admin
    When I save a valid authoring change
    Then the change is persisted
    And the owner stays unchanged through general editing

  Scenario: US-T001-AC04 Legacy courses and editor entry
    Given a course has no verified owner
    When a teacher opens its editor or attempts to save
    Then the UI explains that editing is unavailable and the API denies the mutation
    And an admin can still edit the course
```

### US-T002 — Submit, review, and publish courses safely

**As a teacher, I want to submit a course for admin review and see its outcome,
so that learners receive reviewed material.**

State: Proposed. Dependencies: US-T001. Defects: DEF-002, DEF-003.
Scope: explicit transitions, admin-only pricing/catalog controls, and private drafts.
Decision to confirm: how review feedback is recorded; whether changing published
content creates a reviewable revision. Proposed transitions: draft to review by
owner; review to draft/published by admin; published to archived by admin.

```gherkin
Feature: Course review and publication
  Scenario: US-T002-AC01 Submit an eligible draft
    Given I own a draft that meets the agreed publishing checklist
    When I submit it for review
    Then its status becomes ready-for-review
    And I can see that it awaits an admin decision

  Scenario: US-T002-AC02 Enforce admin-only publication and pricing
    Given I am a teacher
    When I attempt to publish, archive, change pricing, or set admin catalog flags
    Then the API denies the change through every creation and update route
    And saving ordinary authoring fields with unchanged pricing remains possible

  Scenario: US-T002-AC03 Admin review outcome
    Given I am an admin reviewing a submitted course
    When I publish it or return it with a reason
    Then the teacher can see the decision
    And only a published course appears in the learner catalog
```

### US-T003 — Protect unsaved authoring work

**As a teacher, I want to keep or intentionally discard unsaved edits, so that
navigation or a failed save does not erase my work.**

State: Proposed. Defect: DEF-006. Scope: metadata and course outline edits.
Decision to confirm: navigation warning only, or local draft recovery after refresh.
The proposed scenarios include recovery; implement only after that choice is confirmed.

```gherkin
Feature: Authoring draft protection
  Scenario: US-T003-AC01 Leave an edited course
    Given I have unsaved metadata or outline changes
    When I navigate away using a link, Cancel, or browser back
    Then I can choose to stay or explicitly discard my changes
    And choosing to stay preserves every edit

  Scenario: US-T003-AC02 Save failure
    Given I have edited a course
    When saving fails
    Then my edited values remain available for retry
    And the UI identifies which part failed without claiming a complete save

  Scenario: US-T003-AC03 Recover a local draft
    Given a recoverable unsaved draft exists for my account and course
    When I return after refreshing the page
    Then I can restore or discard that draft
    And another account cannot restore it
```

### US-T004 — Publish valid, answerable quizzes

**As a teacher, I want clear assessment validation, so that learners can complete
every published quiz and understand what they answered.**

State: Proposed. Dependency: US-T002. Defect: DEF-005.
Decision to confirm: retain the current single-choice learner interaction. Proposed
rule: exactly one correct answer per question; incomplete questions may be saved
as drafts but cannot be submitted or published.

```gherkin
Feature: Assessment readiness
  Scenario: US-T004-AC01 Reject an unanswerable assessment
    Given a quiz has a blank question, blank answer, no correct answer, or an unreachable pass mark
    When I submit the course for review or an admin attempts publication
    Then the action is rejected with the affected question and reason
    And the draft remains available for correction

  Scenario: US-T004-AC02 Publish a valid single-choice quiz
    Given every question has four nonempty options and exactly one correct option
    And the pass mark is between one and the total available points
    When the course passes review
    Then learners can answer and reach the pass mark using the intended rules

  Scenario: US-T004-AC03 Stable question identity
    Given a quiz contains duplicate question or answer IDs
    When I save it
    Then validation rejects ambiguous IDs without overwriting the saved content
```

### US-T005 — Save authoring work without silent overwrites

**As a teacher, I want reliable save results and conflict detection, so that a
stale browser tab cannot silently erase newer course work.**

State: Proposed. Dependency: US-T001. Investigation: INV-001.
Decisions: revision format and reconciliation UX; whether metadata/content become
one transaction or retain explicit partial-save outcomes across Sheets and MongoDB.

```gherkin
Feature: Reliable course saves
  Scenario: US-T005-AC01 Detect a stale edit
    Given another authorized session has saved a newer course revision
    When I save from an older revision
    Then I receive a conflict response
    And the newer saved data and my local draft remain intact

  Scenario: US-T005-AC02 Report a partial save truthfully
    Given a save includes metadata and outline changes
    When metadata succeeds but content storage fails
    Then the UI identifies the saved and unsaved parts
    And retrying does not duplicate a course or overwrite unrelated newer work
```

### US-T006 — Manage media with clear operational states

**As a teacher, I want uploads, processing, and removal to have clear outcomes,
so that I can maintain course material without broken references.**

State: Proposed. Dependency: US-T001. Investigation: INV-002.
Decisions: whether removal deletes Mux assets or only detaches them; retention and
cleanup; public versus signed playback. Live integrations remain unverified by this audit.

```gherkin
Feature: Course media operations
  Scenario: US-T006-AC01 Observe an upload lifecycle
    Given I own a course and media services are configured
    When I upload a supported file
    Then I see upload, processing, ready, or failure states accurately
    And a failed upload offers a safe retry without a broken saved reference

  Scenario: US-T006-AC02 Remove media under the agreed retention policy
    Given a component references uploaded media
    When I remove it
    Then the reference and provider asset follow the agreed retention policy
    And repeated removal or delayed webhooks cannot restore the removed reference

  Scenario: US-T006-AC03 Unavailable integration
    Given shared media storage or upload configuration is unavailable
    When I attempt an upload
    Then I receive an actionable error and keep my course draft
```

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

## Learner journey

### US-L001 — Enroll and learn through authorized access

**As a learner, I want to access published courses I have joined, so that my
learning library contains material I am authorized to use.**

State: Proposed. Dependencies: US-T001, US-T002. Defects: DEF-003, DEF-004, DEF-010.
Decisions: public preview limits; access for already-enrolled users after archival;
whether prices are informational or require payment. No payment system currently exists.

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

  Scenario: US-L001-AC04 Resume through a direct learning URL
    Given I am enrolled in an accessible course and have a valid remembered session
    When I open or refresh its learning workspace URL directly
    Then my session, course metadata, and learning content are restored
    And the course does not incorrectly display as missing
```

### US-L002 — See trustworthy progress across learning views

**As a learner, I want consistent progress in my workspace, library, and home
page, so that I know what to continue and what I have completed.**

State: Proposed. Dependency: US-L001. Defects: DEF-007, DEF-009.
Decisions: which lesson types require explicit completion, video viewing, or a
passing quiz; server persistence; how deleted/revised lessons affect totals.

```gherkin
Feature: Consistent learning progress
  Scenario: US-L002-AC01 Complete a lesson
    Given my enrolled course has two required lessons and I have completed none
    When I complete one according to its agreed completion rule
    Then the workspace, My Learning, and home page show 50 percent progress
    And reopening the course resumes the next incomplete lesson

  Scenario: US-L002-AC02 Restore progress across devices
    Given progress has been saved for my account
    When I sign in on another device
    Then the same completed lessons and progress are restored

  Scenario: US-L002-AC03 A new account has an honest empty state
    Given I have no enrollments or completed lessons
    When I open the home page
    Then it offers a real starting action
    And it does not display invented course activity or completion
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

### US-L005 — Make unavailable controls understandable

**As a learner, I want controls to lead to real behavior or explain their
unavailability, so that I do not click features that silently do nothing.**

State: Proposed. Defect: DEF-011. Scope: Adjust track, Q&A, and Notes.
Decision: implement these separately or hide/disable them until their contracts exist.

```gherkin
Feature: Honest feature availability
  Scenario: US-L005-AC01 An unfinished feature
    Given a feature has not been implemented
    When its entry point would otherwise be shown
    Then it is hidden or clearly disabled with an explanation
    And it is not presented as a working action

  Scenario: US-L005-AC02 A released feature
    Given a feature has an implemented behavior contract
    When I activate its entry point with a pointer or keyboard
    Then its intended view or action occurs and its selected state is clear
```

### US-L006 — Retrieve consistent career path previews

**As a learner, I want consistent career path previews available through the
platform API, so that future guidance can build on explicit course sequences.**

State: Proposed. Existing scope: [#22](https://github.com/Stormeal/qi-education/issues/22),
[#23](https://github.com/Stormeal/qi-education/issues/23),
[#24](https://github.com/Stormeal/qi-education/issues/24). API/data foundation only;
no new path UI is required by the imported issue scope. Confirm fixture content
and naming before implementation; split model, fixtures, and endpoints into tasks.

```gherkin
Feature: Career path read foundation
  Scenario: US-L006-AC01 Read paths and their structure
    Given the career path model and fixtures are available
    When a client calls GET /career-paths or GET /career-paths/:id
    Then the response uses validated shared path, step, and course types
    And it expresses required or optional courses, estimated duration, target role, a primary recommendation, and alternatives

  Scenario: US-L006-AC02 Clearly identify preview content
    Given fixtures cover Technical Tester, Test Manager, Test Analyst, Agile Tester, and AI Testing Specialist
    When their preview courses are returned
    Then placeholder courses are explicitly identified in the data
    And the fixtures require no Google Sheets changes

  Scenario: US-L006-AC03 Missing path
    Given a requested path ID does not exist
    When a client requests that path
    Then the API returns 404 with the agreed safe error response
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

### US-L008 — Keep catalog metadata and badges readable

**As a learner, I want correct categories and readable course labels,
so that I can compare courses without misleading or obscured metadata.**

State: Proposed. Sources: [#42](https://github.com/Stormeal/qi-education/issues/42)
and [#44](https://github.com/Stormeal/qi-education/issues/44). Defects DEF-012/013 are
reported, not reproduced by this audit. First obtain isolated fixtures matching
the reported records and viewport; do not infer a fix from the issue title.

```gherkin
Feature: Catalog card integrity
  Scenario: US-L008-AC01 Correct stored category
    Given a course has a valid stored category
    When I see its list card or apply a category filter
    Then both use that category rather than an incorrect Uncategorized fallback

  Scenario: US-L008-AC02 A long course title
    Given a course title spans two lines and its card has badges
    When I view the card at supported desktop and mobile widths
    Then the complete title and badges remain readable without clipping or overlap
```

## Platform reliability

### US-P001 — Verify complete role journeys before release

**As a maintainer, I want repeatable journey verification, so that changes do
not pass unit tests while breaking teaching or learning.**

State: Proposed. Depends on agreed teacher/learner contracts. No permanent browser
E2E suite exists today. Decisions: CI browser runner, isolated fixtures, and test ownership.

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

State: Proposed. Defect: DEF-008. Decisions: stable error codes and field-error DTO;
preserve the current `message` field for compatibility.

```gherkin
Feature: API error feedback
  Scenario: US-P002-AC01 Classify invalid input accurately
    Given a request has malformed JSON, invalid fields, or an oversized upload
    When the API processes it
    Then malformed JSON and field validation return 400 and oversized uploads return 413
    And the response explains the correction without exposing internal stack traces

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

## Adding a story

Allocate the next unused ID in the relevant journey. Add a table entry and a
section containing the actor/goal/benefit, state, scope, dependencies, source,
decisions, and uniquely numbered BDD scenarios. Link relevant defects and a spec
when the work needs a detailed contract. New audit ideas start as Proposed.
Do not reset IDs or mark behavior Done because it has only been documented.

## Existing issue reconciliation

[GitHub #30](https://github.com/Stormeal/qi-education/issues/30) requests a catalog
carousel. A carousel already exists at the audit baseline and recent commits
refine it; the issue remains open. Verify its original desired behavior before
changing its status externally. This audit has not created, edited, or closed any
GitHub issue. Use the linked items above instead of opening duplicate requests.
