# Work queue

Updated: 2026-10-22. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

None. Delivered 2026-10-22 and closed: US-T015 (Rise SCORM import; the ISTQB Foundation
repetition course was imported to the hosted site as course `2127cfd3-d3ad-44b0-8946-9fff1d51a591`)
and US-A005 (admins assign course teachers, built with Codex; record in
[history/handoffs](history/handoffs/US-A005-codex.md)). Behavior in
[specs/authoring/course-editor.md](specs/authoring/course-editor.md),
[specs/authoring/quizzes.md](specs/authoring/quizzes.md) and [business_rules.md](business_rules.md).

## Waiting on Alex

| Item | What Alex does | How to tell it is done |
| --- | --- | --- |
| ISTQB Foundation repetition course | Upload compressed Kapitel 4 and Kapitel 5 (over 4 MB, skipped by the import) in the editor, then submit and publish | The course is in the catalog with all 8 PDFs |
| Hosted careers to milestone format | Admin page → **Career paths**: open each of the three careers (Technical Tester, Test Manager, AI Testing Specialist), click **Convert to milestone format**, check stages and actions, publish | Career Path shows Locked/Ready states instead of "Recommended later" |
| US-A004-AC04 curriculum review | Review the [candidate course map](stories/US-A004-curriculum-review.md) | Every course mapped or deferred with a reason |
| Go-live for payments (later) | Stripe live mode: business verification, live secret key and a live webhook destination into Vercel, and **Settings → Customer emails → Successful payments** on | A real purchase sends a receipt email |
| Defect pass decisions (built as defaults) | Confirm or change: course saves up to 4 MB (DEF-051); prices 0 = free, otherwise 3–999,999 DKK | Say so to Claude |
| Extra Codex work | Paste assignments X6–X7 (X1–X5 done) from [handoffs/codex-extra-assignments.md](handoffs/codex-extra-assignments.md) one at a time | Each ends with a Codex summary and a commit starting with its ID |
| Decisions | US-P003 (cross-instance writes), US-P001 (browser test runner); confirm the US-L001 and US-P005 defaults (recorded in `specs/catalog/course-details-and-enrollment.md` and `specs/platform/reliability.md`) | Decision recorded in the story or spec |

## Next candidate

US-O001 organizations (release 2): decided with Alex, needs its design pass (brainstorm → spec →
plan). Codex assignment X5 drafts the API side first. Other open stories wait on a decision by
Alex (US-A004 curriculum, US-P001 browser runner, US-P003 multi-instance writes).

## Open release checks

Delivered work whose real-environment check has not been done. Tick off here when checked.

- Career cards, carousel and Start over on the hosted site: compare careers on a wide screen and a phone; Start over with a learner who has achievements (they must stay).
- Exercise intro video on the hosted site: upload a real video to an exercise, watch it to the end as a learner.
- Paid courses (US-L024) on the hosted site: test-card purchase and enrollment checked by Alex on 2026-10-20; a full refund (US-L025) delivered `charge.refunded` with 200 and removed the course, checked by Alex on 2026-10-22. Still open: **Payment and receipts** → **Manage saved card** opens the Stripe portal.
- Course locks (US-P005) on the hosted site: Admin → **Course locks** reads the MongoDB `_locks` collection (empty list expected); a listed lock row against real data not seen yet.
- Price note (US-L001) on the hosted site: a priced published course shows "Price for information only. Enrolling is free."
- Email confirmation (US-L014) on the hosted site: sign up with a real address, receive the Brevo mail, open the link on a phone, Home notice gone. Notice at phone width not checked.
- Mux: real upload, webhook delivery and playback in the editor checked 2026-10-22 with the 88 imported ISTQB videos. Still open: playback as a learner once the course is published; INV-019.
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
