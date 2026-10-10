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
Profile goals stay device-local (US-L003).

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
| Account | Student signup, login, remembered session, role permissions | No reset flow; demo fallback only outside production; missing production user store disables auth |
| Teacher | Create a draft, author owned courses, text/resources/quizzes/video, thumbnails, quiz readiness, private revisions and full review history | Legacy unowned courses require admin editing |
| Admin | Authoring, price and catalog fields, feedback inbox/triage | Feedback triage may create a real GitHub issue |
| Learner | Catalog filters/sort/search, details, enrollment, library, learning workspace | Published-only enrollment; no payment system or persisted quiz attempts |
| Progress/profile | Account completion union/cache; selected paths, roadmap/Home milestones and next-course guidance | Legacy quizzes need fresh passing evidence; profile remains local; hosted Mongo checks pending |

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
| `services/profile.service.ts` | Profile data keyed by user ID in localStorage |

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
Course responses use private/no-store and Vary: Authorization. The client honors no-store. Private thumbnails use authenticated blobs revoked on logout. Course response guards use session identity, route, and operation generation; stale 401s cannot end a newer session. Session restoration/enrollment reset pending loaders before applying the updated session. Other successful JSON responses retain explicit invalidation and no TTL.

## API map and current access

Most routes also work with `/api` through prefix normalization. Raw uploads and
Mux webhooks register explicit aliases before JSON middleware.

| Routes | Current permission |
| --- | --- |
| `GET /health`, `/health/config`, `/health/auth`, `/health/content` | Public diagnostic routes |
| `POST /auth/login`, `/auth/signup` (also `/login`, `/signup`) | Public |
| `GET /auth/me` (also `/me`) | Active bearer session |
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
| `PUT /courses/:id/content/components/:componentId/attachments` | Owner teacher/admin; 25 MB |
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

## Persistence

| Domain | With configuration | Without configuration / tests |
| --- | --- | --- |
| Accounts and enrollments | GoogleSheetsAuthRepository | InMemoryAuthRepository with three demo accounts outside production; empty unavailable repository in production |
| Identity, owner, admin catalog/price | GoogleSheetsCourseRepository | InMemoryCourseRepository with one published demo course |
| Reviewed author metadata, live/working snapshots, review history | Mongo course-content document | InMemoryCourseContentRepository |
| Content | MongoCourseContentRepository | InMemoryCourseContentRepository |
| Thumbnails and attachments | MongoCourseAssetRepository | InMemoryCourseAssetRepository |
| Feedback | GoogleSheetsFeedbackRepository | InMemoryFeedbackRepository |

Factories choose these independently. Mixed configuration is possible. Course
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
Learner question DTOs explicitly expose only ID, text, points 1, `multiple` and
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
Claude owns the simple authoring and learner frontend. Question images are Proposed
US-T014 and have no implementation. Replacement
of a live course requires a private revision; submitted revisions cannot be edited.
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
add it to a Project. The service is called before saving the resulting link. Local
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

Production is exactly NODE_ENV=production, matching the existing session-secret
policy. Complete resolved Sheets settings select the configured user repository;
otherwise no demo store is constructed and login/signup/protected routes answer
503 with the existing message shape. Local development and NODE_ENV=test retain
demo users. `/health/auth` checks the session secret and the selected user store's
configuration availability; `/health/config` marks auth unconfigured when either
is absent. Existing health fields/storage labels are retained for compatibility.
Hosted health checks do not prove Google Sheets reads/writes or an entire login
journey. Follow the release
checklist and record actual integration verification separately.
