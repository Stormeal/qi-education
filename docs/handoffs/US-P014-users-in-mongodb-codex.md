# US-P014 accounts in MongoDB — Codex handoff (all code)

Assigned 2026-10-17 by Claude Code (lead). Read `AGENTS.md` (including "Two agents in one
working tree") first. Claude works in parallel on the cutover runbook
(`docs/release/US-P014-cutover.md`) and `docs/local_development.md` only.

## What to build

Everything in the [US-P014 spec](../specs/US-P014-users-in-mongodb.md), scenarios
US-P014-AC01 to AC12. Alex's requirement: **no account data may be lost during the
migration, including a rollback.** AC09 to AC12 (write freeze, direction guards, verify,
restore) carry that; treat them as the core of the story, not extras.

1. `MongoAuthRepository` implementing `AuthRepository` (`api/src/authRepository.ts`): every
   method, documents and indexes as in the spec's "API, storage, and compatibility". Reads hit
   MongoDB on every call (DEF-027/DEF-032 stay true). Create maps a duplicate-key error to
   the existing 409. Enroll uses `$addToSet`; password, role and status `$set` only their field;
   role/status keep writing the existing user change records.
2. Store selection: `USER_STORE` (`google-sheets` default, `mongodb`), applied in hosted and
   shared modes only; isolated runs keep the demo users. `mongodb` without MongoDB settings on
   the hosted API keeps today's "user store unavailable" behavior.
3. Write freeze: `USER_STORE_READ_ONLY=1` makes every account write (signup, enroll, password
   reset and change, role, status) answer 503 with the spec's message and write nothing, in
   both stores. Sign-in and reads keep working. Prefer one guard in the repository layer (a
   read-only wrapper) over checks in each route; make sure each write route turns the guard's
   error into the 503 body.
4. Health and doctor: `/health/config` `auth.storage` and `/health/auth`
   `{ status, store, readOnly }` exactly as in the spec's "Operator contract";
   `scripts/doctor.mjs` names the store and checks the MongoDB settings when
   `USER_STORE=mongodb`, with cases in `api/src/localScripts.test.ts`.
5. Learner count: count enrolled accounts with a query instead of listing all users;
   `authenticateRequest(auth, true)` and `listUsers({ fresh })` may then go if nothing else
   needs them (keep the Sheets path working while `USER_STORE=google-sheets`).
6. Copy script `users:migrate` in `api/package.json` with `--dry-run`, `--apply`, `--verify`,
   `--restore-sheet`: flags, guards, output lines and exit codes exactly as in the spec's
   "Operator contract". It reuses the existing row mapping in `auth.ts`; it never prints a
   password hash; `--apply` never deletes a MongoDB document; `--restore-sheet` updates rows in
   place by id, appends new accounts and never deletes or reorders rows.

Claude's runbook quotes the commands, settings, health bodies and output lines from the spec.
If you need to change any of them, finish the rest, then report the change in your summary.

## Tests (isolated stores and fakes only)

- Repository contract tests run against both the in-memory and the Mongo repository (a fake
  collection like the other Mongo repository tests).
- AC03/AC04 across two repository instances sharing one fake collection (overlapping signup,
  enrollment during a password reset).
- AC09 every write route with `USER_STORE_READ_ONLY=1`: 503 body, nothing written, sign-in
  still 200.
- AC05, AC06, AC10, AC11, AC12 for the script against a fake Sheets client and fake collection,
  including: apply twice is idempotent; a stray `--apply` with `USER_STORE=mongodb` refuses;
  verify reports a changed field by id and name without its value; restore after a
  post-cutover enrollment leaves the sheet identical to MongoDB (verify passes).
- Existing suites, journeys and `platformLoad.test.ts` stay green with the default store.

## Files

Owned by Codex: `api/**` (including `api/package.json`), `scripts/doctor.mjs`,
`docs/architecture.md` (storage table, settings, routes), `docs/defect_management.md` only to
note under INV-005 and US-P003 rows that US-P014 closes the multi-instance account cases once
cut over, the spec's "Implementation checklist" and an "Outcome" section in this handoff, your
row in `docs/work_queue.md`, and the version lines (`package.json`, `app/package.json`, the
`appVersion` line only in `app/src/app/services/app-state.service.ts`, the three matching
entries in `package-lock.json`).

Must not edit: anything else under `app/`, `docs/release/**`, `docs/local_development.md`,
`docs/user_stories.md`, the rest of the spec, `CLAUDE.md`.

If you need a file outside this list, finish everything else first, then report the file and
the reason in your summary. Do not stop before writing the code.

## Rules

- Isolated in-memory stores and fakes only. No real MongoDB, Google Sheets, Mux, GitHub or
  Vercel, and never run `users:migrate` against real settings.
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
