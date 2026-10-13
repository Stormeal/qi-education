# Application architecture

Updated 2026-10-09 through US-T003/US-T005, delivery `d674ee3`, base `5211365`.
The core map describes the current implementation; desired changes live in
[user_stories.md](user_stories.md) and `specs/`. Release verification is separate.
The career path section was checked again on 2026-10-05 at `9a2f30b` plus
unfinished lifecycle work. Access was delivered in `a6767f6`; see
[work_queue.md](work_queue.md) for subsequent delivery and verification records.

## Career path and account progress boundary — checked 2026-10-10

Career paths have published revisions, admin drafts, one selection per account,
and required-step progress derived from current course completion. The roadmap
and Home show the next available required course; switching asks for confirmation.
See [the career path spec](specs/US-L009-L012-T008-career-paths.md) for those deliveries.
Path references never enroll a learner or grant learning access. Public reference
titles use live published metadata or the curator's published label, never a
private draft or archived course's current metadata.

US-A003 adds admin withdrawal (`POST /admin/career-paths/:id/unpublish`): public
reads hide the path, while its draft, revision and learner selections remain.
Republishing restores the path without altering course completion or enrollment.
Save, publish and withdrawal optionally compare `X-Expected-Updated-At`; a stale
nonempty token returns 409 `{ message, code: "CAREER_PATH_CONFLICT" }` without a
write. Missing/empty tokens keep successful last-save-wins behavior. Unsaved
seeds have no version; nonempty fictional versions conflict, while legacy saves
and direct publication remain supported. CORS reflects the new header.

The path repository allocates and returns each persisted ISO updatedAt, strictly
advancing from the current stored timestamp even under a fixed/backward clock.
Mongo conditional replacement filters by `_id` plus updatedAt with no upsert
and majority acknowledgment. Legacy writes internally retry comparisons, and
concurrent first creations retry unique `_id` collisions, so overlapping legacy
clients cannot reuse a token and conceal edits from a protected editor. Memory
comparison/allocation/replacement does not yield. Actual provider contention
and durability remain release checks; see [withdrawal](specs/US-A003-career-path-withdrawal.md).

`LearningProgressService` keeps synchronous completion readers/mutations and its
email/course localStorage arrays. New routes persist a union per authenticated
account/course. Restoration starts on course loading or a direct roadmap
`forContent` read, with network/signal work deferred outside computed calculations.
Account IDs merge into local memory/storage; writes add single lessons atomically.
Off-page legacy IDs go directly to the authoritative API without an outline
prerequisite. Failures retain completion; transient failures retry with bounded
backoff. Reset aborts requests/timers and clears the context; every reply checks
the initiating account/token and context before updating signals or storage.

Resume selects the first incomplete current component. Percentages count unique
current IDs, ignore stale/duplicate records, require all lessons for 100%, and
leave empty courses at 0%. Mark complete/video-ended triggers are unchanged.
The new grading route saves passing evidence before returning success, but only
Finish quiz saves its completion. The save route requires a fingerprint for the
current quiz. Legacy quiz IDs remain local until a new verified passing attempt.
The previous grading route remains unchanged for existing clients. MongoDB
stores account/course sets beside career paths; without configuration the
repository is in-memory. Real Mongo and hosted two-device checks remain pending.
US-L003 adds private account-profile persistence for bio, job title, company,
learning goals and avatar color; browser caching/restoration is owned by the
profile service. Public instructor descriptions remain separate.

Selection preserves atomic last-committed-write-wins replacement. Its unchanged
DTO identifies the chosen path, path revision and selection timestamp; GET reads
the current outcome. A retried PUT reasserts its choice, including after another
device's intervening choice. There is no compare-and-swap rejection in the
existing client. See [account progress](specs/US-L002-account-progress.md).

See the [career path audit](audits/2026-10-05/career_path_audit.md) for evidence,
suggested boundaries, outstanding decisions, and delivery dependencies.

Home's unfinished Adjust track control and workspace Q&A/Notes tabs are hidden.
The existing course overview remains readable without a fake tab button. Full
career/Q&A/Notes behavior remains Proposed. Catalog cards size to their content;
full titles and badges wrap within featured and list cards at responsive widths.
A category is explicit metadata, not inferred from other populated fields. Empty
legacy category cells retain Uncategorized. Seven published category cells were
corrected with the user's explicit approval on 2026-10-09; no schema/ownership
migration accompanied that repair. See [verification](verification/2026-10-09/remaining-defects.md).

## Purpose and implemented journeys

QI-Education is an npm workspace with an Angular 21 frontend and an Express 5 /
TypeScript API. Node 22 is the repository's configured runtime.

| Journey | Current capabilities | Important limitations |
| --- | --- | --- |
| Account | Student signup, login, remembered session, role permissions; account email, hashed single-use password reset and signed-in password change API | Existing sessions survive password changes; shared-store concurrency and new profile/browser flow remain release checks; missing hosted user store disables auth |
| Teacher | Create a draft, author owned courses, text/resources/quizzes/video, thumbnails, quiz readiness, private revisions and full review history | Legacy unowned courses require admin editing |
| Admin | Authoring, price/catalog fields, feedback triage, user search/role/reset/status and recent change log | Feedback triage may create a real GitHub issue |
| Learner | Catalog filters/sort/search, details, enrollment, library, learning workspace | Published-only enrollment; no payment system or persisted quiz attempts |
| Progress/profile | Account completion union/cache; selected paths, roadmap/Home milestones and next-course guidance; private account profile and separate public instructor description APIs | Legacy quizzes need fresh passing evidence; hosted Mongo and combined profile browser checks pending |

Statuses are `draft`, `ready-for-review`, `published`, and `archived`. Explicit
review actions enforce transitions. One private working revision may coexist with
a published or archived live snapshot. Submission freezes authoring; admin return
requires a reason; publication replaces live metadata, lessons and thumbnail
pointers atomically while preserving enrollment. Archive retains existing access. US-T001 adds
stable owner IDs and owner/admin authorization before authoring side effects.
The UI uses those IDs for draft filtering, Edit actions, and direct editor entry.

## Boundaries and flow

```text
Angular routes -> page/UI components -> AppStateService + focused services
  -> ApiClientService / attachment XMLHttpRequest
  -> Express createServer() -> repository interfaces
  -> Google Sheets (accounts/course metadata/feedback)
  -> MongoDB (course content/binary assets)

Video: browser -> Mux direct upload -> signed webhook -> course content repository
Feedback: admin triage -> GitHub service -> feedback repository stores issue link

US-P003 coordinates selected writes within each `createServer` instance using
separate keyed serial queues: normalized email for signup's complete existence
check/create, user ID for enrollment's complete repository read/modify/write,
and feedback ID for triage's read/create/save. Queues release after success or
failure and do not serialize unrelated keys; existing course locks still apply.
The coordination covers both Sheets and memory repositories without changing
their interfaces or other routes. No new uniqueness/update guarantee exists
across instances. Distributed coordination and restart recovery remain open
decisions in [safe retries](specs/US-P003-safe-retries.md).
```

No current backend `routes/`, `repositories/`, `models/`, or `services/` subdirectories
exist. The implementation is flat under `api/src/`. Those folders are potential
future organization, not paths a fresh contributor can navigate today.

## Frontend map

| Path | Responsibility |
| --- | --- |
| `app/src/app/app.routes.ts` | Lazy routes; unsaved-change `canDeactivate` guards on new/edit course routes |
| `app/src/app/routes/` | Thin wrappers bind shared state to pages and session/login states |
| `app/src/app/pages/` | Login, dashboard, catalog, course/editor, library, profile, admin, terms |
| `app/src/app/ui/` | CourseBuilder, header, profile menu, feedback dialog, skeletons/buttons |
| `app/src/app/app.models.ts` | Shared frontend types and catalog constants |
| `services/app-state.service.ts` | Signals, session/navigation, authoring drafts, uploads, feedback |
| `services/api-client.service.ts` | Fetch, response cache, base URL selection/fallback, 401 notifications |
| `services/course.service.ts` | Course requests, thumbnail warmup, attachment XMLHttpRequest |
| `services/learning-progress.service.ts` | Account completion union/retry, local cache, synchronous current-outline summaries and session boundaries |
| `services/auth.service.ts`, `session.service.ts` | Auth requests and stored token/session restoration |
| `services/profile.service.ts` | Private profile account API and user-ID browser cache; instructor description has separate account API storage |

Routes: `/`, `/courses`, `/courses/new`, `/courses/:id`, `/courses/:id/edit`,
`/library`, `/library/:id`, `/profile`, `/admin`, `/terms`. Unknown routes redirect
to `/`. Authentication views are rendered by route wrappers rather than a separate
`/login` route.

`AppStateService` is approximately 2,900 lines and handles many unrelated concerns.
Changes need a full data-flow check; avoid a wholesale refactor as a side effect of
fixing one story. Draft saves compare JSON snapshots. Loaded content normalizes
legacy quiz structures. LearningProgressService centralizes account completion
and the browser cache; new progress routes preserve existing clients/course routes.

Course navigation compares metadata/content snapshots and focused builder buffers.
Native confirmation protects links, Cancel, Back, editor-ID changes and voluntary
logout; beforeunload protects refresh/external departure. Declined navigation keeps
the editor and restores the canceled browser history position; forced session
expiry clears private state. Metadata initializes before
thumbnail warmup and once per editor path. Successful partial metadata saves advance
their snapshot. Unchanged Markdown text keeps its original storage representation.
Device-local authoring drafts include metadata, outlines and focused text, scoped
to the authorized account/course and a fresh document UUID. Returning offers a
Restore/Discard choice (with a title/date selector when several drafts exist). Records
expire after seven days and are bounded to 2 MB; storage failures are reported.
Confirmed saves or explicit discards clear the corresponding record. Stale recovery
requires manual comparison/reconciliation. Pending recovery blocks editing/review.
Background media refresh retains dirty outlines and focused buffers. Outline controls
remain busy through media writes to prevent response replacement of newer edits.
Nested library routes load catalog metadata
and entitled content after restored session identity/permissions have been applied.

The API client selects a configured `window.qiEducationConfig.apiBaseUrl` first.
GitHub Pages calls the hosted Vercel API. On other hosts it tries local port 3001
then the hosted API after a network failure for reads. On loopback frontends
(localhost/subdomains, 127/8 and IPv6 loopback), methods other than GET/HEAD
attempt only a loopback API, including configured overrides. They never replay
to the hosted fallback. Local network failure or a remote mutation override
returns a client-generated 503 JSON message through existing caller error paths,
so signup/save/enrollment display local API guidance and retain unsaved work.
Deployed hosts and GET/HEAD fallback retain their previous behavior. See
[safe operation](specs/US-P008-safe-operation.md).
Course responses use private/no-store and Vary: Authorization. Successful thumbnail reads whose string `v` equals the ID of the asset actually served use `private, max-age=31536000, immutable` for browser caching; unversioned reads, 404s and errors retain private/no-store. The `/api` alias follows the same policy; access checks and other routes are unchanged, and nothing is public-cacheable. The client honors no-store. Private thumbnails use authenticated blobs revoked on logout. Course response guards use session identity, route, and operation generation; stale 401s cannot end a newer session. Session restoration/enrollment reset pending loaders before applying the updated session. Other successful JSON responses retain explicit invalidation and no TTL.

## API map and current access

Most routes also work with `/api` through prefix normalization. Raw uploads and
Mux webhooks register explicit aliases before JSON middleware.

| Routes | Current permission |
| --- | --- |
| `GET /health`, `/health/config`, `/health/auth`, `/health/content` | Public diagnostic routes |
| `POST /auth/login`, `/auth/signup` (also `/login`, `/signup`) | Public |
| `POST /auth/password-reset/request`, `/check`, `/confirm` | Public; both normal and /api prefixes; no-store; 202 privacy-preserving request (400 invalid email, 503 mail unavailable), 204 check/confirm, 410 reset-link-invalid, 400 signup password validation |
| `POST /users/me/password` | Active session, every role; no-store; current proof first, wrong current 400 current-password-incorrect (never 401), signup policy/different password 400, changed 204, invalid session 401, unavailable storage 503; notice failure is harmless |
| `GET /admin/users` | Admin only; no-store; optional trimmed <=100 name/email substring ignoring case; <=50 display-name sorted six-field users plus total before cap; 400 invalid search, 401/403 without user data |
| `PATCH /admin/users/:userId/role` | Admin only; no-store; student/teacher/admin, six-field User 200; same role no write/log, actual change logged, own-role 409, invalid 400, missing 404 |
| `PATCH /admin/users/:userId/status` | Admin only; no-store; active/disabled, safe User 200; same status no write/log; own-status 409, invalid 400, missing 404; deactivation revokes existing-session access on next request |
| `GET /admin/users/changes` | Admin only; no-store; newest 50 safe Change snapshots; empty array when none, safe 503 when log unavailable; no password/enrollment/document extras |
| `POST /admin/users/:userId/password-reset` | Admin only; no-store; ordinary shared reset link and three-mail limit; 202 target email, missing 404, inactive/limit 409, unavailable/failed mail 503; no password/token in response |
| `GET /auth/me` (also `/me`) | Active bearer session |
| `GET /users/me/profile`, `PUT /users/me/profile` | Active session, every role; own private account only; exact `{ bio, jobTitle, company, learningGoals, avatarColor, updatedAt }`; never-saved empty texts/default color/null timestamp; complete trimmed replacement, 400 validation/no write, 401 ordinary auth, safe 503 storage; private/no-store on both prefixes |
| `GET /users/me/instructor-profile`, `PUT /users/me/instructor-profile` | Active teacher/admin; own description only, trimmed string 0..280, empty clears; 200 `{ description }`; 400 invalid input, 401 invalid/missing session, 403 student |
| `GET /instructors` | Public; ignores bearer token; only `{ description, courseIds }` for non-empty descriptions owning published live courses; private/no-store |
| `GET /admin/instructor-profiles`, `DELETE /admin/instructor-profiles/:userId` | Admin; list only `{ userId, displayName, description }` for every non-empty stored profile; clear returns 204 even when absent; 401/403 otherwise |
| `GET /career-paths`, `/career-paths/:id` | Public published paths only; withdrawn detail is 404 |
| `GET /admin/career-paths`, `PUT /admin/career-paths/:id`, `POST .../publish`, `POST .../unpublish` | Admin; writes optionally reject stale updatedAt with 409 CAREER_PATH_CONFLICT |
| `GET /users/me/career-path`, `PUT /users/me/career-path` | Own goal selection; withdrawal retains selections without granting course access |
| `GET /courses`, `/courses/:id/thumbnail`, `/courses/:id/outline` | Public published metadata/title outlines; owner/admin private access; enrolled archived access |
| `GET /courses/:id/content` | Authenticated owner/admin or enrolled published/archived learner; learner DTO by default; owner/admin-only `?view=author` |
| `POST .../components/:componentId/quiz-attempts` | Same learning entitlement; server scoring without exposing unsubmitted answer keys |
| `GET /users/me/learning-progress`, `PUT /users/me/learning-progress/:courseId/lessons/:componentId` | Own account and entitled current lessons only; atomic union; quizzes require passing evidence |
| `POST /users/me/learning-progress/:courseId/components/:componentId/quiz-attempts` | Same server grading with account passing proof persisted before success; does not complete until Finish |
| `POST /users/me/courses/:id` | Active session; published-only new enrollment; published retry is idempotent |
| `POST /courses` | All roles create drafts; teachers use default admin fields; authenticated owner ID |
| `PATCH /courses/:id`, `PATCH /courses/:id/content` | Owner teacher/admin; editable working draft only; required loaded revision; no direct status/price changes |
| `POST /courses/:id/review` | Owner/admin start and submit revisions; admin return/publish/archive; loaded revision ID and version required |
| `PUT /courses/:id/thumbnail` | Owner teacher/admin; JPEG/PNG/WebP, 2 MB |
| `PUT /courses/:id/content/components/:componentId/attachments` | Owner teacher/admin; 4 MB; quiz accepts JPEG/PNG/WebP only, text/resources MIME rules unchanged, video upload unavailable |
| `GET /courses/:id/content/attachments/:assetId` | Owner/admin or entitled learner; asset must belong to the requested course |
| `DELETE /courses/:id/content/components/:componentId/attachments/:assetId` | Owner teacher/admin |
| `POST .../components/:componentId/mux-upload`, `DELETE .../mux-video` | Owner teacher/admin |
| `PATCH /courses/:id/price`, `/courses/:id/catalog-metadata` | Admin |
| `POST /feedback` | Active session |
| `GET /feedback`, `PATCH /feedback/:id/triage` | Admin |
| `POST /webhooks/mux` | Mux signature verification; no bearer session |

`server.ts` constructs/injects dependencies and contains the route handlers. Zod
validates input. Error handling returns `{ message }`, with `issues` for Zod errors;
parser callbacks preserve safe 400/413/415 responses for invalid JSON, oversized
bodies and unsupported/corrupt encodings. Application failures retain generic 500;
input bodies and internal errors are never echoed. Thumbnail MIME is checked
before the missing-body check, preserving unsupported-type 415 feedback.

Authentication uses salted scrypt hashes and an HMAC-signed JWT-shaped token with
a default 12-hour lifetime. Protected requests look up the active user again,
using their current stored role. Tokens are stored in browser storage by
`SessionService`; do not expose or commit them in audit evidence.

## Store mode boundary (US-P011)

`config.ts` resolves one API policy: tests are always isolated; otherwise production
or any defined VERCEL marker is hosted; other runs are shared only with exact
USE_SHARED_SERVICES=1 and isolated by default. Hosted ignores the opt-in. Isolated
configuration removes Google/Sheets, Mongo, Mux and GitHub settings before validation,
including aliases and invalid unused values. Auth secret, HTTP/CORS and mail remain.
Common presence helpers guard factories, including assets and webhook verification.
Tests also suppress the Brevo key and skip dotenv; provider doubles are injected.
No setting or process environment is rewritten.

All store factories select memory in isolated mode. Video/webhook services are
absent and GitHub feedback remains an unconfigured service which refuses issue creation.
Existing demo users/course and failed-login memory-storage header are unchanged. Shared
local mode selects configured existing adapters, including Mongo reset tokens. Missing
shared settings retain local fallbacks. Hosted auth, instructor profiles and reset
storage fail closed without required settings, including VERCEL without production;
other existing missing-setting fallbacks and signed-Mux rejection remain.

Startup prints one mode-only `Stores:` line. `/health/config` adds `mode` and retains
its other fields, routes and statuses. Doctor mirrors the small mode predicate without
requiring a TypeScript build, uses dotenv parsing and shell precedence, accepts missing
shared settings when isolated, and detects runtime mode mismatch. App-dev forwards an
explicit opt-in value unchanged. Mail still selects Brevo only for NODE_ENV=production;
a VERCEL marker alone does not change mail. See [local setup](local_development.md) and
[the verified contract](specs/US-P011-isolated-local-runs.md). Real hosted/shared readiness
remains a release check, separate from synthetic factory and HTTP verification.

## Persistence

Account email uses injectable `MailSender`, with Brevo fetch in production and
recorded complete stdout messages locally. Nonproduction never selects Brevo,
even with credentials present. Optional `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`,
`MAIL_FROM_NAME` (default QI-Education) and `APP_PUBLIC_URL` configure it. Missing
production settings refuse reset requests with the safe 503. `/health/config`
adds only `mail: { configured, provider }`, where configured checks the key,
sender and public app URL. Existing diagnostic fields remain unchanged. Provider
details, credentials and tokens never enter diagnostic logs or error responses;
complete local mail display is deliberate, and unavailable in production.

`passwordResetRoutes.ts` adds three routes without changing existing auth routes.
Reset links carry at least 32 random bytes in `/reset-password#token=...`; only
SHA-256 hashes are stored in per-user Mongo documents under
`<MONGODB_COURSE_CONTENT_COLLECTION>_password_resets`. Isolated/test factories
select memory despite configured Mongo; shared/hosted factories select configured
Mongo. Hosted without Mongo fails closed. Versioned compare-and-replace and unique
first-insert retries await
majority acknowledgment and enforce three stored mail slots per rolling hour
across instances. Pending slots cannot be checked/used, and become active only
after provider acceptance. Failed/uncertain sends retain their unusable slot until
expiry so an accepted mail with a lost response cannot bypass the limit. Active
and used tokens also count; tokens expire at exactly 60 minutes, and requesting a
new link does not invalidate older ones. Checks never consume tokens.

US-L013 extends confirmation: signup validation and scrypt are unchanged, but
claiming an active hash now cancels every pending/active sibling in the same CAS,
then calls `AuthRepository.updatePasswordHash`. New reservations carry a SHA-256
fingerprint of the salted credential (never the credential hash itself). Check and
confirm reject a fingerprint that differs from the account's current credential.
Confirmation rechecks status/credential after claiming and before writing, so a
late old-credential link claimed after a profile change cannot overwrite it.
Security reads request a fresh Sheets snapshot, bypassing older in-flight lookups;
ordinary reads retain their existing coalescing. Legacy tokens without a fingerprint
remain compatible until canceled, and postclaim comparison uses their preclaim
credential. An already claimed write cannot be retroactively stopped across stores.
Mongo and Sheets cannot share a transaction: a failed/uncertain password write
keeps all these links consumed; request a fresh link. At most one password write
occurs per token, and cancellation retains its rolling-hour mail slot.
Sheets updates only D (passwordHash); enrollment updates only H (enrolledCourseIds),
repairing DEF-026 where a late full-row enrollment write restored the old hash.
Memory preserves the other account fields; the unavailable user store refuses
updates. Notices contain neither password nor link, and failed notices do not
fail the change. The exact notice subject/text now live in a shared sender helper.
The new `changePasswordRoutes.ts` uses existing authentication, checks the current
password before new-password policy/equality, awaits cancellation before writing,
then attempts that notice once. Cancellation failure prevents the password write;
a failed or uncertain password write leaves canceled links canceled. Both change
routes invalidate unused recovery links; already signed sessions remain valid
until expiry. There are no current-password attempt limits (US-P008-AC02 remains
open). Existing login/auth and other route contracts/cache headers are unchanged.
See [signed-in password change](specs/US-L013-change-password.md). Provider failures
can answer 503 only for real active accounts, an accepted rare existence signal.
Storage failures return safe 500 messages. Client-address and confirmation-mail
limits remain open. See [reset](specs/US-L004-password-reset.md) and
[account mail](specs/US-P009-account-email.md) for tests and release limitations.

US-A001 adds `adminUsersRoutes.ts` and exposes `AuthRepository.listUsers` and
`updateRole`. Its six-field account projection excludes passwordHash and
enrolledCourseIds. Permissions precede all target lookups, search validation
and writes; authentication errors use the existing 401, student/teacher denial
is 403 with no target information. Scoped no-store middleware runs before JSON
parsing on both prefixes. Route-specific storage errors use safe message-only 503
without logging private provider details; existing other routes are unchanged.

Sheets role changes read the current account and write only E using RAW, then
invalidate in-flight local user reads. DEF-027 makes session authentication use a
fresh snapshot, so another instance cannot authorize a new request from a
pre-revocation read. Every authenticated request costs one fresh Users fetch;
non-security user/catalog reads retain coalescing. The isolated 20-reader burst
measured 22 Sheets reads (20 Users, two catalog), with unchanged one/two single-route
budgets. This supersedes the earlier shared-auth burst budget; hosted quotas remain
unverified. Password D and enrollment H writes preserve
roles even when they read an earlier snapshot. Same-role requests do not write.
Memory preserves independent account fields as well. Existing sessions use the
new role on their next request, without a new token or browser push. Demoted
teachers keep their courses but cannot author; no data is transferred/deleted.
Self-role and self-status changes are refused, including unchanged-value requests.
Simultaneous mutual admin demotion/deactivation is not protected by a distributed
last-admin CAS. US-A001-AC07/AC08 adds active/disabled transitions through admin routes.
Sheets status writes use RAW column F only; concurrent password D, role E and enrollment
H writes preserve every independent field. Existing sessions of disabled users get 401
on their next protected request, and login returns the same generic 401 as a wrong
password (DEF-031); reactivation restores access with a still-valid old token. Login
requests fresh findByEmail reads so it cannot share a snapshot begun before another
instance changed status (DEF-032); non-security email lookups retain coalescing.

`userChangeRepository.ts` stores role/status changes in the permanent
`<MONGODB_COURSE_CONTENT_COLLECTION>_user_changes` Mongo collection when hosted. The new
log's explicit contract keeps nonhosted local/test logs in memory, including opted-in
local runs. No TTL, spreadsheet audit column, migration or historical backfill. Hosted
missing Mongo returns safe 503 on log reads; account changes still stand when append
fails. Mongo inserts use the change id as _id and majority acknowledgment; recent reads
sort descending by ISO at/id and limit 50 without deleting older records. Memory returns
detached snapshots. Both storage and HTTP projections whitelist the exact Change fields:
id/at, actor id/displayName, target id/displayName/email, field/from/to. Renames do not
rewrite recorded names. No credentials, password hash or enrollment list is captured.

Role/status admin routes share an instance-owned keyed queue by target for read/change/log;
unrelated targets proceed independently. New adapter mutation results contain the actual
read-before-write snapshot, or previous=null for no write; the existing updateRole/status
wrappers still return AuthUser. Logging uses that result without a second route lookup,
so an adapter-observed no-op produces no entry and from reflects its actual input. Account persistence precedes append; successful
changes remain 200 on a log failure, with one constant warning containing no personal data.
A crash/log failure can leave an unlogged change; no reconciliation or cross-store
transaction is added. Cross-instance access mutations still lack compare-and-swap, so
concurrent decisions are last-write-wins rather than a distributed audit/last-admin
invariant. Existing role/reset/search DTOs and unrelated route wiring remain unchanged.
See the appended increment in [user management](specs/US-A001-user-management.md).

`passwordResetDelivery.ts` shares issuance between the existing public request
and the new admin action: identical random token, hash/fingerprint, pending slot,
plain text message/link, 60-minute lifetime, sender and activation. Public responses
retain their privacy-preserving 202; admins get a specific inactive/limit 409 and
202 target-email confirmation. Admin/public requests share the same stored three
slots across API instances. Failed/uncertain sends remain unusable pending slots;
activation/storage ambiguity keeps the established reset limitations. Existing
check/confirm, single use, sibling cancellation and account notice apply to either
issuer. See [user management](specs/US-A001-user-management.md).

US-T007 adds `instructorProfile.ts`, `instructorProfileRepository.ts` and
`instructorProfileRoutes.ts`. Only new dependency/route registration is added to
`server.ts`; existing routes and users spreadsheet fields are unchanged. Saving
publishes immediately without approval. Public output joins profile user IDs to
the reviewed live course catalog, excludes drafts/in-review/archived/unowned
courses, and never returns account fields or selects an author view. Admin output
resolves displayName through the account repository; orphan profiles retain an
empty displayName so they can be cleared. New routes have message-only errors and
private/no-store responses; authenticated operations vary on Authorization.

Mongo documents are `{ _id: userId, description }` in
`<MONGODB_COURSE_CONTENT_COLLECTION>_instructor_profiles`, following career-path
selection storage. Per-user atomic upserts and idempotent deletes await majority
acknowledgment; concurrent saves are last-committed-write wins. First-upsert `_id`
collisions get one replacement retry, with honest failure if its row vanished.
Hosted without Mongo configuration refuses new storage operations with 503.
Local/test memory stores return isolated snapshots. Real Mongo durability and
combined browser acceptance remain release checks; see the
[instructor description spec](specs/US-T007-instructor-description.md).

US-L003 adds `accountProfile.ts`, `accountProfileRepository.ts` and
`accountProfileRoutes.ts`; `server.ts` injects/registers this separate dependency
without altering existing route DTOs/statuses or the users spreadsheet. The only
new endpoints are GET and PUT `/users/me/profile`, with the existing `/api`
normalization. Authentication resolves the active account first; every role can
read/replace only its own profile. No target-user, admin-list or public private-profile
endpoint exists. Private bio never flows into instructor descriptions.

The exact six-field response returns empty texts, `#2f4f43` and `updatedAt: null`
for an absent document, without writing defaults. PUT requires all five strings:
trimmed bio/learningGoals at most 280 and jobTitle/company at most 120; avatarColor
exactly `#` and six ASCII hex digits, preserving case. Unknown fields and client
timestamps are ignored. Empty saves remain stored with a server UTC ISO timestamp
so they cannot be mistaken for never-saved profiles. Both prefixes set
`Cache-Control: private, no-store` and vary on Authorization before JSON parsing,
including errors. Invalid input is message-only 400 with no write; failed profile
reads/writes return fixed message-only 503 without logging provider/profile data.
Existing centralized authentication behavior is retained.

Hosted documents use user ID as `_id` in
`<MONGODB_COURSE_CONTENT_COLLECTION>_account_profiles`, containing only the five
fields and `updatedAt`. Per-user atomic upserts await majority acknowledgment,
following instructor-profile handling of first-save unique-ID races (one
replacement retry, honest failure if the row vanished). Successful responses
await persistence. Concurrent saves remain last committed write wins; a timed-out
write may have an uncertain outcome. No revision precondition, migration, new
setting or spreadsheet backfill is introduced. Clocks are injectable. Every
nonhosted local/test run uses a fresh isolated memory store, including local
shared-service opt-in; hosted missing Mongo fails closed. Real Mongo durability,
hosted API and combined two-device browser acceptance remain release checks in
the [account profile spec](specs/US-L003-account-profile.md).

| Domain | With configuration | Without configuration / tests |
| --- | --- | --- |
| Accounts and enrollments | GoogleSheetsAuthRepository | InMemoryAuthRepository with three demo accounts in isolated/test or unconfigured shared mode; unavailable in unconfigured hosted mode |
| Identity, owner, admin catalog/price | GoogleSheetsCourseRepository | InMemoryCourseRepository with one published demo course |
| Reviewed author metadata, live/working snapshots, review history | Mongo course-content document | InMemoryCourseContentRepository |
| Content | MongoCourseContentRepository | InMemoryCourseContentRepository |
| Thumbnails and attachments | MongoCourseAssetRepository | InMemoryCourseAssetRepository |
| Feedback | GoogleSheetsFeedbackRepository | InMemoryFeedbackRepository |
| Instructor descriptions | MongoInstructorProfileRepository in a separate per-user collection | InMemoryInstructorProfileRepository in isolated/test or unconfigured shared mode; operations unavailable in unconfigured hosted mode |
| Private account profiles | MongoAccountProfileRepository, separate per-user collection in hosted mode | InMemoryAccountProfileRepository for all nonhosted local/test runs; operations unavailable in unconfigured hosted mode |
| Password reset token hashes and rolling-hour reservations | MongoPasswordResetRepository, per-user versioned token document in shared/hosted mode | InMemoryPasswordResetRepository in isolated/test or unconfigured shared mode; missing hosted Mongo refuses operations |
| Sign-in failures, pending checks and account locks | MongoSignInAttemptRepository, SHA-256 normalized-email key with CAS revision and TTL expiry in shared/hosted mode | InMemorySignInAttemptRepository in isolated/test or unconfigured shared mode; missing/failing hosted Mongo allows ordinary login with a safe warning |

Within shared/hosted mode, factories choose these independently. Mixed configuration
is possible. Course
creation is blocked when metadata uses Sheets but content uses memory; thumbnails
are blocked for Sheets metadata with memory assets; attachments are blocked for
Mongo content with memory assets. These guards reduce references that would be
lost on process restart, but are not a transaction across all stores.

Base course metadata writes use full row updates. Courses have 21 columns
(`A:U`), Users eight (`A:H`), Feedback 13 (`A:M`). Column U holds `ownerUserId`;
missing legacy values default to empty, allowing only admins to edit those courses.
Creation sets the authenticated ID; general edits cannot transfer ownership.
Asset deletion uses both asset and course ID. Authoring rejects existing foreign
attachment bindings and client thumbnail references on new course creation.
Header lists in `course.ts`,
`auth.ts`, and `feedback.ts` define the column order. Some config/example range
strings still say `Courses!A:R`; the course repository derives the width from its
headers. Do not treat the config string as the complete data schema.

Course content contains sections of discriminated `text`, `resources`, `quiz`,
and `video` components. Quizzes contain questions with two to six answer options,
one or more correctness flags, fixed one-point scoring and an optional question
explanation (at most 1000 characters, default empty). Content saves ignore sent
weights and store points 1; author reads normalize old weights/default explanations
without a migration. Legacy answer descriptions remain supported.
Learner question DTOs explicitly expose only ID, text, points 1, image assetId/alt
or null, `multiple` and
options with ID/text/empty description. Correct answer identities, question
explanations and arbitrary stored question fields are withheld before an attempt.
Both existing course and account quiz-attempt routes accept `answerIds` and legacy
`answerId`; answerIds takes precedence. Selected sets ignore order/duplicates and
earn one point only when equal to the correct set. Unknown/empty selections and
duplicate question entries are 400. Feedback exposes submitted IDs, correctness,
question explanation and the first selected answer's legacy description fallback,
never unselected correct IDs. Attempt totalPoints counts questions, while an old
stored high passPoints is clamped for passing comparison only. Scoring otherwise
refuses unanswerable stored quizzes. Incomplete draft quizzes are
editable, including empty question lists, but review/publication requires nonblank
questions/options, at least one correct answer, and a pass mark in 1..question count.
Account passing proof fingerprints the same stored quiz as Finish, so parser
defaults and old weights cannot create mismatching proof; changed quiz data still
invalidates it. [US-T013 spec](specs/US-T013-simple-quiz.md) records API verification;
Claude owns the simple authoring and learner frontend. Replacement
of a live course requires a private revision; submitted revisions cannot be edited.
US-T014 adds optional question `image: { assetId, alt } | null`, default null on
save when omitted, with trimmed alternative text 0..300. There is no new image
or alternative-text readiness requirement. Images are ordinary quiz-lesson
attachments using existing upload/download routes and binary storage. Content
save validates membership in that lesson's attachments and the asset's actual
course/component/MIME; invalid references and image field errors get message-only
400 in the Question N style. A projected metadata lookup reads no binary and
leaves the existing owner-only lookup unchanged.

Learner question output whitelists image assetId/alt or null without answer keys;
legacy author/learner reads normalize absent images without migration, and public
outlines disclose no image. Both grading routes remain unchanged. Deletion clears
all matching question image references together with their lesson attachment in
one content/review write before asset cleanup. Frozen submissions keep their
images; deleting from a working revision preserves bytes referenced by the live
published snapshot. Existing owner/admin and learner download permission rules,
including archived entitlement, remain unchanged. See the
[question image spec](specs/US-T014-question-image.md); combined browser and real
provider verification remain separate release checks.

All content saves reject duplicate section/component/question/answer identities. Combined draft
content/review saves persist the outline first, so validation sees the latest quiz.
Assets have binary payload, type, filename, size, and course/component association.

The quiz builder opens only the newly added question, scrolls its header to the
modal body's top and focuses the question field without scrolling again. Question
headers toggle open/closed with `aria-expanded`; summaries retain text, points,
answer count and correct-answer status. Existing question-readiness reasons remain
visible when closed. The modal body is the sole quiz scroll container. Adding a
question reserves trailing scroll space so a short last question can align even
in a tall viewport; opening, toggling or removing questions resets that space.

Lessons move between chapters by dragging onto a lesson position or chapter end,
including empty/collapsed chapters, or by a labelled chapter select. Selecting a
chapter expands the destination and restores focus to the moved lesson's control.
The builder's
existing `courseComponentMoved` event gains only optional `toSectionIndex`; the
route forwards it as the fourth state-handler argument. Omission retains the
same-chapter reorder contract. State validates indices and editable/busy/upload
guards and inserts the complete component, preserving IDs, content and media.
The existing dirty, revision-save, local recovery and conflict paths capture the
changed outline. No API shape or storage migration is introduced. See the
[builder spec](specs/US-T011-T012-course-builder.md) for tests and browser checks.

Course operations pair lifecycle reads/content under per-course coordination.
Memory uses its repository lock; Mongo uses a separate nonexpiring owner record.
Sheets operations require Mongo coordination. Acquisition/deletion have bounded
waits, while actual uncertain provider writes retain ownership for verified
recovery. Pre-write reads release normally. Publication is one Mongo document write, not a cross-store transaction. Review
actions and full authoring saves use revision/version checks (US-T005). See [recovery runbook](course_operation_recovery.md).

## Course review storage and views

`CourseReviewService` composes public course metadata from live snapshots and
selects working metadata/content inside authoring operations. Raw Sheet records
remain authoritative for identity/owner and admin price/catalog controls. Legacy
courses are initialized lazily. The first and subsequent authoring edits write
the private snapshot and its version together in one course-content write, without
first changing raw Sheet metadata or raw lesson sections. No headers or shared rows are
migrated. Stored `sections` and live snapshots change in the publication write.

Review events store action, revision ID, authenticated actor ID/name, date and
return reason. Owner/admin author content includes full review state/history;
public and learner DTOs omit it. History is never silently trimmed. Document-limit
or uncertain writes fail safely and retain coordination for the recovery runbook.
Full metadata/outline saves require `X-Course-Revision` JSON `{version, revisionId}`
from the private author snapshot. The per-course lock checks it before writing: 428
for missing/malformed, 409 `AUTHORING_CONFLICT` for stale versions. Private mutation
responses acknowledge the new review version; catalog/learner DTOs remain separate.
Field-specific media writes check supplied versions; the new frontend always sends
them. Metadata and lessons remain sequential saves: partial metadata success advances
only its baseline/version, retains unsaved lessons, and retries safely. Conflicts
preserve local edits and require explicit comparison/reconciliation or discard.

Submitted content has a read-only lesson/quiz/media/resource preview. Archive only
changes live availability, preserving unsaved private authoring buffers. Existing
live assets remain stored when removed privately. Owners/admins can download
references in either authorized snapshot; learners can download only live ones.
Private thumbnail previews require the exact working pointer and authorization.
Mux callbacks match stored media IDs, ignore duplicates and late processing events
after terminal states, and version changed snapshots without losing live playback.
Callback lookup follows the stable component ID across chapters in each live and
working snapshot. The passthrough chapter may predate a lesson move; upload ID
(or asset ID when no upload ID is supplied) must still match before an update.
Chapter-scoped upload/remove routes use the lesson's newly saved chapter; attachment
ownership uses course/component IDs and downloads remain course-scoped. Isolated
move tests cover retained playback, pending callbacks and attachment add/remove/
download. Real provider delivery and browser playback remain separate checks.

## Integration lifecycles

Video creation asks the API for a Mux direct upload URL, then sends the file from
the browser using UpChunk. Mux webhooks update the referenced component using
compressed passthrough IDs `{ c, s, m }`. The actual webhook path is
`/webhooks/mux`, not `/mux/webhook`. Signed playback config exists, but a playback
token flow is not implemented in the current course player. Removing a Mux video
removes its component reference; provider deletion is not exposed in the service.

Admin feedback triage with `workStatus: work` can create a GitHub issue and optionally
add it to a Project. An existing saved link is reused. The service is called
before saving a new link, and an instance-owned per-feedback checkpoint retains
the created issue number/URL when that save fails. Serialized retries reuse it
and successful persistence clears the checkpoint; no cold-instance/restart or
multi-instance issue guarantee is added. No shared migration is needed. Local
audit mode must not trigger real issue creation. No issues were created in this audit.

## Verification and deployment

API tests use Vitest; Angular tests use the Angular/Vitest builder with jsdom.
The audited baseline had 72 API and 24 frontend tests; DEF-001 adds regression
coverage for totals of 111 API and 31 frontend tests. The 2026-10-07 batch has 185 API and 55 frontend tests; see its verification record. There is no committed
browser E2E suite or root lint script. Local browser verification supplements,
but does not replace, the unit suites. US-T002 adds 264 API/108 frontend checks;
see [review verification](verification/2026-10-09/US-T002.md) for current evidence.

PR CI runs frontend builds, Pages build, frontend tests, API build, and API tests.
Pushes to `main` run the Pages workflow, including tests and hosted API health/config
checks. The workflow publishes `app/dist/qi-education-app/browser`, with a generated
`404.html` SPA fallback. Vercel serves the API via `api/[...path].ts` and can also
serve the frontend using `vercel.json` routing.

Hosted is NODE_ENV=production or a defined VERCEL marker, with NODE_ENV=test
always isolated. Hosted mode ignores USE_SHARED_SERVICES. Complete resolved Sheets
settings select the configured user repository; otherwise no demo store is constructed
and login/signup/protected routes answer 503 with the existing message shape. Isolated
local development and NODE_ENV=test retain demo users; only exact opt-in selects
configured shared users in a nonhosted local run. `/health/auth` checks the session
secret and the selected user store's
configuration availability; `/health/config` marks auth unconfigured when either
is absent. Existing health fields/storage labels are retained for compatibility.
Hosted health checks do not prove Google Sheets reads/writes or an entire login
journey. Follow the release
checklist and record actual integration verification separately.

## Per-account sign-in attempt limits (US-P008-AC02)

All four existing login routes share one normalized-address limit. The handler
validates input, reserves an attempt in `signInAttemptRepository.ts`, then reads
fresh users and checks credentials. Ten generic 401 failures within a rolling
15-minute window start a fixed 15-minute lock at the tenth completed failure.
Locked attempts respond 429 before user reads or password checks, with
`too-many-attempts`, remaining minutes rounded up (singular `1 minute`),
`Retry-After` seconds rounded up and `Cache-Control: no-store`. They neither
count nor prolong the deadline; expiry resets the count. Other accounts and
existing 200/400/401/503 contracts are preserved. Case and surrounding spaces
normalize before login validation. Disabled/unknown addresses count identically.

`SignInLimit` injects the clock and policy and hashes the address before storage.
Mongo stores one document per SHA-256 address under
`<MONGODB_COURSE_CONTENT_COLLECTION>_sign_in_attempts`. Failure timestamps,
expiring opaque reservation tickets, lock deadline, unique CAS revision and
Date expiry are the only fields; email and password are absent. Majority
conditional writes bound failures plus outstanding checks to ten across API
instances. Saturated pending capacity waits for outcomes rather than locking on
unfinished requests, polls at 100 ms and stops on HTTP disconnect. US-P008-AC02-11
(DEF-034) bounds this wait with one injectable capacityWaitMs budget, default
3,000 ms, shared across all later sleeps and reads. A final atomic observation
has at most min(100 ms, capacityWaitMs) to see changes during the last sleep;
it cannot restart the wait. Thus the default capacity wait takes at most about
3.1 seconds with a responsive event loop, including a stalled later store poll.
If still busy, the existing private 429 message/code is returned before user
reads/password checks. Retry-After uses the earliest pending-ticket expiry or
counted-failure timestamp plus windowMs, rounded up against the current injected
clock (minimum one second on an expiry race). Busy refusals never create/extend
a lock or consume an attempt. The last busy snapshot supplies the hint if the
final observation stalls; a newly observed lock uses its lockedUntil. Ordinary
completion within the budget still permits admission or the existing lock result.
Tickets expire after the window if their worker crashes;
duplicate, expired or cleared outcomes cannot recreate failures. Unique revisions
avoid stale replacement after TTL deletion and recreation. A single-field TTL
index reclaims Mongo records; application deadlines remain authoritative because
TTL deletion is asynchronous. Memory uses the same CAS transitions and reclaims
expired records on subsequent reservations. No new environment setting.

Success clears failures/tickets; a successfully written reset password also
clears the lock before the existing confirmation notice. Other reset responses
and signed-in password changes retain their behavior. Attempt-storage read/write
failures or a five-second deadline permit ordinary authentication and emit a fixed warning without provider
details or personal data. Driver operations carry timeoutMS and an abort signal;
the adapter checks cancellation before read/write/CAS retry stages. Late successful
reservations are cancelled, and timed-out clears cannot retry over newer state.
Already-issued writes may have uncertain outcomes. Remaining lock time is measured
after the storage read; expiry during that read retries admission. Hosted missing Mongo does not select a private memory
fallback. This fail-open policy, worker-ticket expiry, and the nontransactional
Sheets-password/Mongo-clear boundary are protection limitations. Signup, reset
mail limits, wrong current profile passwords and per-client limits are unchanged.
See the [safe-operation spec](specs/US-P008-safe-operation.md) for scenarios,
DEF-033/DEF-034 reproduction and local delivery/release checks.
