# US-P006: API availability under class load

State: In progress (selected API increments, including AC06, delivered locally;
hosted AC02 budget remains). Owner: Codex. Branch/base: main / f8d4c2f. Selected 2026-10-09.
Delivery: `67ec9f2a8da47c31a835ff1ffc430087520ab7a2` (version 0.1.62).
Related investigations: INV-005, INV-007, INV-011, INV-012 (reproduce before promotion).

## Contract and decisions

US-P006 AC01/03: 20 concurrent learners can read one published course without
waiting on other readers or an exclusive writer lock. Writers remain serialized.
Existing entitlement checks, private revisions and response shapes remain intact.
AC02: record Sheets reads per authenticated route before/after. Reuse the Google
client, remove header initialization from reads, and reuse metadata within an
operation. No cross-request timed user cache: account revocations stay fresh.
Concurrent Sheets reads may share only an in-flight fetch, with no retained result.
Quota headroom across cold serverless instances remains a disposable-provider
release check, not a guarantee established by unit tests.
AC04: saving attachment references checks ownership with a projection excluding
binaries; preserve the existing missing-reference behavior and foreign-course denial.
AC05: catalog uses a batched projection of review metadata/status, excluding lesson
sections and history, including existing documents without a migration.
AC06 selected 2026-10-11 ([handoff](../handoffs/US-P006-thumbnail-cache-codex.md)),
main/base df556f0. User-confirmed contract: only a successful 200 thumbnail read
whose string `v` equals the ID of the asset actually served receives
`Cache-Control: private, max-age=31536000, immutable`. `Vary: Authorization` stays.
Unversioned reads, all 404s and errors retain `private, no-store`. Wrong/stale
versions, inaccessible courses, missing assets and foreign-course assets retain
their existing status and body. Working-revision thumbnails still require author
access and the exact working pointer. Content-Type, Content-Length and image bytes
are unchanged. Both `/courses/:id/thumbnail` and its `/api` alias follow this
contract; no other route changes. No response is marked public. No frontend,
storage format or migration change is needed; the frontend already requests `v`.

AC06 acceptance:
```gherkin
Scenario: US-P006-AC06 Unchanged thumbnails are not downloaded again
  Given I loaded a published course thumbnail
  When I revisit the catalog and the thumbnail has not changed
  Then the image is served from cache
  And a draft or replaced thumbnail is never served from a shared cache
```

AC06 implementation checklist:
- [x] Reproduce INV-018 with isolated HTTP before implementation; promote to DEF-021.
- [x] Override the cache header only after existing access and asset checks succeed.
- [x] Verify matching/unversioned/denied/error reads, both callers and route prefixes,
  pending author previews, replacement and unchanged other-route policies.
- [x] Run all five requested checks, record evidence and remove delivered AC06.
- [x] Commit locally with the required aligned version bump; record delivery hash.

## API/storage and plan

- [x] Reproduce/count with isolated HTTP, Sheets and Mongo stubs (RED).
- [x] Share Sheets client; request-scoped metadata reuse; no read-path headers.
- [x] Add course-review summary and asset-owner projections to Mongo/memory stores.
- [x] Replace read-route coordination with review context; retain write locks.
- [x] Verify parallel reads, forbidden access, live/private review compatibility,
  attachment denial, catalog projection and cross-role journey (GREEN).
- [x] Full combined-tree checks, independent review, version bump and local commit.

## Reproduction on f8d4c2f (2026-10-09)

`npm --prefix api test -- src/platformLoad.test.ts`: all five regressions RED.
INV-005: client identities differ; authenticated reads: me 3, catalog 4,
outline/content/thumbnail/quiz attempt 5 each. INV-007: only 1 of 20 readers enters
before the paused read finishes. INV-011: 51 full content reads for 50 seeded courses
plus demo course. INV-012: text save fetches 41,943,040 binary bytes (ten 4 MiB files).
Promoted as DEF-P006-01/02/03/04 respectively to avoid ID collisions with Claude.

## Verification (2026-10-09, isolated combined tree)

| Authenticated route | Before Sheets reads | After Sheets reads |
| --- | --- | --- |
| /auth/me | 3 | 1 |
| /courses | 4 | 2 |
| /courses/:id/outline | 5 | 2 |
| /courses/:id/content | 5 | 2 |
| /courses/:id/thumbnail | 5 | 2 |
| POST quiz-attempts | 5 | 2 |

Counts include authentication. Original measured thumbnail had no pointer (404);
the final test seeds a thumbnail and proves 200 at the same read budget.
20 simultaneous content requests on one warm instance share in-flight Sheets
fetches (test ceiling four reads, at least 56 of a 60-read budget unused for this
burst). This does not establish a whole-minute workload budget or cold-instance quota.
All 20 readers enter before the paused content fetch completes. All five read
routes return 200 while a writer holds the lock. Catalog performs zero full-document
reads; Mongo uses one batch inclusion projection. Ten attachment ownership checks
transfer zero binary bytes and a foreign course reference remains 403.
Private/live, pricing, enrollment and stale-revision protections remain covered by
`courseLifecycle.test.ts`, `courseReview.test.ts`, and `verify:journeys`.
Because author reads no longer wait for a save, a review action made from the old
version returns 409; fetching the latest version and retrying remains safe.
Final independent review reproduced a split author-read race: old lesson sections
could be paired with a new save token. A RED-to-GREEN HTTP regression now pauses
the old snapshot, saves newer work, and proves replay of the old response receives
409 without overwriting it. Author content and review state use one document read.
AC06 deferred as permitted by the user; no thumbnail cache-policy change.

Initial combined suite: 316 API tests, 128 frontend tests, six journey scenarios, API build
and Pages build pass. Pages retains three existing stylesheet budget warnings.
Final suite after review fixes: 319 API tests and all other checks pass again.
Local delivery: `67ec9f2a8da47c31a835ff1ffc430087520ab7a2`. No browser/product UI change in this API
batch; HTTP regressions exercise the client contracts. Hosted quota/finality pending.

No UI change or shared-store migration. Evidence and route counts are recorded here
after reproduction. Hosted Sheets quota, Mongo durability and provider timings
require separate disposable-provider verification. No push authorized.

## Review note, 2026-10-10 (Claude Code)

The 20-request burst figure is timing dependent: 4 Sheets reads on the development machine,
6 on the CI runner, against 40 with no sharing. The test now asserts fewer than 20 rather than
at most 4. Treat the burst number as evidence that concurrent reads share a fetch, not as a
quota guarantee; the per-route counts above are exact and unchanged.

## AC06 / DEF-021 verification, 2026-10-11

Reproduction on df556f0: the first four HTTP tests failed only on Cache-Control
(`private, no-store` instead of the required versioned private-cache header).
Expanded suite before the fix: six RED header assertions, 36 existing-behavior
cases passing. Implementation changes only the successful thumbnail response
after course access and asset ownership checks, comparing `v` to `asset._id`.

| Scenario / boundary | Evidence in `api/src/thumbnailCache.test.ts` (both route prefixes) |
| --- | --- |
| US-P006-AC06 unchanged published thumbnail | Anonymous and signed-in matching `v`: 200, immutable private caching, Vary Authorization, identical type/length/bytes |
| No version / malformed version | Anonymous and signed-in unversioned reads and empty/array/repeated versions preserve 200/no-store and bytes |
| Wrong version / inaccessible draft | Anonymous, learner and author wrong versions; non-author draft reads: existing 404/body, no-store |
| Missing / foreign asset | Missing course, pointer or binary; foreign-course pointer: 404/no-store |
| Asset returned under a different ID | Existing 200/bytes retained but no-store, regardless of matching course pointer |
| Error responses | Invalid Bearer token: 401/no-store; course/asset store failures: 500, existing safe body, no-store |
| Revision and replacement | Real start-revision/upload/submit/publish workflow: pending version only readable by author; old version readable while live, then 404/no-store for anonymous/learner after publication; new version immutable/private |
| Other route policies | Catalog, outline and author content retain private/no-store with matching `v` |

Final focused suite: 42/42 pass. Combined tree includes Claude's preserved
9a4d032 quiz keyboard fix. `npm run api:test`: 500 tests pass;
`npm run verify:journeys`: six scenarios pass (prints HEAD 9a4d032 with these
working API changes); `npm run api:build`: pass; `npm run app:test`: 222 tests
pass; `npm run app:build:pages`: pass with three existing stylesheet budget
warnings (course-view learning, course-builder, career-path). Frontend tests
also emit existing jsdom scrollTo notices. No check was blocked by Claude's work.

This verifies the HTTP cache contract with isolated memory repositories and
loopback ephemeral ports, including the existing frontend URL shape. Actual
browser network-cache hits, hosted API/header behavior and real provider
durability are unverified. No shared Sheets, MongoDB, Mux or GitHub data was
touched, no frontend behavior was edited, and no push/deployment was performed.
No additional file outside the assigned scope is required. Local delivery:
`f1aed614d24c653b083e2ca5399ade3c1387ab9b` (0.1.106); this delivery-record commit
also carries the hook-required aligned patch bump. Read-only review found no Critical,
Important or Minor issues within the explicit contract; additional 503/review
errors exit before the override, while public caching and revocation changes
remain outside this scope.
