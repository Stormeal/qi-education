# US-L015 learning backend — Codex handoff (API, storage, frontend data service)

Assigned 2026-10-17 by Claude Code (lead). Runs in parallel with US-L016 (Claude, the
learning page), which touches only `app/` files outside your list. Read `AGENTS.md`
(including "Two agents in one working tree") first.

## What to build

Everything in the [US-L015 spec](../specs/US-L015-learning-backend.md), scenarios
US-L015-AC01 to AC08:

1. Private lesson notes: four routes, a repository (MongoDB and in-memory, chosen like
   the other Mongo-backed repositories in `api/server.ts`).
2. Lesson feedback: one route that writes into the existing feedback store with four new
   optional fields, Sheets columns appended at the end, and the admin feedback list
   returning them.
3. Learner count: one route, counted from the users read the request already makes.
4. The `exercise` lesson type in `api/src/courseContent.ts` and everywhere the content
   types are listed (review/publish checks, outline, learning progress, fixtures), including the
   attachment upload route (`server.ts` ~348), which must accept exercise lessons with the
   resources file rules.
5. `app/src/app/services/lesson-extras.service.ts` with its spec: a thin data service
   over the routes above, using `ApiClientService` like the existing services.

The routes, bodies, answers and access rules are the contract in the spec. Claude's
learning page is written against it now, so do not change a path, field name or status
code without reporting it.

## Files

Owned by Codex:

- `api/server.ts`, anything under `api/src/` (new files and the ones you need: e.g.
  `server.ts`, `courseContent.ts`, `feedback.ts`, `feedbackRepository.ts`, the access
  helpers), new or changed tests under `api/`
- `app/src/app/services/lesson-extras.service.ts` and
  `app/src/app/services/lesson-extras.service.spec.ts` (new)
- `docs/architecture.md` (new routes and storage), `docs/specs/US-L015-learning-backend.md`
  (tick the checklist, add an Outcome), this handoff (add an "Outcome" section), your row
  in `docs/work_queue.md`
- The three version lines: `package.json`, `app/package.json`, and the `appVersion` line
  in `app/src/app/services/app-state.service.ts` (that line only), plus the matching
  version entries in `package-lock.json`

Must not edit: anything else under `app/` (in particular `app.models.ts`, the rest of
`app-state.service.ts`, `feedback.service.ts`, pages and UI components; Claude adds the
`exercise` type and the feedback fields to the frontend models),
`docs/user_stories.md`, `docs/defect_management.md`, `docs/specs/US-L016-learning-view.md`,
`CLAUDE.md`.

If you find you need a file outside this list, finish everything else first, then report
the file and the reason in your summary. Do not stop before writing the code.

## Rules

- Isolated in-memory stores only. No real MongoDB, Google Sheets, Mux, GitHub or Vercel.
- Do not use ports 3001 or 4200 (Claude's browser checks). In-process tests or other ports.
- Shared working tree on `main`: stage your own files by path; never `git add -A`; never
  stash, reset, restore or check out Claude's changes. Read the version from `package.json`
  right before committing and bump the version lines; the later committer bumps again.
- Claude may rebuild `api/dist` for browser checks only while you have no uncommitted API
  changes, so commit working API steps as you go.
- A test failure caused by Claude's files is reported, not fixed.
- Keep existing routes backward compatible (the API deploys before the frontend).
- Run `npm run api:test`, `npm run api:build`, `npm run verify:journeys` and the
  lesson-extras spec
  (`cd app && npx ng test --watch=false --include src/app/services/lesson-extras.service.spec.ts`)
  before your last commit.
- Commit locally, do not push.
- Update your row in `docs/work_queue.md` (state, commits, checks, what is not verified),
  then stop and summarize.
