# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Start with [AGENTS.md](AGENTS.md), [docs/work_queue.md](docs/work_queue.md), and
[docs/development_workflow.md](docs/development_workflow.md). The committed backlog
and specs define the selected scope. Current architecture is documented in
[docs/architecture.md](docs/architecture.md); keep proposed behavior separate from implementation.

## Project Overview

QI-Education is a full-stack educational platform where teachers create courses and students enroll and learn. The repo is an npm workspace with two packages: `app/` (Angular frontend) and `api/` (Express backend).

## Commands

Run from the repo root unless noted.

```bash
# Full local dev (frontend + API together)
npm run app:dev           # http://localhost:4200 + API on :3001

# Frontend only
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

# Run a single test file
npm --prefix app test -- --run --reporter=verbose <path-to-spec>
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
| Auth | Google Sheets | In-memory demo users |
| Courses (metadata) | Google Sheets | Google Sheets or in-memory |
| Course content (sections/components) | MongoDB | In-memory |
| Course assets (thumbnails) | MongoDB | In-memory |
| Feedback | Google Sheets | Google Sheets or in-memory |

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
Other parser errors currently become 500 (DEF-008). Bearer tokens are required on protected routes.

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

### Video Upload Flow

1. Client requests an upload URL from the API (`POST /courses/:id/content/components/:componentId/mux-upload`)
2. API calls Mux and returns a direct upload URL
3. Client uploads directly to Mux via UpChunk (no API proxy)
4. Mux fires a webhook back to the API (`POST /webhooks/mux`, also `/api/webhooks/mux`)
5. Webhook handler reads the compressed passthrough payload (`{ c, s, m }` = course/section/component IDs) to locate the target component and writes the Mux asset/playback IDs to MongoDB

### Roles & Course Lifecycle

Roles: `student | teacher | admin`

Course statuses: `draft → ready-for-review → published → archived`

These are current status values; transition and admin-only publication enforcement
have gaps recorded in the defect log. Owner-only teacher authoring is a confirmed
target policy in US-T001, not an implemented guarantee.

- Teachers create/edit courses and add video content
- Admins set pricing, catalog metadata, and publish/archive
- Feedback marked for follow-up is auto-converted to GitHub issues via `GitHubFeedbackService`

### Deployment

- Frontend → GitHub Pages (`app:build:pages`)
- API → Vercel Serverless Functions; environment variables managed via Vercel (`npm run env:pull`)
- Health endpoints: `/health`, `/health/config`, `/health/auth`, `/health/content`

## Capturing Learnings

When finishing a task — typically when we commit and push — ask whether I want to add any of the learnings from the task to this file.

- Present a short, easy-to-read bulleted list of the learnings made during the task (e.g. non-obvious gotchas, conventions discovered, architectural details, fixes that revealed how something works).
- Keep each bullet to one line where possible.
- Only add the items I select to the relevant section of CLAUDE.md.
