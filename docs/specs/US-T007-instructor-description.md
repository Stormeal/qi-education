# US-T007: Public instructor description

## Record

- Story: [US-T007](../user_stories.md), AC01 and AC02.
- State: API/storage increment delivered locally, selected 2026-10-11;
  combined frontend/browser acceptance remains open with Claude.
- Owner: Codex (API, validation, storage); Claude Code (all frontend behavior).
- Branch/base: main / a482800; required ancestor confirmed.
- Related defects: none confirmed. Existing broken behavior, if found, must be
  reproduced before a defect record/fix; missing new routes are not defects.
- Assignment: [handoff](../handoffs/US-T007-instructor-description-codex.md).

## Problem and outcome

As a teacher, I want to write my public instructor description in my profile,
so catalog visitors see an accurate introduction rather than course tags.
The API provides saved text associated only with the teacher's published courses;
when no description is available it provides no invented biography or account data.
Claude owns the card rendering, fallback text and profile/Admin interactions.

## Scope and decisions

Alex decided on 2026-10-11 that saving publishes the description immediately,
without approval, and an admin can clear unsuitable text.

Lead decisions (confirm or change), recorded from the handoff:
- One plain-text field, trimmed, at most 280 characters after trimming; empty clears.
- Teachers/admins may read and save their own description; students may not.
- Store per user in MongoDB in production and memory for local/demo/tests, using
  the career-path selection repository pattern. Do not change the users sheet.
- Public output contains only description and owned published course IDs.
- A saved description appears publicly only while its user owns a published course.

No frontend edits, approval workflow, account field expansion, existing route
changes, shared provider mutations, push or deployment are included.

## Behavior contract

```gherkin
Feature: Instructor introduction
  Scenario: US-T007-AC01 Display an authored description
    Given I saved my public instructor description and own a published course
    When a learner requests the instructor data used by the catalog card
    Then my description is associated with exactly my published course IDs
    And no other account fields are disclosed

  Scenario: US-T007-AC02 No public description exists
    Given an instructor has no public description
    When their instructor data is requested
    Then the public list has no description entry for them
    And the frontend can use its agreed fallback without inventing private details

  Scenario: US-T007-AC03 Save, reopen and clear own text
    Given I am a teacher or admin
    When I save trimmed text of 0 to 280 characters
    Then my own GET returns the stored description immediately
    And an empty string removes my public description

  Scenario: US-T007-AC04 Reject invalid descriptions without overwriting
    Given I have a saved description
    When I send a non-string or more than 280 characters after trimming
    Then the API returns 400 with only a message field
    And the previous description remains

  Scenario: US-T007-AC05 Enforce own-profile and moderation access
    Given an anonymous, invalid-session or student caller
    When they request own-profile or admin operations
    Then they receive 401 or 403 without profile data
    And a teacher also receives 403 on admin operations

  Scenario: US-T007-AC06 Restrict publication to course ownership
    Given saved profiles and draft, in-review, archived, published and legacy unowned courses
    When the public instructor list is requested even with an invalid token
    Then only non-empty profiles owning published courses appear
    And course IDs contain no private, archived, foreign or legacy unowned course

  Scenario: US-T007-AC07 Moderate every stored non-empty profile
    Given an admin and saved non-empty descriptions
    When the admin lists profiles and clears one
    Then the list returns only userId, displayName and description for each stored profile
    And clearing returns 204 even if nothing was stored
    And that description disappears from own and public reads

  Scenario: US-T007-AC08 Fail honestly on storage errors
    Given a failed profile read, save or clear
    When a new instructor endpoint is called
    Then it returns a message-only error instead of reporting success
```

## UI and accessibility

Claude implements the existing profile's About you field, catalog/course cards
and Admin clear control. This increment preserves their supplied API contract.
API-only acceptance does not establish browser rendering, keyboard interaction
or accessibility; those remain with the frontend owner.

## API, storage, and compatibility

All new routes also use `/api` after the existing alias normalization:

| Route | Access and exact response |
| --- | --- |
| `GET /users/me/instructor-profile` | Teacher/admin: 200 `{ description }`, empty string when absent; 401 invalid/missing session, 403 student |
| `PUT /users/me/instructor-profile` | Same access; `{ description }` string, trimmed 0..280, empty clears; 200 `{ description }`; invalid input 400 |
| `GET /instructors` | Public, ignores Authorization; 200 `[{ description, courseIds }]`, exactly one row per non-empty saved profile owning published courses, otherwise `[]`; private/no-store |
| `GET /admin/instructor-profiles` | Admin: 200 `[{ userId, displayName, description }]` for every non-empty stored profile, otherwise `[]`; 401/403 |
| `DELETE /admin/instructor-profiles/:userId` | Admin: 204 including absent profile; 401/403 |

Errors contain only `{ message }`. New profile routes use private/no-store;
authenticated responses also vary on Authorization. No existing response or
cache policy changes. Extra input fields do not let a caller choose another user.
Plain text is stored as a string, never interpreted as markup. Length follows
JavaScript string length, consistent with the existing About you limit.

New Mongo collection: `<MONGODB_COURSE_CONTENT_COLLECTION>_instructor_profiles`.
Documents contain `_id` (user ID) and `description` only. Atomic per-ID upsert
saves and delete clears follow the selection-storage pattern. Concurrent saves
are last-committed-write wins; no edit-version protocol is added. Memory storage
returns isolated snapshots. No migration or spreadsheet field change is needed.
Production without Mongo configuration refuses these new storage operations
with a message-only 503, rather than silently saving to temporary memory.
Configured development follows existing Mongo factory selection; tests always
inject memory stores or a memory-only collection into the actual Mongo adapter.

Public courses use the reviewed live catalog; author-view query parameters or
tokens cannot select working/private revisions. Public output never reads or
returns account names/emails. The admin list resolves displayName from accounts;
if a stored user is no longer found, it retains that record with an empty
displayName so an admin can clear it. No role/active-state policy beyond the
specified save/read restrictions and published-course association is invented.

## Implementation plan and checklist

Implement inline in this shared main checkout, as requested; no extra plan file,
branch or worktree. Apply test-first steps to each deliverable:

- [x] Write this spec before implementation.
- [x] Add `api/src/instructorProfile.test.ts`: isolated HTTP for all scenarios,
  both prefixes, permissions, trimming/boundaries, whitelist, live ownership,
  clear, missing profiles and message-only failures. Run RED before routes exist.
- [x] Add `api/src/instructorProfileRepository.test.ts`: memory snapshot isolation,
  actual Mongo adapter with memory collection for per-user get/save/list/clear,
  duplicate initial upsert retry, errors and factory selection. Run RED first.
- [x] Create `instructorProfile.ts` for validation and the stored model; route DTO
  selection explicitly whitelists output. Create
  `instructorProfileRepository.ts` for `get(userId)`, `save(userId, description)`,
  `list()` and `clear(userId)`; use injected collection loading for tests.
- [x] Create `instructorProfileRoutes.ts`; reuse injected existing authentication,
  teacher/admin and admin guards. Add only new dependency/registration in server.ts.
- [x] Run focused GREEN and all five checks; read-only review; update architecture,
  backlog and only Codex's queue row. Retain Claude's frontend acceptance.
- [x] Fresh aligned version bump, scoped staging, local commit, record hash and stop.

## Verification and delivery

Implementation: `7b890df` (0.1.116), locally on main after Claude frontend
`67079db`. This delivery-record commit carries its own hook-required aligned
patch bump and records the verified implementation; nothing is pushed.

| Scenario | Evidence | Result |
| --- | --- | --- |
| AC01/02/06 | Empty/draft-only, published-course ownership, live/working/archive revisions, legacy unowned courses, invalid bearer/author query, exact public DTO HTTP tests | API passed; browser pending |
| AC03/04 | Own-profile save/read/clear, trim/280, forged owner ignored and invalid input preserving previous text | Passed |
| AC05/07 | Role/session matrix; admin list including orphan, public description before clear then absent, idempotent clear | Passed |
| AC08 | Repository-failure HTTP and actual Mongo adapter with isolated collection; factory fail-closed production 503 | Passed in isolation |

Test-first evidence: before implementation, the first six HTTP cases failed with
404 for the absent routes. The expanded suite had 40 expected missing-route
failures and two existing JSON-parser rejections passing (42 cases). Repository
tests initially could not import the not-yet-created repository module. These
are new-feature RED evidence, not reproduced existing defects; no DEF entry was
created. Final focused result: 60 cases (46 HTTP, 14 repository).

All five required checks pass on the combined checkout with Claude's frontend
commit `67079db` preserved: 594 API tests, six journey checks, API build, 230
frontend tests and Pages build. Pages reports the existing career-path,
course-view-learning and course-builder stylesheet budget warnings; frontend
tests emit jsdom scrollTo notices. No failures were hidden or bypassed.
Read-only independent review found no remaining findings; its moderation fixture
coverage observation was addressed before delivery. No outside-scope edit needed.

Required: `npm run api:test`, `npm run verify:journeys`, `npm run api:build`,
`npm run app:test`, `npm run app:build:pages`. Isolated stores/collections only,
loopback ephemeral ports, never 3001/4200. Real Mongo durability, hosted API and
frontend/browser behavior remain unverified. API deployment must precede any
dependent frontend deployment; no deployment or push is authorized here.

## Frontend acceptance by the lead (2026-10-11)

Frontend delivered in `67079db` (0.1.115) and a fix in the lead-check commit. Story Done
locally; removed from the open backlog.

| Scenario | Check |
| --- | --- |
| US-T007-AC01 | `instructor-profile.service.spec.ts` (a card gets the description of whoever owns one of its courses; the public list is read without a token, once per visit and again after a save; profile state: read with the new token after sign-in, failed save stays unsaved and says why, retry saves). Browser, in-memory API: the demo teacher saved "About you" on the profile page (the text was trimmed, the page said it is on the account); with a published course owned by that teacher, the catalog's Popular instructors card and the course page's instructor card both showed the description instead of topics |
| US-T007-AC02 | Same spec (no description for other courses, for no courses, or when the list cannot be loaded). Browser: the demo course without an owner kept its topics; after an admin cleared the teacher's description the card showed "Course instructor"; `GET /instructors` returned only description and course ids |
| Admin clear | Browser as the demo admin: Admin, Instructor descriptions listed the teacher's name and text; Clear asked for confirmation, then showed "Cleared the description of Teacher Demo.", the list was empty and the public list was `[]` |

Decisions taken by the lead (confirm or change): the description is the profile's existing
"About you" field; a card without a description shows the course topics, or "Course
instructor" when there are none; job title, company, goals and avatar color stay on the device.

Found in the combined check and fixed: signing in as a teacher or admin ended the session at
once. The first description read went out before the new token reached the service, the API
answered 401, and the client treats a 401 as an expired session. The token is now set before
that read; the spec case "reads the account description with the new session token right
after sign-in" covers it. It never reached a pushed commit.

Combined tree: 594 API and 233 frontend tests, six journeys, API and Pages builds pass.
Not verified: real MongoDB, hosted behavior, a screen reader, the Admin section at phone width.
