# Work queue

Updated: 2026-10-20. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

None. US-L024 paid courses pushed to `main` on 2026-10-20 (`af434c4`, with Codex X1 and X2): API by Codex
(`9e74a7d`…`369b5a9`, record in [history/handoffs](history/handoffs/US-L024-paid-courses-codex.md)),
app by Claude (`5f87e59` and the integration commit). Behavior: [specs/payments](specs/payments/payments.md).
Checks 2026-10-20: `api:test` 1,725/1,725, `app:test` 417/417, `verify:journeys` 16/16,
`app:build:pages` and `api:build` pass; browser check on the isolated servers (fake Stripe): buy,
return with "Payment received", Start learning, receipts button, phone width.

## Waiting on Alex

| Item | What Alex does | How to tell it is done |
| --- | --- | --- |
| Hosted careers to milestone format | Admin page → **Career paths**: open each of the three careers (Technical Tester, Test Manager, AI Testing Specialist), click **Convert to milestone format**, check stages and actions, publish | Career Path shows Locked/Ready states instead of "Recommended later" |
| US-A004-AC04 curriculum review | Review the [candidate course map](stories/US-A004-curriculum-review.md) | Every course mapped or deferred with a reason |
| Go-live for payments (later) | Stripe live mode: business verification, live secret key and a live webhook destination into Vercel, and **Settings → Customer emails → Successful payments** on | A real purchase sends a receipt email |
| Extra Codex work | Paste assignments X1…X7 from [handoffs/codex-extra-assignments.md](handoffs/codex-extra-assignments.md) one at a time | Each ends with a Codex summary and a commit starting with its ID |
| Decisions | US-P003 (cross-instance writes), US-P001 (browser test runner); confirm the US-L001 and US-P005 defaults (recorded in `specs/catalog/course-details-and-enrollment.md` and `specs/platform/reliability.md`) | Decision recorded in the story or spec |

## Next candidate

US-O001 organizations (release 2): decided with Alex, needs its design pass (brainstorm → spec →
plan). Codex assignment X5 drafts the API side first. Other open stories wait on a decision by
Alex (US-A004 curriculum, US-P001 browser runner, US-P003 multi-instance writes).

## Open release checks

Delivered work whose real-environment check has not been done. Tick off here when checked.

- Paid courses (US-L024) on the hosted site, after the push: buy a priced course with test card `4242 4242 4242 4242`, see it in My Learning, open **Payment and receipts**, and check that the Stripe destination `qi-academy-vercel` shows a delivered event.
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
