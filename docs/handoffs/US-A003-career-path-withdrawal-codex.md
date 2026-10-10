# US-A003 career path withdrawal and edit protection — Codex handoff

Assigned 2026-10-10 by Claude Code (lead). Runs in parallel with Claude's rebuild of the
Admin page and the career path editor in this same working tree. Read `AGENTS.md` (including
"Two agents in one working tree") and the
[career path spec](../specs/US-L009-L012-T008-career-paths.md), which lists both items below
as known gaps: "unpublishing a path" (excluded) and "two admins saving the same path at
once — last save wins" (known limit).

## Why now

Alex is mapping real courses and publishing paths on the live site, and asked for an
organized Admin page. An admin who publishes a mistake cannot take it back today, and two
admins can silently overwrite each other. The new editor needs both closed.

## Scope

Add story **US-A003 — Withdraw a published career path and protect concurrent edits** to
`docs/user_stories.md` with these scenarios, then deliver it:

- **AC01 Withdraw.** An admin withdraws a published path. It disappears from
  `GET /career-paths` and `GET /career-paths/:id` (404 with `{ message }`). Its content stays
  editable as a draft, and its learner selections are kept, so publishing it again restores
  it for the learners who chose it. Students and teachers get 403; anonymous gets 401.
- **AC02 Stale save.** When an admin saves or publishes a path that another admin changed
  since it was loaded, nothing is saved and the answer is 409.
- **AC03 Compatibility.** A save or publish that does not say which version it was based on
  behaves exactly as today.

Write `docs/specs/US-A003-career-path-withdrawal.md` before implementing.

## Contract Claude's frontend is built against (do not change without recording it)

- `POST /admin/career-paths/:id/unpublish` — admin only. Returns the same body shape as
  `PUT /admin/career-paths/:id` (the admin path with `published: null`, a `draft`, `revision`,
  `updatedAt`, `learners`). Withdrawing a path that is not published returns 409 with
  `{ message }`. The revision number is not reset.
- `PUT /admin/career-paths/:id` and `POST /admin/career-paths/:id/publish` accept an optional
  request header `X-Expected-Updated-At` holding the `updatedAt` the admin loaded. When it is
  present, not empty, and differs from the stored `updatedAt`, answer 409 with
  `{ message, code: "CAREER_PATH_CONFLICT" }` and store nothing. Absent or empty: no check.
- The unpublish route accepts the same header with the same rule.
- CORS must allow the new header from the existing origins.

## Files

Yours: `api/src/**`, `docs/specs/US-A003-career-path-withdrawal.md`, `docs/user_stories.md`,
`docs/defect_management.md`, `docs/architecture.md`, and your row in `docs/work_queue.md`.

Not yours (Claude is editing them now): everything under `app/`, `CLAUDE.md`,
`docs/specs/US-L009-L012-T008-career-paths.md`.

## Requirements

- The check and the write must not allow two saves based on the same version to both
  succeed against real MongoDB; say in the spec how that is guaranteed and what could only
  be proven with the in-memory store.
- Existing routes, response shapes and the deployed frontend keep working (a push deploys
  the API before the frontend).
- A path that was never stored (an unsaved starter draft) has no version to compare; define
  and test that case.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset or restore changes you did not make. Read the version from `package.json` right
before committing and apply the aligned bump the hook requires (this touches
`package.json`, `app/package.json`, `package-lock.json` and the `appVersion` line in
`app/src/app/services/app-state.service.ts`; those four version lines are the only thing you
may change under `app/`). Use in-process tests or ports other than 3001 and 4200. Isolated
in-memory stores only. Run `npm run api:test`, `npm run verify:journeys` and
`npm run api:build`. Run `npm run app:test` too, but a failure caused by Claude's unfinished
files under `app/` is reported, not fixed, and does not block your commit. If you need a
file outside your list, do not wait for an answer: write the need in your queue row, commit
what is yours, and stop. Do not push. Update your queue row with the commit, what you
verified and what you could not, then stop and summarize.
