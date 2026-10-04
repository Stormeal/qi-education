# <story-id>: <behavior title>

Use this template for a new feature spec. Replace angle-bracket fields before
marking the linked story Ready. Keep this template itself as a reusable example.

## Record

- Story: <ID and backlog link>
- State: Proposed
- Owner: <implementation owner when selected>
- Related defects: <IDs or none>
- Branch/base: <actual branch and Git commit>
- Product decisions: <confirmed choices and their date>

## Problem and outcome

As a <actor>, I want <capability>, so that <benefit>.
Describe the current trigger and behavior, the intended outcome, and observable
success. Distinguish observed facts from assumptions.

## Scope

Define included behavior and explicit exclusions. Name prerequisites and any
product decisions that must be resolved before implementation.

## Behavior contract

```gherkin
Feature: <user-visible capability>
  Scenario: <story-id>-AC01 <successful outcome>
    Given <initial state and actor permissions>
    When <one user action>
    Then <observable result>
    And <persisted or navigation result when relevant>

  Scenario: <story-id>-AC02 <denied or failed action>
    Given <forbidden state or dependency failure>
    When <the action is attempted>
    Then <specific feedback or response>
    And <required data preservation>
```

## UI and accessibility

Define entry points, loading/empty/error states, keyboard behavior, focus, and
validation feedback. Preserve draft work on errors when required.

## API, storage, and compatibility

List affected routes and request/response changes, permission enforcement,
identifiers and invariants, persistence, migrations, retry/idempotency behavior,
and effects on existing clients. State whether this is implemented or proposed.

## Implementation checklist

Add small ordered steps after the story is selected, grounded in the affected
files. Include migration and failure handling before release.

## Verification and delivery

| Scenario | Test or manual check | Result/evidence |
| --- | --- | --- |
| <ID>-AC01 | <test file or walkthrough> | Pending |
| <ID>-AC02 | <test file or walkthrough> | Pending |

Record commands, date, tested commit, environment, integration limitations,
delivery commit, and any subsequent release verification. Pending is not passing.
