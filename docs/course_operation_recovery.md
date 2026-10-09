# Course operation coordination and recovery

Introduced with DEF-002–004 on 2026-10-07. This is an operational runbook, not an
automated lock recovery feature. No shared lock records were changed during testing.

## Normal behavior

MongoDB uses `<MONGODB_COURSE_CONTENT_COLLECTION>_locks` in the configured database.
Each record has `_id` = course ID, a random `owner`, and `acquiredAt`. The built-in
unique `_id` index serializes API instances. Acquisition and owner-scoped deletion
request majority acknowledgement. No TTL index or age-based takeover is permitted.
Collection loading/insertion share a five-second deadline. Contention or deadline
expiry returns 409; storage failures return 500. Driver insert/delete use
`timeoutMS`; owner deletion is also bounded by five seconds. A late acquisition
never enters the course operation and may leave an owner requiring recovery.

The lock covers consistent reads, author/admin mutations, enrollment, and webhook
content writes. It remains held until the awaited handler finishes, even if a
client disconnects. Successful operations and validation failures release it.
Actual provider write failures conservatively retain durable ownership:
a remotely accepted write may still complete after a local connection failure.
Logs identify course/owner records requiring verified recovery. Read failures
release normally because they do not initiate remote mutations.

Memory stores coordinate only within their shared repository/process. Sheets
operations require MongoDB coordination; process-local locks cannot protect
independent hosted functions. This locking prevents overlapping operations; it
does not implement stale-editor conflict detection or a cross-store transaction.

## Recover an abandoned or uncertain owner

1. Pause writes for the affected course and inspect the exact course/owner record,
   acquisition time, and corresponding API/provider logs.
2. Confirm the originating API invocation has terminated. For an uncertain write,
   also establish the final Sheets/Mongo/provider outcome; stopping the invocation
   alone does not prove an accepted remote operation cannot still commit.
3. Inspect persisted course status, price, content, and asset references. Repair
   inconsistent data only after deciding the intended outcome and confirming no
   operation can still write it.
4. Delete **only** the inspected record matching both `_id` and `owner`, using
   majority acknowledgement. Never delete by age alone or clear the whole collection.
5. Retry a harmless authorized read, verify the intended lifecycle/content state,
   then resume writes. Record the incident and recovery evidence.

If termination or final remote outcome cannot be established, leave ownership in
place. Automated recovery and operator tooling are Proposed in US-P005.

## Required hosted release checks

Use disposable Sheets, MongoDB, and course assets. Verify two API instances share
the lock collection, permissions allow majority-acknowledged insert/delete, and
success/validation release works. Exercise a paused save concurrent with publish,
withdrawal during content reads, webhook overlap, disconnects, failed writes, and
verified owner-scoped recovery. Confirm there is no TTL policy on this collection.
These live checks remain pending; in-memory/fake-collection regressions are not
evidence of hosted durability or provider timeout behavior.
