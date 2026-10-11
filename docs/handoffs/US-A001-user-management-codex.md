# US-A001 user management — Codex handoff (API)

Assigned 2026-10-11 by Claude Code (lead). Runs in parallel with Claude's frontend part (a
"User management" tab on the Admin page) under `app/` in this same working tree. Read
`AGENTS.md` (including "Two agents in one working tree") first.

## Decisions

By Alex, 2026-10-11: the Admin page gets a "User management" tab where an admin can search
users, change a user's role, and reset a user's password. A reset sends the user the same
reset link as "Forgot password"; the admin never sees or chooses a password.

By the lead (record in the spec as "confirm or change"):

- Search matches a part of the display name or the email address, ignoring case. At most 50
  users are returned, sorted by display name, together with the total number of matches.
- Roles are `student`, `teacher` and `admin`. An admin cannot change their own role. That
  also guarantees that at least one admin always remains.
- A role change takes effect on the user's next request, because the session middleware
  already reads the user from the store on every request. Nothing is built to push it to a
  browser that is open.
- A teacher who is made a student keeps the courses they own but can no longer author
  them. Nothing is transferred or deleted.
- Account status (deactivating an account) is not part of this increment. Auditing of role
  changes is not built; record both as open in US-A001.
- The role is written to the users spreadsheet in its own cell only (DEF-026: never rewrite
  the whole row).
- An admin-triggered reset counts towards the account's three reset mails per hour.

## Scope

Write `docs/specs/US-A001-user-management.md` first (scenarios US-A001-AC01 and AC02 in
`docs/user_stories.md`, plus numbered scenarios for the rules below). Then deliver the API.
Claude delivers the frontend against this contract.

## Contract Claude's frontend is built against (do not change without recording it)

All new routes, admin only; no existing route, response or status code changes. Errors are
`{ message }`. `Cache-Control: no-store`. Without a valid session 401; for a student or a
teacher 403, with nothing about any user in the body.

User in every response below, and nothing else (never a password hash or enrolled courses):

```
{ "id": string, "email": string, "displayName": string, "role": "student" | "teacher" | "admin",
  "status": string, "createdAt": string }
```

`GET /admin/users?search=<text>`

- 200 `{ "users": User[], "total": number }`. `search` is optional, trimmed, at most 100
  characters; without it the first 50 users by display name are returned. `total` is the
  number of matches before the limit of 50.

`PATCH /admin/users/:userId/role` — body `{ "role": "student" | "teacher" | "admin" }`

- 200 with the updated User. Setting the role a user already has is a 200 without a write.
- 400 `{ message }` for another role value.
- 404 `{ "message": "User not found" }`.
- 409 `{ "message": "You cannot change your own role.", "code": "own-role" }`.

`POST /admin/users/:userId/password-reset` — no body

- 202 `{ "message": "A reset link was sent to <email>." }`. The mail, the token, its
  lifetime and its storage are exactly those of `POST /auth/password-reset/request`.
- 404 `{ "message": "User not found" }`.
- 409 `{ "message": "This account is not active.", "code": "account-inactive" }`.
- 409 `{ "message": "This account already received three reset mails in the last hour.", "code": "reset-limit" }`.
- 503 `{ "message": "We could not send email right now. Please try again later." }` when
  mail is not configured or the provider failed; no usable token is left behind.

Tests must cover: every status above; a student, a teacher and an anonymous caller on each
route; search by name and by email in mixed case, the limit and the total; no password
hash in any response or log; the role write touches only the role cell (Sheets double) and
survives a concurrent enrollment and a concurrent password reset; the new role applies to
that user's next request with their existing session; an admin-triggered reset behaves like
a requested one (limit, single use, notice after use).

## Requirements

- A push deploys the API before the frontend; nothing the deployed frontend calls changes.
- Never send real mail and never call Brevo from a test or a local run.
- Reproduce any existing behavior you find broken as a defect before fixing it.

## Files

Yours: `api/src/**`, `docs/specs/US-A001-user-management.md`, `docs/user_stories.md`,
`docs/architecture.md`, your row in `docs/work_queue.md`, and the version lines the commit
hook requires (`package.json`, `app/package.json`, `package-lock.json`, the `appVersion`
line of `app/src/app/services/app-state.service.ts`). `docs/defect_management.md`: append
only, as bytes (the file is not valid UTF-8).

Not yours (Claude is editing them now): everything else under `app/`, including the rest of
`app/src/app/services/app-state.service.ts`, `CLAUDE.md`, `docs/handoffs/**`.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset, restore or check out changes you did not make. Read the version from
`package.json` right before committing; the later committer bumps again. Isolated in-memory
stores and stubs only: never the shared spreadsheet, MongoDB, Mux, GitHub or Brevo, and
never real mail. No servers on ports 3001 or 4200. Run `npm run api:test`,
`npm run verify:journeys`, `npm run api:build`, `npm run app:test` and
`npm run app:build:pages`. A frontend failure caused by Claude's unfinished files under
`app/` is reported, not fixed, and does not block your commit. If you need a file outside
your list, do NOT stop: finish and commit everything that does not depend on it, then
describe the exact change you need in your queue row. Do not push. Update your queue row
with your commits, what you verified and what you could not, then stop and summarize,
starting with your commit ID.
