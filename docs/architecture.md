# Architecture

How QI Academy is built and how to add to it. What each area does is in [specs/](specs/README.md);
rules are in [business_rules.md](business_rules.md); libraries are in [tech_stack.md](tech_stack.md).
This file describes the current code only. Planned changes belong in stories.

## Shape

```text
Browser (Angular, GitHub Pages)
  routes/  → thin wrappers that bind state to a page
  pages/   → route-level behavior
  ui/      → reusable, presentational components
  services/→ state (signals), API access, browser storage
      │  fetch via ApiClientService (bearer token)          Mux direct upload (UpChunk)
      ▼                                                           │
API (Express, Vercel function)                                    ▼
  createServer() in server.ts: middleware, auth, route wiring   Mux ──signed webhook──► /webhooks/mux
  *Routes.ts modules for newer features
  domain files (Zod schemas, pure rules)
  repository interfaces → MongoDB | in-memory
```

`api/src/` is flat: there are no `routes/`, `repositories/` or `models/` folders. Find things by
file-name convention (below).

## Backend

**Wiring.** `createServer(dependencies)` builds every repository from `config.ts` (or takes test
doubles), then registers routes. Older routes (courses, content, review, enrollment, feedback, Mux)
are inline in `server.ts` (~2,100 lines); newer features live in their own module with a
`register<Feature>Routes(app, deps)` function called from `server.ts`.

**File conventions** for a feature `x`:

| File | Holds |
| --- | --- |
| `x.ts` | Zod schemas, types, pure rules (no I/O) |
| `xRepository.ts` | The interface plus its MongoDB and in-memory implementations |
| `xRoutes.ts` | `registerXRoutes`: HTTP mapping, permission checks, cache headers, error mapping |
| `x.test.ts` | Vitest tests, named by scenario ID where one exists |

**Request path.** Prefix normalization lets every route also answer under `/api`. Raw uploads and
the Mux webhook register before the JSON parser. `authenticateRequest(auth)` re-reads the account
on every protected request (current role and status); `requireAdmin` / `requireCourseCreator`
guard roles; `canAuthorCourse` / `canLearnCourse` in `courseAccess.ts` guard course access.
Private routes set `Cache-Control: private, no-store` and `Vary: Authorization`.

**Errors.** Throw or `next(error)`; the error middleware answers `{ message }` (with `issues` for
`ZodError` → 400). Parser errors keep 400/413/415. Everything else is a generic 500. Never echo
request bodies, tokens, provider details or personal data in responses or logs.

**Course writes** go through `withCourseLock` (per-course lock, revision checks inside). Locked
handlers must answer with `response.send`/`json`, not `response.end`: the answer is held until the
lock is released, because Vercel may pause a function once it has answered.

**Response projections.** The same course has a public view, a learner view (no answer keys, no
working revision) and an author view (`?view=author`, owner/admin). Add fields to a projection on
purpose; never return a stored document as is.

## Frontend

- Standalone components, `ChangeDetectionStrategy.OnPush`, signal `input()`/`output()`, `@if`/`@for`
  with `track`. Shared types in `app.models.ts`.
- **`AppStateService`** (~3,200 lines) is the central signal store: session, course list, editor
  drafts, saves, uploads, enrollment. Changes there need a full data-flow check; do not refactor it
  as a side effect of a story. New, separable concerns get a focused service instead
  (`LearningProgressService`, `CareerPathService`, `LessonExtrasService`, `ProfileService`, …).
- **`ApiClientService`** chooses the base URL (`window.qiEducationConfig.apiBaseUrl`, else Pages →
  hosted API, else local `:3001` only), caches successful JSON reads until invalidated, honors
  `no-store`, and reports 401s. On a local frontend it never sends anything to the hosted API.
- **Notifications**: `NotificationService` owns account-scoped list/count/cache and request
  generations; AppState feeds session refresh counts and clears it at account boundaries.
  `TurnstileService` owns the shared lazy script loader; `ui/turnstile-challenge` owns widget
  lifecycle. Presentational login and header components communicate through inputs/outputs.
- **Session guards**: every async reply checks that the session (and course/route) that started it
  is still current before touching signals or storage. Keep this when adding requests.
- **Browser storage** only through the owning service (`SessionService`, draft recovery, progress
  cache, profile cache). Never from components.
- **Feedback**: one root modal host and `FeedbackComposerService` keep the session draft and send
  guard across routes; the presentational dialog uses reactive forms. Legacy page bindings remain
  compatible. Triage uses a Mongo operation journal; Google Sheets is migration-only.
- **UI**: use the shared components and design values ([ui-foundation](specs/platform/ui-foundation.md));
  the colour and pattern guard runs with `npm run app:test`.

## Where new code goes

| Change | Put it in |
| --- | --- |
| New API feature | `x.ts` + `xRepository.ts` (Mongo + memory) + `xRoutes.ts`, registered in `createServer`; repository chosen by run mode like its neighbours |
| New stored data | Its own MongoDB collection `<MONGODB_COURSE_CONTENT_COLLECTION>_<purpose>`, per-account documents keyed by user ID where private; atomic updates with majority acknowledgement |
| New page | `pages/<name>-page/` plus a thin `routes/<name>-route.ts`, lazy route in `app.routes.ts` |
| Reusable control | `ui/<name>/`, presentational, no API calls |
| API calls / shared state | A focused service in `services/`; extend `AppStateService` only for existing editor/session flows |
| Pure frontend rule | `utils/<name>.ts` with a `.spec.ts` |

## Invariants to keep

- The API is the authority on permissions, grading, milestone states and progress; the UI mirrors.
- Stale writes are refused (revision headers, `X-Expected-Updated-At`), never silently merged.
- Private data is per authenticated account; identity comes from the token, never the request body.
- Local runs and tests use isolated stores ([run modes](specs/platform/storage-and-run-modes.md)).
- The API deploys before the frontend: keep API changes backward compatible and keep legacy routes
  (e.g. `/users/me/career-path`, `answerId` in quiz attempts) until the frontend no longer needs them.
- Frontend tests: clear `localStorage` and `sessionStorage` in `beforeEach`; do not `vi.mock` a
  library at module level (give the service a replaceable member instead); assert properties, not
  exact request counts or timings.

## Known debt

- `server.ts` and `AppStateService` are large and mix concerns.
- No browser end-to-end suite (US-P001). Hosted-only behavior is checked by hand.
- Multi-instance guarantees exist only where MongoDB provides them; per-instance queues cover the rest
  ([reliability](specs/platform/reliability.md)).
