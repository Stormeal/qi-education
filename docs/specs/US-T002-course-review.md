# US-T002: Course review and publication

## Record

- Story: [US-T002](../user_stories.md#us-t002--submit-review-and-publish-courses-safely).
- State: Blocked on two product decisions; selected by the user on 2026-10-09.
- Owner: Codex. Branch: `main`.
- Base: `528e5571567da9559e7a728b1373b21a1ddeb710`.
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

## Pending product decisions

The user was asked these questions on 2026-10-09; no answer is assumed:

1. Keep a history of decisions, reasons, reviewer and date (recommended), or
   retain only the latest decision and return reason?
2. Require an admin to return a published course to draft before teacher edits,
   removing it from the catalog during review (recommended), or create a
   separate reviewable revision while the published version stays live?

These choices affect storage and the lifecycle contract. Do not implement either
alternative until answered. Review-history storage and a revision model must be
specified after the choices are recorded; existing Courses columns A:U are not
silently repurposed.

## Scope

Include submission, admin publication/return with a required reason, visible
teacher outcomes, private review feedback, explicit transition validation across
all routes, and the selected published-edit policy. Preserve admin-only pricing
and catalog settings and ownership rules.

Proposed submission checklist: valid existing metadata, an outline with at least
one lesson, and the existing US-T004 answerable-quiz checks. Recheck readiness at
publication. Preserve incomplete drafts and show actionable validation errors.
This checklist is proposed, not an additional confirmed product decision.

Do not add payments, notifications, collaborative editing, career paths,
cross-device progress, category warnings (US-A002), or the broader media
operational states of US-T006. Do not change shared data during implementation
verification. Existing enrolled-learner access rules remain the baseline; record
and resolve any impact of the chosen published-edit policy before implementation.

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

Add exact published-edit and history scenarios after the two answers. Define
whether submitted work is frozen and whether the owner can withdraw a submission
in the final transition table; do not leave those behaviors implicit in a generic
Status dropdown. No new scenario is marked passing before verification.

## UI and accessibility

Use the existing course editor's Publishing section as the decision entry point;
admins can already find private courses through the catalog's authoring view.
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

Choose storage only after the feedback policy is answered. Status and decision
persistence must not claim success after partial or uncertain provider writes.
Specify legacy rows with no feedback, restart persistence, header/schema impact,
retry behavior, and compatibility with existing clients. Do not silently discard
saved history or expose it in public catalog/course-content DTOs. No migration or
shared provider mutation is authorized by the story selection alone.

## Implementation checklist

Use writing-plans and test-driven-development for implementation; keep this
checklist in the project spec rather than creating a competing work queue.

- [x] Refresh clean main and read the story, linked contracts, and affected flows.
- [x] Identify missing policies and request the two product choices.
- [ ] Record the answers, finalize checklist, transition matrix and history/revision
  contracts, and change story/spec/queue to In progress at the actual base commit.
- [ ] Add failing real API/repository regressions for submission, review feedback,
  publication bypasses, chosen edit policy, stale actions, and private access.
- [ ] Implement lifecycle enforcement and persistence; run the affected API tests.
- [ ] Add failing UI flow/failure regressions, then implement typed review actions
  and visible outcomes in the existing editor and connected services.
- [ ] Run API/frontend suites and API/frontend/Pages builds. Walk teacher submission,
  admin return, teacher correction/resubmission, publication, and chosen edit policy
  in an isolated browser/API/store fixture; record integration limitations.
- [ ] Obtain fresh independent final review, address material findings, align semver,
  and commit locally on main. Record delivery commit and acceptance evidence in
  story/spec/queue; preserve resolved defect records. Do not push or deploy.

## Verification and delivery

| Scenario | Planned evidence | Current result |
| --- | --- | --- |
| AC01 | API lifecycle/readiness + teacher editor/browser submission | Pending |
| AC02 | Existing lifecycle authorization plus new bypass regressions | Narrow defect scope delivered in `a6767f6`; broader transition checks pending |
| AC03 | Persisted admin return/publication + owner reopen + catalog visibility | Pending |
| AC04 | Blank reason rejection and unchanged store + retained UI input | Pending |
| AC05 | Role access matrix and public DTO privacy | Pending |
| AC06 | Stale/concurrent actions, storage failure, retry and session guards | Pending |
| Selected edit/history policy | Exact tests and isolated browser checks after answers | Pending decisions |

Discovery was read-only. No application behavior or provider records changed and no
new acceptance checks have run. A documentation commit records this preparation;
it is not an implementation delivery or completion of US-T002.
