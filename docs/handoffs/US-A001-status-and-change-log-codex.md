# US-A001 account status and change log — Codex handoff (API and storage)

Assigned 2026-10-11 by Claude Code (lead). Runs in parallel with Claude's frontend part
(deactivate and reactivate buttons and a change log in the "User management" tab) under
`app/` in this same working tree. Read `AGENTS.md` (including "Two agents in one working
tree") first.

## Decisions

By Alex, 2026-10-11: an admin can deactivate and reactivate any account except their own. A
deactivated user cannot log in and is logged out on their next request. A log shows who
changed whose role or status and when; it is visible to admins only and kept without a time
limit.

By the lead (record in the spec as "confirm or change"):

- The two statuses are the existing `active` and `disabled`. Nothing else is added.
- An admin cannot change their own status, as they cannot change their own role. One active
  admin therefore always remains. Two admins deactivating each other at the same moment is
  not prevented; record it as a known limit.
- The status is written to the users spreadsheet in its own cell only (DEF-026).
- A log entry is written for every role or status change made through the admin routes that
  actually changed something. It stores the names as they were at that moment, so the log
  stays readable after a rename.
- The change is made first and logged second. If the log cannot be written, the change
  stands, the response is still successful, and one line without personal data goes to the
  API log. Record this as a known limit.
- The log is stored in MongoDB in production and in memory locally and in tests, following
  the instructor profile repository. It is never written to the users spreadsheet.
- Changes made before this increment have no entry. Nothing is backfilled.

## Scope

Append the new scenarios to `docs/specs/US-A001-user-management.md` first (US-A001-AC07 and
AC08 in `docs/user_stories.md`, plus numbered scenarios for the rules below). Then deliver
the API. Claude delivers the frontend against this contract.

## Contract Claude's frontend is built against (do not change without recording it)

New routes, admin only; errors are `{ message }`; `Cache-Control: no-store`; 401 without a
valid session; 403 for a student or teacher with nothing about any user or change in the
body. `User` is the shape the existing admin routes return. The existing routes keep their
paths, requests and responses.

`PATCH /admin/users/:userId/status` — body `{ "status": "active" | "disabled" }`

- 200 with the updated User. Setting the status a user already has is a 200 without a write
  and without a log entry.
- 400 `{ message }` for another value.
- 404 `{ "message": "User not found" }`.
- 409 `{ "message": "You cannot change the status of your own account.", "code": "own-status" }`.

Effect, to be shown by tests: a disabled account's next authenticated request with its
existing session answers 401; its login is refused the way a wrong password is refused
today, without saying the account is disabled; after reactivation both work again.

`GET /admin/users/changes`

- 200 `{ "changes": Change[] }`, newest first, at most 50.

```
Change = { "id": string, "at": string (ISO time),
           "actor":  { "id": string, "displayName": string },
           "target": { "id": string, "displayName": string, "email": string },
           "field": "role" | "status", "from": string, "to": string }
```

The existing `PATCH /admin/users/:userId/role` now also writes a Change when the role
actually changed. Its response does not change.

Tests must cover: every status above; a student, a teacher and an anonymous caller on both
new routes; the status write touches only the status cell and survives a concurrent
enrollment, role change and password reset; the session and login effects in both
directions; one log entry per real change and none for an unchanged value; newest first and
the limit of 50; names captured at the time of the change; a failing log store does not
fail or undo the change; no password hash anywhere.

## Requirements

- A push deploys the API before the frontend; nothing the deployed frontend calls changes.
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
stores and stubs only: never the shared spreadsheet, MongoDB, Mux, GitHub or Brevo. No
servers on ports 3001 or 4200. Run `npm run api:test`, `npm run verify:journeys`,
`npm run api:build`, `npm run app:test` and `npm run app:build:pages`. A frontend failure
caused by Claude's unfinished files under `app/` is reported, not fixed, and does not block
your commit. If you need a file outside your list, do NOT stop: finish and commit everything
that does not depend on it, then describe the exact change you need in your queue row. Do
not push. Update your queue row with your commits, what you verified and what you could
not, then stop and summarize, starting with your commit ID.
