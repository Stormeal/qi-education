# US-P003: Safe account and feedback retries

## Record

- Story: [US-P003](../user_stories.md), AC01, AC02, AC03.
- State: In progress; selected 2026-10-11.
- Owner: Codex.
- Related investigations: INV-003 (signup/enrollment), INV-004 (triage).
- Related defects: DEF-023 (signup), DEF-024 (Sheets enrollment), DEF-025 (triage),
  allocated after isolated reproduction.
- Branch/base: main / fc98679; required ancestor confirmed.
- Assignment: [handoff](../handoffs/US-P003-safe-retries-codex.md).

## Problem and outcome

As a maintainer, I want concurrent/retried operations to have one intended
outcome, so duplicate accounts, lost enrollments and duplicate issues do not
result. The audit observed read/check/write sequences, not confirmed incidents.
Reproduce each scenario independently before changing its production behavior.
An unreproduced case is recorded with evidence and is not fixed.

## Scope and decisions (confirm or change)

The lead selected these decisions on 2026-10-11:

- Within one API instance, signup writes sharing the same normalized email run
  one after another, including the existence check and account creation.
- Within one API instance, enrollment writes for the same user run one after
  another, covering the repository's entire read/modify/write operation.
- Across several API instances nothing new is guaranteed. Alex must decide
  whether to retain Sheets with shared uniqueness/atomic update coordination,
  or move these writes to a store providing those guarantees. That portion of
  US-P003 remains open; this is not a distributed lock or uniqueness constraint.
- Triage reuses the issue already stored on feedback or already created in this
  instance. The smallest selected mechanism is a per-feedback serial queue and
  an in-memory issue checkpoint written immediately after successful creation,
  retained across failed feedback saves, and cleared after a successful save.
  A queue prevents overlapping triage attempts from both creating an issue.
  Restart/cold-instance recovery is not newly guaranteed: a durable issue lookup
  or persisted idempotency strategy requires Alex's remaining decision.
- No attempt limits or auth abuse controls; those belong to US-P008-AC02.

## Behavior contract

```gherkin
Feature: Safe account and feedback writes within one API instance
  Scenario: US-P003-AC01 Concurrent signup
    Given two requests use the same normalized email address
    When signup requests overlap within one API instance
    Then at most one account is created
    And the other request receives the existing registered-email conflict

  Scenario: US-P003-AC02 Concurrent enrollment
    Given I enroll in two different published courses concurrently
    When both operations complete within one API instance
    Then both enrollments persist without duplicates or lost updates

  Scenario: US-P003-AC03 Retried feedback triage
    Given feedback is marked for work and issue creation succeeds before persistence fails
    When triage is retried within that API instance
    Then it links the issue already created instead of creating a second one
```

Failure cases: queues release on success, rejection and missing-data returns;
unrelated email/user/feedback keys can proceed independently. Failed signup or
enrollment writes retain existing error responses and allow subsequent retries.
Triage retains existing permission denial, validation, missing feedback,
GitHub-unavailable and persistence-error responses. A creation failure must not
leave a false issue checkpoint. Existing saved issue links remain unchanged on
retry and on non-work triage. Queues are instance-owned, not global.

## UI and accessibility

No frontend change. Existing forms and triage interactions retain their
loading/error/success behavior, paths and JSON contracts. No new client retry
keys, headers or response fields are required.

## API, storage, and compatibility

Affected handlers: `/auth/signup` and `/signup` (including `/api` aliases),
`POST /users/me/courses/:id`, `PATCH /feedback/:id/triage`.
Login, authentication and every other route keep their existing wiring.
The overlapping signup loser returns exactly 409 and
`{ "message": "An account with this email already exists" }`.
All request shapes, success statuses/responses and triage issue fields remain
unchanged. Existing role, active-account and published-course checks remain.
Both real Sheets adapters exercised through local stubs and in-memory adapters
use the same scoped coordination; no schema or shared-store migration.
An in-memory enrollment that already handles concurrent updates correctly is
characterized, not independently rewritten to invent a reproduced defect.

## Implementation checklist

- [x] Write this spec before tests and implementation.
- [x] Reproduce AC01/02/03 with isolated HTTP, memory stores and Sheets/GitHub stubs.
- [x] Append confirmed DEF records without re-encoding or editing existing entries.
- [x] Fix only reproduced races using instance-owned queues/checkpoint.
- [x] Verify failed operations release queues and unrelated keys remain independent.
- [x] Run all five required checks; remove delivered scenarios, retain distributed work.
- [ ] Record local delivery commits, limitations and queue status; no push.

## Verification and delivery

| Scenario | Test or manual check | Result/evidence |
| --- | --- | --- |
| US-P003-AC01 | `api/src/safeRetries.test.ts`: paused memory createUser / real Sheets adapter append against local rows; case-normalized email across signup aliases | RED: two 201s, four cases. GREEN: one 201, one 409 with exact existing duplicate body; one Sheets row; login still 200 |
| US-P003-AC02 | Same file: real Sheets adapter, paused row update across two memory courses; memory characterization | RED: both 200, course-b lost (two cases). GREEN: both persisted, duplicate retry adds nothing; memory did not reproduce and its repository was not rewritten |
| US-P003-AC03 | Same file: memory and real Sheets feedback adapters, issue stub then failed link write | RED: retry links issue 2 (four cases). GREEN: issue 1 reused/saved; overlap reuses one issue; existing link preserved |
| Failure/independence | Same file: write rejection then retry, unrelated email/user keys, repeated triage save failure, non-work retry, GitHub failure and denied/invalid/missing triage | GREEN on both route prefixes |

### Reproduction and verification, 2026-10-11

The spec was written first on fc98679. Before any production change,
`npm --prefix api test -- src/safeRetries.test.ts` ran 12 cases: ten expected
assertion failures and two passing in-memory enrollment characterizations.
Both `/api` and plain paths reproduced; the signup aliases overlap in one queue.
INV-003/004 were promoted only on this evidence. New defect records were appended
as ASCII bytes; existing non-UTF-8 bytes and Claude's DEF-022 entry were preserved.

Implemented three instance-owned `KeyedSerialQueue` objects and a pending-issue
Map in `createServer`. No repository/interface/schema, frontend behavior, login
or other-route wiring changed. Gates never reject and release in `finally`;
completed queues discard their own tail. The issue checkpoint survives repeated
failed link saves and is persisted even if the retry changes triage status.
Only acknowledged saves clear it. This does not solve multi-instance races,
instance termination, an ambiguous GitHub creation result or cold-start retries.

Final focused suite: 34/34 pass. Combined tree includes Claude's preserved
35b45c2 DEF-022 keyboard-focus commit. Required checks:

| Command | Result |
| --- | --- |
| `npm run api:test` | 534 tests, 31 files, pass |
| `npm run verify:journeys` | Six scenarios pass; printed HEAD 35b45c2 with working API changes |
| `npm run api:build` | Pass |
| `npm run app:test` | 225 tests, 28 files, pass; existing jsdom scrollTo notices |
| `npm run app:build:pages` | Pass; existing stylesheet budget warnings for course-view learning, course-builder and career-path |

No check was blocked by Claude's work. Read-only review found no Critical,
Important or Minor issue within the explicit instance-only contract; creation
with a lost GitHub response, distributed/restart recovery and abuse controls
were explicitly outside scope. Local delivery hash is recorded after committing.
No outside-scope file is needed. Delivered AC01,
AC02 and AC03 are removed from the backlog; Proposed AC04 retains the existing
distributed/restart gap and Alex's unresolved coordination/persistence decision.

Required commands: `npm run api:test`, `npm run verify:journeys`,
`npm run api:build`, `npm run app:test`, `npm run app:build:pages`.
Tests use loopback ephemeral ports, never 3001/4200. No shared spreadsheet,
MongoDB, Mux or GitHub reads/writes. Hosted behavior, real providers, browser
walkthroughs, multiple API instances and restart recovery are unverified.
