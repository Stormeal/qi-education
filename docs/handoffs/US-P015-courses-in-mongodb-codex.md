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

## Outcome

Implemented US-P015-AC01 to AC09 on `main`, required ancestor `751af29` verified.
Working commits: `abc1958` (repository, selection, freeze, diagnostics and Mongo
journeys; 0.1.225), `ba3ff83` (guarded migration, lossless restore and row preservation;
0.1.226). The final documentation/version commit records delivery. No push or
provider cutover was performed; the default course store remains Google Sheets.

| Scenarios | Implementation and isolated evidence |
| --- | --- |
| AC01–AC03 | `mongoCourseRepository.test.ts` runs the memory/fake-Mongo repository contract over all 21 fields, order, uncached reads, immutable identity/owner/date and atomic input-only majority writes. `courseStoreConfig.test.ts` covers default/shared/hosted/isolated selection and missing Mongo configuration. `courseStoreRoutes.test.ts` exercises metadata/price/catalog/thumbnail, review/publication, authorization, enrollment, learning content/outline/notes/count and confirms no Sheets reads. `journey.test.ts` runs the complete six-step author/review/enroll/learn flow with both memory and fake Mongo. Existing default suites, including `platformLoad.test.ts`, remain in the full suite. |
| AC04 | Strict settings, exact effective `courses: { storage, readOnly }` health object and doctor checks, including missing each of the three Mongo settings, invalid values and runtime mismatch, in `courseStoreConfig.test.ts`, `courseStoreRoutes.test.ts` and `localScripts.test.ts`. Account settings and diagnostics remain independent. |
| AC05 | Both HTTP prefixes plus ordinary case/trailing-slash variants return the exact 503 before assets, content creation or locks. Memory/fake-Sheets/fake-Mongo cases prove zero side effects, available reads/content saves and safe review actions. Both raw and reviewed repository writers are wrapped; shared Mongo metadata also requires durable content/asset coordination. |
| AC06–AC09 | `coursesMigration.test.ts` covers exact flags/guards/output/exit codes, full A:U reads, all 21 field comparisons, both-direction missing records, missing/duplicate IDs, malformed rows/documents, no writes on failed preflight, idempotent apply, majority upserts/index, restore in place with extra cells/order preserved, sorted append, source preservation and retry after lost acknowledgements. Entry-point tests mock all provider access and assert sanitized errors and connection cleanup. `courseRollback.test.ts` covers default mapping compatibility, lossless cells and every subsequent Sheets update method. |

Detail-write trace: `POST /courses`, `PATCH /courses/:id`,
`PATCH /courses/:id/price`, `PATCH /courses/:id/catalog-metadata`,
`PUT /courses/:id/thumbnail`, and each `/api` alias. Author metadata and thumbnail
methods write private review snapshots, so the freeze also wraps the review
projection. `POST /courses/:id/review` actions write content/review snapshots and
never base details; start/submit/return/publish/archive, lesson-content saves and
reads remain available. The Accounts freeze and US-P014 operator contract are
unchanged; account migration regression tests pass with the new migration tests.

Review found and fixed a rollback gap in the legacy sheet mapper: legal Mongo
ratings can have more than one decimal, and lists can contain their own sheet
separator or duplicate languages. Restore now opts into lossless serialization
using typed `qi-course-cell:v1:` base64url JSON cells only where needed. All six
affected fields survive restore → verify → apply unchanged, and later Sheets
edits preserve them. Literal marker prefixes are safely escaped on new writes;
ordinary reads preserve malformed legacy literals, while migration preflight
refuses malformed/ambiguous encodings before writes. Independent review of the
final fixes found no remaining actionable issues (152 focused tests passed).

Operator note for the lead: a rollback changes `COURSE_STORE` back to Sheets while
keeping this API version deployed. Lossless restored cells require its reader;
rolling application code back to a version before US-P015 would not decode them.
The owned architecture documentation records this representation; the cutover
runbook remains Claude's file.

Final required checks on `ba3ff83` (2026-10-17): `npm run api:test` passed 1,589
tests in 63 files; `npm run api:build` passed; `npm run verify:journeys` passed 12
checks (memory and fake Mongo); `npm run app:test` passed 343 tests in 45 files,
23 UI guard tests and the foundation scan. Existing Angular test-setup and jsdom
scrollTo warnings remain; no failed checks or changes to Claude's files.

Not verified: real MongoDB/Sheets durability, provider concurrency/failure behavior,
actual course data/order, hosted health, live browser/API integration, deployment,
forward migration or hosted rollback. All exercised stores/providers are isolated
memory implementations or fakes. No migration command ran against real settings;
no ports 3001 or 4200 were used. No files outside the assigned ownership were edited.

