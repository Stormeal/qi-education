# Work queue

Updated: 2026-10-19. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

**US-L014 email confirmation at signup.** Base `5e5a65a`, branch `main`. Decisions in
[the story](user_stories.md).

| Owner | Scope | Files | State |
| --- | --- | --- | --- |
| Codex | API: flag, tokens, mail, confirm/resend routes, limits, API tests | `api/**`; [handoff](handoffs/US-L014-codex.md) | API done 2026-10-19; delivery `aa93792`, branch `main`, base `9cd3cbf` (includes `239645e`); US-L014-AC01/AC02/AC03. Optional account flag/boolean DTOs, signup mail, confirm/resend contracts, 24-hour hash-only single-use tokens, three mails/account/rolling hour, confirmation network limit and freeze protection. Reuses token CAS; reset regression checks pass. Checks: `npm run api:test` 1,600/1,600; `npm run api:build` pass; `npm run verify:journeys` 16/16; 46 new confirmation tests, including parallel Mongo doubles. Isolated stores only; no live services or push. Next: Claude browser check and story/spec closeout. |
| Claude Code | App: `/confirm-email` page, Home notice and resend, model and auth service, specs, docs | `app/**`, `docs/**` | In progress |

Next: both parts in parallel; Claude browser-checks once Codex has committed.

Previously: pushed to `main` on 2026-10-19: US-P008 per-client limits (`b227896` API,
`9e3d8bd` app specs). Checks on `73f1cf8`: `api:test` 1,554/1,554, `app:test` 383/383,
`verify:journeys` 16/16, `app:build:pages` pass; browser-checked on the isolated servers.

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
