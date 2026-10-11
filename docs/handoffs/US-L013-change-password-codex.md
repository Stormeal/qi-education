# US-L013 change password while signed in — Codex handoff (API)

Assigned 2026-10-11 by Claude Code (lead). Runs in parallel with Claude's frontend part (a
password section on the profile page) under `app/` in this same working tree. Read
`AGENTS.md` (including "Two agents in one working tree") first.

## Why this item

No confirmed defect is open. Alex asked for the account email stories on 2026-10-11 and the
order recorded then was US-P009, US-P008-AC05, US-L004, US-L013, US-L014. The first three
are live, so US-L013 is next.

## Decisions taken by the lead (record in the spec as "confirm or change")

- The current password is required, also for teachers and admins.
- The new password follows the signup rules and must differ from the current one.
- A wrong current password is answered with 400, never 401: the frontend treats every 401
  as an expired session and signs the user out.
- Any password change, through this route or through a reset link, cancels every unused
  reset link of that account. Today a second, older link stays usable for up to 60 minutes
  after a reset; that is closed in this increment.
- Other signed-in browsers stay signed in (signed tokens; known limit from US-L004).
- No limit on wrong current-password attempts here; that belongs to US-P008-AC02. Record
  it as open.

## Scope

Write `docs/specs/US-L013-change-password.md` first (scenarios US-L013-AC01 and AC02 in
`docs/user_stories.md`, plus numbered scenarios for the rules below). Then deliver the API.
Claude delivers the frontend against this contract.

## Contract Claude's frontend is built against (do not change without recording it)

One new route; no existing route, response or status code changes. Errors are `{ message }`.

`POST /users/me/password` — signed in, any role. Body
`{ "currentPassword": string, "newPassword": string }`. `Cache-Control: no-store`.

- 204 when the password was changed. Signing in with the new password then works and with
  the old one does not; `/auth/login` itself is not changed.
- 400 `{ "message": "Your current password is not correct.", "code": "current-password-incorrect" }`
  when the current password does not match. Nothing is changed.
- 400 `{ message }` with the signup rule's own message when the new password breaks the
  rules, and 400 `{ "message": "Choose a password that differs from your current one." }`
  when it equals the current one. Check the current password first, so that these two
  answers never confirm a guessed current password.
- 401 without a valid session, as every protected route answers today.
- 503 `{ message }` when the user store is unavailable.
- After a change, the notice mail of US-L004 goes to the account's address (same subject and
  text, through the same sender). A notice that cannot be sent does not undo or fail the
  change. Locally and in tests the local sender is used; never Brevo.
- After a change by this route or by `POST /auth/password-reset/confirm`, every unused reset
  token of that account answers 410 on check and confirm.

Tests must cover: every status above; the order of the checks; both stores of the password
update; a change cancels pending reset tokens, and so does a reset confirm; the notice is
sent once and its failure is harmless; no password or hash in any log line or response.

## Requirements

- A push deploys the API before the frontend; nothing the deployed frontend calls changes.
- Reproduce any existing behavior you find broken as a defect before fixing it. The older
  reset link staying valid after a reset is a known gap from the US-L004 decisions, not a
  defect to log; record it in the spec as closed by this increment.

## Files

Yours: `api/src/**`, `docs/specs/US-L013-change-password.md`,
`docs/specs/US-L004-password-reset.md` (append only), `docs/user_stories.md`,
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
