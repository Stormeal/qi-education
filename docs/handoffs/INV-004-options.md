# INV-004: feedback triage can create a second GitHub issue

X6 investigation and options for Alex and Claude, 2026-10-22. **Proposal only; no production fix
implemented.** Source base: `f4c1d61` on shared `main`. Related: US-P003-AC04 and
[feedback behavior](../specs/admin/feedback.md).

## Reproduction and cause

`api/src/multiInstanceFeedback.test.ts` reproduces this through the real HTTP route, once with
the plain path and once with `/api`:

1. Seed one feedback record in an in-memory repository and use a stub GitHub service with its
   own issue list. Authenticate as the synthetic local admin.
2. PATCH `/feedback/:id/triage` with `{ workStatus: 'work', priority: 'high' }`.
3. The stub creates issue #1. Inject a failure before saving that issue's link. HTTP is 500;
   the stored feedback is unchanged and still has no issue link.
4. Close the first HTTP server, then construct a **fresh `createServer()` and GitHub service**.
   Only the feedback/account store and simulated external issue list survive.
5. Retry the same PATCH. HTTP is 200, but issue #2 has been created for the same feedback.

First run as ordinary `it`: **two failures**, both at the final assertion expecting one issue
and observing two. Final committed form uses **`it.fails`**, documenting the unfixed expectation.
All setup, failure-response, unchanged-store, restart, successful-retry, and persisted-link checks
are in `beforeEach`, outside the expected-failure body. An unrelated setup error therefore fails
the suite instead of being accepted as the known defect. Only the no-duplicate assertion is
expected to fail. When a future fix satisfies it, Vitest should report an unexpected pass until
the annotation is removed.

The memory-backed repository models stored data surviving an API restart; it does not claim to
test Sheets durability. The stub is the only issue creator. No real GitHub, Sheets, MongoDB,
Stripe, Mux, or mail calls were made, and both listeners use ephemeral ports.

### Code path

- `api/src/server.ts:179–182`: `triageWrites` and `pendingFeedbackIssues` are created inside
  `createServer()`. Neither is shared across instances or persisted.
- `api/src/server.ts:1531–1559`: triage reads the feedback, creates an issue when there is no
  saved link or local pending entry, caches the result in that local map, then saves the link.
  Failed saves leave the map available to the same instance; a fresh server has an empty map.
- `api/src/keyedSerialQueue.ts`: explicitly instance-local coordination. It cannot serialize
  two independent servers processing the same feedback.
- `api/src/githubFeedback.ts:17–63,79–98`: the service creates an issue and returns its number/URL;
  it has no recovery lookup. Bodies already contain a visible `Feedback ID`, useful when manually
  finding old orphan issues. Project attachment is best effort after issue creation.
- `api/src/feedbackRepository.ts:68–107`: Sheets reads the row and overwrites J:M. Its interface
  has no atomic claim/compare-and-set operation. A pending flag written through this method is
  not a cross-instance lock.

## Options

Sizes below are rough engineering estimates for one developer familiar with this code, including
isolated regression tests and documentation. They are not implementation commitments or provider
behavior guarantees.

| Option | Main benefit | Remaining limitation | Rough size |
| --- | --- | --- | --- |
| A. Durable pending marker on the feedback row | Restarts remember that issue creation was attempted | A pending marker does not reveal whether GitHub accepted the request; Sheets read/write is not an atomic claim | 1–3 days for the limited guard and manual recovery policy |
| B. Find an issue by a stable hidden marker | Can recover an issue whose link was never saved | Lookup plus create is not atomic; concurrent requests or an inconclusive lookup can still duplicate | 1–2 days for lookup, marker, tests, and bounded failure handling |
| C. Atomic operation journal plus marker recovery | Coordinates instances and preserves known issue results independently of the feedback link save | A crash during GitHub creation still leaves an uncertain external outcome requiring reconciliation | 3–5 days plus provider/operational acceptance checks |

### A. Persist a pending creation marker before calling GitHub

**How:** Add an issue-creation state and stable operation key to the feedback record. Before the
POST, durably mark it pending. On success, store the issue number/URL and mark it linked. A retry
that sees pending must reconcile or report an unresolved operation, rather than automatically
creating again. For the demonstrated failed-link-save case, the pending marker survives the
restart even when the final issue link does not.

**What can still go wrong:**

- Crash after marking pending but before contacting GitHub leaves an entry that needs recovery.
- Crash after GitHub accepts the issue, or a lost POST response, leaves the same pending state.
  Retrying creation when a timeout expires can create a duplicate. Waiting indefinitely can
  strand feedback; an admin needs a documented way to inspect and attach the existing issue.
- Two instances can both read an unclaimed Sheets row, both write pending, and both create an
  issue. A fresh read or process-local queue cannot make that read/write pair atomic. This is
  a limited restart guard, not a complete fix for concurrent instances. An atomic coordinator
  would turn this into option C or require a separately reviewed storage mechanism.
- New columns must survive every row update and serializer, and old rows need a default state.
  A failed or uncertain pending write must prevent GitHub creation, not be ignored.

**Code touched:** `feedback.ts` (entry type, column headers, row serialization/defaults),
`feedbackRepository.ts` (pending/state operations, memory and Sheets implementations/ranges),
the triage handler in `server.ts`, and tests. Admin UI/service and feedback spec changes would
be needed if explicit pending-state recovery is exposed to admins. Preserve existing columns;
do not repurpose J:M or silently change the public work-status vocabulary.

### B. Recover by a stable marker in the GitHub issue body

**How:** Append a machine-readable marker such as
`<!-- qi-academy-feedback:<environment-namespace>:<feedback-id> -->` to issues created by the
integration. Before creation, search/list candidate issues in the configured repository and
verify the exact marker in each returned body. If exactly one matches, reuse its number and URL
and retry only the feedback save. Include closed issues and handle pagination. Use the immutable
feedback ID and a stable namespace, not mutable message text or the displayed title.

**What can still go wrong:**

- Two instances can both observe no match before either POST completes. There is still no atomic
  lookup-and-create operation in the current adapter.
- An incomplete, delayed, denied, or failed lookup must not be treated as proof that no issue
  exists. API lookup behavior, permissions, pagination, and visibility timing need provider-level
  verification. If search cannot expose a hidden comment reliably, enumerate candidate issues
  and inspect returned bodies; do not assume hidden comments are searchable.
- A marker can be edited or removed. Inspect trusted integration-authored metadata rather than
  accepting a user-supplied marker quoted in a feedback message as authority. Multiple matches
  should trigger reconciliation, not an arbitrary choice or another POST.
- Existing issues contain only the visible `Feedback ID`; a reviewed legacy lookup/backfill or
  manual attachment policy is needed for those orphans. No real issue is changed by this note.
- More reads add latency and consume provider capacity. Bound the lookup work; report an
  unresolved operation when it cannot establish a safe result. An arbitrary scan limit cannot
  establish absence. Reusing an issue must not duplicate optional Project side effects.

**Code touched:** `githubFeedback.ts` (marker formatting, lookup/reuse interface and configured
adapter), `server.ts` (recovery decision and error mapping), GitHub service fakes/callers in tests,
and feedback documentation. No Sheets schema change is required for this option alone. The
existing `createIssueFromFeedback` service could instead become an explicit find-or-create
operation, provided its remaining race limitations are documented.

### C. Durable atomic operation journal, with B as its recovery mechanism

**How:** Use a shared journal keyed uniquely by repository, stable environment namespace, and
feedback ID. MongoDB is already an application storage dependency, but this would be a new
feature-specific collection/repository, not an automatic migration of feedback from Sheets.
Atomically claim the operation before the first GitHub POST. Record `creating`, then the returned
issue number/URL as `created`, independently of the final feedback row update. A fresh instance
seeing `created` retries the Sheets link save without creating again. Only the atomic claimant
may create an issue. Keep the saved result so late retries can recover it.

If an instance dies in `creating`, use the stable GitHub marker to find and record the result.
If the external outcome remains unknown, stop creation and return an actionable unresolved
state for reconciliation. Lease expiry may permit a recovery worker; it must not authorize a
second POST while the first operation's outcome is uncertain.

**What can still go wrong:** There is no transaction spanning the journal, GitHub, and Sheets.
A lost GitHub response or a crash before recording `created` still needs marker recovery or
manual resolution. Journal outages must refuse new creation. Lease/recovery ownership needs
atomic checks; a slow original worker must not race a replacement creator. Marker deletion,
old unmarked issues, provider lookup limits, stale Sheets links, and multiple historical matches
still need an operational policy. Keep existing saved feedback links authoritative unless a
separate repair is approved. This reduces the demonstrated duplicate path and coordinates
instances; it should not be sold as unconditional exactly-once delivery.

**Code touched:** new `feedbackIssueOperationRepository.ts` (interface, memory/Mongo adapters,
unique index and conditional state transitions), a focused orchestration service, `server.ts`
(wiring/triage delegation), `githubFeedback.ts` (B's marker and lookup), configuration/health as
needed, isolated cross-instance and crash-window tests, and operational/spec documentation.
The existing feedback work status and Sheets records can remain in place. Any admin recovery
control would require its own UI/API contract.

## Recommendation

Choose **C with B's recovery marker** if the objective includes both restarts and independent
instances, as INV-004 does. An atomic operation record plus a persisted issue result closes the
known successful-POST/failed-feedback-save path without depending on the lifetime of one server.
The marker addresses the remaining window between GitHub accepting the POST and the journal
recording its result. Stop on an uncertain outcome rather than silently creating another issue.

If Alex wants a smaller first step, B is a useful mitigation for visible orphan issues after a
restart, but label it partial and keep INV-004 open. A Sheets pending flag alone is not a complete
concurrency fix. Do not add a pending flag and then automatically retry POSTs after a timeout.

Before implementation, Alex/Claude should choose the storage/coordination approach and agree
how admins resolve an uncertain operation. Follow-up acceptance should include: failed pending
write creates nothing; failed final feedback save reuses the known issue after restart; two
servers triaging one feedback create only one issue; lost POST responses and journal-write
failures do not cause a blind second POST; closed/edited/legacy/multiple matches are handled;
an unrelated feedback item remains actionable; auth, error privacy, and Project behavior hold.

## Evidence limits and delivery

- The committed reproduction is an expected failure, not a fix. INV-004 stays open.
- No production API implementation, app behavior, story, or area spec was changed.
- Real Sheets persistence/atomicity, MongoDB indexes/failover, GitHub search/indexing/rate limits,
  issue permissions, and Project retry behavior were not tested. Provider-specific design details
  above are requirements to verify during implementation, not claims of observed guarantees.
- Verification before delivery: `npm run api:test` completed successfully, **94 files;
  2,431 passing tests and 2 expected failures (2,433 total)**. `npm run api:build` passed.
  `git diff --check` passed. The two expected failures are the new INV-004 reproductions.
- Delivered locally in the commit containing this note, titled
  `X6: reproduce INV-004 and compare recovery options`. No push or deployment.
