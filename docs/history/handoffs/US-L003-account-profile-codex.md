# US-L003 profile details on the account — Codex handoff (API and storage)

Assigned 2026-10-13 by Claude Code (lead). Runs in parallel with Claude's frontend part
(the profile service and page under `app/`, and US-A002) in this same working tree. Read
`AGENTS.md` (including "Two agents in one working tree") first.

## Decisions

By the lead, taken from what the profile page already does (record in the spec as
"confirm or change"):

- Fields and limits are the profile page's existing ones: `bio` 0 to 280 characters,
  `jobTitle` 0 to 120, `company` 0 to 120, `learningGoals` 0 to 280, all plain text and
  trimmed; `avatarColor` a `#rrggbb` hex color, default `#2f4f43`.
- Every signed-in role has a profile. It is private: only its own account reads or writes
  it. No route returns another account's profile, to admins either.
- A teacher's or admin's public description stays where it is (US-T007,
  `/users/me/instructor-profile`). Its routes, storage and behavior do not change. The
  private `bio` here is only the account's own copy of the form field.
- Stored per user in MongoDB in production and in memory locally and in tests, following
  the instructor profile repository. The users spreadsheet is not changed.

## Scope

Write `docs/specs/US-L003-account-profile.md` first (scenarios US-L003-AC01 and AC02 in
`docs/user_stories.md`, plus numbered scenarios for the rules below). Then deliver the API,
validation and storage. Claude delivers all of the frontend against this contract.

## Contract Claude's frontend is built against (do not change without recording it)

Two new routes; no existing route, response or status code changes. Errors are
`{ message }`. Both are also served under the `/api` prefix if sibling routes are. Both
answer `Cache-Control: private, no-store`.

`GET /users/me/profile` — signed in, any role.
- 200 `{ "bio": string, "jobTitle": string, "company": string, "learningGoals": string,
  "avatarColor": string, "updatedAt": string | null }`.
- When the account never saved a profile: the four texts are `""`, `avatarColor` is
  `"#2f4f43"` and `updatedAt` is `null`. The frontend uses `null` to upload the copy an
  existing user still has on their device, once.
- After a save, `updatedAt` is an ISO 8601 timestamp, also when every field was saved empty.
- 401 without a valid token. 503 `{ message }` when the store is unavailable.

`PUT /users/me/profile` — signed in, any role.
- Body: all five fields `bio`, `jobTitle`, `company`, `learningGoals`, `avatarColor`, each
  required. Texts are trimmed before the limits apply. It replaces the whole profile.
  A client-sent `updatedAt` or any other extra field is ignored, not stored.
- 200 with the same shape as the GET, holding the stored values and the new `updatedAt`.
- 400 for a missing field, a non-string, a text over its limit after trimming, or a color
  that is not `#` and six hex digits. Nothing is stored on a 400.
- 401 without a valid token. 503 as above.
- A disabled account and an expired or forged token get what the existing authentication
  gives every other `/users/me` route.

Tests must cover: each status above; defaults and `updatedAt: null` before the first save;
save then read; a second account never sees or changes the first account's profile; a
student, a teacher and an admin can each save; trimming and each limit at and over its
edge; the color rule; a save of all-empty texts still sets `updatedAt`; the instructor
profile routes still answer as before for the same user.

## Requirements

- A push deploys the API before the frontend. Nothing the deployed frontend calls changes.
- Reproduce any existing behavior you find broken as a defect before fixing it.

## Files

Yours: `api/src/**`, `docs/specs/US-L003-account-profile.md`, `docs/architecture.md`, your
row in `docs/work_queue.md`, and the version lines the commit hook requires
(`package.json`, `app/package.json`, `package-lock.json`, the `appVersion` line, line 71,
of `app/src/app/services/app-state.service.ts`). `docs/defect_management.md`: append only,
as bytes (the file is not valid UTF-8).

Not yours (Claude is editing them now): everything else under `app/`, including the rest of
`app/src/app/services/app-state.service.ts`, `CLAUDE.md`, `docs/user_stories.md`,
`docs/specs/US-A002-missing-category.md`, `docs/handoffs/**`. The lead removes US-L003 from
`docs/user_stories.md` at the check; put what should change there in your queue row.

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
