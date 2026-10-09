# US-T003: Protect and recover unsaved authoring

## Record
- State: Done. Owner: Codex. Branch: `main`.
- Base: `5211365d2f0dd1cec6538d96a6c0ec6262e1aa50`, 2026-10-09.
- Story: [US-T003](../user_stories.md). Previous fix: DEF-006 remains Fixed.
- Decision: user selected device-local recovery on 2026-10-09. Existing warnings remain.

## Problem and outcome
Teachers can recover unsaved metadata, lesson outlines and focused text after a
refresh. Recovery is offered explicitly to the same authenticated account and
course; it does not submit or publish work.

## Behavior contract
US-T003-AC01/02 retain the [navigation contract](DEF-006-unsaved-navigation.md)
and truthful failure/retry behavior in [US-T005](US-T005-reliable-saves.md).

```gherkin
Feature: Local draft recovery
  Scenario: US-T003-AC03 Recover my draft after refresh
    Given I am authorized to edit a course and have unsaved metadata or lessons
    When I refresh and return as the same account
    Then I can explicitly restore or discard my local draft
    And focused lesson text and section titles are recoverable
    And a different account cannot restore it
  Scenario: DR-01 Recover against newer saved work
    Given my recovered draft was based on an older saved revision
    When I restore it
    Then my draft is retained and saving requires conflict reconciliation
  Scenario: DR-02 Honest storage failure and intentional discard
    Given local storage is unavailable, full, corrupt or expired
    When I edit or return
    Then unusable drafts are not offered and persistence failures are reported
    And navigation warnings still protect current edits
    And a confirmed save or explicit discard clears the corresponding local draft
  Scenario: DR-03 Separate browser tabs
    Given two tabs edit the same course
    When they create different local drafts
    Then one tab does not overwrite the other's recovery record
```

## UI and accessibility
An inline status offers Restore/Discard before editing. Recovery is limited to
this browser, retained seven days, and bounded to 2 MB per draft. Storage errors
explain that refresh recovery is unavailable. Existing file uploads are not cached;
only textual content and completed asset references are included. No tokens.

## API, storage and compatibility
A dedicated helper owns versioned localStorage records, keyed by account/course/document.
Each document gets a fresh UUID, including duplicated tabs; no cloned sessionStorage
identity can overwrite another record. Returning offers the newest applicable draft
and a title/date chooser for other records belonging to the same account and course.
Authorization and the private author snapshot must load before offering recovery.
Corrupt or expired records are ignored. Explicit discard removes the offered record;
native refresh warnings retain it. Restored stale bases use US-T005 reconciliation.
No server migration, cross-device sync, automatic merging, or draft publication.

## Implementation checklist
- [x] RED/GREEN recovery helper: account isolation, separate tabs, expiry, corrupt/quota failure.
- [x] Capture focused buffers and persist edits only after authorized editor initialization.
- [x] Restore/discard UI and session/path guards; protect background refreshes from data loss.
- [x] Scenario tests, isolated browser flow, fresh final review, documentation and local commit.

## Verification and delivery
Delivered 2026-10-09 in `d674ee3a24c487923ca8f8586afefb27bd191753`. [verification](../verification/2026-10-09/US-T003-T005.md) maps every
scenario to tests and browser evidence. Staged-only verification: 276 API and
122 frontend tests; API, frontend and Pages builds pass. One independent final
review completed; all five findings have RED-to-GREEN regressions. Shared-provider
and hosted checks remain separate; no shared stores were used for mutation probes.
