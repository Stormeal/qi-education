# User stories

Updated: 2026-10-18. Priority order chosen by the user: **teachers, learners,
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
| US-A004 | Curate career milestone graphs and map TestHuset courses | In progress | P2 | Curriculum review; existing T008/A003 | None |
| US-L017 | See a focused milestone tree for my career | In progress | P2 | A004, L019, L020, L021 | None |
| US-L018 | Understand how to achieve a milestone | In progress | P2 | A004, L017 | None |
| US-L019 | Record my own learning and certification achievements | In progress | P2 | A004; release with L020 | None |
| US-L020 | Unlock milestones through shared prerequisites | In progress | P2 | A004, L019 | None |
| US-L021 | Pursue several careers and focus on one route | In progress | P2 | A004, L019; legacy selection mapping | None |
| US-L022 | Get consistent career guidance on Home and my tree | In progress | P2 | L017, L018, L020, L021 | None |
| US-L023 | Recognise relevant achievements from my CV | Proposed (future) | P3 | L019, L020; extraction and review policy | None |
| US-P001 | Verify complete role journeys before release | In progress | P2 | Teacher/learner contracts | None |
| US-P002 | Return useful, consistent API errors | Proposed | P2 | None | DEF-008 |
| US-P003 | Retry account/feedback operations safely | In progress | P2 | Distributed coordination decision | DEF-023/024/025; multi-instance/restart work remains |
| US-P004 | Recover career guidance safely across failures and sessions | In progress | P2 | L006, L009; per-increment checks | DEF-016 fixed in this delivery |
| US-P005 | Recover uncertain course operations safely | In progress | P2 | Lifecycle access | DEF-P005-LOCK; operator tooling remains Proposed |
| US-P006 | Keep courses available when a class uses them together | In progress | P1 | Lifecycle access | DEF-P006-01–04; hosted budget/AC06 pending |
| US-P008 | Limit client reset requests and confirmation mail | Proposed | P2 | Client/confirmation limit decision | AC02 per-account login delivered locally; INV-014 signup investigation remains; safe-operation spec |
| US-P016 | Retire the Google Sheets code for accounts and courses | Proposed | P3 | P014, P015 | None |

Priorities describe impact, while the queue describes delivery sequence. P1 is a
high-impact access or release concern; P2 affects a core journey; P3 improves
convenience.

This file lists open work only. A story is removed once it is delivered, and a delivered
scenario is removed from a story that stays open; IDs are never reused, so gaps in the
numbering are delivered work. Their contracts and evidence remain in `specs/`,
`verification/` and Git history. Resolved defects are different: they stay in
[defect_management.md](defect_management.md).

## Teacher journey

US-A002 (category warning) was delivered 2026-10-13; see its
[spec](specs/US-A002-missing-category.md).

### US-A004 — Curate career milestone graphs and map TestHuset courses

**As an admin, I want to curate job routes using milestones, learning options and
explicit requirements, so learners see a credible route through our courses.**

State: Proposed, selected for feature definition only. Source: Alex's career-tree
brainstorm and approved visual direction, 2026-10-18, including multiple careers
and cross-path requirements. Spec:
[career milestone trees](specs/US-L017-L023-A004-career-milestone-trees.md).
Dependencies: existing admin draft/publish/withdrawal contracts (US-T008/US-A003).
Scope: the initial Test Analyst, Technical Tester and Test Manager routes,
shared milestone identities, course/action mappings, cross-path graph validation
and publication. Implementation owner: unassigned. Priority: P2.
Decisions before Ready: review the complete current TestHuset inventory, decide
equivalent options and actual role criteria/prerequisites, and approve legacy
path/schema migration. The mockup's course edges are illustrative. A composite
Test Architect route is future curriculum; the graph must support it.

```gherkin
Feature: Credible career milestone curation
  Scenario: US-A004-AC01 Curate the three initial careers
    Given I am an admin editing a draft career route
    When I define its stages, milestone references and prerequisite relationships
    Then I can prepare Test Analyst, Technical Tester and Test Manager routes
    And all three reference the same Foundation milestone identity
    And a milestone can reference prerequisites used by another career
    And learners see only published definitions

  Scenario: US-A004-AC02 Separate preparation from completion requirements
    Given a milestone has courses, actions and alternative learning options
    When I configure its completion requirement
    Then I explicitly distinguish recommendations from required actions
    And I can require every action in one of several accepted bundles
    And a preparation course alone cannot satisfy a required external exam

  Scenario: US-A004-AC03 Refuse an invalid published graph
    Given a draft has a missing prerequisite, a cycle across careers, conflicting shared identities, or no course or action for a milestone
    When I publish it
    Then publication is refused with the affected milestone and a useful explanation
    And the previous published definitions and learner records remain unchanged

  Scenario: US-A004-AC04 Map real catalogue offerings honestly
    Given the current TestHuset course inventory and the three proposed routes
    When the curriculum mapping is reviewed for publication
    Then every inventoried course is mapped or explicitly deferred with a reason
    And equivalent formats are not confused with different qualifications
    And external courses are distinguished from available Academy courses
    And planned on-demand courses are labelled unavailable until published

  Scenario: US-A004-AC05 Preserve permissions, privacy and concurrent edits
    Given a non-admin caller, a stale admin draft, or a reference to private course metadata
    When the caller reads or changes career definitions
    Then only an authorized current admin may change the draft or publication
    And a stale write cannot erase a newer edit
    And public references disclose only approved public labels and availability

  Scenario: US-A004-AC06 Revise content without losing achievements
    Given learners follow a published route and have recorded achievements
    When I publish a layout change or a material change to milestone criteria
    Then layout changes retain stable achievement identities
    And changed criteria use explicit requirement versions and an update explanation
    And historical evidence, goals and enrollments remain stored
    And an old editor cannot silently strip the new milestone fields
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

### US-L017 — See a focused milestone tree for my career

**As a learner, I want a compact milestone tree for the career I am viewing,
so I understand my current position and next development choices.**

State: Proposed. Priority: P2. Owner: unassigned. Source: Alex, 2026-10-18.
Spec: [career milestone trees](specs/US-L017-L023-A004-career-milestone-trees.md).
Dependencies: US-A004, US-L019, US-L020 and US-L021. Scope: replace the roadmap
presentation using the current UI foundation; retain the setup flow and honest
CV preview. Decisions: reviewed curriculum and legacy career mapping. Other
trees are hidden by default; several followed careers are allowed.

```gherkin
Feature: Focused career milestone tree
  Scenario: US-L017-AC01 Open my focused career
    Given my account follows several careers and has a saved focus
    When I open Career Path
    Then I see that career's published tree starting at ISTQB Foundation
    And milestones are grouped into understandable stages
    And other careers' trees are hidden until I explore them
    And my other followed careers remain available through a compact selector

  Scenario: US-L017-AC02 Show honest milestone states
    Given a new account has no achievements or an existing account has recorded achievements
    When the tree loads successfully
    Then nodes distinguish achieved, ready and locked states in words as well as color
    And the achieved count comes from the account's actual qualifying evidence
    And no qualification is inferred from my CV preview or account role

  Scenario: US-L017-AC03 Inspect a milestone without completing it
    Given a ready or locked milestone appears in the tree
    When I select it
    Then its requirements and learning options appear in a detail area
    And selecting the node alone changes no achievement or enrollment

  Scenario: US-L017-AC04 Recover from missing data or a failed load
    Given career data is loading, failed, genuinely unselected, or withdrawn
    When I open the page
    Then I see the matching loading, retry, career-choice or unavailable-career state
    And a failed load is not presented as zero progress or no followed careers
    And saved goals and achievements remain intact

  Scenario: US-L017-AC05 Use the route with a keyboard or narrow screen
    Given I navigate by keyboard or use a narrow viewport
    When I explore milestones and their details
    Then all milestones, prerequisite explanations and actions are reachable
    And an ordered narrow-screen view preserves the tree's dependency meaning
    And focus remains visible and meaningful after updates
```

### US-L018 — Understand how to achieve a milestone

**As a learner, I want each milestone to explain its learning options and required
actions, so I can choose a suitable way to achieve it.**

State: Proposed. Priority: P2. Owner: unassigned. Source: Alex, 2026-10-18.
Spec: [career milestone trees](specs/US-L017-L023-A004-career-milestone-trees.md).
Dependencies: US-A004 and US-L017. Scope: course/action details, alternatives,
required exams and availability. Decisions: curriculum approval of each accepted
bundle. Course access and enrollment keep their current rules.

```gherkin
Feature: Milestone learning options
  Scenario: US-L018-AC01 Compare learning routes
    Given a milestone offers classroom and on-demand preparation or other approved alternatives
    When I inspect its details
    Then I see each option's course or action, format and availability
    And the milestone clearly distinguishes preparation from completion requirements
    And choosing an option does not enroll me or complete the milestone

  Scenario: US-L018-AC02 Require an exam separately from preparation
    Given Foundation requires passing its exam
    When a preparation course is completed or declared completed
    Then the exam action remains outstanding until it is declared passed
    And classroom attendance alone does not claim the qualification
    And an already-qualified learner may declare the passed exam without retaking a course

  Scenario: US-L018-AC03 Explain all required actions and alternatives
    Given a milestone accepts alternative bundles containing required actions
    When I review my remaining work
    Then the UI says which actions in a bundle are required together
    And it says when satisfying one accepted bundle is enough
    And unrelated alternatives are not all counted as mandatory

  Scenario: US-L018-AC04 Explain unavailable options without leaking data
    Given a recommended course is planned, withdrawn, external, or unavailable in the Academy
    When I inspect the milestone
    Then its availability and any published alternatives are explained
    And unavailable Academy options have no enabled start or enrollment action
    And public details reveal no private draft title or content
```

### US-L019 — Record my own learning and certification achievements

**As a learner, I want to record completed courses, passed certifications and
other milestone actions, so my career progress reflects what I have achieved.**

State: Proposed. Priority: P2. Owner: unassigned. Source: Alex, 2026-10-18.
Spec: [career milestone trees](specs/US-L017-L023-A004-career-milestone-trees.md).
Dependency: US-A004. Release with US-L020 before exposing declaration writes.
Scope: account-owned, explicitly self-reported declarations; persistent recovery
and isolation; separate evidence from platform lesson/quiz completion.
Decisions: approve the spec's requirement identities, add-only first-release
policy and handling of existing real course completion. No certificate upload
or administrator verification is required in the first release.

```gherkin
Feature: Self-reported career achievements
  Scenario: US-L019-AC01 Start without invented qualifications
    Given I am a new learner without saved achievements
    When I open a career tree
    Then no exam, course or milestone is already declared achieved
    And the CV preview does not populate qualifications

  Scenario: US-L019-AC02 Confirm an achievement
    Given an eligible published course, exam or action is shown in a followed career
    When I confirm that I completed or passed it
    Then one declaration is saved to my authenticated account
    And it is labelled self-reported rather than independently verified
    And an exam declaration does not claim the platform awarded a certification

  Scenario: US-L019-AC03 Restore and reuse the same achievement
    Given my account has a saved declaration used by several careers
    When I reload or open another device or career
    Then that declaration remains available wherever its identity qualifies
    And repeating the same save produces no duplicate achievement
    And another account cannot read or write it

  Scenario: US-L019-AC04 Retry without false success
    Given saving my declaration fails or its reply is interrupted
    When I inspect the result and retry
    Then the UI explains the failure and retains my chosen action
    And no unconfirmed save is shown as a persisted achievement
    And retry reconciles to one saved outcome

  Scenario: US-L019-AC05 Preserve real learning progress
    Given a course has incomplete lessons or an unpassed platform quiz
    When I declare that course completed for a career milestone
    Then the declaration is separate from platform lesson and grading records
    And those lesson records and quiz results remain unchanged
    And the declaration grants no course enrollment or content access

  Scenario: US-L019-AC06 Protect session and evidence boundaries
    Given an anonymous caller, an unknown action, or a response pending during an account change
    When a declaration is requested or its response arrives
    Then unauthorized or unknown declarations are refused without mutation
    And account identity comes from authentication rather than request-supplied identity
    And an old-session reply cannot populate the new account's achievements
```

### US-L020 — Unlock milestones through shared prerequisites

**As a learner, I want milestones to unlock when I meet their prerequisites,
so progression is meaningful while different career branches remain open.**

State: Proposed. Priority: P2. Owner: unassigned. Source: Alex, 2026-10-18.
Spec: [career milestone trees](specs/US-L017-L023-A004-career-milestone-trees.md).
Dependencies: US-A004 and US-L019. Scope: shared/cross-path prerequisite and
completion evaluation, with API enforcement. Decisions: final curriculum edges
and criteria versions. Course access remains independent. Test Architect is a
future composite-route example, not an additional launch career.

```gherkin
Feature: Meaningful and nonexclusive milestone progression
  Scenario: US-L020-AC01 Enforce prerequisites for achievement
    Given a milestone has an unachieved prerequisite
    When I inspect it or directly request an achievement declaration for its actions
    Then I can see what is required but cannot complete the locked milestone through the tree or API
    And the API explains the missing prerequisites without saving the forbidden declaration
    And existing course access rules are unchanged

  Scenario: US-L020-AC02 Keep sibling branches available
    Given the prerequisites for Test Automation Engineer and Technical Test Analyst are achieved
    When I pursue or achieve Test Automation Engineer
    Then Technical Test Analyst remains available
    And only downstream milestones whose prerequisites are met become eligible

  Scenario: US-L020-AC03 Reuse shared achievements across careers
    Given Foundation is referenced by several careers
    When I record the qualifying Foundation exam declaration
    Then that one achievement satisfies Foundation in each applicable career
    And changing the displayed route does not require repeating it
    And it is not duplicated in the account's achievement records

  Scenario: US-L020-AC04 Evaluate prerequisites across career boundaries
    Given an isolated published composite-career fixture requires management, technical and analyst milestones
    When I have achieved only two of those required milestones
    Then its dependent milestone remains locked and explains the remaining prerequisite
    When I achieve the remaining prerequisite in its contributing route
    Then the dependent milestone becomes eligible without copying or re-entering any achievement
    And I need not keep every contributing career followed to reuse that evidence

  Scenario: US-L020-AC05 Continue beyond a role milestone
    Given I achieve a published role milestone
    When the route has further development milestones
    Then those milestones remain visible and use their own prerequisite rules
    And the UI recognises the milestone without declaring my whole career finished or awarding a job title
```

### US-L021 — Pursue several careers and focus on one route

**As a learner, I want to follow several careers while viewing one route at a
time, so I can combine career directions without a crowded tree or lost progress.**

State: Proposed. Priority: P2. Owner: unassigned. Source: Alex's explicit
multiple-career correction, 2026-10-18. Spec:
[career milestone trees](specs/US-L017-L023-A004-career-milestone-trees.md).
Dependencies: US-A004, US-L019 and reviewed legacy selection mapping.
Scope: followed-career set, saved display focus, nonmutating exploration,
add/remove controls and preservation. This supersedes the prototype's exclusive
switching behavior. Decisions: review compatibility/migration for existing paths
outside the three launch roles; do not erase them or invent replacements.

```gherkin
Feature: Several career goals with one focused tree
  Scenario: US-L021-AC01 Follow another career without replacing a goal
    Given I follow Technical Tester
    When I follow Test Manager
    Then my account follows both careers
    And each followed career can be opened from the career selector
    And repeated follows do not create duplicates
    And no course enrollment is created by following either career

  Scenario: US-L021-AC02 Focus and explore independently
    Given I follow several careers
    When I focus one followed career or preview another published career
    Then the page displays only the selected route's tree
    And viewing a followed route preserves the followed-career set
    And previewing an unfollowed career changes no saved goal, focus or achievement
    And recording a new achievement through that preview requires following the career first

  Scenario: US-L021-AC03 Preserve achievements when stopping following
    Given I follow two careers and have achievements shared by their routes
    When I stop following one career
    Then the other career remains followed
    And all achievements and course enrollments remain stored
    And removing the focused career offers the remaining goals or a career-choice state

  Scenario: US-L021-AC04 Restore goals without lost concurrent additions
    Given two devices add different career goals to my account
    When both additions succeed and I reload
    Then both goals remain followed without duplicates
    And the saved focus identifies a followed career or the page offers a focus choice
    And a failed add or remove preserves the last confirmed state and offers retry

  Scenario: US-L021-AC05 Preserve an existing single-career selection
    Given an account already has a legacy selected career
    When the reviewed compatibility mapping is applied
    Then a supported existing career becomes a followed goal and initial focus
    And an unsupported or withdrawn selection is retained with a recovery explanation
    And existing completion, enrollment and evidence are not reset
    And a legacy selection write cannot erase the new followed-career set

  Scenario: US-L021-AC06 Keep goals private and controls accessible
    Given I use keyboard navigation or an account request completes after logout
    When I explore, follow, focus or remove a career
    Then dialogs and updated views preserve meaningful visible focus
    And goals can only be read or mutated for the authenticated account
    And the old response cannot alter the next session's goals or focus
```

### US-L022 — Get consistent career guidance on Home and my tree

**As a learner, I want Home and Career Path to use the same focus and achievement
rules, so I can trust the next step they recommend.**

State: Proposed. Priority: P2. Owner: unassigned. Source: integration consequence
of Alex's approved feature, 2026-10-18. Spec:
[career milestone trees](specs/US-L017-L023-A004-career-milestone-trees.md).
Dependencies: US-L017, US-L018, US-L020 and US-L021. Scope: adapt existing Home
career guidance to multiple goals, focused route and real milestone evidence;
no unrelated Home redesign. Proposed default: achieved counts, not a whole-tree
percentage that would treat every alternative branch as mandatory.

```gherkin
Feature: Consistent next-step guidance
  Scenario: US-L022-AC01 Recommend an eligible next action
    Given my focused career has an incomplete eligible milestone
    When Home and Career Path load
    Then they agree on the focused career and eligible next milestone
    And the action opens the relevant milestone, course or exam details
    And a locked milestone is not presented as ready to achieve

  Scenario: US-L022-AC02 Update guidance after a shared achievement
    Given my account follows several careers that share a prerequisite
    When the qualifying achievement is successfully saved
    Then guidance uses it wherever applicable
    And changing focus updates the displayed recommendation without deleting another goal

  Scenario: US-L022-AC03 Keep counts and completion claims honest
    Given the tree has alternative branches and separately recorded exam actions
    When I inspect Home and Career Path
    Then both use the same qualifying achievement counts
    And neither fabricates a whole-career percentage or assumes every branch is required
    And course preparation alone does not imply a passed exam

  Scenario: US-L022-AC04 Preserve existing recovery and session protection
    Given career goals or achievements cannot be loaded or an old-account response is pending
    When the page renders or I change accounts
    Then failed freshness is shown as unknown or unavailable with recovery guidance
    And cached information is not represented as newly confirmed
    And no previous account's private career information enters the new session
```

### US-L023 — Recognise relevant achievements from my CV

**As a learner, I want relevant certifications and courses from my CV to become
reviewable career achievements, so I do not have to enter them all manually.**

State: Proposed, future scope; excluded from the first milestone-tree release.
Priority: P3. Implementation owner: unassigned; Alex plans the later CV reader.
Source: Alex, 2026-10-18. Spec boundary:
[career milestone trees](specs/US-L017-L023-A004-career-milestone-trees.md).
Dependencies: US-L019 and US-L020. Decisions before Ready: upload/consent and
retention policy, supported CV formats, extraction interface, exact/ambiguous
matching rules, recognition provenance, learner review, and treatment of
out-of-order evidence. Do not implement the CV reader or imply it already works.

```gherkin
Feature: Future CV achievement recognition
  Scenario: US-L023-AC01 Recognise a matching certification or course
    Given the future CV reader has extracted a certification or course
    When it matches a canonical qualification or course under the reviewed matching policy
    Then the result identifies the existing achievement action rather than creating a duplicate milestone
    And the result has explicit recognition provenance

  Scenario: US-L023-AC02 Handle ambiguity and existing declarations
    Given a CV entry is ambiguous or matches an achievement I already recorded
    When the proposed results are reviewed under the agreed learner-review policy
    Then ambiguous text is not silently treated as a passed qualification
    And existing declarations and lesson evidence are not erased or duplicated

  Scenario: US-L023-AC03 Keep release-one CV behavior honest
    Given the CV recognition feature has not been implemented and released
    When I use the existing CV preview in career setup
    Then no file is uploaded, read or interpreted as achievement evidence
    And manual achievement recording remains available
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

### US-P016 — Retire the Google Sheets code for accounts and courses

**As the team maintaining QI Academy, I want accounts and courses to have one storage path,
so that there is less code to keep correct and nothing reads the old sheets by mistake.**

State: Proposed (2026-10-17). US-P014 and US-P015 are cut over (2026-10-18); this can start
after one release with a clean hosted log. Removes the Sheets repositories for users and courses, the
`USER_STORE`/`COURSE_STORE` switches and their health and doctor checks, and updates the
architecture and local development docs. Feedback keeps its Google Sheets store; the old
sheets stay in Google Drive as a read-only backup.

```gherkin
Feature: One storage path for accounts and courses
  Scenario: US-P016-AC01 Only feedback uses Google Sheets
    Given the API source after this story
    When a reviewer searches it for Google Sheets clients
    Then only the feedback repository and its configuration use them
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
