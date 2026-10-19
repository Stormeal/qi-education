# Work queue

Updated: 2026-10-19. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

**US-P016 retire the Sheets code for accounts and courses.** Base `d1cdcb9`, branch `main`.
Decisions in [the story](user_stories.md). Not pushed: `947f7a5` (CI spec fix) and later commits.

| Owner | Scope | Files | State |
| --- | --- | --- | --- |
| Codex | API: Sheets account/course repositories, store switches, migration code, API tests | `api/**` except the three tests below; [handoff](handoffs/US-P016-codex.md) | Assigned 2026-10-19 |
| Claude Code | Doctor, DEF-012 correction script, Pages gate, docs | `scripts/doctor.mjs`, `scripts/correct-def-012-categories.mjs`, `.github/workflows/pages.yml`, `api/src/localScripts.test.ts`, `api/src/categoryCorrection.test.ts`, `api/src/pagesWorkflow.test.ts`, `docs/**`, `CLAUDE.md`, `AGENTS.md` | In progress |

Next: Claude finishes its part, then runs the check routine on Codex's commit.

## Waiting on Alex

| Item | What Alex does | How to tell it is done |
| --- | --- | --- |
| Hosted careers to milestone format | Admin page → **Career paths**: open each of the three careers (Technical Tester, Test Manager, AI Testing Specialist), click **Convert to milestone format**, check stages and actions, publish | Career Path shows Locked/Ready states instead of "Recommended later" |
| US-A004-AC04 curriculum review | Review the [candidate course map](stories/US-A004-curriculum-review.md) | Every course mapped or deferred with a reason |
| Decisions | US-P003 (cross-instance writes), US-P001 (browser test runner), US-P008 (limits), US-L001 (preview, archive access, payment) | Decision recorded in the story |

## Next candidate

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
