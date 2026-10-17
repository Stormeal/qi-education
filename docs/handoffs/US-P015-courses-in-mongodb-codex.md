# US-P015 course details in MongoDB — Codex handoff (all code)

Assigned 2026-10-17 by Claude Code (lead). Read `AGENTS.md` (including "Two agents in one
working tree") first. Claude works in parallel on `docs/release/US-P015-cutover.md`,
`docs/local_development.md` and a keyboard check of the learning page (frontend fixes, if any,
only in `app/src/app/pages/learning-page/`).

## What to build

Everything in the [US-P015 spec](../specs/US-P015-courses-in-mongodb.md), scenarios
US-P015-AC01 to AC09. Alex's requirement still holds: **no data may be lost during the
migration, including a rollback**; AC05 to AC09 carry it. Build it the way US-P014 built
accounts (`mongoAuthRepository.ts`, `authStore.ts`, `usersMigration.ts`, `migrateUsers.ts`):
reuse those pieces where they generalize, without changing the accounts behavior or its
operator contract.

1. `MongoCourseRepository` implementing `CourseRepository` (`api/src/courseRepository.ts`);
   `storageType` gains `'mongodb'`. Keep `reviewedRepositories` (`courseReview.ts`) and every
   route unchanged on top of it. Keep today's catalog order (check what order routes and the
   review list produce with the sheet, and match it).
2. Store selection `COURSE_STORE`, freeze `COURSE_STORE_READ_ONLY` at the HTTP boundary (both
   route prefixes, before side effects such as thumbnail uploads) and in a repository wrapper.
   Trace every route that writes course details (create, metadata, price, catalog settings,
   thumbnail, and any review action that writes base details) and list them in your summary.
3. `/health/config` `courses: { storage, readOnly }`; `scripts/doctor.mjs` with cases in
   `api/src/localScripts.test.ts`.
4. Copy script `courses:migrate` (`api/package.json`) with `--dry-run`, `--apply`, `--verify`,
   `--restore-sheet`; flags, guards, output lines and exit codes exactly as in the spec's
   "Operator contract". Reuse the row mapping in `course.ts` (`courseFromSheetRow`,
   `courseToSheetRow`); restore updates rows in place by id, appends new courses in
   `createdAt` order and never deletes or reorders rows.
5. The `server.ts` rule that refuses shared course operations without MongoDB content keeps
   working for `COURSE_STORE=mongodb`.

Claude's runbook quotes the commands, settings, health body and output lines from the spec. If
you need to change any of them, finish the rest, then report the change in your summary.

## Tests (isolated stores and fakes only)

- `CourseRepository` contract tests against the in-memory and the Mongo repository (fake
  collection), including order and every field.
- AC02: the existing course, review, authoring, catalog and journey tests also pass with the
  Mongo repository (run the relevant suites against both, or a representative set with a short
  note on what is covered).
- AC05: every course-detail write route with `COURSE_STORE_READ_ONLY=1` on both prefixes: 503
  body, nothing written, reads and content saves still work.
- AC06 to AC09 for the script against a fake Sheets client and fake collection: apply twice is
  idempotent; a stray `--apply` with `COURSE_STORE=mongodb` refuses; duplicate ids stop it;
  verify reports a changed field by id and name without its value; restore after a
  post-cutover course leaves the sheet identical to MongoDB.
- Existing suites, journeys and `platformLoad.test.ts` stay green with the default store.

## Files

Owned by Codex: `api/**` (including `api/package.json`), `scripts/doctor.mjs`,
`docs/architecture.md`, `docs/defect_management.md` only to note under INV-005 and INV-017
that US-P015 resolves them once cut over, the spec's "Implementation checklist" and an
"Outcome" section in this handoff, your row in `docs/work_queue.md`, and the version lines
(`package.json`, `app/package.json`, the `appVersion` line only in
`app/src/app/services/app-state.service.ts`, the three matching entries in
`package-lock.json`).

Must not edit: anything else under `app/`, `docs/release/**`, `docs/local_development.md`,
`docs/user_stories.md`, the rest of the spec, `CLAUDE.md`.

If you need a file outside this list, finish everything else first, then report the file and
the reason in your summary. Do not stop before writing the code.

## Rules

- Isolated in-memory stores and fakes only. No real MongoDB, Google Sheets, Mux, GitHub or
  Vercel, and never run `users:migrate` or `courses:migrate` against real settings.
- Do not use ports 3001 or 4200 (Claude's browser checks).
- Shared working tree on `main`: stage your own files by path; never `git add -A`; never stash,
  reset, restore or check out Claude's changes. Read the version from `package.json` right
  before committing and bump the version lines; the later committer bumps again.
- Commit working steps as you go. A failure caused by Claude's files is reported, not fixed.
- Keep every existing route, status code and body unchanged with the default settings (the API
  deploys before the frontend).
- Before your last commit: `npm run api:test`, `npm run api:build`, `npm run verify:journeys`,
  `npm run app:test` (it runs the doctor and UI guards too).
- Commit locally, do not push.
- Update your row in `docs/work_queue.md` (state, commits, checks, what is not verified), then
  stop and summarize.

