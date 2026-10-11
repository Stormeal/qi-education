# US-A001: Admin user management

## Record and outcome

- Story: US-A001-AC01/02; API owner Codex, frontend owner Claude Code.
- State: API delivered locally 2026-10-11; main/base 9209e22, ancestor confirmed.
- Local implementation commit: 54a9427b64425fd82c2d839ad2825db0aa399803 (0.1.141).
- Delivery record accompanies this spec, DEF-027 and own queue row; local only, no push.
- Spec first; [handoff](../handoffs/US-A001-user-management-codex.md).
- Related defects: DEF-026's cell-only mutation rule and reproduced DEF-027 stale authorization reads.

An admin can search accounts, grant or remove a role, and send the ordinary
password reset link. The admin never receives a password or reset token. Claude
owns the Admin page tab. All existing routes and public reset responses stay compatible.

## Decisions (confirm or change)

Alex (2026-10-11): Admin page user management, search, role change and reset mail.
Lead: substring search of display name/email ignoring case, 50 sorted results and
the unbounded match count. Roles are student, teacher and admin. No self-role
change, including a same-role request; another user's same role is a read without
a write. New permissions apply on the next request using the existing session.
Demoted teachers retain owned courses but cannot author them. No ownership transfer.
Admin reset requests share the account's three stored mail slots per rolling hour.
Account deactivation and role-change auditing remain open in US-A001.

Implementation: expose repository listing and add updateRole, writing only Sheets
column E (RAW). Memory also preserves password, status, identity and enrollments.
Reuse existing authentication/requireAdmin before target lookup or validation.
Search is trimmed, limited to 100 characters, with malformed/repeated query values
rejected as 400. Sort by display name with an id tie-break for stable pagination;
this is a bounded list, not a pagination feature. Return an explicit six-field DTO.
Role mutations invalidate in-flight local reads; authentication requests a fresh
store snapshot per request, bypassing pre-revocation reads even on another instance. No session rewrite or browser push is added. The self-role
rule prevents ordinary self-demotion; it is not a distributed last-admin CAS
invariant against simultaneous mutual demotions across admins/instances.

Extract shared reset issuance from passwordResetRoutes into a focused module,
reusing the injectable clock/id options, mail sender, hashed tokens and credential
fingerprint. Reserve pending, send the exact existing plain text mail, then activate.
A failed or uncertain provider send leaves an unusable pending slot that still
counts toward the limit. Existing public status/error shapes stay unchanged.
Admin storage failures use a safe message-only 503; provider failure uses the exact
mail-unavailable 503. Neither route logs credentials or tokens. Local sender output
continues to follow its explicit local-mail contract; tests use a silent recorder.

## API, storage and compatibility

All new routes are admin-only and also accept the /api prefix. Every response,
including denial, malformed JSON and storage failure, carries Cache-Control: no-store.
Existing protected 401 without a valid session; student/teacher 403
`{ message: "Admin access is required" }` without user information.

User DTO, with no additional fields:
`{ id, email, displayName, role, status, createdAt }`.
Never return passwordHash or enrolledCourseIds.

| Route | Contract |
| --- | --- |
| GET /admin/users?search=text | 200 `{ users: User[], total }`; optional trimmed search, at most 100 characters; substring name/email ignoring case, at most 50 sorted users, total before limiting; empty result `{ users: [], total: 0 }` |
| PATCH /admin/users/:userId/role | Body `{ role }`; 200 updated User; same role 200 without a write; invalid value 400 `{ message }`; 404 `{ message: "User not found" }`; own role 409 `{ message: "You cannot change your own role.", code: "own-role" }` |
| POST /admin/users/:userId/password-reset | No body; 202 `{ message: "A reset link was sent to <email>." }`; missing 404 User not found; inactive 409 account-inactive; shared limit 409 reset-limit; unavailable/failed mail 503 exact existing mail message |

Inactive: `{ message: "This account is not active.", code: "account-inactive" }`.
Limit: `{ message: "This account already received three reset mails in the last hour.", code: "reset-limit" }`.
Mail: `{ message: "We could not send email right now. Please try again later." }`.

No schema migration or new store. Reuse Mongo/memory reset storage and Sheets/memory
AuthRepository. Role updates touch E only; enrollments H only and passwords D only,
including overlapping writes that read old snapshots. Existing reset checks,
60-minute expiry, signup password policy, single use, account notice, sibling
cancellation and credential binding apply identically to admin-issued links.
Cross-store uncertain activation/write behavior retains the existing reset limitations.

## Behavior contract

```gherkin
Feature: User access administration
  Scenario: US-A001-AC01 Grant teacher access
    Given I am an admin viewing an active student account
    When I grant teacher access through the administration flow
    Then the persisted role becomes teacher
    And subsequent requests with that user's existing session use the new permissions
  Scenario: US-A001-AC02 Deny unauthorized administration
    Given I am a student, teacher or anonymous caller
    When I request any admin user route
    Then the API denies access without user data or a mutation
  Scenario: US-A001-AC03 Search and project users safely
    Given more than 50 accounts with names and email addresses
    When an admin searches by a mixed-case name or email fragment
    Then at most 50 name-sorted six-field users and the total match count are returned
    And an absent search lists the first 50 and an unmatched search returns an empty list
  Scenario: US-A001-AC04 Validate and preserve role changes
    Given an admin changing a role
    When the role is invalid, the account is missing or the account is their own
    Then the agreed 400, 404 or own-role 409 is returned without a write
    And repeating another account's role returns 200 without a write
    And concurrent enrollment/password changes preserve every independent field
  Scenario: US-A001-AC05 Send an ordinary recovery link
    Given an active target account and configured local recorder
    When an admin sends a password reset
    Then the exact ordinary reset mail/link is sent and its token expires in 60 minutes
    And use changes login once, cancels sibling links and sends the same account notice
  Scenario: US-A001-AC09 Observe revoked access across instances
    Given a second API instance holds a pre-revocation Sheets user snapshot
    When another instance completes demotion or the stored account is disabled
    Then the account's next request cannot share the earlier authorization snapshot
    And it receives the current 403 or 401 using the existing session
  Scenario: US-A001-AC06 Share limits and fail safely
    Given missing/inactive/limited accounts or failed provider/storage
    When an admin sends a reset link
    Then the agreed 404, account-inactive 409, reset-limit 409 or safe 503 is returned
    And the public and admin requests share three rolling-hour mail slots
    And a failed send leaves no usable token and exposes no private diagnostics
```

## Frontend and accessibility

Claude owns the Admin tab, search loading/empty/error states, role confirmation,
reset feedback and keyboard/focus checks. No frontend changes are part of this API
assignment. Combined hosted/browser acceptance remains a release check.

## Implementation checklist

- [x] Read handoff, confirm branch/ancestor, spec first and select own queue row.
- [x] Add isolated HTTP RED for all admin routes and repository RED for role-cell writes.
- [x] Extend listing/role repositories, shared reset issuance, route registration and headers.
- [x] Pass focused HTTP/Sheets overlap and existing reset/change-password regressions.
- [x] Update architecture, retain status/audit scenarios in backlog and obtain read-only review.
- [x] Run five required checks.
- [x] Fresh version, scoped local implementation commit.
- [x] Record commit/evidence in queue/spec with fresh delivery-record version; stop, no push.

## Verification and delivery

| Scenarios | Evidence | Result |
| --- | --- | --- |
| AC01/04 | Memory/Sheets role projection and old-session permissions; E/H/D overlap including actual reset confirmation | Pass |
| AC02/03 | Both-prefix HTTP denial before target lookup, exact projection, search/limit/order/total and no-store | Pass |
| AC05/06 | Shared ordinary mail, hash/60-minute/single-use/notice, public/admin and overlapping three-slot limits, provider/storage failures | Pass |
| AC09 / DEF-027 | Six two-instance HTTP demotion/disabled-account cases with held prior snapshot | Pass |

Required: npm run api:test, npm run verify:journeys, npm run api:build,
npm run app:test, npm run app:build:pages. No api/dist rebuild except the final API
build. No shared providers, real mail, servers on 3001/4200, branch/worktree or push.
Real Sheets/Mongo/Brevo and hosted/browser/tab/keyboard flow remain unverified.

Initial RED: 87 failures for missing routes/repository methods and no-store headers.
The first implementation run passed 219 cases and failed two malformed bracket-search
cases; explicit scalar-query validation repaired them. Final focused run: 223 cases
pass across admin users, public reset, signed-in password and password-update files.
This includes an actual HTTP reset confirmation completing while an E-cell role
write is paused and an H-cell enrollment completes, preserving all three changes.

Review reproduced DEF-027: six deterministic HTTP assertions returned 200 instead
of the expected 403/401 after a completed role/status change on another instance.
Fresh session authentication closes the teacher/admin/disabled snapshot cases on
both prefixes. This deliberately costs one Users read per authenticated request.
The route budgets remain me=1 and course read routes=2; the simulated 20-reader
burst measured 22 reads (20 fresh Users plus two shared catalog reads), instead of
the earlier shared-auth ceiling. Catalog/content coalescing and shared clients stay.
The historic US-P006 spec is outside this assignment's ownership; the queue requests
an append documenting this new budget/freshness decision without rewriting history.

## Final local verification (2026-10-11)

- Focused: 253 cases in six files pass; includes 95 admin-user cases.
- npm run api:test: 908 tests in 40 files, pass.
- npm run verify:journeys: six journeys, pass.
- npm run api:build: pass; the only api/dist rebuild in this task.
- npm run app:test: 258 tests in 33 files, pass; existing jsdom scrollTo notices.
- npm run app:build:pages: pass; three existing component stylesheet budget warnings
  and Pages fallback created.
- Independent read-only review: no remaining important findings; separate 95-case
  admin test run also passes after DEF-027 repair.

Checks ran on Claude's frontend commit b14e307 plus this API working tree. Claude's
files are preserved. US-A001 remains Proposed only for account status AC07 and
role auditing AC08; delivered AC01/02 and implementation rules are in this spec.
No shared spreadsheet, Mongo, Brevo or real mail; actual provider contention and
durability, hosted Admin tab/browser/keyboard and live Sheets quota impact remain
unverified. Outside-owner follow-up: append a US-A001/DEF-027 budget note to
docs/specs/US-P006-class-load.md stating 20 fresh auth reads plus shared catalog
reads (22 observed); preserve the older four-read historical evidence and clarify
that auth reads now bypass prior snapshots. Queue carries that exact request.
Local commits only; no branch/worktree, push or deployment.

## Frontend acceptance and lead correction (2026-10-11)

Frontend delivered in `b14e307` (0.1.140). The selected scope (search, role change, reset
link) is Done locally; account status and auditing stay Proposed in US-A001.

| Scenario | Check |
| --- | --- |
| US-A001-AC01 | `admin-page.spec.ts` (list and search with the session; the total when more match than are shown; a role change after confirmation shows the stored result; a cancelled or refused change puts the old role back; the admin's own role is not offered). Browser, in-memory API, demo admin on Admin, User management: three users listed, the admin's own role disabled; searching "STUDENT" left Student Demo; before the change the learner's existing session got 403 creating a course; the admin changed the role to Teacher after the confirmation question and saw "Student Demo is now Teacher."; the same learner session then got 201 creating a course |
| US-A001-AC02 | Browser: `GET /admin/users` answered 401 without a session and 403 `{ "message": "Admin access is required" }` for a non-admin, with no user in the body |
| Reset link | Same spec (confirmation, the API's sentence, a failure in plain words; no button for an account that is not active). Browser: "Send reset link" asked first, showed "A reset link was sent to student@qi-education.local.", and the API printed one reset mail to that address |

Lead correction to DEF-027's fix, in the lead-check commit. The fix made every authenticated
request read the users sheet on its own, so a burst of 20 readers cost 20 user reads. That
gave up the sharing US-P006 depends on to stay inside the Sheets quota when a class opens a
course together. `InFlightRead.runFresh` now gives both: a read that starts after the caller
arrived (so no request can use a snapshot from before a role change or deactivation), shared
by every caller that arrives while one read is in flight (two reads per burst, not one each).
The six DEF-027 cases still pass unchanged; `platformLoad.test.ts` again requires fewer than
20 user reads for 20 readers; `inFlightRead.test.ts` covers the helper.

Decisions taken by the lead (confirm or change): both actions ask for confirmation; a role
change is saved at once, without a Save button; at most 50 users are shown.

Combined tree: 912 API and 258 frontend tests, six journeys, API and Pages builds pass.
Not verified: the real users sheet (the role cell write, the read count under a real class),
a real reset mail from this button, a screen reader, phone width.


## Account status and change log increment (AC07/AC08), 2026-10-11

State: Done locally, implementation d81933e (0.1.153), 2026-10-11.
Delivery record is this commit with the hook-required fresh aligned version. Codex API/storage;
main/base 5bc4ed4 confirmed; concurrent Claude frontend commit 3306233 preserved.
Spec appended before implementation. Claude owns the Admin page/frontend; preserve
its concurrent files and commits. [Handoff](../handoffs/US-A001-status-and-change-log-codex.md).

### Decisions (confirm or change)

Alex: administrators deactivate/reactivate other accounts, existing sessions are refused
on the next request, and only admins read the permanent log of role/status changes.
Lead: active/disabled only; self-status changes refused, including an unchanged value.
Self-protection does not prevent two admins simultaneously disabling/demoting each other.
Change first, log second; failed log writes preserve successful account changes and emit
one constant diagnostic line without personal data. No backfill or retention expiry.
Capture actor/target names and target email at the time of change, never join current names.

Implementation decisions: extend AuthRepository.updateStatus(userId, status), preserving
all other fields and writing RAW F only in Sheets. Existing role/status methods keep
their AuthUser return; new updateRoleWithChange/updateStatusWithChange return
{ user, previous }, with previous null for no actual write. Log uses the adapter
read which actually supplied the mutation, not an earlier route lookup. Reuse fresh security reads and existing
no-store/admin authentication. Serialize role/status read-change-log by target inside each
API instance so overlapping identical requests do not create duplicate entries. No new
cross-instance compare-and-swap or last-admin guarantee. UserChangeRepository exposes
append(Change) and recent(): newest first, at most 50, with detached snapshots. Store
Mongo documents in <MONGODB_COURSE_CONTENT_COLLECTION>_user_changes with majority insert
acknowledgment, no TTL/delete/backfill. Hosted uses configured Mongo and refuses log reads
when unavailable; local/test uses memory, including opted-in nonhosted local runs as this
increment's contract requires. Inject repository, clock and identifier generator into the
server. Login alone additionally requests a fresh findByEmail read (DEF-032),
using the existing coalescer rather than a pre-change list read. Keep the existing
instructor/reset and every unrelated route wiring unchanged.

### Contract and numbered scenarios

User remains exactly { id, email, displayName, role, status, createdAt }. All errors are
message-only except agreed self-protection codes. Both new routes support /api; no-store
on successes, denials, malformed JSON and errors. No token/password/hash/enrollment in logs
or output. The disabled-login behavior is the explicit change to existing auth responses:
wrong password and disabled account both return the same generic 401 message. Reactivation
restores the old still-valid session and login. It does not renew expired sessions.

| Route | Contract |
| --- | --- |
| PATCH /admin/users/:userId/status | { status: active or disabled }; 200 safe User, same status without write/log; invalid 400 message; missing 404 User not found; own 409 { message: "You cannot change the status of your own account.", code: "own-status" } |
| GET /admin/users/changes | 200 { changes: Change[] }, newest first, at most 50; [] when none; safe message-only 503 if log store unavailable |
| PATCH /admin/users/:userId/role | Existing request/response unchanged; append Change only for actual role mutation |

Change = { id, at: ISO UTC time, actor: { id, displayName }, target: { id, displayName,
email }, field: role or status, from, to }. Explicit output projection hides Mongo _id or
any extra stored fields. No direct Spreadsheet audit column or schema migration.

```gherkin
Feature: Account status and permanent administrator change log
  Scenario: US-A001-AC07 Disable and reactivate another account
    Given an admin and another active account with an existing session
    When the admin changes its status to disabled
    Then the API returns the agreed safe User with disabled status
    And its next authenticated request is 401 and login matches a wrong-password failure
    When the admin reactivates it
    Then both existing-session requests and correct-password login work again
  Scenario: US-A001-AC08 Trace actual role and status changes
    Given an admin changes another account's role or status
    When the account write succeeds
    Then one permanent Change stores the actor and target names at that time
    And admins read at most 50 newest entries, with no hashes or enrollments
  Scenario: US-A001-AC10 Validate and protect account status
    Given an admin status request
    When the value is invalid, target missing, or target is the caller
    Then agreed 400, 404 or own-status 409 is returned without account/log writes
    And repeating another account's current status returns 200 without account/log writes
  Scenario: US-A001-AC11 Deny status and change-log access
    Given a student, teacher, anonymous, expired or malformed session
    When requesting either new route
    Then existing 401/403 is returned before target lookup or log read, with no user/change data
    And all responses retain no-store, including malformed bodies and store errors
  Scenario: US-A001-AC12 Preserve concurrent independent account writes
    Given a held Sheets status write and concurrent enrollment, role change and password reset
    When all writes finish
    Then only F, H, E and D respectively changed, and every independent update remains
    And status writes invalidate prior local auth snapshots
  Scenario: US-A001-AC13 Log after success without undoing it
    Given a log store which fails or an account write which fails
    When an admin changes an account
    Then a successful account write stays successful despite log failure with one safe warning
    And a failed account write gets safe 503 and no log entry
    And overlapping identical changes within one instance have one write and one log entry
```

### Implementation plan and evidence ledger

- [x] Confirm branch/ancestor/shared edits, append spec and select queue row.
- [x] RED: disabled login disclosure; DEF-031 confirmed and appended before fixing.
- [x] RED: status/role logging HTTP, permissions, validation, session/login round trip,
      ordering/50/snapshots/failures/concurrency; Sheets F/H/E/D overlap; Mongo adapter doubles.
- [x] Implement userChangeRepository.ts and status-cell method; integrate only admin routes
      and new dependency, plus generic disabled login. Pass focused/new and existing regressions.
- [x] Update architecture/backlog, independent read-only review; run five required checks.
- [x] Fresh aligned version and scoped implementation commit, then record hash/evidence/limits
      in this spec and own queue row with a hook-required version; stop without push.

No live provider or shared data probes, real mail or ports 3001/4200. Use synthetic rows,
Mongo collection doubles and ephemeral loopback HTTP. No .env inspection necessary. Live
Sheets/Mongo durability, log failure monitoring, hosted/UI and keyboard acceptance remain
release checks. Nontransactional account/log writes can leave an unlogged change after a
log failure or crash; no repair/backfill feature is promised. No outside file need identified.


### AC07/AC08 verification, 2026-10-11

| Scenarios | Isolated evidence | Result |
| --- | --- | --- |
| AC07 / DEF-031 | Normal and /api status round-trip in memory/Sheets doubles, old sessions, login aliases, generic disabled 401 | Pass |
| AC07 / DEF-032 | Four held old-read/two-instance disable/reactivate login cases; login now opts into fresh reads | Pass |
| AC08/AC13 | Exact snapshots, renames, role/status no-ops, latest 50/empty/permanent history, safe append failure and accurate adapter mutation metadata | Pass |
| AC10/AC11 | Invalid inputs, own-status/no-op protection, 404, all roles/anonymous/bad/expired tokens, no-store and safe 503/malformed JSON | Pass |
| AC12 | Actual reset confirmation and independent H/E/D writes while F is held; all fields preserved; memory/Sheets metadata/no-op and refreshed reads | Pass |

All five required checks pass on main/3306233 plus this implementation:
api:test **1055 tests / 46 files**; verify:journeys **6**; api:build; app:test
**269 / 34**; app:build:pages and generated SPA fallback. Existing style budget,
test-setup type-check and jsdom scrollTo warnings remain. No failed frontend check,
frontend fix or integration probe. api/dist rebuilt only by final api:build.

TDD record: DEF-031 first failed twice (disabled login 403 vs 401), then appended
as Confirmed before repair. Initial route RED: 48 failed, four already-passing
characterization cases, six overlap cases skipped until methods existed. Status
repository RED: six missing-method failures; new log repository module absent.
First focused GREEN: 173 existing/new cases. Review identified stale login and
route-vs-adapter mutation metadata; ten added assertions failed before correction
(four DEF-032, six audit cases). DEF-032 appended before repair. Updated overlap
assertions count actual mutation outcomes, not repository invocations. The final
suite includes **92 new cases**, plus all existing admin/reset/journey regressions.

Independent review found no remaining material issues after the two corrections;
final four overlap checks independently pass. Protected sessions continue using
existing fresh findById reads; only login adds fresh findByEmail. Role/status change
metadata comes from the adapter's actual read/no-op result. Sheets still lacks
cross-instance CAS: an external write after that read can race the eventual write,
so exact concurrent audit linearization/last-admin preservation is not promised.
Actor/target fields are explicit snapshots; repository return metadata never enters
HTTP/log storage directly, and no password hash is stored or exposed there.

DEF-031/032 are Fixed locally in d81933e; append-only resolutions retain their
original reproduction bytes and record regression and release limits.
AC07/AC08 are removed from the open story list. No outside-owned file is needed.
Real Sheets behavior, Mongo acknowledgment/durability, hosted/UI/keyboard acceptance
and log-failure monitoring remain unverified. A successful change can be unlogged
on append failure or crash; simultaneous mutual admin disable/demotion remains the
agreed limitation. No shared provider, real mail, .env inspection, push or deployment.

Codex stopped after the scoped delivery-record commit. No push or deployment.

## Frontend acceptance of status and change log (2026-10-11)

Frontend delivered in `3306233` (0.1.152). US-A001 is Done locally and out of the open backlog.

| Scenario | Check |
| --- | --- |
| US-A001-AC07 | `admin-page.spec.ts` (Deactivate and Reactivate after confirmation, the stored result shown, a refusal reported, a cancelled question sends nothing, the own account not offered). Browser, in-memory API, demo admin: the admin's own Deactivate button was disabled; deactivating Student Demo asked first, showed "Student Demo is now deactivated." and the label "Deactivated"; the learner's existing session then answered 401 and their login answered 401 "Invalid email or password", the same as a wrong password; reactivating asked first and the login answered 200 again |
| US-A001-AC08 | Same spec (changes in plain words with their time, reloaded after a change, no section when there is nothing to show or the log cannot be read). Browser: "Recent changes" was absent at first and then listed, newest first, the deactivation, a role change of Teacher Demo and the reactivation, each with actor, target, old and new value and time |

Decisions taken by the lead (confirm or change): a deactivated account is labelled
"Deactivated"; the log sits under the user list and shows the 50 newest entries the API
returns; no filter or export.

Also delivered with this increment at Alex's request, outside the story:

- The profile menu closes on a click outside it and on Escape, which returns focus to its
  button (`profile-menu.ts`, case "closes on a click outside and on Escape"). Browser, real
  clicks: opened, clicked an empty part of the page, closed; opened, Escape, closed.
- A disabled shared button is dimmed (`app-button.scss`); before, it only changed the cursor,
  so the admin's own Deactivate button looked usable. This applies to every disabled
  `app-button` except the login button, which has its own disabled colour.

Combined tree: 1055 API and 269 frontend tests, six journeys, API and Pages builds pass.
Not verified: the real users sheet and MongoDB (status cell write, the log surviving a
restart), hosted behavior, a screen reader, phone width.

## Hosted check by Alex and the in-app confirmation (2026-10-11)

Reported by Alex from the live site on 0.1.155: deactivating a user works (seen: a row
labelled "Deactivated" with Reactivate offered and "Send reset link" disabled). His one
remark: the confirmation was the browser's own dialog and should be part of the interface.

Delivered by the lead in the following commit:

- `ConfirmService.ask({ title, message, confirmLabel })` and one `<app-confirm-dialog>` at the
  app root (`app/src/app/services/confirm.service.ts`, `app/src/app/ui/confirm-dialog/`). It
  follows the feedback dialog's keyboard contract: focus starts on Cancel, Tab stays between
  the two buttons, Escape and a click outside decline, and focus returns to the control that
  asked.
- The four confirmations of the Admin page use it: deactivate and reactivate, role change,
  send reset link, and clear an instructor description.

Evidence: `confirm-dialog.spec.ts` (three cases) and `admin-page.spec.ts` (the questions and
both answers). Browser, in-memory API, demo admin: Deactivate opened the dialog with focus on
Cancel; Cancel and Escape left the account unchanged and returned focus to the button;
Deactivate in the dialog deactivated it; the role question, cancelled, put the old role back;
the reset question sent the link; Reactivate reactivated. The browser's own dialog was never
called. 272 frontend tests and the Pages build pass.

Still using the browser's own dialog, not changed here: the three questions of the career
path editor (withdraw, load latest, discard) and the two of the course editor (discard
unsaved changes, use the latest saved version). The page-leave warning of the browser tab
cannot be replaced by a page.
