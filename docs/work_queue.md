# Work queue

Updated: 2026-10-18. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

None. Delivered locally on `main` on 2026-10-18, not pushed: US-L007 (`2b03e15`) and the API part of
US-P002 (`2848ad5`). Check routine on `2848ad5`: `api:test` 1,727/1,727, `app:test` 378/378,
`verify:journeys` 16/16, `app:build:pages` ok. Open: US-P002-AC02 UI half; raw MongoDB outages are
no longer logged (follow-up for Codex).

| Owner | Scope | Files | State |
| --- | --- | --- | --- |
| Codex | US-P002 review follow-up: log MongoDB connection failures once before the unchanged 503 | `api/src/server.ts` connection-error branch, `api/src/dependencyErrors.test.ts` | Delivered locally in this row's commit, `fix(US-P002): log storage outages before returning 503`, on `main`, base `2b9d257` (2026-10-18). Both route-prefix tests first failed with zero log calls, then passed with exactly one `console.error('Storage unavailable', error)` and the same response body. `npm run api:test`: 1,729/1,729 (68 files), isolated stores only; no push. Supersedes the missing-log note above. Lead follow-up: remove stale logging limitation from the queue introduction and reliability spec (outside Codex scope). |

## Waiting on Alex

| Item | What Alex does | How to tell it is done |
| --- | --- | --- |
| DEF-PAGES-MONGO hosted check | Open the latest "Deploy to GitHub Pages" run on GitHub Actions | The run is green, including the hosted auth check |
| Hosted careers to milestone format | Admin page → **Career paths**: open each of the three careers (Technical Tester, Test Manager, AI Testing Specialist), click **Convert to milestone format**, check stages and actions, publish | Career Path shows Locked/Ready states instead of "Recommended later" |
| US-A004-AC04 curriculum review | Review the [candidate course map](stories/US-A004-curriculum-review.md) | Every course mapped or deferred with a reason |
| Decisions | US-P003 (cross-instance writes), US-P001 (browser test runner), US-P008 (limits), US-L001 (preview, archive access, payment) | Decision recorded in the story |

## Next candidate

US-P016 (retire the Sheets code for accounts and courses) once one release has a clean hosted log.
A backup and restore rehearsal for MongoDB, now the only live copy of accounts and courses, was
suggested on 2026-10-18 but is not yet a story.

## Open release checks

Delivered work whose real-environment check has not been done. Tick off here when checked.

- Mux: real upload, webhook delivery, processing delay and public playback on the hosted site; INV-019.
- Career paths: hosted MongoDB data, admin editor at phone width, trees wider than five stages.
- Browser thumbnail cache hit on the hosted site (DEF-021).
- Profiles and instructor descriptions on two devices against hosted MongoDB.
- Screen reader pass over the learning page, career tree, course editor and dialogs (none done yet).
- The live [teacher rehearsal checklist](release/teacher-rehearsal-checklist.md).
- CV recognition (US-L023) on the hosted site: careers already published there have no CV keywords until an admin adds them in the career editor (or converts/publishes from the starter drafts, which carry ISTQB keywords); then scan a real PDF and .docx CV. Scan panel at phone width not checked.

## Handoff record

When an item starts, put one record under Active work with:

- Item and linked defect IDs; owner per part (Claude Code / Codex) with scope and files owned.
- Branch and the base commit taken from Git, not from earlier chats.
- Contract path and scenario IDs in scope.
- Completed work and checks with date and environment; what is not verified.
- Remaining work, open decision or blocker, and the concrete next action.
- Delivery commit once available.

When the item is delivered, delete its record: the commit and the area spec carry the result.
