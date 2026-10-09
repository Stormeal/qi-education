# User stories

Updated: 2026-10-07. Priority order chosen by the user: **teachers, learners,
platform reliability**, with confirmed defects before enhancements. Story status
and evidence distinguish desired changes from delivered behavior. Current behavior
is documented in [architecture.md](architecture.md).
Use [work_queue.md](work_queue.md) for the next item and active handoff.

## Backlog

| ID | Story | State | Priority | Dependencies | Defects |
| --- | --- | --- | --- | --- | --- |
| US-T001 | Enforce course ownership | Done | P1 | None | DEF-001 |
| US-T002 | Submit, review, and publish courses safely | Proposed | P1 | T001 | DEF-002, DEF-003 |
| US-T003 | Protect unsaved authoring work | Proposed | P2 | None | DEF-006 |
| US-T004 | Publish valid, answerable quizzes | Done | P2 | T002 authorization delivered | DEF-005 |
| US-T005 | Save authoring work without silent overwrites | Proposed | P2 | T001 | Investigation INV-001 |
| US-T006 | Manage media with clear operational states | Proposed | P2 | T001 | Investigation INV-002 |
| US-T007 | Publish an authored instructor description | Proposed | P2 | T001 | GitHub #41 |
| US-T008 | Curate valid, versioned career paths | Proposed | P2 | L006; path governance decisions | None |
| US-A001 | Administer teaching access | Proposed | P2 | None | GitHub #20 |
| US-L001 | Enroll and learn through authorized access | Proposed | P1 | T001, T002 | DEF-003, DEF-004, DEF-010 |
| US-L002 | See trustworthy progress across learning views | Proposed | P2 | L001 | DEF-007, DEF-009, DEF-014 |
| US-L003 | Keep profile details across devices | Proposed | P3 | None | None |
| US-L004 | Recover account access | Proposed | P2 | None | None |
| US-L005 | Make unavailable controls understandable | Proposed | P3 | None | DEF-011 |
| US-L006 | Retrieve consistent career path previews | Proposed | P3 | None | GitHub #22, #23, #24 |
| US-L007 | Present the primary recommendation first | Proposed | P3 | L002 | GitHub #45 |
| US-L008 | Keep catalog metadata and badges readable | Proposed | P2 | Reproduce reported cases | DEF-012, DEF-013 |
| US-L009 | Compare and choose a career path | Proposed | P2 | L003, L006 | None |
| US-L010 | Follow an actionable next learning step | Proposed | P2 | L001, L002, L009 | None |
| US-L011 | Change paths while retaining learning history | Proposed | P3 | L002, L009 | None |
| US-L012 | Understand milestones and path completion | Proposed | P2 | L002, L006, L009 | None |
| US-P001 | Verify complete role journeys before release | Proposed | P2 | Teacher/learner contracts | None |
| US-P002 | Return useful, consistent API errors | Proposed | P2 | None | DEF-008 |
| US-P003 | Retry account/feedback operations safely | Proposed | P2 | None | Investigations INV-003, INV-004 |
| US-P004 | Recover career guidance safely across failures and sessions | Proposed | P2 | L006, L009; per-increment checks | None |
| US-P005 | Recover uncertain course operations safely | Proposed | P2 | Lifecycle access | Coordination review |

Priorities describe impact, while the queue describes delivery sequence. P1 is a
high-impact access or release concern; P2 affects a core journey; P3 improves
convenience. An item is not Done without scenario evidence and a delivery commit.
US-T001 is delivered locally in `a9940cc` with passing acceptance checks.
Other audit-generated stories remain Proposed.

The [career path audit](audits/2026-10-05/career_path_audit.md) recommends a
sequence within that journey. Its new stories remain Proposed; path governance,
completion rules, persistence, and curriculum decisions have not been approved.

## Teacher journey

### US-T001 — Enforce course ownership

**As a teacher, I want only myself and admins to edit my courses, so that my
authoring work is protected from changes by unrelated teachers.**

State: Done. Owner: Codex. Policy confirmed by the user on 2026-10-04.
Scope: stable owner IDs, all authoring routes, and role-appropriate editor access.
Spec: [US-T001-course-ownership.md](specs/US-T001-course-ownership.md).
Legacy policy: courses without a verified owner remain editable by admins only;
never infer ownership from a teacher display name. Collaboration is out of scope.
Acceptance evidence: [DEF-001 verification](verification/2026-10-04/DEF-001.md).
Delivered 2026-10-04 in `a9940ccd9fc13a149b5eb96017c5484796b0012d`.
Local acceptance checks pass. Shared Sheets/MongoDB and hosted release verification
remain separate checks; no push or deployment has been performed.

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

  Scenario: US-T001-AC05 Foreign media references cannot change another course
    Given I can edit my course and an asset belongs to another course
    When I forge that asset reference or trigger cleanup through my own course
    Then new foreign attachment and thumbnail assignments are denied before writes
    And the other course's asset remains stored
    And replacing an existing invalid thumbnail reference safely repairs only my course
```

### US-T002 — Submit, review, and publish courses safely

**As a teacher, I want to submit a course for admin review and see its outcome,
so that learners receive reviewed material.**

State: Proposed. Dependencies: US-T001. Defects: DEF-002, DEF-003.
Delivered narrow defect scope on 2026-10-07 in `a6767f6`: AC02 admin controls and private draft
access; see the lifecycle spec and verification. Review reasons/revisions and
readiness remain unfinished, so this broader story is not Done.
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
User confirmed **warnings only** on 2026-10-08. Selected DEF-006 implements AC01/02
and standard browser departure warnings under [NW-01–05](specs/DEF-006-unsaved-navigation.md).
AC03 local recovery remains Proposed and is outside this batch. The broader story
stays Proposed until recovery is separately selected. Verification:
[DEF-005/006/010](verification/2026-10-08/DEF-005-006-010.md).
AC01/02 delivery commit: `3feeea4de8d056ba1e88789103a280df52c5d2f0`, 2026-10-08.

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

State: Done. Owner: Codex. Completed: 2026-10-08. Defect: DEF-005.
Dependency: US-T002 authorization boundaries delivered in `a6767f6`; its broader
review workflow remains Proposed. Assessment delivery commit:
`3feeea4de8d056ba1e88789103a280df52c5d2f0`.
Selected DEF-005 retains the existing single-choice interaction: exactly one correct
answer per question. Incomplete questions may be saved as drafts but cannot be
submitted or published. AC01–03 map to LC-05/06 in
[the lifecycle spec](specs/DEF-002-005-course-lifecycle.md). Verification:
[DEF-005/006/010](verification/2026-10-08/DEF-005-006-010.md). All three criteria pass.

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

### US-T008 — Curate valid, versioned career paths

**As a curriculum curator, I want to maintain explicit course sequences, so that
learners follow a coherent path that can evolve without losing their history.**

State: Proposed. Source: [career path audit](audits/2026-10-05/career_path_audit.md).
Depends on US-L006 for path identity/read contracts. Scope: course references,
required/optional steps, alternatives, availability, review, and revisions.
Decisions: curator roles and ownership, teacher proposal permissions, publishing
workflow, revision migration, and prerequisite guidance versus enforcement.
Existing teacher course ownership does not grant path editing permission.

```gherkin
Feature: Governed career path curation
  Scenario: US-T008-AC01 Publish a coherent path
    Given I have the agreed path publishing permission
    And the proposed revision has valid course references and step relationships
    When I publish it
    Then learners can read its target role, outcomes, ordered steps, alternatives, and availability
    And placeholder courses remain explicitly identified and cannot accept enrollment

  Scenario: US-T008-AC02 Reject invalid structure
    Given a proposed revision contains a missing course, duplicate required step, or prerequisite cycle
    When I submit it for publication
    Then publication is rejected with the affected step identified
    And the draft remains editable

  Scenario: US-T008-AC03 Preserve active learners on revision
    Given learners follow a published revision with recorded completion
    When a curator publishes a changed sequence or withdraws a course
    Then the agreed revision policy identifies affected learners and replacements
    And past completion is not silently erased or double-counted

  Scenario: US-T008-AC04 Deny unauthorized curation
    Given I lack permission to edit or publish the requested path
    When I attempt either operation through the UI or API
    Then the change is denied before persistence
    And permission to edit one course does not authorize editing its whole path
```

## Learner journey

### US-L001 — Enroll and learn through authorized access

**As a learner, I want to access published courses I have joined, so that my
learning library contains material I am authorized to use.**

State: Proposed. Dependencies: US-T001, US-T002. Defects: DEF-003, DEF-004, DEF-010.
Delivered narrow DEF-003/DEF-004 scope on 2026-10-07 in `a6767f6`: published-only enrollment,
authorized content/resources, public title outline, redacted quizzes and server
feedback. Working default retains existing archived access. DEF-010 / AC04 is verified
in the selected 2026-10-08 batch using [DL-01–04](specs/DEF-010-direct-learning.md).
Its runtime fix was already included in `a6767f6`; dedicated regression/browser
evidence is recorded [here](verification/2026-10-08/DEF-005-006-010.md).
AC04 regression/browser delivery: `3feeea4de8d056ba1e88789103a280df52c5d2f0`, 2026-10-08.
Broader access/payment decisions remain Proposed.
Decisions: confirm public preview limits; access for already-enrolled users after archival;
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

State: Proposed. Dependency: US-L001. Defects: DEF-007, DEF-009, DEF-014.
Selected narrow defect batch, 2026-10-09: AC01 on this browser, AC03 and AC04 under
[LP-01-05](specs/DEF-007-009-014-learning-progress.md). Existing ordinary lesson
completion and trusted passing quiz rules are retained. Cross-device AC02 and
broader revision/completion policies remain Proposed; this does not select them.
The local criteria pass route/page regressions and isolated browser checks:
[verification](verification/2026-10-09/DEF-007-009-014.md). Delivery commit pending.
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

  Scenario: US-L002-AC04 Quiz position does not imply completion
    Given I have opened a quiz without submitting any answers
    When I view its first or last question
    Then the question position is distinguished from completed assessment work
    And the completion indicator does not claim that the untouched attempt is complete
    And reaching the final question alone does not mark the lesson passed
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

### US-L009 — Compare and choose a career path

**As a learner, I want to compare paths and save an explicit goal, so that my
learning guidance reflects the career I actually want to pursue.**

State: Proposed. Source: [career path audit](audits/2026-10-05/career_path_audit.md).
Depends on US-L006 for previews and US-L003 for account goal persistence;
read-only comparison can precede saved selection. Scope: outcomes, target role,
steps, estimated effort, available versus preview courses, and account selection.
Decisions: approved tracks/course mappings, minimum onboarding inputs, one versus
multiple active paths, and relationship to the free-text profile learning goals.
Recommendation: start with one primary path, explicitly selected by the learner.

```gherkin
Feature: Explicit career path selection
  Scenario: US-L009-AC01 Explore without choosing
    Given I have not selected a path
    When I open career guidance
    Then I can compare available path outcomes, steps, effort, and preview availability
    And the page does not assume a goal or invent completed learning

  Scenario: US-L009-AC02 Save my selected goal and path
    Given I am signed in and have compared available paths
    When I confirm a path and its target goal
    Then the selection is saved for my account with the relevant path revision
    And Home displays that goal independently of my student, teacher, or admin permissions
    And signing in on another device restores the selection

  Scenario: US-L009-AC03 Selection is separate from access
    Given a selected path includes courses I have not enrolled in or cannot yet access
    When I save the path
    Then it does not silently enroll me or grant paid or private course access
    And the required next action and course availability are explained

  Scenario: US-L009-AC04 Failed selection preserves my choice
    Given I have chosen a path but persistence fails
    When I confirm the choice
    Then I see a retryable error and my draft choice remains available
    And the previously saved selection is not reported as changed
```

### US-L010 — Follow an actionable next learning step

**As a learner, I want a clear next action linked to real content, so that I can
move from my career goal into learning without reconstructing the route myself.**

State: Proposed. Source: [career path audit](audits/2026-10-05/career_path_audit.md).
Depends on US-L001 access, US-L002 progress, and US-L009 selection; US-L007 supplies
primary-action ordering. Scope: stable destinations, resume, recommendation reason,
alternatives, and availability. Decisions: deterministic recommendation priority,
advisory versus enforced prerequisites, substitutions, and content revision behavior.

```gherkin
Feature: Actionable career guidance
  Scenario: US-L010-AC01 Resume eligible learning
    Given my selected path has an enrolled incomplete course
    When I activate the primary next action
    Then its learning workspace opens at the agreed next incomplete lesson
    And the action identifies the course and explains why it is next

  Scenario: US-L010-AC02 Review a course before enrollment
    Given my next step is an available published course I have not joined
    When I activate its recommendation
    Then its actual course details and enrollment requirements are shown
    And private lesson content is not exposed by the recommendation

  Scenario: US-L010-AC03 Explain unavailable steps
    Given a required step is withdrawn, missing, preview-only, or blocked by an agreed prerequisite
    When I view guidance
    Then its availability and an approved alternative or useful next action are explained
    And no enabled action links to nonexistent or unauthorized learning content

  Scenario: US-L010-AC04 Accessible action and progress
    Given a primary action and real progress are available
    When I use keyboard navigation or a supported mobile viewport
    Then the action is reachable with a clear destination and visible focus
    And named progress values can be read without interpreting bar width or color
    And the current action is presented before historical completed steps
```

### US-L011 — Change paths while retaining learning history

**As a learner, I want to change my career direction deliberately, so that I can
follow a new goal while keeping the learning I have already completed.**

State: Proposed. Source: [career path audit](audits/2026-10-05/career_path_audit.md).
Depends on US-L002 and US-L009. Scope: preview impact, explicit confirmation,
historical completion, and revised recommendations. Decisions: equivalence between
courses/revisions, multiple active paths, and the extent of switch reversibility.
Free-text profile edits should not silently select a different path.

```gherkin
Feature: Deliberate career path changes
  Scenario: US-L011-AC01 Compare the impact of switching
    Given I have a selected path with completed courses
    When I choose another path to preview
    Then I see retained recognized learning, new required steps, and the new goal
    And the saved selection remains unchanged until I confirm

  Scenario: US-L011-AC02 Confirm a switch
    Given I have reviewed the switch impact
    When I confirm the new path
    Then it becomes the agreed active selection and next actions are recalculated
    And completed learning and existing enrollments remain in my history
    And a shared course or alternative is not counted twice

  Scenario: US-L011-AC03 Cancel or fail safely
    Given I am previewing a different path
    When I cancel or the switch fails to save
    Then my saved path and completion remain unchanged
    And a failed save preserves the proposed choice with retry guidance
```

### US-L012 — Understand milestones and path completion

**As a learner, I want milestones based on actual learning outcomes, so that I
know what I have achieved and what meaningful step comes next.**

State: Proposed. Source: [career path audit](audits/2026-10-05/career_path_audit.md).
Depends on US-L002, US-L006, and US-L009. Scope: required/optional steps, alternative
completion, milestone evidence, and honest finishing states. Decisions: completion
rules, progress denominator, prior learning recognition, and certification wording.
External examination/certification issuance is not implied by finishing a course.

```gherkin
Feature: Evidence-based career milestones
  Scenario: US-L012-AC01 Complete a required step
    Given my path has two equally weighted required steps and neither is complete
    When the agreed completion evidence is saved for one step
    Then path progress is 50 percent and the next required action is identified
    And Home, the path view, and My Learning use the same saved completion

  Scenario: US-L012-AC02 Handle alternatives and optional learning
    Given a required step permits either of two courses and another course is optional
    When I complete an accepted alternative and the optional course
    Then the required step is counted once
    And optional completion is visible without inflating required path progress

  Scenario: US-L012-AC03 Finish a path honestly
    Given I have completed all required steps under the agreed policy
    When I return to guidance
    Then it clearly identifies the completed path and offers an appropriate next goal
    And it does not claim an external certification or job qualification without separate verified evidence

  Scenario: US-L012-AC04 A failed assessment is not completion
    Given a required step includes an assessment with a pass condition
    When the saved assessment outcome does not meet it
    Then the step remains incomplete and a useful retry action is shown
    And browsing to the last question does not advance the milestone
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

### US-P004 — Recover career guidance safely across failures and sessions

**As a learner, I want guidance to stay honest and private during failures, so
that I can retry safely without seeing another account's path or false success.**

State: Proposed. Source: [career path audit](audits/2026-10-05/career_path_audit.md).
Depends on US-L006 and US-L009; apply relevant checks to each delivered increment.
Scope: loading/empty/error states, retry, session changes, private DTOs, and selection
concurrency. Decisions: safe cache lifetime, revision conflict contract, and retry
idempotency. A last known selection must be labeled stale when freshness is unknown.

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

  Scenario: US-P004-AC03 Preserve course and account boundaries
    Given I request another learner's progress or a preview containing a private draft course
    When the API processes the request
    Then private account data and unpublished learning content are denied or omitted according to the agreed DTO
    And a path reference alone does not bypass course entitlement

  Scenario: US-P004-AC04 Resolve conflicting selections safely
    Given two devices change the same saved selection concurrently or retry a timed-out request
    When the writes are reconciled
    Then the agreed revision and retry policy produces one identifiable saved outcome
    And a rejected update preserves the user's choice with actionable feedback
```

### US-P005 — Recover uncertain course operations safely

**As an operator, I want to reconcile an interrupted course write safely, so that
learners regain access without a delayed operation overwriting the recovered course.**

State: Proposed. Source: DEF-002–004 coordination review and recovery runbook.
Depends on course lifecycle access. Scope: operator diagnostics, verified remote
outcomes, owner-scoped recovery, and disposal-store rehearsal. Decisions: operator
identity/permissions, provider evidence required for finality, and manual versus
assisted recovery. No time-based takeover is permitted with unfenced Sheets writes.

```gherkin
Feature: Verified course operation recovery
  Scenario: US-P005-AC01 Preserve an uncertain owner
    Given a provider write timed out and its remote outcome is unknown
    When another course operation arrives
    Then ownership is retained and the successor receives retry guidance
    And logs identify the course and owner without credentials

  Scenario: US-P005-AC02 Recover only after finality
    Given the originating invocation has stopped and provider evidence establishes its final outcome
    When an authorized operator reconciles the course and releases the exact owner
    Then a harmless read verifies the intended persisted state before writes resume
    And another owner's lock is never removed

  Scenario: US-P005-AC03 Avoid unsupported recovery
    Given final remote outcome or owner termination cannot be established
    When recovery is requested
    Then ownership remains in place with a concrete investigation action
    And age alone never authorizes takeover
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
