# US-T007 instructor description — Codex handoff (API and storage)

Assigned 2026-10-11 by Claude Code (lead). Runs in parallel with Claude's frontend part
(profile page, catalog and course instructor cards, Admin page) under `app/` in this same
working tree. Read `AGENTS.md` (including "Two agents in one working tree") first.

## Decisions

By Alex, 2026-10-11: a description is public as soon as the teacher saves it. There is no
approval step. An admin can clear an unsuitable description from the Admin page.

By the lead (record in the spec as "confirm or change"):

- One field: plain text, at most 280 characters (the profile page's existing "About you"
  limit), trimmed. An empty string means "no description".
- Teachers and admins have one; students do not.
- Stored per user in MongoDB in production and in memory locally and in tests, following
  the career path selection repository. The users spreadsheet is not changed.
- Public output never contains a user id, email or any other account field. It links a
  description to the published courses that user owns, nothing else.
- A description is public only while its author owns at least one published course.

## Scope

Write `docs/specs/US-T007-instructor-description.md` first (scenarios US-T007-AC01 and
AC02 in `docs/user_stories.md`, plus numbered scenarios for the rules below). Then deliver
the API, validation and storage. Claude delivers all of the frontend against this contract.

## Contract Claude's frontend is built against (do not change without recording it)

All new routes; no existing route, response or status code changes. Errors are
`{ message }`. All four are also served under the `/api` prefix if sibling routes are.

`GET /users/me/instructor-profile` — signed in, teacher or admin.
- 200 `{ "description": string }` (`""` when none). 401 without a valid token. 403 student.

`PUT /users/me/instructor-profile` — signed in, teacher or admin.
- Body `{ "description": string }`, trimmed, 0 to 280 characters after trimming. `""` clears.
- 200 `{ "description": string }` with the stored value. 400 for a longer or non-string
  value. 401, 403 as above.

`GET /instructors` — public, no token needed, a token is ignored.
- 200 `[{ "description": string, "courseIds": string[] }]`: one entry per user who has a
  non-empty description and owns at least one published course; `courseIds` are exactly
  that user's published course ids. No other fields. `[]` when there are none.
- Draft, in-review and archived courses never appear, nor do users without a description.
- `Cache-Control: private, no-store`.

`GET /admin/instructor-profiles` — admin only.
- 200 `[{ "userId": string, "displayName": string, "description": string }]` for every
  user with a non-empty description. 401, 403 otherwise.

`DELETE /admin/instructor-profiles/:userId` — admin only.
- 204, also when there was nothing to clear. 401, 403 otherwise.

Tests must cover: each status above; a student and an anonymous caller get nothing from the
`me` and `admin` routes; the public list for a teacher with a draft only, with a published
course, and after an admin clears; that no id, email or name leaks from `GET /instructors`;
a legacy course without an owner; the 280 limit and trimming.

## Requirements

- A push deploys the API before the frontend. Nothing the deployed frontend calls changes.
- Reproduce any existing behavior you find broken as a defect before fixing it.

## Files

Yours: `api/src/**`, `docs/specs/US-T007-instructor-description.md`, `docs/user_stories.md`,
`docs/architecture.md`, your row in `docs/work_queue.md`, and the version lines the commit
hook requires (`package.json`, `app/package.json`, `package-lock.json`, line 65 of
`app/src/app/services/app-state.service.ts`). `docs/defect_management.md`: append only, as
bytes (the file is not valid UTF-8).

Not yours (Claude is editing them now): everything else under `app/`, including the rest of
`app/src/app/services/app-state.service.ts`, `CLAUDE.md`, `docs/handoffs/**`.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset, restore or check out changes you did not make. Read the version from
`package.json` right before committing; the later committer bumps again. Isolated in-memory
stores only: never the shared spreadsheet, MongoDB, Mux or GitHub. No servers on ports 3001
or 4200. Run `npm run api:test`, `npm run verify:journeys`, `npm run api:build`,
`npm run app:test` and `npm run app:build:pages`. A frontend failure caused by Claude's
unfinished files under `app/` is reported, not fixed, and does not block your commit. If you
need a file outside your list, do NOT stop: finish and commit everything that does not
depend on it, then describe the exact change you need in your queue row. Do not push.
Update your queue row with your commits, what you verified and what you could not, then
stop and summarize, starting with your commit ID.
