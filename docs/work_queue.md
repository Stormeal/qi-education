# Work queue

Updated: 2026-10-18. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

**US-L023 CV recognition** (started 2026-10-18). Branch `main`, base `1f43ded`.
Contract and plan: [stories/US-L023-cv-recognition.md](stories/US-L023-cv-recognition.md), scenarios AC01–AC08.

| Owner | Scope | Files | State |
| --- | --- | --- | --- |
| Codex | Tasks C1–C4: `cvKeywords`, state rule, `POST /users/me/achievements/cv`, journey step | `api/src/**`; handoff [handoffs/US-L023-codex.md](handoffs/US-L023-codex.md) | Not started |
| Claude | Tasks A1–A6: models, matcher, CV reading, scan panel, editor field, checks | `app/**`, US-L023 contract, `docs/specs/career-paths/` | In progress |

Next action: Codex runs C1–C4; Claude runs A1–A5, then A6 once Codex has committed.

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

## Handoff record

When an item starts, put one record under Active work with:

- Item and linked defect IDs; owner per part (Claude Code / Codex) with scope and files owned.
- Branch and the base commit taken from Git, not from earlier chats.
- Contract path and scenario IDs in scope.
- Completed work and checks with date and environment; what is not verified.
- Remaining work, open decision or blocker, and the concrete next action.
- Delivery commit once available.

When the item is delivered, delete its record: the commit and the area spec carry the result.
