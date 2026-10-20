# Work queue

Updated: 2026-10-19. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

US-L024 paid courses for individuals. Started 2026-10-20 on `main` from `bd64928`. Contract:
[stories/US-L024](stories/US-L024-paid-courses.md); plan:
[superpowers/plans/2026-10-20-US-L024-paid-courses.md](superpowers/plans/2026-10-20-US-L024-paid-courses.md).

| Owner | Scope | Files | State |
| --- | --- | --- | --- |
| Codex | Plan Tasks 1–4: payments store, Stripe service + fake, routes, 402 guard, journey, doctor | `api/**`, `scripts/doctor.mjs`, `package-lock.json`; handoff [handoffs/US-L024-paid-courses-codex.md](handoffs/US-L024-paid-courses-codex.md) | API implementation committed `9e74a7d`, `95b255b`, `6af4729`, `2e17a32`, `34d83b0`, `369b5a9` on `main` from `3102208`; 2026-10-20 payment tests 39/39, journeys 16/16, doctor/build pass. Full API: 1722/1725 pass with four workers; 3 exact health assertions need owner updates in `server.test.ts` and `isolatedServices.test.ts` (outside assigned scope). Independent review: invoice opt-in/pricing and overlapping first-purchase customer identity need design decisions before portal receipts are release-ready. Next: Claude/Alex integration and decisions; full Result in handoff. No push. |
| Claude | Plan Tasks 5–7: purchase flow, course page, profile receipts, check routine, docs | `app/**`, `docs/**` except Codex's row | In progress |

Not verified: hosted Stripe test-card purchase (after push, Alex). Pushed state before this item:
`cc9fb6b`.

## Waiting on Alex

| Item | What Alex does | How to tell it is done |
| --- | --- | --- |
| Hosted careers to milestone format | Admin page → **Career paths**: open each of the three careers (Technical Tester, Test Manager, AI Testing Specialist), click **Convert to milestone format**, check stages and actions, publish | Career Path shows Locked/Ready states instead of "Recommended later" |
| US-A004-AC04 curriculum review | Review the [candidate course map](stories/US-A004-curriculum-review.md) | Every course mapped or deferred with a reason |
| Decisions | US-P003 (cross-instance writes), US-P001 (browser test runner); confirm the US-L001 and US-P005 defaults (recorded in `specs/catalog/course-details-and-enrollment.md` and `specs/platform/reliability.md`) | Decision recorded in the story or spec |

## Next candidate

Every open story waits on a decision by Alex (US-A004 curriculum, US-P001 browser runner,
US-P003 multi-instance writes). Ask which one, with defaults.

## Open release checks

Delivered work whose real-environment check has not been done. Tick off here when checked.

- Course locks (US-P005) on the hosted site: Admin → **Course locks** reads the MongoDB `_locks` collection (empty list expected); a listed lock row against real data not seen yet.
- Price note (US-L001) on the hosted site: a priced published course shows "Price for information only. Enrolling is free."
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
