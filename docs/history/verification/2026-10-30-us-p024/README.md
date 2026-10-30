# US-P024 — Notification background loading

Codex, 2026-10-30, `main`, base `2a36250`. Alex requested this after observing slow bell opening
during the real review-notification walkthrough. No API/storage changes, poller or shared mutation
probes. Production remains 0.1.542 until a further authorized release.
Delivery commit: `3fcd215` (0.1.544); the subsequent closure changes only records/version metadata.

## Change and behavior

Before: the bell always called `list(true)`, invalidating cache and pending loads and showing a
loading placeholder before every fresh response. Login/session restoration only hydrated the count.

Now: successful login/signup and validated restoration launch a failure-contained preload without
awaiting it. Bell opening displays cached rows or cached emptiness immediately and refreshes in the
background. It shares an existing preload, preserves local read state, and clears private cache
on logout/account changes. Read completion supersedes older list responses. Count requests,
including auth hydration, are sequenced so a delayed response cannot resurrect a cleared badge.

## Acceptance evidence

| Scenario | Regression coverage |
| --- | --- |
| AC01 — nonblocking preload | Notification service spec: login with delayed list, unchanged restored session, signup with unresolved list |
| AC02 — immediate cached display | Bell DOM: old notices visible while newer activity loads; cached empty inbox; rows retained after single/all read actions |
| AC03 — shared pending load | Bell DOM: opening during unfinished preload causes one notification GET and displays its result |
| AC04 — preload failure/retry | Service: failed preload leaves login/count intact, later list succeeds; existing bell Retry test remains green |
| AC05 — account/write/count races | Service and bell: late prior-account replies, delayed read POST with intervening refresh, old background list after Mark all read, initial list not yet available, close/reopen during POST, pre-read auth count and out-of-order count replies |

Initial four regressions failed before implementation (login/restore preload, cached display and
pending-request sharing). Subsequent regressions reproduced loss of read-cache rows and an older
list clearing them. Review identified two more write/list orderings; both and the delayed auth-count
case were reproduced as three failing tests and fixed. The final full app run passed
**637/637** across 79 files, including **27 notification service/bell tests**. UI-foundation tests
and style guard passed. Pages production build passed. Existing setup/scrollTo and CommonJS
warnings remain non-blocking. Backend code is unchanged; its release suite was not repeated.

## Isolated browser

Used a fresh Pages build displaying 0.1.543, a local UI on 4213, and an API on 3013 forced to
test/isolated mode. Seeded one notice for the built-in teacher in memory. The fixture delayed
every notification GET by **two seconds** and exposed only request/completion counters.

1. Before login: notification request count 0.
2. Signed in with the local demo teacher. Home rendered; before touching the bell the server
   had already received and completed exactly one list request.
3. Opened the bell: the seeded notice appeared in the immediate snapshot, with no loading
   placeholder. The open-plus-observation tool call completed in about 0.47 seconds, within
   the deliberately delayed fresh response. Counter then confirmed a second GET for refresh.
4. Marked all read in isolated memory: unread indicator disappeared, the row remained and
   Mark all read became disabled. Closing/reopening retained the row without the loading
   placeholder (about 0.62-second open-plus-observation call during another delayed refresh).
5. Reloaded Home: the restored session started another list request before opening the bell,
   bringing the counter to four. Read state stayed clear.

These timings include tool observation overhead and are not a production latency benchmark.
No hosted account preferences, notifications or course state were mutated by the agent.

## Remaining hosted verification

After an authorized release, verify preload after real sign-in and restoration, immediate cached
display, and fresh event arrival on open. The existing Test Course review walkthrough can continue
with user-performed admin Return, resubmit/publish and preference checks. Organization event
coverage, metadata indexes and genuine cross-device preference checks remain separate release work.
