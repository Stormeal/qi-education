# DEF-008/011/012/013: Remaining defect closure

## Record

- State: Fixed. Owner: Codex. Selected: 2026-10-09.
- Branch/base: `main`, `797d55c` (clean; origin refreshed).
- Defects: [DEF-008, DEF-011, DEF-012, DEF-013](../defect_management.md).
- Stories: US-P002-AC01, US-L005, US-L008 in [the backlog](../user_stories.md).
- Scope: accurate parser responses, honest unfinished controls, and investigation
  and correction of catalog category/card reports. No new career/Q&A/Notes feature.

## Behavior contract

```gherkin
Feature: Accurate request errors
  Scenario: RD-01 Invalid JSON
    Given a request contains malformed JSON
    When the API parses it on a supported route or alias
    Then it returns 400 with a safe message
    And it does not echo the body or expose internal errors

  Scenario: RD-02 Oversized request
    Given an authorized author uploads a thumbnail over 2 MiB or attachment over 25 MiB
    When the raw parser rejects the body
    Then it returns 413 with a safe message
    And stored metadata, content and assets remain unchanged

  Scenario: RD-03 Existing errors
    Given invalid fields, an unsupported upload type or encoding, or an unexpected exception
    When the API processes the request
    Then validation retains 400 and unsupported media retains 415
    And corrupt compressed bodies return safe 400 responses
    And unexpected exceptions retain a safe 500 response

Feature: Honest feature availability
  Scenario: RD-04 Unfinished controls
    Given career track editing, Q&A and Notes have no implemented contract
    When the learner opens Home or a learning workspace
    Then those features are not presented as working actions
    And Overview remains readable and real learning actions remain operable

Feature: Catalog integrity
  Scenario: RD-05 Stored category
    Given an isolated sheet row contains a valid category in column S
    When it is read through the repository and catalog API
    Then its category is preserved
    And the card and category filter use that category
    And an empty legacy category still falls back to Uncategorized

  Scenario: RD-06 Wrapping title and badges
    Given a published course has a wrapping title and catalog badges
    When its featured and list cards render at desktop and mobile widths
    Then title, badges and price are readable without clipping or overlap
```

## Boundaries and decisions

Keep existing JSON `message` responses and upload limits. Classify known parser
errors locally at the parsing boundary; do not trust arbitrary application error
status fields. No data migration. Shared mutations are limited to the seven
category cells explicitly approved by the user on 2026-10-09. Category reports
must be traced through actual row/DTO/card/filter evidence; do not invent a
category from unrelated course fields. An unreproduced report stays Investigating
with the next evidence needed. DEF-011 uses the stated default of hiding
unfinished controls; the optional preference had no reply before implementation.
Full features remain Proposed. DEF-012 was reproduced as missing category data;
existing valid-category mapping is correct. The approved repair is applied and
verified, with before values and a fresh dry-run retained as evidence.

## Implementation checklist and ledger

- [x] API: add request error regressions in `api/src/requestErrors.test.ts`, run
  them red, fix parser error handling in `api/src/server.ts`, verify full API suite.
- [x] Catalog: probe `GoogleSheetsCourseRepository` with an isolated sheet double,
  trace API/category filters; record whether DEF-012 actually reproduces.
- [x] UI: capture DEF-013 before/after with long-title fixtures. Correct only
  failing card layout in `courses-page.scss`; test the rendered desktop/mobile UI.
- [x] Availability: test Home/workspace entry points, remove or clearly disable
  unfinished actions according to the preference, retain working actions.
- [x] Run frontend/API suites, API/frontend/Pages builds, isolated browser checks
  and fresh independent review. Update backlog, defects, architecture and queue.
- [x] Align versions and commit locally, then record the fixing hash. No push.

## Verification and delivery

RD-01-06 pass. [Verification](../verification/2026-10-09/remaining-defects.md)
records 222 API/101 frontend tests, all builds, browser/layout evidence, shared
category repair and clean independent review. Other shared provider writes and
hosted application deployment checks are excluded. Fix commit: `79c2ea5fd2721594f4b1f2c603982d80ef909bce` (2026-10-09). Resolution record version: 0.1.50.
