# Work queue

Updated: 2026-10-18. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

**US-L007 + US-P002 (API part)** (started 2026-10-18). Branch `main`, base `e75e14d`. Decisions are
recorded in the stories in [user_stories.md](user_stories.md).

| Owner | Scope | Files | State |
| --- | --- | --- | --- |
| Codex | US-P002-AC02 API part: 503 `STORE_UNAVAILABLE` / `READ_ONLY` codes | `api/src/server.ts` error middleware, its tests; handoff [handoffs/US-P002-codex.md](handoffs/US-P002-codex.md) | Not started |
| Claude | US-L007-AC01/AC02: recommended course first with a corner ribbon on Home | `app/src/app/pages/dashboard-page/`, `docs/specs/learning/home-and-library.md`, `docs/user_stories.md` | Delivered locally (this commit): spec 3/3, `app:test` 378/378, browser-checked at desktop and phone width (one-course catalog; order covered by the spec). GitHub #45 can be closed. |

Next action: both parts run in parallel; Claude reviews Codex's commit with the check routine.

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
