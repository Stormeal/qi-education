# US-L003: Private account profile persistence

## Record

- Story: US-L003, scenarios AC01 and AC02 in `docs/user_stories.md`.
- State: API/storage verified locally; frontend and final story acceptance belong
  to Claude Code. This delivery covers API and storage only.
- Owner: Codex; Claude Code owns frontend behavior and the final story check.
- Branch/base: `main`, `4e465d9` (ancestor confirmed 2026-10-13).
- Related defects: None discovered at specification time.
- Decisions: Lead's 2026-10-13 handoff, recorded as **confirm or change**:
  four trimmed plain-text fields with the existing form limits, a six-digit hex
  avatar color, every signed-in role, private own-account access, MongoDB hosted
  storage and isolated memory locally/tests. Public instructor descriptions remain
  separate. The users spreadsheet is unchanged.

## Problem and outcome

As a learner, I want my profile details saved to my account, so that my goals
and bio are available wherever I sign in. The existing browser-local details
cannot establish that contract across devices. A successful save must persist
before returning the exact profile DTO; failures must leave the previously
stored profile intact when validation rejects input, and provide a useful error
so the frontend can preserve unsaved edits.

## Scope

Two additive own-account API routes and separate account-profile storage. No
frontend changes belong to this delivery. No existing route, response, status,
instructor-description behavior, account column or shared-service data changes.
No public profile, admin profile listing, or route accepting a target user ID.

## Behavior contract

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

  Scenario: US-L003-AC03 Never-saved defaults
    Given my account has never saved a profile
    When I GET my profile
    Then the four texts are empty and avatarColor is "#2f4f43"
    And updatedAt is null and the read does not create a saved profile

  Scenario: US-L003-AC04 Complete trimmed replacement
    Given I have an active student, teacher or admin session
    When I PUT all five valid fields
    Then all texts are trimmed before applying their limits
    And the whole profile is stored and returned with a server ISO updatedAt
    And client updatedAt, user IDs and every extra field are ignored

  Scenario: US-L003-AC05 Validation is atomic
    Given a previously saved or never-saved profile
    When any required field is missing or non-string, any trimmed text exceeds
      its limit, or avatarColor is not exactly "#" plus six hex digits
    Then PUT returns 400 with only a useful message
    And no field or timestamp is stored or changed

  Scenario: US-L003-AC06 Account privacy
    Given two different active accounts, including an admin
    When either reads or replaces a profile, including with another ID in input
    Then only the authenticated account's profile can be read or changed
    And no public, admin or target-account route returns private profiles

  Scenario: US-L003-AC07 Authentication
    Given a missing, expired, forged or invalid token, or a disabled account
    When GET or PUT is requested
    Then existing authentication returns its ordinary 401 message
    And profile storage is not accessed

  Scenario: US-L003-AC08 Unavailable storage
    Given profile storage is unavailable or its read or write fails
    When an authenticated GET or valid PUT is requested
    Then the route returns 503 with only a safe message
    And provider details and profile contents are not logged or returned

  Scenario: US-L003-AC09 Saved empty profile
    Given my account has never saved a profile
    When I save four empty or whitespace-only texts and a valid color
    Then the texts are stored empty with a non-null ISO updatedAt
    And later reads distinguish this save from never-saved defaults

  Scenario: US-L003-AC10 Compatibility and caching
    Given either the normal route or its /api alias
    When GET or PUT succeeds or returns an error
    Then Cache-Control is "private, no-store"
    And teacher and admin instructor-profile routes still return description only
    And student instructor-profile access remains 403
```

## UI and accessibility

Claude owns the profile service/page, loading, one-time legacy upload based on
`updatedAt: null`, edit preservation and error presentation. API tests verify the
transport/storage parts of AC01/AC02; browser and keyboard acceptance remain
Claude's final check. An all-empty saved profile must not trigger legacy upload.

## API, storage, and compatibility

Both normal and `/api` prefixes provide:

| Route | Request | Response |
| --- | --- | --- |
| `GET /users/me/profile` | Existing bearer authentication, every active role | 200 exact DTO; 401 ordinary authentication message; 503 `{ message }` when storage is unavailable |
| `PUT /users/me/profile` | All five fields required | 200 stored DTO; 400 `{ message }` invalid input with no write; 401 as above; 503 `{ message }` storage unavailable |

The exact DTO is `{ bio, jobTitle, company, learningGoals, avatarColor, updatedAt }`.
Text limits after JavaScript trimming are bio 280, jobTitle 120, company 120,
learningGoals 280 (existing form's string-length semantics). Text is stored as
plain text, without HTML interpretation or rewriting. Color is exactly
`#[0-9a-fA-F]{6}` and preserves the submitted case; it is not trimmed. The four
texts may be empty. `updatedAt` is null only before the first save, otherwise
a server-generated UTC ISO timestamp, regenerated on each valid PUT. Extras
are ignored and never persisted or exposed. Successful PUT awaits persistence.

Both routes have `Cache-Control: private, no-store` and `Vary: Authorization`,
including authentication, validation, store and JSON-parser errors. Existing
authentication remains centralized, including its unavailable-auth behavior.

Flat modules follow `instructorProfileRepository.ts`: `accountProfile.ts`
defines validation, types and the exact projection; `accountProfileRepository.ts`
provides `get(userId)` and `save(userId, input)` and injects a clock;
`accountProfileRoutes.ts` registers thin own-account handlers. `server.ts` only
wires the dependency/routes and adds the new routes' cache middleware before
JSON parsing.

Hosted storage uses `{ _id: userId, bio, jobTitle, company, learningGoals,
avatarColor, updatedAt }` in
`<MONGODB_COURSE_CONTENT_COLLECTION>_account_profiles`. Atomic per-user upserts
await majority acknowledgment; a first-upsert duplicate gets one replacement
retry, with failure if the target vanished. Concurrent saves are last committed
write wins; there is no revision precondition or cross-store transaction. A
provider timeout may have an uncertain write outcome; retry the complete PUT.
Missing hosted Mongo fails closed with 503, never temporary memory. Nonhosted
local runs (including shared-service opt-in) and tests always use isolated memory
for this private profile. Reads and saved results return detached snapshots.
No migration, backfill, new environment variable or users-sheet write is needed.

## Implementation checklist

- [x] Write HTTP contract tests against isolated stores and observe missing-route failures.
- [x] Write storage tests for per-user replacement, empty saves, detached snapshots,
  failed acknowledgments, first-upsert races and hosted/local selection.
- [x] Implement validation, projection, memory/Mongo adapters and route registration.
- [x] Run focused tests, compatibility tests and all five required commands.
- [x] Review the owned diff, update architecture/spec/queue evidence, align the fresh
  version, commit locally by explicit paths, then record the delivery commit.

## Verification and delivery

| Scenario | Test or manual check | Result/evidence |
| --- | --- | --- |
| AC01, AC03, AC04, AC09 | `api/src/accountProfile.test.ts`, `accountProfileRepository.test.ts`: defaults, role saves, fresh-client reads, replacement, empty saved timestamp | Pass locally, 2026-10-13 |
| AC02, AC05 | HTTP invalid bodies, each field's exact/over limits, no writes, unavailable save/retry | Pass at API/storage layers; frontend edit preservation belongs to Claude |
| AC06 | Two-account HTTP reads/writes, spoofed IDs and target-route denial; memory/Mongo isolation | Pass locally |
| AC07 | Both methods, missing/invalid/expired/forged/disabled sessions | Pass locally |
| AC08 | Failed read/write, safe 503/no diagnostic output; missing hosted storage | Pass locally, isolated provider doubles only |
| AC10 | Both prefixes/status headers, malformed JSON, same-user instructor compatibility and existing instructor suite | Pass locally |

Required commands: `npm run api:test`, `npm run verify:journeys`,
`npm run api:build`, `npm run app:test`, `npm run app:build:pages`.
All probes use isolated memory and ephemeral loopback ports; no servers on 3001
or 4200 and no shared Sheets/Mongo/Mux/GitHub/mail calls. Real Mongo durability,
hosted API, deployment ordering and combined two-device browser verification
remain release checks. This delivery is local only; no push is authorized.

Local evidence on 2026-10-13, working tree above Claude's `4a0ac60` (which retains
required ancestor `4e465d9`): first two never-saved HTTP tests failed with 404 on
both prefixes. After adding contract tests and repository scaffolding, all 164
new cases failed before implementation. Final focused profile/instructor run:
224 tests in four files passed. Full required checks:

| Command | Observed result |
| --- | --- |
| `npm run api:test` | Pass: 1,281 tests, 50 files |
| `npm run verify:journeys` | Pass: six HTTP role journeys; printed HEAD `4a0ac60528ea37c399907f5bd56b0402daeea1b2` with this API working delta |
| `npm run api:build` | Pass: TypeScript compilation |
| `npm run app:test` | Pass: 283 tests, 36 files |
| `npm run app:build:pages` | Pass: Pages bundle and generated SPA 404 fallback |

Frontend checks reported the existing test-setup compilation warning, jsdom
scrollTo notices and three stylesheet-budget warnings. No frontend failure was
fixed by Codex. No existing broken behavior was discovered/repaired, so the
non-UTF-8 append-only defect log was left untouched. No shared service or real
mail was contacted. Real Mongo acknowledgment/durability, hosted routes and the
combined browser/keyboard/two-device flow were not verified by Codex. The API
must deploy before the dependent frontend if Alex later authorizes release.

Independent read-only review found no actionable contract, security or storage
issues and separately passed the same 224 focused tests. Frontend accessibility
and migration, real Mongo durability/hosted routing and deployment remain outside
that review. Concurrent conflict detection is deliberately absent from this
complete-profile last-committed-write-wins contract.

Delivery: implementation committed locally as `56c7d36` (aligned version
`0.1.170`, ordinary commit hook passed), preserving Claude's `05a4bd7` and
`4a0ac60`. This documentation follow-up records the implementation ID and final
queue handoff with another fresh aligned version for the required hook. No API
behavior changed after the recorded verification. Claude owns final AC01/AC02
browser acceptance and removal of US-L003 from the backlog after that check.
