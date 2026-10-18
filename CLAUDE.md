# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Start with [AGENTS.md](AGENTS.md), [docs/work_queue.md](docs/work_queue.md), and
[docs/development_workflow.md](docs/development_workflow.md). The backlog
([docs/user_stories.md](docs/user_stories.md)) and story contracts (`docs/stories/`) define the
selected scope. Current behavior is in `docs/specs/<area>/`, current architecture in
[docs/architecture.md](docs/architecture.md); keep proposed behavior separate from implementation.

## Finding documentation

Load only what the task needs: match its words to a row and read that file. Read
`docs/business_rules.md` when roles, permissions or limits matter and `docs/architecture.md` before
adding files. Skip `docs/history/` and `docs/defects_resolved.md` unless the task is about the past
or names an old ID. Keep this table identical to the one in `AGENTS.md`.

| Keywords in the task | Read (under `docs/`) |
| --- | --- |
| login, signup, session, token, remember me, `/auth/me`, sign-in limit, 429, disabled account | `specs/accounts/sign-in-and-sessions.md` |
| password reset, reset link, change password, account mail, Brevo | `specs/accounts/passwords-and-email.md` |
| profile, avatar, bio, job title, instructor description | `specs/accounts/profiles.md` |
| catalog, `/courses`, carousel, search, filter, sort, category, course card | `specs/catalog/browse.md` |
| course details, `/courses/:id`, enroll, enrollment, outline, price shown | `specs/catalog/course-details-and-enrollment.md` |
| course editor, course form, steps, ownership, unsaved changes, draft recovery, save conflict, 409, 428 | `specs/authoring/course-editor.md` |
| course builder, lesson, chapter, section, move lesson, exercise, attachment, file, thumbnail | `specs/authoring/lessons-and-builder.md` |
| quiz, question, answer, pass mark, grading, quiz attempt, question image | `specs/authoring/quizzes.md` |
| video, Mux, UpChunk, webhook, playback | `specs/authoring/video.md` |
| review, submit, return, publish, archive, revision, review history, price, catalog settings | `specs/authoring/review-and-publication.md` |
| Home, dashboard, My Learning, library list | `specs/learning/home-and-library.md` |
| learning page, `/library/:id`, notes, lesson feedback, up next, Previous/Next, course facts | `specs/learning/learning-page.md` |
| progress, completion, percentage, resume, `learning-progress` | `specs/learning/progress.md` |
| career path, follow career, focus, career tree, CV preview, Home career tile | `specs/career-paths/careers.md` |
| milestone, achievement, declaration, prerequisite, unlock, requirement route, bundle | `specs/career-paths/milestones-and-achievements.md` |
| career editor, publish/withdraw career, convert to milestone format, curriculum | `specs/career-paths/curation.md`, `stories/US-A004-curriculum-review.md` |
| admin users, role change, disable account, admin reset link, change log | `specs/admin/users.md` |
| feedback, triage, GitHub issue, feedback inbox | `specs/admin/feedback.md` |
| MongoDB, Google Sheets, store, in-memory, isolated, `USE_SHARED_SERVICES`, health, doctor, migrate, read-only freeze | `specs/platform/storage-and-run-modes.md` |
| lock, `withCourseLock`, concurrency, race, retry, queue, cache, `Cache-Control`, error response | `specs/platform/reliability.md` |
| CI, GitHub Pages, Vercel, deploy, push, version bump, git hook | `specs/platform/deployment-and-checks.md` |
| button, tabs, chip, progress bar, focus ring, colour, design value, `tailwind.css`, accessibility | `specs/platform/ui-foundation.md` |
| new file, new route, new repository, where code goes, conventions | `architecture.md` |
| a library or version | `tech_stack.md` |
| `DEF-…` / `INV-…` | `defects.md`, then `defects_resolved.md` |
| `US-…` | `user_stories.md`, then `stories/` |

- When a story is delivered, fold its behavior into the matching `docs/specs/<area>/` file and
  delete its `docs/stories/` contract.
- Commit `6c94eba` is the last one with every old story spec, handoff and verification file at its
  original path: `git show 6c94eba:docs/specs/<file>.md` reads an old contract.
- Docs written by other tools may contain stray Windows-1252 bytes (old `defect_management.md` had
  `0x97` dashes); Read/Edit refuse such files until the bytes are replaced (`perl -pi -e 's/\x97/-/g'`).

## Default skills

Use these without being asked (set by Alex, 2026-10-10):

- **Always:** work in `ponytail:ponytail` mode on this project.
- **Anything frontend** (pages, components, templates, styles, UI copy or layout in `app/`): load the `design-taste-frontend` skill before making the change.

## Working sessions with Codex

Claude is the lead. Alex's Codex project is this same folder, so both agents work on `main`
in one working tree, at the same time. Set by Alex, 2026-10-10.

Triggers: "let's start working" or "start <item>" runs the start routine. "check Codex" runs
the check routine.

### Start routine

1. **State.** `git status`, `git log -3`, and Active work in `docs/work_queue.md`. Uncommitted
   changes in files Claude does not own mean Codex is mid-task: leave them alone.
2. **Pick.** In this order: the item Alex named; unfinished Active work; leftovers of the last
   increment (unticked spec boxes, "Not verified" lines); the first open item in queue order,
   confirmed defects before stories. Say in one line what was picked and why. Ask only when a
   product decision blocks the work; otherwise take the story's recommended default and record
   it in the story contract (`docs/stories/`) as "confirm or change".
3. **Split** into two parts that can run in parallel with no file in common. Default:
   Claude takes pages, UI components and UI-facing services in `app/`; Codex takes
   `api/src/**`, storage, and frontend services that only move data. If the item is too small
   to split, Codex gets the next independent item from the queue. If Codex is still busy,
   do not hand it more.
4. **Record.** Owner, scope, files and state per owner in Active work; a handoff at
   `docs/handoffs/<item>-codex.md` (moved to `docs/history/handoffs/` when done); decisions in
   the story contract. Commit locally.
5. **Hand Alex the Codex prompt first**, before starting Claude's own part: one fenced block
   to paste into Codex as is. Alex does nothing else: no shell commands, no folders to open.
6. **Do Claude's part**: implement, test, browser-check on the isolated servers, record,
   commit locally. Never push without Alex saying so.

### Every Codex prompt contains

The folder and branch; the commit its history must contain (not "latest commit must be", because
Claude keeps committing); the handoff path; story and scenario
IDs; files it owns and files it must not edit; the contract Claude's side relies on;
"isolated in-memory stores only"; the shared-tree rules below; "commit locally, do not push";
"update your row in `docs/work_queue.md`, then stop and summarize".

Two rules learned on 2026-10-10. Trace every event and argument Codex's work passes through
(component output, page, route template, state handler) and put each of those files, or the
exact line, in its list. And never tell Codex to stop when it needs a file outside its list:
tell it to finish everything else first and report the need, otherwise it stops before writing
any code.

### Shared-tree rules (both agents)

- Stage your own files by path. Never `git add -A`, and never stash, reset, restore or check
  out the other agent's changes.
- Read the version from `package.json` right before committing; the later committer bumps again.
- A failure caused by the other agent's files is reported, not fixed.
- Claude's browser checks use ports 3001 and 4200. Codex uses in-process tests or other ports.
- While Codex has uncommitted API changes, do not rebuild `api/dist` for a browser check.
- Restarting the isolated API makes the session stored in the browser invalid: the first
  requests after a restart answer 401. Sign in again before reading anything into them.

### Check routine

1. `git status` and `git log`: has Codex committed and updated its queue row?
2. Review its diff against the handoff: only its files, the contract kept, existing routes unchanged.
3. Run `npm run api:test`, `npm run app:test`, `npm run verify:journeys`, `npm run app:build:pages`.
4. Fix small findings in Claude's own files; return the rest to Codex as a new paste-ready prompt.
5. Update queue and stories, and fold delivered behavior into the area spec; tell Alex in plain
   words what is done and what only Alex can do (push, hosted checks).

### Talking to Alex

Every instruction for Alex is an exact thing to paste or click, with full paths. Never
"open X with folder Y". State what Alex will see and how to tell it is finished.

## Project Overview

QI Academy is a full-stack educational platform where teachers create courses and students enroll and learn. The repo is an npm workspace with two packages: `app/` (Angular frontend) and `api/` (Express backend).

## Commands

Run from the repo root unless noted.

```bash
# Full local dev (frontend + API together)
npm run app:dev           # http://localhost:4200 + API on :3001

# Frontend only (sign-in and saving need the local API: localhost never sends changes to the hosted API)
npm run app:dev:frontend

# API only
npm run api:dev

# Pull environment variables from Vercel (needed for local API)
npm run env:pull

# Build
npm run app:build         # Angular app
npm run app:build:pages   # GitHub Pages deployment build
npm run api:build         # TypeScript compilation

# Tests
npm run app:test          # Angular/Vitest frontend tests
npm run api:test          # Vitest backend tests

# Cross-role release journey (teacher -> admin review -> learner) over HTTP, in-memory stores
npm run verify:journeys

# Run a single test file
(cd app && npx ng test --watch=false --include <path-to-spec>)   # `ng test` has no --run
npm --prefix api test -- <path-to-test>

# Health check for local configuration
npm run doctor

# Generate a password hash for Google Sheets auth store
npm --prefix api run auth:hash-password -- "Password123!"
```

## Architecture

### Storage: Pluggable Repository Pattern

The backend uses interface-based repository abstraction with different implementations per environment. Each storage domain is independently configurable:

| Domain | Production | Local / Test |
|---|---|---|
| Accounts and enrollments | MongoDB (cut over 2026-10-18) | In-memory demo users |
| Courses (metadata) | MongoDB (cut over 2026-10-18) | In-memory |
| Course content (sections/components) | MongoDB | In-memory |
| Course assets (thumbnails, attachments) | MongoDB | In-memory |
| Progress, careers, notes, profiles, tokens | MongoDB | In-memory |
| Feedback | Google Sheets | In-memory |

Local runs use in-memory stores unless `USE_SHARED_SERVICES=1`. Full table:
`docs/specs/platform/storage-and-run-modes.md`.

Repositories are instantiated in `api/src/server.ts` and injected as dependencies — nothing touches storage directly from route handlers.

### Backend (`api/`)

- `server.ts` — Express app factory; constructs repositories and wires up all routes
- `src/server.ts` — Route handlers (auth, courses, content, feedback, Mux webhooks)
- `src/*Repository.ts` — Storage implementations (Google Sheets, MongoDB, in-memory)
- `src/googleSheets.ts`, `mongo.ts`, `auth.ts` — Clients and auth helpers (scrypt + signed tokens)
- `src/course.ts`, `courseContent.ts`, `feedback.ts` — Zod schemas and domain types
- `src/muxService.ts`, `githubFeedback.ts` — External side-effect services

Auth and JSON mutation bodies use Zod; raw uploads use MIME and size checks.
Error middleware converts `ZodError` to 400 responses with a `{ message }` body.
Invalid JSON, oversized bodies and bad encodings answer 400/413/415; other failures a generic 500.
Bearer tokens are required on protected routes.

### Frontend (`app/`)

- `src/app/routes/` — Angular route components (thin wrappers)
- `src/app/pages/` — Page components with business logic
- `src/app/ui/` — Reusable UI components (button, header, course builder, feedback dialog, etc.)
- `src/app/services/` — Service layer:
  - `AppStateService` — Central state using Angular signals and `computed()`; owns login state, course list, and editing session
  - `ApiClientService` — HTTP client with response caching, fallback URL support, and 401 handling
  - `AuthService`, `CourseService`, `FeedbackService`, `SessionService`
- `src/app/app.models.ts` — Shared TypeScript types for the whole frontend

### Angular State Management

`AppStateService` uses Angular signals throughout. Course draft changes are detected by comparing JSON snapshots (serialized on load, re-serialized on edit). Content normalization runs on load to handle legacy quiz format migration. Sheets repositories also maintain worksheet headers. The rendered app version lives in `AppStateService.appVersion`.

The catalog carousel's skeleton gate is the `thumbnailsReady` signal in `courses-page.ts`; its `effect` reactively re-runs on `visibleFeaturedCourses()`, so it covers carousel paging too — but it must reset to `false` at the start of each run or the skeleton won't reappear on later pages.

### Frontend spec isolation

Spec files share `localStorage`/`sessionStorage`, and file order differs on CI. Every new spec must clear both in `beforeEach`; a stored login left by another spec otherwise changes what renders (e.g. the session-restore screen instead of the login page).

### Tests that pass locally but fail on CI

CI runs on slower Linux machines and has caught two patterns that pass on a Windows dev machine:

- `vi.mock('<library>')` may not reach app code there (the service keeps the real module). Do not fake a library at module level; give the service a replaceable member and override it in the test (see `createChunkedUpload` in `AppStateService` and `course-media.spec.ts`).
- Do not assert exact counts or timings that depend on how many requests overlap. Assert the property instead (e.g. "fewer reads than without sharing").

### Career paths

Careers are curated by admins and stored in MongoDB. A learner follows several careers and has one focus. Milestone states (achieved/ready/locked) are **computed by the API** from the account's declarations and its real course completion (stored per account, cross-device); the page shows them as given. Old-format careers (published before milestones) still compute "any one course 100% complete" per step in the browser. Details: `docs/specs/career-paths/`.

### Video Upload Flow

1. Client requests an upload URL from the API (`POST /courses/:id/content/components/:componentId/mux-upload`)
2. API calls Mux and returns a direct upload URL
3. Client uploads directly to Mux via UpChunk (no API proxy)
4. Mux fires a webhook back to the API (`POST /webhooks/mux`, also `/api/webhooks/mux`)
5. Webhook handler reads the compressed passthrough payload (`{ c, s, m }` = course/section/component IDs) to locate the target component and writes the Mux asset/playback IDs to MongoDB

"Video uploads are temporarily unavailable" in the editor means Mux refused step 2 (for example a revoked token answers 401). The reason is only in the hosted API's log, as `Mux upload creation failed`.

### Roles & Course Lifecycle

Roles: `student | teacher | admin`

Course statuses: `draft → ready-for-review → published → archived`

Only review actions change status, and only admins publish. Teachers author only their own
courses on every mutation route; admins can author all courses. Legacy rows without an
owner remain admin-editable only. Full rules: `docs/business_rules.md`.

- Teachers create courses and edit/add content to their own courses
- Admins set pricing, catalog metadata, and publish/archive
- Feedback marked for follow-up is auto-converted to GitHub issues via `GitHubFeedbackService`

### Deployment

- Frontend → GitHub Pages (`app:build:pages`)
- API → Vercel Serverless Functions; environment variables managed via Vercel (`npm run env:pull`)
- Health endpoints: `/health`, `/health/config`, `/health/auth`, `/health/content`
- The hosted API's log: `npx vercel logs` from the repo root, once `npx vercel login` has been run. The Hobby plan keeps only the last 30 minutes, so read it right after the failure; `--since 1h` is refused.
- A route wrapped in `withCourseLock` holds its answer until the course lock is released (DEF-042): Vercel may pause a function once the answer is sent. Locked handlers must answer with `send`/`json`; `response.end` would bypass the hold.
- A push to `main` deploys the API on Vercel immediately, but the frontend only if the Pages workflow's tests pass. A failing test therefore leaves a new API serving an old frontend, so keep API changes backward compatible and run both test suites and `npm run app:build:pages` before pushing.

## Capturing Learnings

When finishing a task — typically when we commit and push — ask whether I want to add any of the learnings from the task to this file.

- Present a short, easy-to-read bulleted list of the learnings made during the task (e.g. non-obvious gotchas, conventions discovered, architectural details, fixes that revealed how something works).
- Keep each bullet to one line where possible.
- Only add the items I select to the relevant section of CLAUDE.md.
