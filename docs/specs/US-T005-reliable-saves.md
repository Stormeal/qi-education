# US-T005: Save without silent overwrites

## Record
- State: Done. Owner: Codex. Branch: `main`.
- Base: `5211365d2f0dd1cec6538d96a6c0ec6262e1aa50`, 2026-10-09.
- Story: [US-T005](../user_stories.md). Defect: DEF-015, reproduced INV-001.
- Ruling: retain sequential metadata/content saves with explicit partial outcomes.
  Manual reconciliation preserves work; automatic merging is excluded.

## Problem and outcome
A stale browser currently returns HTTP 200 and overwrites a newer title. Each full
document save must prove which authorized private snapshot it edited. Failure
preserves the local draft. A retry uses the last acknowledged version, never a
blindly refreshed token.

## Behavior contract
```gherkin
Feature: Reliable authoring saves
  Scenario: US-T005-AC01 Reject a stale save
    Given another authorized editor saved after my loaded snapshot
    When I save metadata or the complete lesson outline
    Then the API returns 409 AUTHORING_CONFLICT without writing
    And the UI preserves my local draft and offers the latest saved version
    And I must explicitly reconcile or discard before saving again
  Scenario: US-T005-AC02 Identify a partial save and retry safely
    Given metadata and lesson edits are submitted together
    When metadata saves and lesson storage fails
    Then the UI says details saved and lessons remain unsaved
    And retry saves only the unfinished part with the acknowledged revision
    And an intervening save causes a conflict instead of an overwrite
  Scenario: RS-01 Require a loaded revision
    Given an authorized client omits or malforms its revision on a full save
    When it submits metadata or lessons
    Then the API rejects it without writing and asks it to reload
  Scenario: RS-02 Respect authorization, publication and private data
    Given the requester lacks course ownership or the revision is frozen
    When authoring is attempted
    Then existing authorization and review gates still apply
    And public and learner responses contain no private review state
  Scenario: RS-03 Retain edits during media polling
    Given unsaved outline or focused text exists
    When a background media refresh sees a changed server version
    Then local edits remain intact and saving requires reconciliation
```

## UI and accessibility
An inline alert explains conflicts. Compare latest loads a private read-only preview
of all metadata and lessons. The teacher edits their local draft, then explicitly
acknowledges reconciliation against the displayed snapshot, or discards local work.
Frozen/different working revisions cannot be adopted by a stale draft. All async
responses respect account and editor identity. Pending/error/success are distinct.

## API, storage and compatibility
`X-Course-Revision` is JSON `{version, revisionId}` from author GET `review`.
Metadata and outline PATCH require it; malformed/missing returns 428, stale returns
409. Checks execute inside the existing per-course storage lock before mutation.
Field-specific asset/media operations check a supplied header; old clients without
one retain their existing narrow server-side update behavior. New clients send it.
Successful private mutations include updated `review`; general metadata consumers
strip this from catalog items. Create returns the initial private revision.
No precondition for pricing/catalog fields, which are independent admin operations.
Both API prefixes retain the same contract. Existing full-save clients must refresh
with the updated frontend; omission never silently bypasses conflict protection.

## Implementation checklist
- [x] RED/GREEN API stale/missing versions, lock races, partial provider failure and privacy.
- [x] Typed frontend revision propagation through normal saves and media operations.
- [x] RED/GREEN partial outcomes, conflict preview/reconciliation and background refresh protection.
- [x] Isolated browser two-editor conflict, full suites/builds, one fresh review, docs and local commit.

## Verification and delivery
Delivered 2026-10-09 in `d674ee3a24c487923ca8f8586afefb27bd191753`. [verification](../verification/2026-10-09/US-T003-T005.md) maps every
scenario to tests and browser evidence. Staged-only verification: 276 API and
122 frontend tests; API, frontend and Pages builds pass. One independent final
review completed; all five findings have RED-to-GREEN regressions. Shared-provider
and hosted checks remain separate; no shared stores were used for mutation probes.

Original isolated reproduction: version 0, first PATCH 200, stale PATCH 200,
stored title replaced by stale title at version 2. Full saves now reject stale
snapshots without writing. First legacy saves persist data and version together.
