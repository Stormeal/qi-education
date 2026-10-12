# Work queue

Updated: 2026-10-12. Working branch: `main`. Original audited base: `6e19213`.

## Active work

**Session 2026-10-12 — started by the user with "let's start working".** Branch: `main`.
Base: `03e39dd` (local, 0.1.157; two commits not pushed). No confirmed defect is open. Picked
by the lead: the leftover of the last increment (five questions still asked in the browser's
dialog). It is too small to split, so Codex takes an independent API item. Chosen by Alex for
Codex: US-P008-AC02, with the limit decided (10 wrong passwords per account in 15 minutes,
refused for 15 minutes, per account only, in the API).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | The five remaining browser confirmations use the app's dialog: withdraw, load latest and discard in the career path editor; discard course changes (leaving the editor, logout) and use latest version in the course editor | Everything under `app/` except the version lines, `docs/specs/US-A001-user-management.md` | In progress |
| Codex | US-P008-AC02 / INV-014: sign-in attempt limit per account | See the [handoff](handoffs/US-P008-sign-in-limit-codex.md) and [spec](specs/US-P008-safe-operation.md) | Handed over 2026-10-12 |

**US-P001 — Role journey verification.** In progress. Owner: Claude Code.
Delivered: `npm run verify:journeys` and two manual walks of the teacher, admin and learner
screens ([record](verification/2026-10-09/teacher-walkthrough.md)). Remaining: the live
rehearsal in the [teacher rehearsal checklist](release/teacher-rehearsal-checklist.md)
before the first teacher session, and the browser-runner decision.

**Career paths, increment 2 — selected by the user 2026-10-10.** This lifts the feature pause
below for career paths only. Branch: `main`. Base: `35567db`. Split decided by Claude Code
as lead; the two owners touch no common file.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | Completed-step browser check (spec remaining 1); US-L010 next step on the roadmap and Home; US-L011 confirm before switching; US-P004-AC01–02 in the page and service | `app/src/app/pages/career-path-page/`, `app/src/app/pages/dashboard-page/`, `app/src/app/services/career-path.service.ts`, `app/src/app/utils/career-path-progress*` | Delivered locally: completed-step check, US-L010 (0.1.76), US-L011 and US-P004-AC01–02 (0.1.77). Next: merge Codex's part |
| Codex | US-L002-AC02 lesson completion saved to the account; US-P004-AC03–04 on the selection API | `api/src/**`, `app/src/app/services/learning-progress.service.ts` and its spec; authorized grading-URL-only exception in `course.service.ts` | Delivered locally: `b66a8e1` (implementation, 0.1.79); this delivery-record commit bumps to 0.1.80 for the hook. Initial guard `5c2a4b5`; `a81255d` preserved with user approval. [Spec](specs/US-L002-account-progress.md) written first. Verified: 352 API/156 frontend tests, six journeys, API/Pages builds; final independent review clear. Not verified: real Mongo durability/concurrency, hosted API/frontend, two-device browser walk. No shared-service mutations or push. Next: Alex's hosted Mongo/release check; Codex stopped |
| Alex | Hosted MongoDB check, then map real courses and publish the paths | Admin page, hosted | After both merge |

Decisions and the scenario map are in the [spec](specs/US-L009-L012-T008-career-paths.md).
User correction 2026-10-10: Codex works and commits here on `main`, with the hook's
aligned version bump, without pushing. Claude has finished editing.
Out of scope: CV analysis, teacher proposals, unpublishing a path, step reorder, US-L003.
Lead check 2026-10-10 on `190a3e8`: Codex stayed within its files plus the recorded
`course.service.ts` exception; existing routes are unchanged and the old quiz route remains.
352 API and 156 frontend tests, six journeys and the Pages build pass. Browser, in-memory API:
a lesson completed in one browser showed as 50% after all browser storage was wiped and the
learner signed in again. Open: the service's sync messages (`accountSyncError`) are shown on
no page yet, so a quiz passed before this change counts only in the browser that passed it
until it is passed again, without telling the learner. Not checked: keyboard-only walk.
Next: Alex decides on the push; then the hosted MongoDB check and publishing real paths.

**2026-10-11, hosted check of 0.1.155 by Alex, and his one remark.** Confirmed on the live
site: reload without the restore screen, the profile menu closing on an outside click,
deactivating a user, and a password change from the profile with its notice mail. Remark: the
confirmation should be part of the interface, not the browser's dialog. Delivered locally by
the lead (frontend only, no Codex part): a shared confirm dialog, used by the four questions
of the Admin page ([record](specs/US-A001-user-management.md)). Five other questions in the
career path editor and the course editor still use the browser's dialog; offered to Alex.

**2026-10-11, after the push of `005552d` (0.1.155; CI and the Pages deployment succeeded; the
hosted API reports its real stores).** Reported by Alex from the live site: Brevo's IP blocking
is off and mail works; reset mails reach Gmail and Outlook outside spam; a student enrollment
in a new course works (hosted check of DEF-026). Still to be seen on the live site: the reload
without the restore screen, the profile menu closing on an outside click, deactivate and
reactivate with the change log, and a password change from the profile page.
Open backlog items all wait for a decision by Alex: US-P008-AC02, US-L014, US-A002.

**Session 2026-10-11 (10) — Alex: "push and start working on the next bit".**
Branch: `main`. Base: `c03e602` (pushed and deployed, 0.1.150; the hosted API reports mode
`hosted` with Google Sheets, MongoDB and Brevo, and answered the catalog and auth health
checks). Picked by the lead: the rest of US-A001, first in backlog order. Decided by Alex:
deactivate and reactivate accounts (not one's own) plus a change log for admins.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-A001-AC07/AC08 frontend: Deactivate and Reactivate in the User management tab; "Recent changes" list | Everything under `app/` except the version lines | Delivered locally in `3306233` (0.1.152) and the lead-check commit; acceptance in the [spec](specs/US-A001-user-management.md) |
| Codex | US-A001-AC07/AC08 API: status change, change log storage and read | See the [handoff](handoffs/US-A001-status-and-change-log-codex.md) and appended [spec](specs/US-A001-user-management.md) | Delivered locally 2026-10-11: implementation d81933e (0.1.153), delivery record in this commit with fresh aligned version/hook. Main/base 5bc4ed4 confirmed; Claude 3306233 preserved. Spec appended first; DEF-031 disabled-login disclosure and DEF-032 stale-login reads reproduced/append-logged before fixes, now Fixed. AC07/AC08 Done: F-only status, permanent snapshot log after actual change, harmless safe log failure, no-op without write/log, fresh login and adapter mutation metadata. All five checks pass: API 1055/46, journeys 6, API build, app 269/34, Pages build (existing style/test-setup/jsdom warnings); independent review clear, 92 new cases. No shared services, real mail, .env inspection, ports 3001/4200 or push. Real Sheets/Mongo durability, hosted/UI/keyboard and log-failure monitoring unverified; append failure/crash may leave unlogged changes; distributed CAS/last-admin protection absent. No outside-file change needed. Codex stopped |

Lead check 2026-10-11 on `e4601f5`: Codex stayed within its files and the version lines. New:
the status route and the change log. Changed on purpose at login: a disabled account is now
refused with the same 401 as a wrong password instead of a 403 that named the status
(DEF-031), and login reads the users sheet fresh (DEF-032). 1055 API and 269 frontend tests,
six journeys and the API and Pages builds pass. Browser, in-memory API: deactivate, the
learner locked out of session and login, reactivate, and the change log filling up.
Added by the lead at Alex's request: the profile menu closes on an outside click and on
Escape; a disabled shared button is dimmed. US-A001 is Done locally and out of the backlog.
Not verified: the real users sheet and MongoDB; hosted behavior.
Next: Alex decides on the push.

**Session 2026-10-11 (9) — started by the user with "let's start working on these".**
Branch: `main`. Base: `1d5eebe` (local, 0.1.145; seven commits not pushed). Selected by Alex:
the three stories from the audit and the session question. Split with no file in common:

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-P010: open the app from the stored session and check it in the background. US-P012: no hosted fallback on local hosts | Everything under `app/` except the version lines | Delivered locally in `373cf6f` (0.1.147); record in the [spec](specs/US-P010-P012-session-and-local-api.md) |
| Codex | US-P011: local runs use isolated stores unless `USE_SHARED_SERVICES=1` | See the [spec](specs/US-P011-isolated-local-runs.md) and [handoff](handoffs/US-P011-isolated-local-runs-codex.md) | Delivered locally 2026-10-11: implementation 2010bfa (0.1.148), delivery record in this commit with fresh aligned version/hook. Main/base dba0646 confirmed; Claude 373cf6f preserved. Spec first; initial RED for API/scripts and DEF-030 ambient credential leak, then centralized filtering/factory guards. AC01/02/03 Done; DEF-030 Fixed. All five checks pass: API 963/43, journeys 6, API build, app 265/34, Pages build (existing stylesheet/test-setup/jsdom warnings). Independent read-only review clear after injected-builder correction; 50 focused cases; no hosted-detection doubt. No .env inspection/change, shared services, real mail, ports 3001/4200 or push. Real shared-service readiness, hosted startup/login and combined browser acceptance unverified; Alex handles release checks. No outside-file change needed. Codex stopped |

Lead check 2026-10-11 on `b2f2bd9`: Codex stayed within its files and the version lines. The
mode is decided in one place (`getServicesMode` in `api/src/config.ts`); an isolated run never
sees the shared services' settings. It also found and fixed DEF-030 (credentials inherited
from the shell could still select shared assets, Mux webhooks and GitHub in tests). The lead
added one guard: `VERCEL` from `api/.env` does not make a local run hosted. 963 API and 265
frontend tests, six journeys and the API and Pages builds pass. Checked with the real
`api/.env` and no outside call: default isolated, opt-in shared, production and Vercel hosted.
US-P010, US-P011 and US-P012 are Done locally and out of the open backlog.
Next: push (asked for by Alex), then confirm the hosted API still reports its real stores.

**2026-10-11, audit of outside calls and the session screen (asked for by Alex).**
The lead ran both test suites with a spy that records and blocks real network calls. Two
leaks were found and fixed in `f38f321` (0.1.144): DEF-028 (frontend specs made 21 requests to
the hosted API per run) and DEF-029 (API tests loaded `api/.env` when the shell set
`NODE_ENV`). Afterwards: 258 frontend tests with no real request; 912 API tests whose 2,743
requests all stayed on `127.0.0.1`. Added as Proposed at Alex's request: US-P010 (open the app
at once instead of "Restoring your session"), US-P011 (local runs isolated by default) and
US-P012 (no silent hosted fallback on localhost). The deploy workflow's one health request
per push was judged fine and gets no story. Not checked: the MongoDB, Mux and Vercel plans.
Suggested order: US-P011, US-P010, US-P012.

**Session 2026-10-11 (8) — Alex asked for a "User management" tab on the Admin page.**
Branch: `main`. Base: `d2c7a56` (pushed and deployed, 0.1.138). Selected by Alex: search users,
change their role, reset their password. It is the open story US-A001. Decided by Alex: a
reset sends the user a reset link; the admin never sees a password.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-A001 frontend: "User management" tab with search, role change and "Send reset link" | Everything under `app/` except the version lines | Delivered locally in `b14e307` (0.1.140); acceptance and the lead correction in the [spec](specs/US-A001-user-management.md) |
| Codex | US-A001 API: user search, role change, admin-triggered reset mail | See the [spec](specs/US-A001-user-management.md) and [handoff](handoffs/US-A001-user-management-codex.md) | Delivered locally 2026-10-11: implementation 54a9427 (0.1.141), delivery record in this commit. Main/base 9209e22 confirmed; Claude b14e307 preserved. Spec first; 87 initial RED cases, six DEF-027 stale-auth failures reproduced then fixed; 253 focused cases pass. Read-only review clear (independent 95 pass). All five checks pass: API 908/40, journeys 6, API build, app 258/33, Pages build (existing style warnings). Real Sheets/Mongo/Brevo/mail, hosted Admin tab/browser/keyboard and live quotas unverified. Status AC07/audit AC08 stay Proposed. Outside owner: append US-A001/DEF-027 note to docs/specs/US-P006-class-load.md: auth now fetches fresh per request; 20-reader burst costs 20 Users plus shared catalog reads (22 observed); retain historical four-read evidence. Scoped local commits with fresh version/hook; Codex stopped, no push |

Lead check 2026-10-11 on `4b19102`: Codex stayed within its files and the version lines. New:
three admin routes. It also found and fixed DEF-027 (a request could use a users read begun
before a role change), but by making every authenticated request read the users sheet on its
own. The lead changed that in `api/src/inFlightRead.ts` and `authRepository.ts`: reads are
still fresh, and a burst shares them again (see the spec). 912 API and 258 frontend tests, six
journeys and the API and Pages builds pass. Browser, in-memory API: list, search, role change
taking effect on the user's existing session, reset link, and the denials for non-admins.
US-A001's selected scope is Done locally; account status and auditing stay Proposed.
The note Codex asked for in the US-P006 spec is added.
Not verified: the real users sheet and a real class-sized burst; hosted behavior.
Next: Alex decides on the push.

**Session 2026-10-11 (7) — started by the user with "let's work on the next task".**
Branch: `main`. Base: `cffae22` (pushed and deployed, 0.1.133). No confirmed defect is open.
Picked by the lead: US-L013, the next item in the order recorded with Alex's account email
stories (US-P009, US-P008-AC05 and US-L004 are live).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-L013 frontend: a password section on the profile page | Everything under `app/` except the version lines | Delivered locally in `821a3dc` (0.1.135); acceptance in the [spec](specs/US-L013-change-password.md) |
| Codex | US-L013 API: change the password with the current one; notice mail; a password change cancels unused reset links | See the [spec](specs/US-L013-change-password.md) and [handoff](handoffs/US-L013-change-password-codex.md) | Delivered locally 2026-10-11: implementation f8a3713 (0.1.136), delivery record in this commit. Main/base 673fd59 confirmed; Claude frontend 821a3dc preserved. Spec first, isolated RED, 151 focused cases pass; read-only review clear after late-claim/fresh-read fixes. All five checks pass: API 813/39, journeys 6, API build, app 252/32, Pages build (existing style warnings). Real Sheets/Mongo/Brevo/mail and hosted combined profile/browser/keyboard unverified; no outside-file change needed. Sessions remain signed in; attempt limits open P008-AC02. Scoped local commits with fresh version/hook; Codex stopped, no push |

Lead check 2026-10-11 on `783d02a`: Codex stayed within its files and the version lines. New:
`POST /users/me/password`. Changed on purpose in the reset routes: a reset link is now tied to
the password it was issued for, so any password change makes older links answer 410. 813 API
and 252 frontend tests, six journeys and the API and Pages builds pass. Browser, in-memory
API: wrong current password, weak and unchanged new password, a valid change, old and new
login, one notice mail, and an earlier reset link no longer working. Nothing to fix.
US-L013 is Done locally and out of the open backlog.
Not verified: hosted behavior.
Next: Alex decides on the push.

**Session 2026-10-11 (6) — Alex chose Brevo without a domain and the sender `xqiacademy@gmail.com`.**
Branch: `main`. Base: `80aef51` (local, 0.1.124; one commit not pushed). Selected by Alex in the
brainstorm: the mail sender, so that forgot password can be built. The lead runs US-P009,
US-L004 and US-P008-AC05 as one increment, because the sender has no other user yet.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-L004 frontend: "Forgot password?" form on the login page; reset page at `/reset-password` | Everything under `app/` except the version lines | Delivered locally in `1470b3a` (0.1.126) plus the pasted-link fix in the lead-check commit; acceptance in the [spec](specs/US-L004-password-reset.md) |
| Codex | US-P009 mail sender (Brevo and local); US-L004 reset API and token storage; US-P008-AC05 limit on reset mail | See the [handoff](handoffs/account-email-password-reset-codex.md) | Delivered locally in `9f87cb7` (implementation, 0.1.127); this delivery-record commit carries another hook-aligned patch bump. Owner Codex, main/base be57a77 (ancestor confirmed), selected 2026-10-11; both specs written first. Delivered: injectable Brevo/local sender, three no-store reset routes, hashed 60-minute tokens, atomic shared three-mail reservation/single-use claim, Sheets/memory hash update and notice. DEF-026 reproduced then Fixed: enrollment writes only H to preserve the reset hash in D. Final read-only review clear. All five checks pass: 744 API tests (95 focused, 66 HTTP), six journeys, API build, 248 frontend tests and Pages build; existing jsdom/style warnings. Unverified: shared Mongo/Sheets durability, real Brevo acceptance/delivery/spam, hosted/combined browser/keyboard flow. Failed sends retain unusable slots for one hour; a failed password write leaves the claimed token consumed; signed sessions remain. Claude frontend commit 1470b3a preserved. Remaining: Claude's AC03/browser acceptance; Alex's real settings/delivery check and client-address/confirmation-mail limit decisions. No outside-owned file needed, real mail/shared mutations, branch/worktree, push or deployment. Codex stopped |
| Alex | Brevo account and sender confirmation; four settings in Vercel; real delivery test | Brevo, Vercel, his mailbox | Four settings added in Vercel (seen by name, 2026-10-11). Delivery test passed on the live site 2026-10-11 after authorising an IP address in Brevo: reset mail received and password changed ([record](specs/US-L004-password-reset.md)). Login, inbox placement and the notice mail confirmed. Closed 2026-10-11 by Alex's report: Brevo's IP blocking is off, Gmail and Outlook reset mails arrive outside spam, and a hosted enrollment works ([record](specs/US-L004-password-reset.md)) |

Lead check 2026-10-11 on `2a54da9`: Codex stayed within its files and the version lines. New:
a mail sender, three reset routes and a token store; `/health/config` gained a `mail` field.
One existing behavior changed on purpose (DEF-026, reproduced first): enrollment now writes
only the enrolled-courses cell of the users sheet instead of the whole row, so it cannot put
back a password that was just reset. 744 API and 249 frontend tests, six journeys and the API
and Pages builds pass. Browser, in-memory API with the local mail sender: the whole flow from
"Forgot password?" to signing in with the new password, the used link, the weak password and
the three-mail limit. The check found and fixed a gap in the lead's page (a link pasted into
an open tab). US-L004 and US-P009 are Done locally; US-P008-AC05 is delivered for accounts.
Not verified: a real mail through Brevo, the hosted reset link, enrollment against the real
users sheet after DEF-026.
Next: Alex decides on the push, then runs the delivery test and one hosted enrollment.

**2026-10-11, after the push of `7675e98` (0.1.123; CI and the Pages deployment succeeded).**
Alex brainstormed account email with the lead and asked for the stories to be recorded.
Added as Proposed, nothing selected or implemented: US-P009 (send account email), US-L013
(change password while signed in), US-L014 (confirm email at signup), US-P008-AC05 (limit reset
and confirmation mail); US-L004 (forgot password) sharpened with AC03 to AC05. Decided by Alex:
automated reset by email, a free mail service, and he owns no domain. Open before US-P009 can
start: the sender address, and whether Brevo's delivery without a domain is good enough.
Suggested order: US-P009, US-P008-AC05, US-L004, US-L013, US-L014.

**Session 2026-10-11 (5) — started by the user with "let's work on the next task".**
Branch: `main`. Base: `7b99ce6` (local, 0.1.118; 15 commits not pushed). No confirmed defect is
open, so the lead picked the first open story in backlog order, US-T014 (question image), which
Alex asked for on 2026-10-11. Its open decisions were taken from existing precedents and are
listed in the handoff as "confirm or change".

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-T014 frontend: add, preview, describe and remove an image on a question in the quiz editor; show it to learners | Everything under `app/` except the version lines | Delivered locally in `a7f66f7` (0.1.120) plus the focus fix in the lead-check commit; acceptance in the [spec](specs/US-T014-question-image.md) |
| Codex | US-T014 API: `image` on a question, image uploads for quiz lessons, validation, learner read, clearing on delete | See the [handoff](handoffs/US-T014-question-image-codex.md) | Delivered locally: 5b67f16 (implementation, 0.1.121); this delivery-record commit carries the hook-required aligned patch bump. Owner Codex, main/base 0648742 (required ancestor confirmed), selected 2026-10-11. Spec docs/specs/US-T014-question-image.md written first with lead decisions as confirm or change and AC01..07. Optional image/null/alt validation, quiz JPEG/PNG/WebP uploads, actual same-course/lesson/MIME attachment checks, whitelisted learner image, atomic delete reference clearing; existing download/readiness/review/other lesson behavior retained. RED 44 expected feature failures/3 passes; GREEN 55 focused cases and all five checks: 649 API/241 frontend tests, six journeys, API/Pages builds (stylesheet warnings/jsdom notices). One old API exact-shape assertion updated to required image:null; final independent read-only review clear. Claude frontend a7f66f7 preserved. Not verified: real Mongo/Sheets/Mux, hosted bytes/API, combined browser/accessibility AC01/02; Claude owns acceptance, story stays open. No existing defect reproduced or outside-scope change needed, branch/worktree, shared-service mutation, push or deployment. Next: separate combined browser/release checks; Codex stopped |

Lead check 2026-10-11 on `43f1f51`: Codex stayed within its files and the version lines; no
route path, request or response shape changed, and one existing API test's exact-shape
assertion gained `image: null`. 649 API and 242 frontend tests, six journeys and the API and
Pages builds pass. Browser, in-memory API: a teacher added, described, saved, reopened and
removed a question image; after publishing, an enrolled learner saw it and nobody without a
session could fetch it. The check found and fixed a focus loss after Remove image in the lead's
frontend. US-T014 is Done locally and out of the open backlog.
Not verified: the visual result (the browser pane did not draw), real MongoDB, hosted behavior.
Next: Alex decides on the push.

**Session 2026-10-11 (4) — started by the user with "let's work on the next task".**
Branch: `main`. Base: `96b9071` (local, 0.1.113; ten commits not pushed). No confirmed defect
is open, so the lead picked the first open story in backlog order, US-T007. Decided by Alex:
a teacher's description is public as soon as it is saved; an admin can clear it.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-T007 frontend: the profile's "About you" saved to the account for teachers and admins; description on the catalog and course instructor cards with a fallback; clear on the Admin page | Everything under `app/` except the version lines | Delivered locally in `67079db` (0.1.115) plus the sign-in fix in the lead-check commit; acceptance in the [spec](specs/US-T007-instructor-description.md) |
| Codex | US-T007 API and storage: own description read/save, public list by published course, admin list and clear | See the [handoff](handoffs/US-T007-instructor-description-codex.md) | Delivered locally: 7b890df (implementation, 0.1.116); this delivery-record commit has the hook-required aligned patch bump. Owner Codex, main/base a482800 (required ancestor confirmed), selected 2026-10-11. Spec docs/specs/US-T007-instructor-description.md written first with lead decisions and AC01..08. Five new routes, trim/string/280 validation, per-user Mongo/memory storage, exact public description/published-owned-course IDs, admin list/idempotent clear; existing routes/users sheet unchanged. RED: initial six HTTP cases 404; expanded 40 expected failures/2 parser passes, absent repository module. GREEN: 60 focused cases; all five checks pass, 594 API/230 frontend tests, six journeys, API/Pages builds (existing stylesheet warnings/jsdom notices). Read-only review clear after moderation test strengthened. Claude frontend 67079db preserved. Not verified: actual Mongo durability/contention, real providers, hosted API, combined browser/accessibility AC01/02; Claude owns frontend acceptance, story stays open. No outside-scope change needed, branch/worktree, shared-service mutations, push or deployment. Next: separate combined/browser release check; Codex stopped |

Lead check 2026-10-11 on `6f612ba`: Codex stayed within its files and the version lines; five
new routes in their own module, seven lines of wiring in `api/src/server.ts`, no existing route
changed. 594 API and 233 frontend tests, six journeys and the API and Pages builds pass.
Browser, in-memory API: teacher saved a description, it showed on the catalog and course
instructor cards, an admin cleared it and the cards fell back. The check found a defect in the
lead's own frontend (signing in as a teacher ended the session); fixed with a regression test
before any push. US-T007 is Done locally and out of the open backlog.
Not verified: real MongoDB, hosted behavior, a screen reader.
Next: Alex decides on the push.

**Session 2026-10-11 (3) — started by the user with "let's start working on the next".**
Branch: `main`. Base: `28cf2fa` (local, 0.1.108; five commits not pushed). Picked by Claude
Code as lead: DEF-022, the only open confirmed defect, for Claude. It is one component, so
Codex takes the next independent open item with no file in common: US-P003 (API only).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | DEF-022: the lesson editor dialog and the component picker take focus, close on Escape, keep Tab inside and return focus | `app/src/app/ui/course-builder/**`, the DEF-022 entry in `docs/defect_management.md` | Delivered locally in `35b45c2` (0.1.110); DEF-022 Fixed, record in the defect log |
| Codex | US-P003 / INV-003, INV-004: reproduce, then make overlapping signup, enrollment and retried triage safe within one API instance | See the [handoff](handoffs/US-P003-safe-retries-codex.md) | Delivered locally: c13a800 (implementation, 0.1.111); this delivery-record commit also has the hook-required aligned patch bump. Owner Codex, main/base fc98679 (required ancestor confirmed), selected 2026-10-11. Spec written first; AC01/02/03 reproduced as DEF-023/024/025 before changing code (12 cases: 10 RED, 2 memory enrollment cases not reproduced), latest states Fixed appended. Instance-only email/user/feedback queues and pending-issue checkpoint; no repository/frontend or other-route wiring change. Verified: 34 focused HTTP cases, 534 API tests, six journeys, API build, 225 frontend tests, Pages build with existing stylesheet warnings/jsdom notices; read-only review clear. Claude's 35b45c2 preserved; defect records appended as bytes, DEF-022 untouched. Not verified: real Sheets/GitHub, hosted/browser, multiple instances/restart. AC01..03 removed; distributed/restart AC04 remains Proposed with Alex's shared coordination/durable issue recovery decision in the spec/backlog. No outside-scope file needed, branch/worktree, shared providers or push. Next: Alex's distributed/restart decision and separate release checks; Codex stopped |

Lead check 2026-10-11 on `408fa05`: Codex stayed within its files and the version lines. The
code change is one small queue helper and three routes in `api/src/server.ts` (signup,
enrollment, feedback triage); paths, request shapes, responses and status codes are unchanged
and no repository interface changed. 534 API and 225 frontend tests, six journeys and the API
and Pages builds pass. DEF-023, DEF-024 and DEF-025 are Fixed for one API instance. Noted, not
changed: after a failed save, a retry that no longer asks for work still gets the already
created issue link. Open for Alex (US-P003-AC04): the hosted API can run several instances and
restarts between requests, and neither is covered. Not verified: real Sheets and GitHub,
hosted behavior, a screen reader on the DEF-022 dialogs.
Next: Alex decides on the push and on AC04.

**Session 2026-10-11 (2) — started by the user with "let's start working".** Branch: `main`.
Base: `18ae097` (pushed, 0.1.103). Picked by Claude Code as lead: the open check of the last
increment (US-T013 keyboard-only walk) for Claude; it is too small to split, so Codex takes
the next independent open item, US-P006-AC06 (P1 story, API only).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-T013 leftover: keyboard-only walk of the new quiz editor rows and the learner's tick boxes; fix what it finds | Everything under `app/` except the version lines, `docs/specs/US-T013-simple-quiz.md` | Delivered locally in `9a4d032` (0.1.105): focus kept after deleting an answer or a question, focus outline on learner answers; record in the [spec](specs/US-T013-simple-quiz.md) |
| Codex | US-P006-AC06 / INV-018: unchanged thumbnails are served from the browser cache | See the [handoff](handoffs/US-P006-thumbnail-cache-codex.md) | Delivered locally: f1aed61 (implementation, 0.1.106); this delivery-record commit also has the hook-required aligned patch bump. Owner Codex, main/base df556f0 (required ancestor confirmed), selected 2026-10-11. INV-018 reproduced first and promoted to DEF-021, now Fixed; exact asset-version 200s now private/immutable, access and all other responses unchanged. AC06 removed from the open backlog; contract/evidence in docs/specs/US-P006-class-load.md. Verified: 42 focused HTTP cases, 500 API tests, six journeys, API build, 222 frontend tests, Pages build (existing stylesheet warnings/jsdom notices); read-only review clear. Claude's 9a4d032 preserved. Not verified: actual browser cache-hit transfers, hosted API and real providers; hosted AC02 budget remains open. No outside-scope change needed. Shared working tree preserved; no branch/worktree, shared-service mutations or push. Next: separate hosted/browser release check; Codex stopped |

Lead check 2026-10-11 on `977bc0c`: Codex stayed within its files and the version lines; the
code change is three lines in the thumbnail read route and no other route changed. 500 API and
222 frontend tests, six journeys and the API and Pages builds pass. Browser, in-memory API: a
thumbnail requested with its asset id came back `private, max-age=31536000, immutable`; without
`v` it was `no-store`; a wrong `v` and an anonymous read of the draft were 404 `no-store`.
Not verified: that the second read is served from the browser cache (the browser reports no
transfer sizes across origins), real key presses in the quiz editor, hosted behavior.
New: DEF-022 (Open), the lesson editor dialog does not manage keyboard focus.
Next: Alex decides on the push; DEF-022 is the lead's recommended next item.

**Session 2026-10-11 — started by the user with a reference design for a simpler quiz editor.**
Branch: `main`. Base: `a79828f` (pushed and deployed, 0.1.98). Decided by Alex: 1 point per
question, 2 to 6 answers, one or more correct answers, optional explanation per question;
question images later.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-T013 frontend: quiz editor rebuilt after the reference (question, answer rows with a correct box and delete, Add answer, optional explanation, New question); learner quiz view for one or several correct answers | Everything under `app/` | Delivered locally in `1e6506b` (0.1.100); acceptance in the [spec](specs/US-T013-simple-quiz.md) |
| Codex | US-T013 API: quiz model, readiness rules and grading; US-T014 question image recorded as Proposed | See the [handoff](handoffs/US-T013-simple-quiz-codex.md) | API increment delivered locally: 1808432 (implementation, 0.1.101); this delivery record has the hook-aligned patch bump. Owner Codex, main/base 5bfda0d (required commit present), selected 2026-10-11. Spec/stories written first. One point, 2..6 answers, exact-set grading, optional explanation, learner multiple hint and question/answer whitelist; both attempt routes and legacy four-option/points/answerId requests retained, high old pass marks clamped for grading only, account proof aligned with raw stored quiz/Finish. Verified: 458 API tests including 33 simpleQuiz cases, six journeys, API build, 221 frontend tests and Pages build on concurrent combined tree (stylesheet budget warnings). Read-only review: no Critical/Important; malformed unused alias Minor reproduced and fixed; 5,213 independent set combinations pass. No newly confirmed existing defect or further outside-scope need. Not verified: hosted frontend/API, real Mongo durability/providers, combined browser/keyboard/accessibility; Claude owns frontend AC07/08. US-T014 Proposed only. app/ and CLAUDE.md preserved except required version lines; isolated memory stores and ephemeral ports only; no shared data, push or deployment. Claude frontend commit 1e6506b preserved; frontend suite/Pages build repeated after it and pass. Delivered API AC01..AC06 removed from the open backlog; Claude AC07/08 acceptance remains open, US-T014 stays Proposed. Next: Claude records the combined browser acceptance; hosted/provider checks require separate release authorization. Codex stopped |

Lead check 2026-10-11 on `becd1d6`: Codex stayed within its files and the version lines. 458 API
and 221 frontend tests, six journeys and both builds pass. The new editor and learner view
were exercised against the new API in the browser (in-memory); details in the spec. US-T013 is
Done locally and out of the open backlog; US-T014 (question image) stays Proposed.
Next: Alex decides on the push.

**Session 2026-10-10 (4) — started by the user with feedback from the first teacher who built
a course on the live site.** Branch: `main`. Base: `a2926e0` (pushed and deployed, 0.1.90).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | US-T010 guided course form: steps with checkmarks and Back/Next, required-field marks, bullet lists that show their bullets. DEF-020: a published course looks impossible to edit, because the form is locked and "Start revision" is a small button inside step 3 | `app/src/app/pages/**`, `app/src/app/ui/course-review-panel/**`, `docs/specs/US-T010-guided-course-form.md` | Delivered locally in `baf852c` (0.1.92); [spec](specs/US-T010-guided-course-form.md) |
| Codex | US-T011 quiz authoring; US-T012 move a lesson to another chapter | See the [handoff](handoffs/teacher-feedback-builder-codex.md) | Delivered locally: a8595d6 (implementation, 0.1.96); this delivery-record commit also has the hook-aligned patch bump. Owner Codex, main/base 853c249; prior spec 6928646/43f480b and route exception preserved. Quiz add/focus/top alignment, toggle/summaries/readiness and cleaner layout; cross-chapter drag/select with focus, full-content state/save/recovery/conflict and guards; DEF-T012-CALLBACK reproduced then fixed. Verified: 425 API/215 frontend tests, six journeys, API/Pages builds; 27 focused builder/state cases and seven media API cases. Review scroll-clamp and move-focus regressions fixed. Not verified: actual 375px/tall viewport, native keyboard/drag browser, live Mux/Mongo/Sheets/hosted behavior. Claude browser: add several questions on tall/short screens, header top and field focus, Enter/Space collapse/reopen, collapsed summaries and readiness at 375px; drag before/end/empty/collapsed chapter, keyboard select opens destination and retains focus; save/reopen text/video/quiz/attachments; busy/upload/read-only guards, conflict and local recovery. No additional outside-scope need; one authorized route line only; isolated stores, no shared mutations or push. DEF-T012-CALLBACK Fixed in a8595d6; completed stories removed from the open backlog, contract/evidence retained in docs/specs/US-T011-T012-course-builder.md. Pages build succeeds with stylesheet budget warnings. Next: Claude checks the browser checklist above; Codex stopped |

Lead decision 2026-10-10 on Codex's block: the lead missed that the route template passes the
move event's fields one by one. Codex now also owns line 101 of
`app/src/app/routes/course-editor-route.html` (the `courseComponentMoved` binding) and resumes
from its spec checklist. Claude's part is delivered locally in `baf852c` (0.1.92).
Lead check 2026-10-10 on `4e7793d`: Codex stayed within its files and the one route line.
425 API and 215 frontend tests, six journeys and the API and Pages builds pass. Browser,
in-memory API, as the demo teacher: "Move to chapter" moved a lesson into an empty chapter and
kept focus on it; a drag onto the end of another chapter moved a lesson (dispatched drag
events, not a hand drag); adding a quiz question collapsed the first, put the new one at the
top of the editor with the cursor in its text, and showed "Needs attention"; after Save and
reload the moved lesson and the second question were still there. Lead polish on top: the
"drop at end of chapter" targets are now invisible until a lesson is being dragged.
DEF-020 is in the defect log; US-T010 is delivered, so it is not in the open backlog.
Not verified: a hand drag with a mouse, a moved lesson with a real video or attachment,
hosted behavior. Next: Alex decides on the push.

**Session 2026-10-10 (3) — started by the user: the career path editor's Save buttons are cut
off, the Admin page is chaotic, and career paths need a UI overhaul.** Branch: `main`.
Base: `3dc9386` (pushed and deployed, version 0.1.85).

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | Fix the clipped editor (Admin page has a fixed height that hides it); Admin page organized into sections; career path editor rebuilt with a path list, collapsible steps and an always-visible save bar; Withdraw and conflict handling in the editor against Codex's contract | `app/**`, `CLAUDE.md`, `docs/specs/US-L009-L012-T008-career-paths.md` | Delivered locally in `5278f7c` (0.1.87); record in the career path spec |
| Codex | US-A003: withdraw a published path; refuse a stale save | See the [handoff](handoffs/US-A003-career-path-withdrawal-codex.md) | Delivered locally: a889155 (implementation, 0.1.88); this delivery-record commit also has the hook's aligned bump. Owner Codex, main, base 5278f7c (required 9f716fa present). Story and [spec](specs/US-A003-career-path-withdrawal.md) written first; DEF-019 Fixed after mixed legacy/versioned race regression. Verified: 418 API/182 frontend tests, six journeys, API build, 58 focused path tests; final independent review clear. Not verified: actual Mongo durability/atomicity/instances, hosted/API-to-editor browser withdrawal/conflict flow. No outside-scope file needed, shared providers or push; Claude's app/docs preserved except authorized version lines. Next: Claude/Alex's editor and disposable-provider release checks; Codex stopped |

Lead check 2026-10-10 on `3d80100`: Codex stayed within its files and the four version lines;
existing routes and shapes are unchanged. 418 API and 182 frontend tests, six journeys and the
API and Pages builds pass. Browser, in-memory API, new editor against the new routes: a save
made after a second admin's save was refused with the conflict message and the edits kept;
"Load latest version" showed the other admin's text; Withdraw asked first, removed the path
from the public list and left it as a draft. Not verified: real MongoDB, hosted behavior.
Open question for Alex: what the overhaul of the learner's Career Path page should change.
Next: Alex decides on the push.

**Session 2026-10-10 (2) — started by the user with "let's start working".** Branch: `main`.
Base: this commit. Picked by Claude Code as lead: the leftovers of career paths increment 2
for Claude, and the next independent safety item for Codex, because career paths are about
to go live.

| Owner | Scope | Files owned | State |
| --- | --- | --- | --- |
| Claude Code | Show the account progress sync message where learners see progress; keyboard-only walk of the career path page | `app/src/app/pages/**`, `docs/specs/US-L009-L012-T008-career-paths.md` | Delivered locally in `b5b284d` (0.1.83); record in the career path spec |
| Codex | US-P008-AC01 (INV-013) and US-P008-AC03 (INV-015) | See the [handoff](handoffs/US-P008-safe-operation-codex.md) | Delivered locally in `e7afd6d` (0.1.84). DEF-017 and DEF-018 reproduced, then Fixed. Codex stopped before committing, waiting on one fixture approval; the lead approved it, verified and committed. 378 API and 179 frontend tests, six journeys, API and Pages builds pass. Not verified: hosted behavior. AC02 remains Proposed. [Spec](specs/US-P008-safe-operation.md) |

Next: Alex decides on the push; then the hosted checks.

Delivered stories no longer appear here or in `user_stories.md`. Career paths (US-L006,
US-L009, US-L012, US-T008) are delivered; their open checks are a completed step seen in a
browser, real MongoDB, and an admin mapping real courses before publishing a path
([spec](specs/US-L009-L012-T008-career-paths.md)).

## Latest audit

**AUD-2026-10-09 — Whole-repo code audit.** Owner: Claude Code. Branch: `main`.
Audited tree: `96e9ff9` plus the US-T002 changes later delivered in `86196cf`. State:
Recorded (audit only). Report: [code audit](audits/2026-10-09/code_audit.md).
Added investigations INV-005–INV-018 and Proposed stories US-T009, US-P006–US-P008;
re-observed INV-002–INV-004. Nothing was reproduced or fixed. API/frontend builds
and 238 API/107 frontend tests passed on the audited tree. INV-011 and INV-017
concern the delivered US-T002 code. Documentation only; no product change.

**AUD-2026-10-05 — Career path journey audit, selected on 2026-10-05.**
Owner: Codex. Branch: `main`. Base: `9a2f30b` plus the preserved, uncommitted
DEF-002–DEF-005 implementation. Scope: discovery, goals, path selection,
recommendations, course navigation, progress, completion, persistence, and
availability/accessibility. State: Evidence captured (audit only). Report:
[career path audit](audits/2026-10-05/career_path_audit.md).
Completed: source/API inventory, disposable signup, goal/profile comparison,
enrollment and completion walkthrough, progress/accessibility DOM inspection, and
desktop/mobile captures. Reconfirmed DEF-007/DEF-009/DEF-011; added DEF-014 and six
Proposed stories. API build passed; no product fixes or shared-service mutations.
Documentation delivery: local `docs(career-path)` commit in this file's Git history;
audit base and evidence are recorded in the report. No push/deployment.
Next: follow the user's next selection; no Proposed path feature is authorized.

## Historical implementation handoff

DEF-005 resumed on 2026-10-08. Its preserved patch is now applied; do not reapply
it to current main. [The handoff](handoffs/DEF-005.md) keeps the original record
and links to current verification. Delivery commit: `3feeea4` (2026-10-08).

## Completed delivery

**US-T006 / INV-002 — Video operations; INV-016 / US-P008-AC04 — Main checks.**
Done (selected video scope and main CI trigger). Owner: Codex. Branch: `main`. Base: `f602307`. Isolated clone:
`qi-education-codex-media`; no shared environment or provider mutations.
Scope: Mux service/routes/webhook, upload/polling and builder video panel, CI main
trigger. Decisions: public playback; preserve assets referenced by published or
working content; cleanup failures must not block removal. Implemented and verified
with isolated stubs and stores. No push.
2026-10-10 continuation: user's instruction to proceed follows the requested
exception for the existing video-polling test fixture in `course-ownership.spec.ts`.
Only that fixture is corrected; no ownership implementation changes.
Spec: [video operations](specs/US-T006-video-operations.md).
Verified 2026-10-10: API build, 328 API tests, 135 frontend tests, Pages build,
all six journeys; independent review has no important outstanding findings.
Confirmed defects: DEF-T006-CLEANUP/PUBLIC/POLLING/UPLOAD-FAILURE. CI main trigger
implemented; Pages workflow untouched. Live provider gaps are listed in the spec.
Delivery: `cb38175` (version 0.1.65). Next: Claude reviews the combined result;
perform disposable live-provider/hosted rehearsal only under release authorization.
No push, deployment, or shared-service mutation.


**US-P006 API increment / US-P007 spreadsheet half / US-P005 expiry increment.** Delivered locally.
Owner: Codex. Selected/date: 2026-10-09. Branch/base: `main` / `f8d4c2f`.
Implementation commit: `67ec9f2a8da47c31a835ff1ffc430087520ab7a2` (version 0.1.62).
INV-005/007/011/012/009/006 reproduced before fixing; promoted as DEF-P006-01–04,
DEF-P007-SHEETS and DEF-P005-LOCK, now Fixed. Specs: [class load](specs/US-P006-class-load.md),
[spreadsheet text](specs/US-P007-spreadsheet-text.md), [lock recovery](specs/US-P005-lock-recovery.md).
Shared client; authenticated course reads 5 → 2 Sheets calls; concurrent-only
fetch sharing; 20 simultaneous readers; all five read routes remain available
under a held writer. Catalog uses one metadata-only batch; saving ten 4 MiB
attachment references reads zero binary bytes. Nine RAW writes preserve literal
`=1+1` and `007`. Alex approved 31-minute expiry beyond Vercel's 30-minute max;
owner/timestamp predicates protect successors, malformed timestamps fail closed.
Independent review's split author content/save-token race and timestamp parsing
findings fixed with RED-to-GREEN regressions. 319 API / 128 frontend tests,
six `verify:journeys` scenarios, API build and Pages build pass on the combined tree.
Claude's career-path routes/files and release journey were preserved. Only app edits:
package/rendered version strings at commit time, the exception recorded here before
editing; the docs-only delivery-record commit also requires an aligned bump.
Remaining: AC06 deferred as permitted; disposable-provider/cold-instance quota,
Mongo expiry/clock/durability and uncertain provider outcome checks before release.
Broader US-P005 operator tooling remains Proposed. No shared mutations, push or deployment.

**US-T003 / US-T005 — Local draft recovery and reliable saves.** Done.
Owner: Codex. Date: 2026-10-09. Branch: `main`. Base: `5211365`.
Delivery commit: `d674ee3a24c487923ca8f8586afefb27bd191753`. DEF-015 Fixed; DEF-006 remains Fixed.
Contracts: T003 AC01–03/DR-01–03; T005 AC01–02/RS-01–03.
Account/course scoped device-local metadata, outline and focused-text recovery,
separate document records with an explicit chooser, Restore/Discard and storage errors.
Versioned full saves reject stale edits, preserve local work and offer manual latest
comparison/reconciliation. Partial saves identify acknowledged details and unsaved
lessons; safe retries advance only confirmed baselines. Media refresh/busy guards.
276 API/122 frontend tests, API/frontend/Pages builds, isolated recovery/two-editor
browser checks and one final review's five RED-to-GREEN regressions pass.
[Verification](verification/2026-10-09/US-T003-T005.md). User authorized commit and push;
`main` push triggers Pages. Shared-provider and hosted verification remain separate.
Concurrent career-path/journey edits are preserved outside this delivery.

**US-T002 - Full review history and uninterrupted course revisions.** Done.
Owner: Codex. Date: 2026-10-09. Branch: `main`. Base: `96e9ff9`.
Delivery commit: `86196cfc088e32bed99a9435b0d3f31739b646a4`. Contract: AC01-08.
Private editable revisions, frozen submissions, required admin return reasons and
full chronological history. Atomic approval replaces live metadata/lessons/pointers;
existing learners retain access throughout review. Read-only reviewer preview,
versioned actions and retained live resource access. Final review's five findings
fixed with RED-to-GREEN regressions. 264 API/108 frontend tests, all builds and
isolated teacher/admin/learner browser pass. [Verification](verification/2026-10-09/US-T002.md).
Earlier Fixed records remain preserved. Shared-provider and hosted release checks
are separate. No push/deployment; unrelated audit changes excluded from delivery.

**DEF-008, DEF-011, DEF-012, DEF-013 - Remaining defect closure.** Fixed.
Owner: Codex. Date: 2026-10-09. Branch: `main`. Base: `797d55c`.
Fix/delivery record commit: `79c2ea5fd2721594f4b1f2c603982d80ef909bce`. Contract: RD-01-06.
Parser boundaries preserve safe 400/413/415 without reclassifying application
failures. Unfinished Home/workspace controls are hidden. Catalog cards display
full wrapping titles/badges without clipping at seven tested responsive widths.
DEF-012 was confirmed as missing category data; the user explicitly approved
seven category cell corrections. Applied and verified all other fields/headers
unchanged; fresh hosted API read returns the corrected categories.
222 API/101 frontend tests, API/frontend/Pages builds, isolated browser and
carousel/keyboard/filter checks, and fresh independent review pass.
[Verification](verification/2026-10-09/remaining-defects.md). US-L005/US-L008 Done;
US-P002 broader error DTO/dependency recovery remains Proposed. Category warning
prevention is Proposed as US-A002. Hosted application/provider release checks
remain separate. No application push/deployment.

**DEF-007, DEF-009, DEF-014 - Honest local learning progress.** Fixed (resolved in code).
Owner: Codex. Date: 2026-10-09. Branch: `main`. Base: `0a4b522`.
Fix commit: `6729b740e4b421b015ad9d1b97af1b44749f9707`. Contract: LP-01-05.
Workspace, library and Home share existing account/course completion records and
current lesson IDs. Home uses real enrollments and an honest empty/error/loading
state; quiz position is distinguished from completion. Storage-write failures
retain current-session completion across navigation. 100% requires all current
lessons completed. API 196/frontend 98 tests, API/frontend/Pages builds, isolated
browser completion/resume/refresh/account checks and final independent review pass.
[Verification](verification/2026-10-09/DEF-007-009-014.md).
US-L002 remains Proposed for cross-device progress and broader completion/revision
rules. Shared-service/hosted release checks remain pending. No push/deployment.

**DEF-005, DEF-006, DEF-010 — Assessment, navigation and direct learning batch.**
Fixed (resolved in code). Owner: Codex. Date: 2026-10-08. Branch: `main`.
Base: `159f45b`. Delivery: `3feeea4de8d056ba1e88789103a280df52c5d2f0`.
Contracts: LC-05, NW-01–05, DL-01–04. DEF-005 gates review/publication on answerable
quizzes and saves edited drafts before submission. DEF-006 warns before abandoning
metadata, outline and focused editor buffers; Stay preserves edits and Back history.
The user selected warnings only; local recovery remains Proposed. DEF-010's
runtime fix is `a6767f6`; dedicated direct URL/refresh/error/access checks pass.
API 196/frontend 82 tests, API/frontend/Pages builds, isolated browser journeys
and independent review pass. US-T004 is Done; US-T003/US-L001 retain broader
Proposed scope. [Verification](verification/2026-10-08/DEF-005-006-010.md).
Shared-service and hosted release checks remain pending. No push/deployment.

**DEF-002, DEF-003, DEF-004 — Lifecycle access batch.** Fixed (resolved in code).
Owner: Codex. Date: 2026-10-07. Branch: `main`. Base: `ff3d68a`.
Fix commit: `a6767f69e5254e01a47ca33b58dabe34925ea586`.
Scope: restricted teacher/admin fields, public/learner/author DTOs and asset
entitlement, trusted server grading, published-only enrollment, and private
response/session/coordination boundaries. API 185/frontend 55 tests, API/frontend/
Pages builds, isolated teacher/admin/enrollment/quiz browser checks, and independent
review pass. [Verification](verification/2026-10-07/DEF-002-004.md).
DEF-005 and broader US-T002/US-L001 story completion are excluded. Shared-store
and hosted release checks remain pending. No push/deployment.

**DEF-001 / US-T001 — Course ownership.** Defect: Fixed (resolved in code).
Story: Done. Owner: Codex. Date: 2026-10-04. Branch: `main`. Base: `ae9794a`.
Fix commit: `a9940ccd9fc13a149b5eb96017c5484796b0012d`.
Spec: [course ownership](specs/US-T001-course-ownership.md), AC01–AC05.

The user selected defects before enhancements on 2026-10-04. Start with the
confirmed teacher authorization defect, then work through confirmed defects in
teacher, learner, and platform order. Preserve completed defects with their
resolution date, evidence, and fixing commit; never remove their records.

Completed: owner persistence and all authoring gates, UI capabilities and denied
direct editor entry, API/frontend regression suites, builds, and isolated browser
walkthrough. Evidence: [DEF-001 verification](verification/2026-10-04/DEF-001.md).
Independent review found a forged asset-reference deletion bypass; ten additional
regressions reproduced it and the fix adds binding checks and course-scoped deletion.
Independent review found no remaining blocking ownership issue. All 111 API and
31 frontend tests and all builds pass. Release checks for disposable Sheets/MongoDB
and hosted behavior remain pending. No push, deployment, or legacy owner mapping.

## Next candidate

All documented confirmed defects remain Fixed. Feature work is paused until the first
teacher session is over; only fixes found in rehearsal go in.
Await the user's next selected story or investigation; no Proposed enhancement is authorized by
this delivery. Shared-provider/hosted release checks require a separate release.

## Defect order

| Order | Defect / related story | Current state | Next prerequisite |
| --- | --- | --- | --- |
| 1 | DEF-002 / US-T002 admin field restrictions | Fixed | Shared release verification |
| 2 | DEF-003 / US-T002, US-L001 private drafts/content | Fixed | Shared release checks; broader entitlement decisions remain Proposed |
| 3 | DEF-006 / US-T003 unsaved authoring | Fixed | Hosted/browser release verification; recovery delivered in US-T003 |
| 4 | DEF-005 / US-T004 impossible published quizzes | Fixed | Shared release verification; legacy invalid quizzes need correction |
| 5 | DEF-004 / US-L001 unpublished enrollment | Fixed | Shared release verification |
| 6 | DEF-010 / US-L001 direct learning refresh | Fixed | Shared-store and hosted direct URL/refresh release checks |
| 7 | DEF-007, DEF-009, DEF-014 / US-L002 false progress/activity | Fixed | Hosted/browser release checks; cross-device progress remains Proposed |
| 8 | DEF-011 / US-L005 inactive controls | Fixed | Hosted/provider release checks |
| 9 | DEF-008 / US-P002 parser errors | Fixed | Hosted/provider release checks |
| 10 | DEF-012 / US-L008 missing categories | Fixed | Approved repair verified; hosted browser release check |
| 11 | DEF-013 / US-L008 card clipping | Fixed | Hosted/provider release checks |
| 12 | DEF-015 / US-T005 stale authoring saves | Fixed | Hosted/provider and accepted-refresh release checks |

Enhancement-only stories remain in [user_stories.md](user_stories.md) for later
selection. DEF-012/013 are reproduced and resolved in `79c2ea5`. INV-001 is resolved
through DEF-015; INV-002–004 remain investigations; reproduce them before prioritizing implementation.

P1 access defects are release risks even while platform work is later in the
roadmap. Do not interpret this order as approval to release known access gaps.
Change priorities when the user selects a different item; update this file and
the story table together.

## Handoff record

When a story starts, replace Active work with one record containing:

- Item and linked defect IDs; implementation owner.
- Branch and base commit obtained from Git, not inferred from previous chats.
- Spec path and scenario IDs in scope.
- Completed work and verified checks, including date and environment.
- Remaining work, unresolved decision or blocker, and a concrete next command/action.
- Delivery commit once available.

Keep the active record across interrupted sessions. A fresh agent should not
have to reconstruct unfinished work from chat history.
