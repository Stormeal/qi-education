# US-P008-AC02 sign-in attempt limit — Codex handoff (API and storage)

Assigned 2026-10-12 by Claude Code (lead). Runs in parallel with Claude's frontend part
(the remaining browser confirmation pop-ups move into the app's own dialog) under `app/` in
this same working tree. Read `AGENTS.md` (including "Two agents in one working tree") first.

## Decisions

By Alex, 2026-10-12: after 10 wrong passwords for one account within 15 minutes, sign-in for
that account is refused for 15 minutes. Counted per account only, never per client address,
so a class behind one school network is not locked out together. Enforced in the API.
Accepted cost: someone who knows an email address can lock that account for 15 minutes.

By the lead (record in the spec as "confirm or change"):

- The count is kept per normalized email address, whether or not an account exists for it,
  and an unknown address is refused exactly like a known one. The limit must not reveal
  whether an account exists.
- A failed attempt is every login answered 401 today: wrong password, unknown address,
  disabled account. A request refused for another reason (400, 503) is not counted.
- The 10th failure within 15 minutes starts the lock. The lock lasts 15 minutes from that
  failure. Attempts during the lock are refused before the password is checked and before
  the users sheet is read (INV-014: no Sheets quota is spent), are not counted, and do not
  extend the lock. After the lock the count starts from zero.
- A successful sign-in clears the count. A password set through a reset link clears the
  count and the lock, so a locked-out user can get back in by "Forgot password?".
- Stored in MongoDB when hosted and in memory locally and in tests, following
  `passwordResetRepository.ts`. The key is a hash of the normalized email; no plain email
  and no password is stored. Counting is atomic, so overlapping attempts on several API
  instances cannot get more than 10 password checks through. Records expire on their own.
  No new environment variable.
- If the store cannot be read or written, sign-in works as it does today (not limited) and
  one line without personal data goes to the API log. Record this as a known limit.
- The limit, the window, the lock duration and the clock are injectable for tests, like
  `passwordResetOptions`.
- Not in scope: signup, the reset routes and their existing mail limit, the wrong current
  password on `POST /users/me/password`, any limit per client address (rest of AC05).

## Scope

Reproduce INV-014 for login first (isolated stores: more than 10 wrong passwords are all
answered 401 and each reads the users store) and append it to `docs/defect_management.md`
as a defect. Append the scenarios to `docs/specs/US-P008-safe-operation.md` (US-P008-AC02 in
`docs/user_stories.md`, plus numbered scenarios for the rules above). Then deliver the API.

## Contract the deployed frontend relies on (do not change without recording it)

`POST /auth/login` and `POST /login` (and their `/api` forms) keep their request, their 200
body, their 400, their 503 and the 401 `{ "message": "Invalid email or password" }`.

New, on the same routes, while an address is locked:

- 429 `{ "message": "Too many sign-in attempts. Try again in 15 minutes.", "code": "too-many-attempts" }`
  with `Retry-After` in seconds and `Cache-Control: no-store`. The minutes in the message
  are the time left, rounded up, with "1 minute" in the singular.

The login page already shows the `message` of any failed login
(`app/src/app/services/auth.service.ts`, line 45), so no frontend change is needed and none
is yours to make.

Tests must cover: attempts 1 to 10 answer 401 and the 11th 429; a correct password during
the lock is 429 and works again after it; an unknown address behaves the same as a known
one in status, body and headers; a disabled account counts; a success before the 10th
failure resets the count; a completed password reset lifts the lock; another account can
sign in while one is locked; upper and lower case and surrounding spaces count as one
address; a locked attempt reads no user; overlapping attempts cannot exceed the limit; a
failing store does not block sign-in; both route forms; no email or password in the store.

## Requirements

- A push deploys the API before the frontend; nothing the deployed frontend calls changes.
- Existing tests that sign in wrongly many times for one address may now meet the limit:
  fix them in your own files, without weakening the limit.
- Reproduce any existing behavior you find broken as a defect before fixing it.

## Files

Yours: `api/src/**`, `docs/specs/US-P008-safe-operation.md`, `docs/user_stories.md`,
`docs/architecture.md`, your row in `docs/work_queue.md`, and the version lines the commit
hook requires (`package.json`, `app/package.json`, `package-lock.json`, the `appVersion`
line 69 of `app/src/app/services/app-state.service.ts`). `docs/defect_management.md`: append
only, as bytes (the file is not valid UTF-8).

Not yours (Claude is editing them now): everything else under `app/`, including the rest of
`app/src/app/services/app-state.service.ts`, `CLAUDE.md`, `docs/handoffs/**`,
`docs/specs/US-A001-user-management.md`.

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
