# US-T002: Course review and publication

## Record

- Story: [US-T002](../user_stories.md#us-t002--submit-review-and-publish-courses-safely).
- State: In progress; implementation verified, local delivery commit pending.
- Policies confirmed by the user on 2026-10-09.
- Owner: Codex. Branch: `main`.
- Implementation base: `96e9ff90bd8ad04363ac2d5bedf5ac105d0ec7e7`.
- Related defects: DEF-002 and DEF-003 remain Fixed; their original evidence and
  delivery records are preserved. US-T004 supplies the existing quiz readiness rules.
- Selection authorizes this story; it does not select other Proposed stories.

## Problem and outcome

As a teacher, I want to submit a course for admin review and see its outcome,
so that learners receive reviewed material.

At the selected base, teachers can submit by changing the Status selector and
saving. Owner/admin private access, admin-only pricing/catalog controls, and
quiz readiness checks already exist. Admins can change status through ordinary
metadata editing, including bypassing submission. No review reason, reviewer,
decision date, or decision history is stored. Teachers can edit submitted and
published content in place. These are current implementation observations, not
claims that the previously fixed authorization defects have reopened.

The intended result is an explicit submission and admin decision flow, visible
teacher feedback, and an enforced policy for changes to published material.

## Confirmed policies and design

The user selected full decision history and rejected returning published courses
to draft because learners must retain uninterrupted access (2026-10-09).

Use one private working revision per course. Submitted revisions are frozen until
an admin publishes or returns them with a required reason. Owners and admins may
start another revision from a published course. Initial drafts use the same review
flow. Admin authoring also uses revisions; price/catalog controls remain immediate
admin operations. No owner withdrawal action is included.

Persist the working snapshot, live snapshot and chronological review events in the
existing MongoDB course-content document (memory equivalent for isolated checks).
A publication updates live metadata/content/thumbnail pointers and its decision
history in one document write under the existing course lock. Courses Sheets retain
identity/owner and admin catalog/price data; public metadata is composed with the
live snapshot. This avoids a cross-store publication switch or adding history JSON
to a Sheet cell. Legacy published courses remain readable and are snapshotted when
a revision starts; no bulk migration or shared mutation is needed.

History records revision ID, action, authenticated actor ID/name, date and reason.
Review actions require the loaded revision ID and version; stale actions return
409. General POST/PATCH cannot bypass submission/publication or mutate live content.
The first legacy draft metadata/content/thumbnail edit or matching media callback
materializes a workflow and increments its version; later edits do the same.
Draft edits increment revision versions; this is review-action concurrency protection,
not the broader stale-editor feature US-T005. Retain live-referenced assets when
removed from a working revision. Pending assets/feedback stay private. Old history
is never truncated silently; oversized document writes fail without success claims.

| Current working/live state | Action | Actor | Result |
| --- | --- | --- | --- |
| Initial draft or revision draft | Submit | Owner/admin | Frozen ready-for-review snapshot; live unchanged |
| Ready-for-review | Return with reason | Admin | Editable working draft; live unchanged |
| Ready-for-review | Publish | Admin | Atomic live replacement and recorded decision; working cleared |
| Published/archived, no working revision | Start revision | Owner/admin | Clone live into private draft; live unchanged |
| Published | Archive | Admin | Removed from discovery/new enrollment; existing enrollment retains access |

Publication checklist: existing valid metadata, at least one lesson, existing
US-T004 quiz readiness. Recheck on submission and publication. Existing required
field validation stays in place; no new category/thumbnail/video completeness gate.

## Scope

Include submission, admin publication/return with a required reason, visible
teacher outcomes, private review feedback, explicit transition validation across
all routes, and the selected published-edit policy. Preserve admin-only pricing
and catalog settings and ownership rules.

Submission uses the checklist above. Preserve incomplete drafts and actionable
validation errors. A returned revision cannot replace live content until resubmitted
and approved. Archival remains an explicit admin action, never a side effect of editing.

Do not add payments, notifications, collaborative editing, career paths,
cross-device progress, category warnings (US-A002), or the broader media
operational states of US-T006. Do not change shared data during implementation
verification. Existing enrolled-learner access rules remain the baseline; record
any further product changes outside this contract separately.

## Behavior contract

The original story scenarios remain the top-level acceptance contract:

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

  Scenario: US-T002-AC04 A return requires feedback
    Given I am an admin reviewing a submitted course
    When I try to return it with an empty reason
    Then the action is rejected with an actionable validation message
    And the stored status and review feedback are unchanged

  Scenario: US-T002-AC05 Feedback is private
    Given a course has admin review feedback
    When an anonymous visitor, learner, or unrelated teacher requests that feedback
    Then the API denies access without exposing reasons or reviewer details
    And the owner and admins can read it after reopening the course

  Scenario: US-T002-AC06 Reject a stale or failed review action
    Given the course no longer has the status required by my action or storage fails
    When I submit or decide the review
    Then the UI does not claim that the action succeeded
    And my unsaved edits or return reason remain available
    And a retry cannot silently bypass the allowed transition
```

```gherkin
  Scenario: US-T002-AC07 Published revision retains learning access
    Given a published course has enrolled learners
    When its owner creates, edits, submits or receives a returned revision
    Then catalog details and learner lessons still use the current published version
    And existing enrollments remain usable
    And only admin approval replaces the live metadata and lessons together

  Scenario: US-T002-AC08 Full review history survives another cycle
    Given a course has been submitted, returned, resubmitted and published
    When its owner or an admin reopens author preview after a restart
    Then all decisions remain visible in chronological order with revision, actor and date
    And the return reason remains present after publication and later revisions
```

## UI and accessibility

Use the existing course editor's Publishing section as the decision entry point;
admins open the course editor from existing catalog authoring actions. Submitted
lessons, quizzes, resources and media have a read-only preview for review decisions.
Replace unrestricted status changes with permitted actions and a readable status.
Provide an explicit teacher submission action and admin publish/return actions.
Label the return-reason field, display inline errors and pending states, prevent
repeat clicks while pending, and announce outcomes. Display feedback to the owner
and admins with dates and the selected history policy. Preserve existing editor
styling, keyboard access, focus visibility, and unsaved-navigation warnings.

Confirm the selected lifecycle policy in frontend capabilities as well as API
checks. An owner must still be able to read their decision when editing is locked.
Failure must retain the draft or reason; stale responses after logout, account
replacement, or navigation must not populate another user's review state.

## API, storage, and compatibility

Affected boundaries: `api/src/server.ts`, `course.ts`, `courseRepository.ts`,
`courseAccess.ts`, course content/assets and per-course coordination;
`app.models.ts`, `course.service.ts`, `app-state.service.ts`, editor route/page,
and authoring catalog permissions.

Specify typed lifecycle actions and a single transition policy used by general
metadata and dedicated review routes. Creation must not provide an alternative
publication bypass. Re-read lifecycle state under the existing course operation
lock before decisions and protected writes, including uploads and deletions.
Preserve safe 400/403/409/500 errors and private/no-store response boundaries.
Never accept client-supplied reviewer identity or decision timestamps.
Both ordinary and `/api` upload aliases must select the same private snapshot.
Archive preserves unsaved private buffers; authorized authors can download retained
live resources as well as private revision resources. Matching Mux callbacks do
not downgrade ready/errored media to processing, and duplicate events do not
advance a version.

Add a private `review` field to stored content and a repository method to atomically
persist workflow plus live sections. Public/learner DTOs explicitly omit this field.
Use scoped repository views so every existing metadata/content/media mutation
addresses the working revision while public/enrolled reads address live snapshots.
Asset deletion retains live references; thumbnail reads validate selected pointers.
Mux callbacks must match stored upload IDs and never overwrite a different revision.

Expose owner/admin state on author content and typed `POST /courses/:id/review`
actions. No current sheet columns are changed. Provider write uncertainty retains
existing coordination ownership and requires the recovery runbook. A pending
revision never changes live entitlement, even when a write fails.

## Implementation checklist

Use writing-plans and test-driven-development for implementation; keep this
checklist in the project spec rather than creating a competing work queue.

- [x] Refresh clean main and read the story, linked contracts, and affected flows.
- [x] Identify missing policies and request the two product choices.
- [x] Record answers and finalize transition/storage contracts at the current base.
- [x] Add failing real API/repository regressions for submission, review feedback,
  publication bypasses, chosen edit policy, stale actions, and private access.
- [x] Implement lifecycle enforcement and persistence; run the affected API tests.
- [x] Add failing UI flow/failure regressions, then implement typed review actions
  and visible outcomes in the existing editor and connected services.
- [x] Run API/frontend suites and API/frontend/Pages builds. Walk teacher submission,
  admin return, teacher correction/resubmission, publication, and chosen edit policy
  in an isolated browser/API/store fixture; record integration limitations.
- [ ] Obtain fresh independent final review, address material findings, align semver,
  and commit locally on main. Record delivery commit and acceptance evidence in
  story/spec/queue; preserve resolved defect records. Do not push or deploy.

## Verification and delivery

| Scenario | Evidence | Result |
| --- | --- | --- |
| AC01 | Real HTTP submission/checklist/structured quiz issues; editor save-before-submit and frozen preview; browser submission | Pass |
| AC02 | Existing ownership/lifecycle regressions; admin creation/direct publication denial and review role checks; both route prefixes | Pass |
| AC03 | Persisted return/publish; browser owner feedback, correction and admin publication; learner catalog | Pass |
| AC04 | Blank reason rejected with unchanged store; browser inline validation; UI failed decision retains reason | Pass |
| AC05 | Role denials; learner mapper omits workflow; pending thumbnail/resource privacy | Pass |
| AC06 | Initial metadata/content/thumbnail/media versioning; stale and failed writes; duplicate click/session guards; archive retains dirty buffers | Pass |
| AC07/08 | Atomic replacement and full persisted history; retained live assets; matching/late/duplicate media callbacks; teacher/admin/learner browser | Pass |

Detailed tests, browser steps, final review corrections, provider limitations and
release checks: [US-T002 verification](../verification/2026-10-09/US-T002.md).
Implementation verified on 2026-10-09; delivery reference is recorded after commit.

## Implementation plan

Implement inline using executing-plans and TDD; obtain one fresh final reviewer.

1. `api/src/courseReview.ts`: workflow model, scoped metadata/content/asset adapters,
   action validation and snapshots. `courseContentRepository.ts`: atomic workflow
   persistence. Real HTTP and real repositories in `courseReview.test.ts`; boundary
   Mongo doubles only for atomic-write/restart/uncertain-write checks.
2. Connect adapters and review route in `server.ts`; enforce all generic creation,
   metadata, content, thumbnail, attachment and Mux routes. Existing tests whose
   contract intentionally allowed direct publication must use the review flow or
   assert the new denial; keep their original permission/readiness regressions.
3. Add frontend types/service action and review state/session guards; reuse the
   editor with a publication/history panel, explicit revision/submission/decision
   actions and frozen submitted content. Add meaningful DOM/service regressions.
4. Run full checks and isolated role walkthrough, then fresh final review; record
   evidence, align versions, commit and update delivery references.

Review focus: pending asset references, late media callbacks, publication failures,
legacy rows, and stale review actions/session replacement. All must preserve live
learner access and keep private feedback/revision data out of public responses.

No acceptance scenario is marked passing before its verification. No shared data
mutation, push or deployment is included in implementation.
