# Work queue

Updated: 2026-10-19. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

**US-P017 back up and restore MongoDB.** Base `16ec47d`, branch `main`. Decisions in
[the story](user_stories.md).

| Owner | Scope | Files | State |
| --- | --- | --- | --- |
| Codex | Backup and restore commands, tests | `api/**`; [handoff](handoffs/US-P017-codex.md) | API review fix done 2026-10-19; branch `main`, base `729a510`, fix `6e6470e` (initial delivery `93c841f`); US-P017-AC02 now inserts all collections, verifies all counts, then creates manifest indexes. Immediate-expiry TTL double reproduced failure before fix and passes afterwards; 58 targeted tests passed; full `npm run api:test` 71 files / 1,658 tests passed; `npm run api:build` passed. Success messages unchanged. No shared services or push. Next: Claude review; Alex real backup/scratch restore rehearsal |
| Claude Code | Runbook, storage spec, review | `docs/**` | In progress |

Next: Codex fixes the review finding (returned 2026-10-19: create indexes only after the final
count check, so expiry indexes cannot delete restored documents first); then Alex runs the first
real backup and a scratch restore.

Previously: pushed to `main` on 2026-10-19: US-L014 email confirmation (`aa93792` API,
Codex; `9cd3cbf` app). Checks on `de90ee6`: `api:test` 1,600/1,600, `app:test` 392/392,
`verify:journeys` 16/16, `app:build:pages` pass; browser-checked on the isolated servers (signup,
Home notice, link from the mail, notice gone after reload).

## Waiting on Alex

| Item | What Alex does | How to tell it is done |
| --- | --- | --- |
| Hosted careers to milestone format | Admin page → **Career paths**: open each of the three careers (Technical Tester, Test Manager, AI Testing Specialist), click **Convert to milestone format**, check stages and actions, publish | Career Path shows Locked/Ready states instead of "Recommended later" |
| US-A004-AC04 curriculum review | Review the [candidate course map](stories/US-A004-curriculum-review.md) | Every course mapped or deferred with a reason |
| Decisions | US-P003 (cross-instance writes), US-P001 (browser test runner), US-L001 (preview, archive access, payment) | Decision recorded in the story |

## Next candidate

A backup and restore rehearsal for MongoDB, now the only live copy of accounts and courses, was
suggested on 2026-10-18 but is not yet a story.

## Open release checks

Delivered work whose real-environment check has not been done. Tick off here when checked.

- Email confirmation (US-L014) on the hosted site: sign up with a real address, receive the Brevo mail, open the link on a phone, Home notice gone. Notice at phone width not checked.
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
