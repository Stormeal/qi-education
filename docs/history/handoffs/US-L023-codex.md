# US-L023 CV recognition — Codex handoff

Assigned 2026-10-18 by Claude Code (lead) after Alex approved the design and plan. Base: `main`
with `1f43ded` in its history. Read `AGENTS.md`, the [work queue](../work_queue.md) and the
[US-L023 contract](../stories/US-L023-cv-recognition.md) first. Your tasks are **C1–C4** in its
"Implementation plan"; they give the exact tests, values and commit messages.

## Why this is yours

The API side is storage and rules: a schema field on career actions, a batch achievements route,
a new provenance value and a changed milestone state rule. Claude builds the browser side (file
reading, matching, the scan panel, the editor field) at the same time.

## Scope

Scenarios US-L023-AC02, AC04, AC05, AC07 (API side) and the release journey step.

1. **C1** `cvKeywords` on career actions plus starter keywords in the launch seeds.
2. **C2** `milestoneStates`: a satisfied milestone is achieved regardless of prerequisites.
3. **C3** `POST /users/me/achievements/cv { actionIds }`, provenance `'cv'`, no follow or lock check.
4. **C4** `api/src/journey.test.ts`: a learner saves a CV finding out of order.

## Files

Yours: `api/src/**` (expected: `careerPath.ts`, `careerPath.test.ts`, `accountCareers.ts`,
`accountCareers.test.ts`, `accountCareersRepository.ts`, `accountCareersRoutes.ts`,
`journey.test.ts`), your row in `docs/work_queue.md`.

Not yours (Claude is editing them at the same time): everything under `app/`, `app/angular.json`,
`app/package.json`, `docs/stories/US-L023-cv-recognition.md`, `docs/specs/**`. The version files
(`package.json`, `app/package.json`, `package-lock.json`, `app/src/app/services/app-state.service.ts`)
are touched only for the version bump in each commit. If you need anything else, finish
everything else first and write the need in your summary.

## Contract Claude's side relies on

- Every action in public `GET /career-paths` and `GET /career-paths/:id` carries
  `cvKeywords: string[]` (default `[]`, max 10, each trimmed 1–80, duplicates removed).
- `POST /users/me/achievements/cv` with body `{ actionIds: string[] }` (1–50) answers 200 with the
  same `AccountCareers` body as `GET /users/me/careers`; new achievements carry
  `provenance: 'cv'`; existing ones keep theirs. Unknown ID → 404 and nothing saved. Invalid body
  → 400 `{ message }`. `Cache-Control: private, no-store`.
- `milestoneStates` follows the new rule in every account careers response.
- Existing routes and response shapes are unchanged, and `POST /users/me/achievements` keeps its
  follow and lock checks. The API deploys before the frontend, so the deployed frontend must keep
  working.

## Rules

- Isolated in-memory stores only; no shared services.
- Shared tree: stage your own files by path; never `git add -A`, stash, reset, restore or check
  out Claude's changes. Read the version from `package.json` right before committing and bump all
  four version places; the later committer bumps again. A failure caused by Claude's files is
  reported, not fixed. Do not use ports 3001 or 4200.
- Commit locally, do not push.
- When done: update your row in `docs/work_queue.md`, then stop and summarize (tests run, commits,
  anything not done).
