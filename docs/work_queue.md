# Work queue

Updated: 2026-10-22. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

Started 2026-10-24, both on `main` in one working tree:

| Owner | Item | Scope and files | State |
| --- | --- | --- | --- |
| Codex | US-P018-AC04 | API production dependency findings (`zod`, `body-parser`, `ip-address`): `api/package.json`, `package-lock.json`, `docs/audits/2026-10-dependencies.md`; record [handoffs/US-P018-AC04-codex.md](handoffs/US-P018-AC04-codex.md) | Final verification on `main`, base `3953dfb`: ip-address fixed privately; Zod accepted (response-contract regression), body-parser accepted (transitive major/response constraints); audit 3 high → 2 high, 0 critical. Next: serial test reruns, local delivery commit. Not verified: hosted/proxy/provider integrations, Linux/browser; no protected source change needed. |
| Claude | US-A004-AC06 | Changed career criteria: requirement versions, "What changed" note, learner notice. `api/src/careerPath*.ts`, `accountCareers*.ts`, the career routes in `server.ts`, `app/**` career editor and career page; decisions in [stories/US-A004-curriculum-review.md](stories/US-A004-curriculum-review.md) | In progress |

US-O001 release 1 (organizations) built and checked locally 2026-10-23, not pushed. Codex A1–A7
(API) and Claude B1–B5 (app) committed; Claude checked Codex's diff (own files only, contract kept).
Checks: API 2,554 passed + 2 expected failures (one load-sensitive timeout in
`clientLimitRoutes.test.ts` AC05/AC06 passed on rerun, not touched by this work), app 490, journeys
18, both builds. Browser on isolated servers: AC01–AC05, AC08, AC10, AC11 passed (request, approve,
invite, wrong account, sign-up through an invitation with email confirmation, add-on request and
approval with price, free enroll in a 499 DKK course, My Learning, leave). Not browser-checked:
AC09 billed career (no published career locally; API tests cover it), AC12 suspend (API tests).
Leaving removes organization courses from My Learning; progress is kept (Alex, 2026-10-24,
recorded in the contract). Contract:
[stories/US-O001-release-1.md](stories/US-O001-release-1.md); Codex record
[handoffs/US-O001-codex.md](handoffs/US-O001-codex.md).

Delivered 2026-10-22: DEF-057 (dropdowns show their stored value; record in
`defects_resolved.md`) and Codex X6 (INV-004 reproduced as an expected failure in
`api/src/multiInstanceFeedback.test.ts`; options in [handoffs/INV-004-options.md](handoffs/INV-004-options.md)),
checked by Claude. Codex X7 (API patch and minor updates: Mux 14.1.1, MongoDB driver 7.7,
Node types, tsx, Vitest 4.1.12, Vite 8.3 with its Linux bundler binary, `proxy-addr`/`qs`; report in
[audits/2026-10-dependencies.md](audits/2026-10-dependencies.md)), checked by Claude: frontend
lockfile entries unchanged, all checks pass. Real MongoDB with driver 7.7 not exercised before push.

Done on the hosted site 2026-10-22: AI Testing Specialist and Test Manager converted to the
milestone format and published (Technical Tester already was); ISTQB Foundation repetition
published at 1,999 DKK, category Software Testing, Danish, with Kapitel 4 and Kapitel 5 (split
into del 1 and del 2 to stay under 4 MB). Learning-page sidebar scrolls on its own (spec updated).

Delivered 2026-10-22 and closed: US-T015 (Rise SCORM import; the ISTQB Foundation
repetition course was imported to the hosted site as course `2127cfd3-d3ad-44b0-8946-9fff1d51a591`)
and US-A005 (admins assign course teachers, built with Codex; record in
[history/handoffs](history/handoffs/US-A005-codex.md)). Behavior in
[specs/authoring/course-editor.md](specs/authoring/course-editor.md),
[specs/authoring/quizzes.md](specs/authoring/quizzes.md) and [business_rules.md](business_rules.md).

## Waiting on Alex

| Item | What Alex does | How to tell it is done |
| --- | --- | --- |
| Release 1 department interviews (week of 26 October) | Ask marketing, then IT, then sales, then the course department what they need and want for release 1 | Each request handed to Claude; Claude adds it to `user_stories.md` as Proposed with a release |
| Release 1 decisions for management | Hosting budget (about 450–700 DKK a month, needed by mid-November), curriculum owner, backup developer ([roadmap](https://claude.ai/artifact/M5vCXNJZqTWmxhFcWQLVCJ)) | Answers recorded under Releases in `user_stories.md` |
| US-A004-AC04 curriculum review (release 1, Must) | Review the [candidate course map](stories/US-A004-curriculum-review.md) | Every course mapped or deferred with a reason |
| Go-live for payments (release 2) | Stripe live mode: business verification, live secret key and a live webhook destination into Vercel, and **Settings → Customer emails → Successful payments** on | A real purchase sends a receipt email |
| Defect pass decisions (built as defaults) | Confirm or change: course saves up to 4 MB (DEF-051); prices 0 = free, otherwise 3–999,999 DKK | Say so to Claude |
| Dependency follow-ups (X7 report) | Decide what to schedule from [audits/2026-10-dependencies.md](audits/2026-10-dependencies.md): app audit has 3 critical and 21 high entries, mostly build and dev tooling (Angular CLI/build, `tar`, `piscina`), the critical ones fixed by Angular 22 or patch releases; root `concurrently`/`shell-quote` (critical, dev only); API Zod 4.6 (reverted, 163 test failures), Express 5.3 and the SOCKS/`ip-address` family (reverted) | A story or defect per item you want done |
| Decisions | US-P003 (cross-instance writes; for feedback triage pick an INV-004 option in [handoffs/INV-004-options.md](handoffs/INV-004-options.md), Codex recommends C with B's marker), US-P001 (browser test runner); confirm the US-L001 and US-P005 defaults (recorded in `specs/catalog/course-details-and-enrollment.md` and `specs/platform/reliability.md`) | Decision recorded in the story or spec |

## Next candidate

Release 1 (internal, mid-December 2026) comes first; see Releases in
[user_stories.md](user_stories.md). Ready to start without waiting on anyone: US-P018-AC04 (server
dependency findings, a good Codex item) and the live-site checks below. US-P018-AC01–AC03 wait on
the hosting budget and Alex. Requests from the department interviews are added as they arrive.
US-O001 organizations is in release 1 (except the owner overview, see the release split in its story): it needs its design pass now (brainstorm, spec, plan), starting from the X5 API draft in [handoffs/US-O001-api-draft.md](handoffs/US-O001-api-draft.md). It is the largest release 1 item.

## Open release checks

Delivered work whose real-environment check has not been done. Tick off here when checked.

- Career cards, carousel and Start over on the hosted site: compare careers on a wide screen and a phone; Start over with a learner who has achievements (they must stay).
- Exercise intro video on the hosted site: upload a real video to an exercise, watch it to the end as a learner.
- Paid courses (US-L024) on the hosted site: test-card purchase and enrollment checked by Alex on 2026-10-20; a full refund (US-L025) delivered `charge.refunded` with 200 and removed the course, checked by Alex on 2026-10-22. Still open: **Payment and receipts** → **Manage saved card** opens the Stripe portal.
- Course locks (US-P005) on the hosted site: Admin → **Course locks** reads the MongoDB `_locks` collection (empty list expected); a listed lock row against real data not seen yet.
- Price note (US-L001) on the hosted site: a priced published course shows "Price for information only. Enrolling is free."
- Email confirmation (US-L014) on the hosted site: sign up with a real address, receive the Brevo mail, open the link on a phone, Home notice gone. Notice at phone width not checked.
- Mux: real upload, webhook delivery and playback in the editor checked 2026-10-22 with the 88 imported ISTQB videos. Playback in the learner view checked as admin 2026-10-22 (no spinner). Still open: playback with a real learner account; INV-019.
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
