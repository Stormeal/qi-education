# Work queue

Updated: 2026-10-27. Working branch: `main`. Where to resume: active work first, then what waits on
Alex, then the next candidate. Finished records are not kept here: Git history and the commit
messages hold them.

## Active work

**US-P020 and US-P019 API implementation** (started 2026-10-29, owner Codex).
Branch `main`, base `a5afe5f`. Codex owns `api/src/**`, API specs/tests and handoff;
Claude owns the frontend in both contracts. Version files are shared and bumped at commit.
Contracts: [US-P020](stories/US-P020-signup-hardening.md),
[US-P019](stories/US-P019-header-notifications-settings.md); execute US-P020 Tasks 1–4,
then US-P019 A1–A6. Next: implement and verify the injected Turnstile verifier in isolated tests.
Defaults retained: no Turnstile keys means signup stays open; grandfathered accounts pass;
notification list capped at 50 without deletion. No shared-service mutation probes or push.

Delivered locally 2026-10-27, not pushed: **US-T016 teacher overview** ("Your teaching" on a teacher's Home).
Claude: Home card (`ba074e1`); Codex: `GET /teaching/courses` (`b0aa9e9`, record
[history/handoffs/US-T016-codex.md](history/handoffs/US-T016-codex.md)). Check routine by Claude: Codex kept
to its files and the contract; its one shared change, an optional 403 for disabled accounts in
`authenticateRequest`, defaults to 401 so other routes are unchanged. Checks: API 2,852/2,852, app
572/572, journeys 20/20, Pages build (run one at a time; run side by side, both suites time out).
Browser on isolated servers: a teacher's published course with one enrolled learner shows "1 enrolled,
1 started, 0 completed", "Average progress 50%", "1 helpful, 1 not helpful, 1 problem" and the three
items with lesson titles and no learner identity; student and admin get 403. Behavior in
[specs/learning/home-and-library.md](specs/learning/home-and-library.md). Not verified: live MongoDB.

US-L027 (certificate) and US-L028 (ratings) added as Proposed the same day; not started.

Pushed 2026-10-26 as 0.1.503 (Vercel ready, Pages and CI green; hosted `/api/reviews/mine` and `/api/courses/:id/reviewers` answer 401 without sign-in): **US-A007 course reviewers** (release 1 Must). Codex Tasks 1–5
(API, `67b563b`…`2286b01`, record [history/handoffs/US-A007-codex.md](history/handoffs/US-A007-codex.md)),
Claude Tasks 6–9 (app, `1c74a15`…`9fa42e6`). Check routine by Claude: Codex kept to its files and the
contract, except that it shows `reviewerIds` to admins only; the app now knows a reviewing teacher from
`GET /reviews/mine` (`257a0cb`), and Home shows the course state instead of a stale "waiting" verdict once
a course left review. Checks: API 2,836/2,836, app 568/568, journeys 20/20, Pages build. Browser on
isolated servers: admin assigns a reviewer, publish refused with "Waiting for 1 of 1 reviewers"
(API 409), reviewer sees "To review" on Home, opens the course read-only (no Save, Submit or Publish),
approves with a comment, Home shows "Approved", admin's Publish is enabled and the history shows the
verdict; no console errors. The browser check found the reviewer's form empty ("Untitled course"),
fixed in `9fa42e6`. Not verified: a real Brevo email and MongoDB storage (see Open release checks).

Pushed 2026-10-26 as 0.1.482 (live, Vercel and Pages green): X9 API security headers, X10
accessibility pass and its follow-up, the US-P018-AC04 follow-up (compressed bodies refused, Zod
4.6.7, builder list limits) and US-A006 feedback with its storage cutover. Records:
[history/handoffs](history/handoffs/) (X9, US-P018-AC04 follow-up); rules in the area specs. Checked
live: security headers and no-store on `/api/health`, a gzip request answers 415, feedback storage
`mongodb`. Feedback cutover done by Claude with Alex on 2026-10-26: Alex froze writers in Vercel
(`FEEDBACK_STORE_READ_ONLY=1`), push, hosted config showed `readOnly: true`; dry run source=24,
pending=24 with no malformed or duplicate rows; apply imported=24, pending=0, verified=true; a
second dry run identical=24, pending=0; Alex removed the freeze and redeployed, hosted config
`readOnly: false`; MongoDB holds 24 feedback documents and 2 indexes. Operator note: on Alex's
network (VPN DNS 10.2.0.1) Node's SRV lookup for Atlas times out; the run used a one-off preload
that asks Windows (`Resolve-DnsName`) for the SRV/TXT records. In the first full API run before the
push, `clientLimitRoutes.test.ts` "AC06 ... after twenty requests" failed once and passed alone
three times and in a full rerun (load timing).

**Codex X8** (started 2026-10-24, owner Codex): read-only performance and security audit of api/ and
app/; writes `docs/audits/2026-10-performance-security.md` and new DEF rows only. Prompt in
[handoffs/codex-extra-assignments.md](handoffs/codex-extra-assignments.md#x8-performance-and-security-audit-read-only).
State: done on `main` (base `6de6283`); report `docs/audits/2026-10-performance-security.md`: **2 P1, 5 P2, 2 P3** findings, including five reproduced defects DEF-059–DEF-063. API 2,568 passed + 2 expected failures / 101 files; API build and Pages build pass. Read-only audit; no push/deploy. Hosted/provider/index-plan/browser/Linux checks remain unverified.
X8 committed by Claude on Alex's instruction (Codex did not run the commit step); DEF-061 and DEF-063 fixed in `a65bfa0`; DEF-059, DEF-060 and DEF-062 fixed by Claude (see their rows). The growth risks F6 to F9 and the rest of DEF-063 were acted on the same day; results in the report's Follow-up section. During the full API run `signInLimit.test.ts` "DEF-034 / 11 bounds abandoned pending capacity" failed once under load and passed on its own twice and in a full rerun; not touched.

Delivered 2026-10-24, pushed (live from 0.1.464 at the latest): US-A004-AC06 (Claude, `5b040de` and the editor refresh after
publish; defaults confirmed by Alex) and US-P018-AC04 (Codex, `0baf101`/`6f22350`, checked by Claude:
own files only, contract kept). Checks: API 2,568 passed + 2 expected failures, app 505, journeys 18,
Pages build. Browser on isolated servers: changing Foundation's requirement is refused without a
note, publishes as version 2 with one, the learner keeps the recorded exam, sees the note and "met
the earlier requirements", and achieves it again after the new action. Production audit 3 high →
2 high (Zod and body-parser accepted, see Waiting on Alex). Codex record
[history/handoffs/US-P018-AC04-codex.md](history/handoffs/US-P018-AC04-codex.md).

Delivered 2026-10-24, pushed (live from 0.1.464 at the latest): US-O001 release 1 (organizations; Codex A1–A7 API, Claude B1–B5
app). Browser on isolated servers: all of AC01–AC12 passed; on 2026-10-24 AC06 (used link refused
without member details), AC07 (promote shows Owner, remove closes the course), AC09 (Technical
Tester career opens a 499 DKK course: "Enroll (included by Bugfinders)", learned free) and AC12
(suspend refuses invites and closes the course, Reactivate restores both). Fixed while checking:
the course request form is now disabled while suspended (the API already refused it). Behavior in
[specs/organizations/organizations.md](specs/organizations/organizations.md); Codex record
[history/handoffs/US-O001-codex.md](history/handoffs/US-O001-codex.md).

Also 2026-10-24 (Alex's requests): the learning-page sidebar is at most one screen less 144px,
so it fits the window when the page opens; Release 1 roadmap items show a status (Live, Built not
live yet, In progress, Not started) with a count. Update those statuses in `roadmap-page.ts` as
items ship.

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
| US-T016 defaults (built 2026-10-27) | Confirm or change: learners as counts not names, teachers only, every course status listed, newest five feedback items, placement under "To review" | Say so to Claude |
| Defect pass decisions (built as defaults) | Confirm or change: course saves up to 4 MB (DEF-051); prices 0 = free, otherwise 3–999,999 DKK | Say so to Claude |
| Dependency follow-ups (X7 report) | Decide what to schedule from [audits/2026-10-dependencies.md](audits/2026-10-dependencies.md): app audit has 3 critical and 21 high entries, mostly build and dev tooling (Angular CLI/build, `tar`, `piscina`), the critical ones fixed by Angular 22 or patch releases; root `concurrently`/`shell-quote` (critical, dev only); API Zod 4.6 (reverted, 163 test failures), Express 5.3 and the SOCKS/`ip-address` family (reverted) | A story or defect per item you want done |
| Decisions | US-P003 (accept the account concurrency evidence; feedback durable triage live with US-A006 since 0.1.482), US-P001 (browser test runner); confirm the US-L001 and US-P005 defaults (recorded in `specs/catalog/course-details-and-enrollment.md` and `specs/platform/reliability.md`) | Decision recorded in the story or spec |

## Next candidate

Release 1 (internal, mid-December 2026) comes first; see Releases in
[user_stories.md](user_stories.md). Ready to start without waiting on anyone: the live-site checks below. US-P018-AC01–AC03 wait on the hosting budget and Alex. Requests from the department interviews are added
as they arrive.

## Open release checks

- US-A007 course reviewers, after the next push: as admin assign a second real account as reviewer
  on a submitted course; it receives the email (link opens the course), Publish stays disabled until
  it approves, then publishes.
- US-A006 feedback, live since 0.1.482 (copy verified 2026-10-26): still open, as admin open the
  feedback inbox on the live site (24 old items, type filters), send one feedback of each type,
  and mark one for follow-up to check a real GitHub issue is created once.
- Since 0.1.482: the next real Stripe test payment and Mux video upload still reach their webhooks
  (we assume neither sends compressed bodies; a 415 in `npx vercel logs` would mean otherwise).

Delivered work whose real-environment check has not been done. Tick off here when checked.

- Organizations (US-O001 release 1) on the hosted site: Alex runs AC01–AC12 from [the spec](specs/organizations/organizations.md) with a second real email address.
- Pushed 2026-10-25 as 0.1.464: upload a real video and check the lesson minutes change to the video length and the moving bar shows while processing; open the all-careers map (Expand) on a wide screen and a phone; sign in and open an organization page against hosted MongoDB (new orgId indexes are created on first use).
- Career cards, carousel and Start over on the hosted site: compare careers on a wide screen and a phone; Start over with a learner who has achievements (they must stay).
- Exercise intro video on the hosted site: upload a real video to an exercise, watch it to the end as a learner. Since 0.1.482 the exercise minutes must also change to the video length.
- Paid courses (US-L024) on the hosted site: test-card purchase and enrollment checked by Alex on 2026-10-20; a full refund (US-L025) delivered `charge.refunded` with 200 and removed the course, checked by Alex on 2026-10-22. Still open: **Payment and receipts** → **Manage saved card** opens the Stripe portal.
- Course locks (US-P005) on the hosted site: Admin → **Course locks** reads the MongoDB `_locks` collection (empty list expected); a listed lock row against real data not seen yet.
- Price note (US-L001) on the hosted site: a priced published course shows "Price for information only. Enrolling is free."
- Email confirmation (US-L014) on the hosted site: sign up with a real address, receive the Brevo mail, open the link on a phone, Home notice gone. Notice at phone width not checked.
- Mux: real upload, webhook delivery and playback in the editor checked 2026-10-22 with the 88 imported ISTQB videos. Playback in the learner view checked as admin 2026-10-22 (no spinner). Still open: playback with a real learner account; INV-019.
- Career paths: hosted MongoDB data, admin editor at phone width, trees wider than five stages.
- Browser thumbnail cache hit on the hosted site (DEF-021).
- Profiles and instructor descriptions on two devices against hosted MongoDB.
- Screen reader pass: accessibility-tree pass done locally 2026-10-25 (X10); still open: one real screen reader (NVDA or VoiceOver) over the learning page, career tree, course editor and dialogs.
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
