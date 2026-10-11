# US-P003 safe account and feedback writes — Codex handoff (API)

Assigned 2026-10-11 by Claude Code (lead). Runs in parallel with Claude's fix of DEF-022
(keyboard focus in the lesson editor dialog) under `app/src/app/ui/course-builder/` in this
same working tree. Read `AGENTS.md` (including "Two agents in one working tree") first.

## Why

INV-003 and INV-004 in `docs/defect_management.md` are code readings that were never
reproduced: signup checks the email and then appends; enrollment reads a user row and
rewrites it; feedback triage creates the GitHub issue before saving its link. Story:
US-P003 in `docs/user_stories.md`, scenarios AC01 to AC03.

## Decisions taken by the lead (record them in the spec as "confirm or change")

Alex has not decided the uniqueness strategy for Sheets, so this increment does not invent
one that needs new shared infrastructure.

- Within one API instance, overlapping writes for the same normalized email (signup) and
  for the same user (enrollment) run one after another.
- Across several API instances nothing new is guaranteed. Say so plainly in the spec and
  leave that part of the story open with the decision Alex has to take.
- Triage retry: before creating a GitHub issue, reuse the issue this feedback already has
  or already created. Choose the smallest mechanism that survives a failed save; record it.
- No attempt limits, no auth abuse controls (that is US-P008-AC02).

## Scope

1. Write `docs/specs/US-P003-safe-retries.md` from the template first.
2. Reproduce each of AC01, AC02 and AC03 with isolated stores and stubs (RED). Promote each
   one that reproduces to the next DEF IDs, keeping the investigation link. One that does
   not reproduce is recorded as not reproduced, with the evidence, and not "fixed".
3. Fix the reproduced ones within the decisions above.
4. Update `docs/user_stories.md` (remove delivered scenarios, keep what stays open) and
   `docs/architecture.md` if it describes these writes.

## Contract Claude's frontend relies on (do not change)

No frontend file changes, and none may be needed.

- A signup that loses an overlap gets exactly the status and `{ message }` body that a
  signup with an already-registered email gets today.
- Enrollment, login, signup and feedback routes keep their paths, request shapes, success
  responses and status codes.
- The triage response keeps its shape; a retry returns the same issue link as the first try.
- The interfaces of the auth and feedback repositories may grow, but the Sheets and
  in-memory implementations must both satisfy them, and `api/src/server.ts` wiring for every
  other route stays as it is.

## Files

Yours: `api/src/**`, `docs/specs/US-P003-safe-retries.md`, `docs/user_stories.md`,
`docs/architecture.md`, your row in `docs/work_queue.md`, and the version lines the commit
hook requires (`package.json`, `app/package.json`, `package-lock.json`, line 65 of
`app/src/app/services/app-state.service.ts`).

`docs/defect_management.md`: append only, at the end of the file or as new table rows.
Claude will edit the DEF-022 entry in the same file. Note that this file is not valid
UTF-8; append with tools that do not re-encode it.

Not yours (Claude is editing them now): everything else under `app/`, `CLAUDE.md`,
`docs/specs/US-T013-simple-quiz.md`, `docs/handoffs/**`.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset, restore or check out changes you did not make. Read the version from
`package.json` right before committing; the later committer bumps again. Isolated in-memory
stores and stubs only: never the shared spreadsheet, MongoDB, Mux or GitHub. No servers on
ports 3001 or 4200. Run `npm run api:test`, `npm run verify:journeys`, `npm run api:build`,
`npm run app:test` and `npm run app:build:pages`. A frontend failure caused by Claude's
unfinished files under `app/` is reported, not fixed, and does not block your commit. If you
need a file outside your list, do NOT stop: finish and commit everything that does not
depend on it, then describe the exact change you need in your queue row. Do not push.
Update your queue row with your commits, what you verified and what you could not, then
stop and summarize, starting with your commit ID.
