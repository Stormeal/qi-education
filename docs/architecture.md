# Application architecture

Updated 2026-10-04 for DEF-001 / US-T001 after audit base `6e19213`.
This describes the current code; desired changes live in
[user_stories.md](user_stories.md) and `specs/`. Release verification is separate.

## Purpose and implemented journeys

QI-Education is an npm workspace with an Angular 21 frontend and an Express 5 /
TypeScript API. Node 22 is the repository's configured runtime.

| Journey | Current capabilities | Important limitations |
| --- | --- | --- |
| Account | Student signup, login, remembered session, role permissions | No reset flow; demo auth fallback without Sheets configuration |
| Teacher | Create a draft, author owned courses, text/resources/quizzes/video, thumbnails | Legacy unowned courses require admin editing; review workflow lacks enforcement |
| Admin | Authoring, price and catalog fields, feedback inbox/triage | Feedback triage may create a real GitHub issue |
| Learner | Catalog filters/sort/search, details, enrollment, library, learning workspace | API read/enrollment access gaps; no payment/entitlement system |
| Progress/profile | Device-local completion and profile details | Not server-synced; library progress and home activity are inconsistent |

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
| `app/src/app/app.routes.ts` | Lazy route table; no `canDeactivate` guard today |
| `app/src/app/routes/` | Thin wrappers bind shared state to pages and session/login states |
| `app/src/app/pages/` | Login, dashboard, catalog, course/editor, library, profile, admin, terms |
| `app/src/app/ui/` | CourseBuilder, header, profile menu, feedback dialog, skeletons/buttons |
| `app/src/app/app.models.ts` | Shared frontend types and catalog constants |
| `services/app-state.service.ts` | Signals, session/navigation, authoring drafts, uploads, feedback |
| `services/api-client.service.ts` | Fetch, response cache, base URL selection/fallback, 401 notifications |
| `services/course.service.ts` | Course requests, thumbnail warmup, attachment XMLHttpRequest |
| `services/auth.service.ts`, `session.service.ts` | Auth requests and stored token/session restoration |
| `services/profile.service.ts` | Profile data keyed by user ID in localStorage |

Routes: `/`, `/courses`, `/courses/new`, `/courses/:id`, `/courses/:id/edit`,
`/library`, `/library/:id`, `/profile`, `/admin`, `/terms`. Unknown routes redirect
to `/`. Authentication views are rendered by route wrappers rather than a separate
`/login` route.

`AppStateService` is approximately 2,900 lines and handles many unrelated concerns.
Changes need a full data-flow check; avoid a wholesale refactor as a side effect of
fixing one story. Draft saves compare JSON snapshots. Loaded content normalizes
legacy quiz structures. Completion lives in the course-view page rather than a
shared server-backed progress service.

The API client selects a configured `window.qiEducationConfig.apiBaseUrl` first.
GitHub Pages calls the hosted Vercel API. On other hosts it tries local port 3001
then the hosted API after a network failure. This matters for isolated testing:
pin the API URL or keep the local API healthy before performing mutations.
Its successful JSON response cache has explicit invalidation but no TTL.

## API map and current access

Most routes also work with `/api` through prefix normalization. Raw uploads and
Mux webhooks register explicit aliases before JSON middleware.

| Routes | Current permission |
| --- | --- |
| `GET /health`, `/health/config`, `/health/auth`, `/health/content` | Public diagnostic routes |
| `POST /auth/login`, `/auth/signup` (also `/login`, `/signup`) | Public |
| `GET /auth/me` (also `/me`) | Active bearer session |
| `GET /courses`, `/courses/:id/thumbnail`, `/courses/:id/content` | Public; see DEF-003 |
| `POST /users/me/courses/:id` | Active session; existence only, see DEF-004 |
| `POST /courses` | Active teacher/admin; server assigns authenticated owner ID |
| `PATCH /courses/:id`, `PATCH /courses/:id/content` | Owner teacher or admin |
| `PUT /courses/:id/thumbnail` | Owner teacher/admin; JPEG/PNG/WebP, 2 MB |
| `PUT /courses/:id/content/components/:componentId/attachments` | Owner teacher/admin; 25 MB |
| `GET /courses/:id/content/attachments/:assetId` | Teacher/admin or enrolled user |
| `DELETE /courses/:id/content/components/:componentId/attachments/:assetId` | Owner teacher/admin |
| `POST .../components/:componentId/mux-upload`, `DELETE .../mux-video` | Owner teacher/admin |
| `PATCH /courses/:id/price`, `/courses/:id/catalog-metadata` | Admin |
| `POST /feedback` | Active session |
| `GET /feedback`, `PATCH /feedback/:id/triage` | Admin |
| `POST /webhooks/mux` | Mux signature verification; no bearer session |

`server.ts` constructs/injects dependencies and contains the route handlers. Zod
validates input. Error handling returns `{ message }`, with `issues` for Zod errors;
other parser errors currently lose their intended HTTP status (DEF-008).

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
correctness flags, points, and a pass mark. Scoring currently happens in the client.
Assets have binary payload, type, filename, size, and course/component association.

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
coverage for totals of 111 API and 31 frontend tests. There is no committed
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
