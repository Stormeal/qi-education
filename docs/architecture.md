# Application architecture

Updated 2026-10-09 through the remaining DEF-008/011/012/013 batch after base `797d55c`.
The core map describes the current implementation; desired changes live in
[user_stories.md](user_stories.md) and `specs/`. Release verification is separate.
The career path section was checked again on 2026-10-05 at `9a2f30b` plus
unfinished lifecycle work. Access was delivered in `a6767f6`; see
[work_queue.md](work_queue.md) for subsequent delivery and verification records.

## Career path and local progress boundary — checked 2026-10-09

There is no career path model, repository, API endpoint, or dedicated route today.
Home now derives enrolled course summaries from catalog metadata, current title
outlines and shared local completion. Each course has a stable learning link.
Career path progress is explicitly unavailable; role-based percentages, fictional
chapters/courses and claims of matched recommendations have been removed.

Course metadata has free-text `partOfCareer` and `careerGoals`; catalog search
uses them as terms, not curriculum relationships. Accounts persist enrollments
but have no selected path, career goal, milestone, or server progress fields.
Profile learning goals are device-local and do not change career recommendations.

`LearningProgressService` owns the existing localStorage arrays keyed by email
and course ID, shared by workspace, library and Home. Resume selects the first
incomplete current component. Percentages count unique current component IDs,
ignore stale/duplicate records and reserve 100% for full completion; empty courses
remain 0%. Non-quiz completion retains Mark complete/video-ended triggers; quiz
completion still requires a trusted passing score and Finish quiz. Question
position is labeled separately in visible and accessible output. Outline loading
and failure have distinct states and retry. Route changes retain memory when
storage writes fail; account replacement/logout clears memory and invalidates
pending loads. Persistence across devices remains unimplemented. Career path selection,
curation, revisions, switching, milestone logic, and reliable account persistence
are Proposed capabilities, not implemented parts of the architecture.

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
| Account | Student signup, login, remembered session, role permissions | No reset flow; demo auth fallback without Sheets configuration |
| Teacher | Create a draft, author owned courses, text/resources/quizzes/video, thumbnails, quiz readiness gates | Legacy unowned courses require admin editing; review comments/revisions are unfinished |
| Admin | Authoring, price and catalog fields, feedback inbox/triage | Feedback triage may create a real GitHub issue |
| Learner | Catalog filters/sort/search, details, enrollment, library, learning workspace | Published-only enrollment; no payment system or persisted quiz attempts |
| Progress/profile | Shared device-local completion in workspace/library/Home and local profile details | Not server-synced; no selected career path or career completion model |

Statuses are `draft`, `ready-for-review`, `published`, and `archived`. They are
enum values today, not a fully enforced transition state machine. US-T001 adds
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
| `services/learning-progress.service.ts` | Shared local completion, current-outline summaries, loading/errors and session cache boundaries |
| `services/auth.service.ts`, `session.service.ts` | Auth requests and stored token/session restoration |
| `services/profile.service.ts` | Profile data keyed by user ID in localStorage |

Routes: `/`, `/courses`, `/courses/new`, `/courses/:id`, `/courses/:id/edit`,
`/library`, `/library/:id`, `/profile`, `/admin`, `/terms`. Unknown routes redirect
to `/`. Authentication views are rendered by route wrappers rather than a separate
`/login` route.

`AppStateService` is approximately 2,900 lines and handles many unrelated concerns.
Changes need a full data-flow check; avoid a wholesale refactor as a side effect of
fixing one story. Draft saves compare JSON snapshots. Loaded content normalizes
legacy quiz structures. LearningProgressService centralizes local completion;
there is still no server progress endpoint.

Course navigation compares metadata/content snapshots and focused builder buffers.
Native confirmation protects links, Cancel, Back, editor-ID changes and voluntary
logout; beforeunload protects refresh/external departure. Declined navigation keeps
the editor and restores the canceled browser history position; forced session
expiry clears private state. Metadata initializes before
thumbnail warmup and once per editor path. Successful partial metadata saves advance
their snapshot. Unchanged Markdown text keeps its original storage representation.
No recoverable local drafts are persisted. Nested library routes load catalog metadata
and entitled content after restored session identity/permissions have been applied.

The API client selects a configured `window.qiEducationConfig.apiBaseUrl` first.
GitHub Pages calls the hosted Vercel API. On other hosts it tries local port 3001
then the hosted API after a network failure. This matters for isolated testing:
pin the API URL or keep the local API healthy before performing mutations.
Course responses use private/no-store and Vary: Authorization. The client honors no-store. Private thumbnails use authenticated blobs revoked on logout. Course response guards use session identity, route, and operation generation; stale 401s cannot end a newer session. Session restoration/enrollment reset pending loaders before applying the updated session. Other successful JSON responses retain explicit invalidation and no TTL.

## API map and current access

Most routes also work with `/api` through prefix normalization. Raw uploads and
Mux webhooks register explicit aliases before JSON middleware.

| Routes | Current permission |
| --- | --- |
| `GET /health`, `/health/config`, `/health/auth`, `/health/content` | Public diagnostic routes |
| `POST /auth/login`, `/auth/signup` (also `/login`, `/signup`) | Public |
| `GET /auth/me` (also `/me`) | Active bearer session |
| `GET /courses`, `/courses/:id/thumbnail`, `/courses/:id/outline` | Public published metadata/title outlines; owner/admin private access; enrolled archived access |
| `GET /courses/:id/content` | Authenticated owner/admin or enrolled published/archived learner; learner DTO by default; owner/admin-only `?view=author` |
| `POST .../components/:componentId/quiz-attempts` | Same learning entitlement; server scoring without exposing unsubmitted answer keys |
| `POST /users/me/courses/:id` | Active session; published-only new enrollment; published retry is idempotent |
| `POST /courses` | Teacher draft/default admin fields only; admin may set status/price/catalog; authenticated owner ID |
| `PATCH /courses/:id`, `PATCH /courses/:id/content` | Owner teacher/admin; price/catalog/publication/archival changes are admin-only |
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
| Accounts and enrollments | GoogleSheetsAuthRepository | InMemoryAuthRepository with three demo accounts |
| Course metadata | GoogleSheetsCourseRepository | InMemoryCourseRepository with one published demo course |
| Content | MongoCourseContentRepository | InMemoryCourseContentRepository |
| Thumbnails and attachments | MongoCourseAssetRepository | InMemoryCourseAssetRepository |
| Feedback | GoogleSheetsFeedbackRepository | InMemoryFeedbackRepository |

Factories choose these independently. Mixed configuration is possible. Course
creation is blocked when metadata uses Sheets but content uses memory; thumbnails
are blocked for Sheets metadata with memory assets; attachments are blocked for
Mongo content with memory assets. These guards reduce references that would be
lost on process restart, but are not a transaction across all stores.

Course metadata writes use full row updates. Courses have 21 columns
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
and `video` components. Quizzes contain questions with four answer options,
correctness flags, points, and a pass mark. Learner DTOs omit correctness/explanations;
the authenticated quiz-attempt route scores stored answers and returns submitted-answer
feedback only. Scoring refuses invalid legacy quizzes. Incomplete draft quizzes are
editable, including empty question lists, but review/publication requires nonblank
questions/options, exactly one correct answer, and an attainable pass mark. Replacement
of reviewed/published/archived content enforces the same readiness gate; all content
saves reject duplicate section/component/question/answer identities. Combined draft
content/review saves persist the outline first, so validation sees the latest quiz.
Assets have binary payload, type, filename, size, and course/component association.

Course operations pair lifecycle reads/content under per-course coordination.
Memory uses its repository lock; Mongo uses a separate nonexpiring owner record.
Sheets operations require Mongo coordination. Acquisition/deletion have bounded
waits, while actual uncertain provider writes retain ownership for verified
recovery. Pre-write reads release normally. This is not a cross-store transaction
or stale-editor revision check. See [recovery runbook](course_operation_recovery.md).

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
but does not replace, the unit suites.

PR CI runs frontend builds, Pages build, frontend tests, API build, and API tests.
Pushes to `main` run the Pages workflow, including tests and hosted API health/config
checks. The workflow publishes `app/dist/qi-education-app/browser`, with a generated
`404.html` SPA fallback. Vercel serves the API via `api/[...path].ts` and can also
serve the frontend using `vercel.json` routing.

Hosted health checks do not prove Google Sheets reads/writes or an entire login
journey: `/health/auth` currently checks secret presence. Follow the release
checklist and record actual integration verification separately.
