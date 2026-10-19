# Work queue

Updated: 2026-10-19. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

None. Delivered locally on 2026-10-19, not pushed: US-P017 MongoDB backup and restore (`93c841f`
and `6e6470e` commands, Codex; runbook `d90b650`/`729a510`). Checks on `29df0c2`: `api:test`
1,658/1,658, `app:test` 392/392, `verify:journeys` 16/16, `app:build:pages` and `api:build` pass.

## Waiting on Alex

| Item | What Alex does | How to tell it is done |
| --- | --- | --- |
| Hosted careers to milestone format | Admin page → **Career paths**: open each of the three careers (Technical Tester, Test Manager, AI Testing Specialist), click **Convert to milestone format**, check stages and actions, publish | Career Path shows Locked/Ready states instead of "Recommended later" |
| US-A004-AC04 curriculum review | Review the [candidate course map](stories/US-A004-curriculum-review.md) | Every course mapped or deferred with a reason |
| First MongoDB backup and test restore (US-P017) | Follow [MongoDB backup and restore](release/mongodb-backup.md): "Before the first run", "Take a backup", then "Rehearse a restore". Also confirm or change the defaults: backups outside the repo, restore only into an empty database, schedule before data-changing releases and monthly | Both final lines ("Backup complete…", "Restore verified…") pasted to Claude with the same numbers |
| Decisions | US-P003 (cross-instance writes), US-P001 (browser test runner), US-L001 (preview, archive access, payment) | Decision recorded in the story |

## Next candidate

Every open story waits on a decision by Alex (US-A004 curriculum, US-L001 access rules, US-P001
browser runner, US-P003 multi-instance writes, US-P005 operator tooling). Ask which one, with
defaults.

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
