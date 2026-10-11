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
