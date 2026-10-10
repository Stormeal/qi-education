# US-A003 - Withdraw a career path and protect concurrent edits

## Record

- Story: US-A003. State: In progress. Owner: Codex. Selected 2026-10-10.
- Branch/base: main / 5278f7c; required handoff 9f716fa is in the history.
- Product contract: [handoff](../handoffs/US-A003-career-path-withdrawal-codex.md).
- Related defect: DEF-019, found and reproduced in the initial uncommitted
  implementation during review; no live-service incident asserted.

## Problem and outcome

As an admin, I want to withdraw a published path and refuse stale edits, so that
I can correct publication mistakes without losing learners or another admin's
work. Today there is no withdrawal route, and path saves overwrite without
checking the loaded version. Claude owns the editor and Admin page; this work
provides exactly the agreed API contract, with legacy compatibility.

## Scope and behavior contract

```gherkin
Feature: Safe career path curation
  Scenario: US-A003-AC01 Withdraw a published path
    Given an admin has a published path with a draft and learner selections
    When the admin withdraws it
    Then public list omits it and public detail answers 404 with a message
    And the editable draft, revision and learner selections are retained
    And republishing restores the path for learners who selected it
    And teachers and students receive 403 and anonymous callers receive 401

  Scenario: US-A003-AC02 Refuse a stale save, publish or withdrawal
    Given another admin changed the path after I loaded its updatedAt
    When I save, publish or withdraw with X-Expected-Updated-At set to that version
    Then I receive 409 with code CAREER_PATH_CONFLICT
    And nothing in the path or its selections changes
    And only one simultaneous write based on the same version can succeed

  Scenario: US-A003-AC03 Preserve deployed clients
    Given a request omits X-Expected-Updated-At or sends it empty
    When an admin saves or publishes
    Then it behaves as today, with the existing response shape
    And an unsaved starter draft can still be saved or published
```

## API, storage, and compatibility

- Add `POST /admin/career-paths/:id/unpublish`, admin only, also under `/api`.
  Successful response is the existing admin DTO: id, published, draft, revision,
  updatedAt, learners. Published becomes null; keep an existing draft, or copy
  the published content to draft if no draft exists. Keep revision unchanged.
  A missing or already unpublished path responds 409 `{ message }`.
- Save (`PUT /admin/career-paths/:id`), publish and unpublish accept the optional
  `X-Expected-Updated-At` header. Nonempty values compare exactly to stored
  updatedAt. Mismatch responds 409 `{ message, code: "CAREER_PATH_CONFLICT" }`.
  Empty/absent values disable version checking, preserving last-save-wins for
  legacy clients. A stale version is checked before publish validation or
  withdrawal state checks, and checked again atomically at persistence.
- An unsaved seed has updatedAt `''` and no stored record. Empty/absent version
  preserves first-save/direct-publish behavior. Any nonempty expected version
  for an unsaved or missing record conflicts; it cannot upsert a fictional version.
- Every successful mutation issues a fresh ISO UTC updatedAt strictly greater
  than the prior timestamp (at least one millisecond), even with a fixed or
  backwards clock. This stops same-millisecond version reuse. Revision still
  advances only on publish. The repository allocates the timestamp and returns
  the persisted document; routes return that authoritative version. No
  document/response shape or migration is required.
- Mongo uses a single atomic `replaceOne` filtered by `_id` AND expected
  updatedAt, with upsert false and acknowledged majority writes. Zero matches
  produces the conflict. The route's early comparison alone is insufficient;
  the repository comparison prevents races across API instances. Legacy writes
  retain successful last-write-wins behavior, but internally read the current
  stored version and retry conditional replacements until successful, always
  allocating a token greater than that current version. Creation uses unique
  _id insert; a concurrent insert collision retries against the stored record.
  This prevents overlapping legacy clients from reusing a token and concealing
  a change from a versioned editor. Other provider/index errors propagate.
  The in-memory store performs check, version allocation and replacement
  synchronously, without yielding between them.
- Learner selections live in a separate collection and are never modified by
  withdrawal. Course enrollments, completion and access are unaffected. Public
  reads already hide `published: null`; selection reads retain the selected ID.
- Existing CORS middleware reflects requested headers when allowedHeaders is
  unset. Verify preflight from existing origins includes X-Expected-Updated-At;
  preserve other currently allowed headers. No frontend edit is needed here.

## UI and accessibility

Claude's editor owns Withdraw, conflict guidance and Load latest version. The API
supplies unsuccessful statuses and the agreed code; it never silently retries
or overwrites a stale edit. Browser focus/unsaved-form checks belong to Claude.

## Implementation plan

Using writing-plans and inline TDD within this assigned spec (no separate plan
file or worktree). Tech stack: Express, TypeScript, Mongo repository and Vitest.

1. Add this story/backlog and spec; register main/base/next step in Codex's row.
2. Add isolated HTTP tests in `api/src/careerPathWithdrawal.test.ts`: withdrawal,
   denial, selection retention, republish, stale three-operation conflicts,
   compatibility/seeds, same-version races, CORS and monotonic timestamps.
   Run before implementation and retain the failing evidence.
3. Extend `careerPathRepository.ts` with optional conditional save and a typed
   conflict. Stub getMongoDatabase before importing the adapter; test its real
   replaceOne filter/upsert/acknowledgment contract with memory fakes, never Mongo.
4. Add the timestamp helper in `careerPath.ts`; wire optional header checks,
   atomic write arguments/persisted version replies, unpublish and the existing error-handler response in
   `server.ts`. Keep existing validation, auth, DTOs and aliases.
5. Run API tests/build, six journeys and frontend tests. Request independent
   review and resolve important findings with regressions. Do not fix Claude's
   unfinished frontend or request scope extensions; record any need in the queue.
6. Update architecture, defect evidence and delivery status. Read the current
   package version immediately before each commit and apply the aligned bump.
   Stage own paths only. Record implementation hash in a delivery-record commit.

Review focus: stale-write races during publish validation; legacy/versioned ABA
overlap; concurrent first-save seeds;
version reuse under identical clocks; retaining a newer draft on withdrawal;
authorization before side effects; existing CORS/custom-header compatibility.

## Verification and delivery

| Scenario | Test/check | Evidence |
| --- | --- | --- |
| AC01 | Withdrawal HTTP tests, both route prefixes | Pass: retain newer draft, fallback published draft, unchanged revision/selections; republish; 401/403/409/404 |
| AC02 | Stale/race HTTP tests; conditional repository tests | Pass: no mutation on stale versions, one conditional winner, independent Mongo adapter command tests; mixed legacy/versioned overlap |
| AC03 | Existing career-path suite and missing/empty header/seed tests | Pass: existing DTO, missing/empty headers, first save/direct seed publish; no fictional version upsert |
| CORS / version reuse | Preflight and fixed-clock tests | Pass: header reflected from existing origin; strictly advancing persisted timestamps |
| Compatibility | Full API/frontend suites, API build, six journeys | Pass 2026-10-10: 418 API tests, 182 frontend tests, six journeys, API build |

Initial red evidence before implementation: 20/26 withdrawal/version HTTP cases
failed and 5/8 repository cases failed. The first implementation passed its
suites but independent review reproduced DEF-019: a delayed legacy write reused
the immediate writer's token. Both HTTP-prefix regressions failed before that
fix. Moving allocation into persistence and returning the saved token resolved
it. Final 58 focused tests pass (28 withdrawal, 12 repository, 18 existing path
tests); final independent review has no remaining important findings.

Implementation and local delivery commit: pending. Version bump read/applied
at commit time. No file outside the assigned ownership is needed.

All mutation tests use disposable memory stores, fetch stubs and ephemeral ports.
Mongo adapter tests can prove the issued compare-and-replace command and modeled
contention; actual Mongo deployment, durability and multi-instance behavior
remain unverified. No shared Sheets, MongoDB, Mux or GitHub data is read/written.
No push. Hosted/API-to-editor/browser checks remain release checks.
