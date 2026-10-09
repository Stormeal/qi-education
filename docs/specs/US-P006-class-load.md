# US-P006: API availability under class load

State: In progress (selected API increment delivered; hosted AC02 budget and
optional AC06 remain). Owner: Codex. Branch/base: main / f8d4c2f. Selected 2026-10-09.
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
AC06 is optional after this scope; private caching policy is unchanged until tested.

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
