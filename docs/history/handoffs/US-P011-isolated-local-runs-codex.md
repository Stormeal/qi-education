# US-P011 isolated local runs — Codex handoff (API, scripts, docs)

Assigned 2026-10-11 by Claude Code (lead). Runs in parallel with Claude's frontend work on
US-P010 (open the app at once instead of "Restoring your session") and US-P012 (no hosted
fallback on localhost) under `app/` in this same working tree. Read `AGENTS.md` (including
"Two agents in one working tree") first.

## Why

Audit of outside calls, 2026-10-11, finding 3. `npm run app:dev` and `npm run api:dev` load
`api/.env`, which holds the real keys for Google Sheets, MongoDB, Mux and GitHub. A course
saved, a video uploaded or feedback triaged during development lands in the shared
spreadsheet, the shared database, real Mux storage and a real GitHub issue. Mux can charge
per upload. Story: US-P011 in `docs/user_stories.md`, scenarios AC01 to AC03.

## Decisions

By Alex, 2026-10-11: build it. He did not change the lead's suggested setting name.

By the lead (record in the spec as "confirm or change"):

- The setting is `USE_SHARED_SERVICES`. Only the exact value `1` opts in.
- "Hosted" means `NODE_ENV` is `production` or the `VERCEL` environment variable is set.
  A hosted API ignores the setting and behaves exactly as today. The second condition is a
  safety net: if the host ever stopped setting `NODE_ENV`, the live API must not fall back
  to memory stores.
- Every other run is isolated unless it opts in: users, courses, course content, assets,
  feedback, career paths, learning progress, instructor profiles, reset tokens, Mux video,
  Mux webhooks and GitHub feedback use their local implementations (or are absent where
  they are absent today without settings), whatever `api/.env` contains.
- Mail does not change: outside production it is only printed, opted in or not.
- Prefer one place for the rule over a check in every factory, for example by not exposing
  the shared services' settings from `api/src/config.ts` to an isolated run. Keep
  `AUTH_TOKEN_SECRET`, `PORT` and `CORS_ORIGIN` working from `api/.env` either way.
- Tests stay isolated whatever the setting says (DEF-029: `NODE_ENV` is pinned to `test`).

## Scope

Write `docs/specs/US-P011-isolated-local-runs.md` first. Then:

1. The rule above in `api/src/**`.
2. At startup the API prints one line that names the mode, for example
   `Stores: isolated (set USE_SHARED_SERVICES=1 to use the shared services)` or
   `Stores: SHARED services`. No key or address is printed.
3. `GET /health/config` gains `mode: "isolated" | "shared" | "hosted"`. Nothing else in
   that response changes.
4. `scripts/doctor.mjs` reports the mode and no longer treats missing shared settings as a
   failure of an isolated run. `scripts/run-app-dev.mjs` passes the setting through
   unchanged if it is set.
5. `docs/local_development.md`, `docs/architecture.md` and `api/.env.example`: how to run
   isolated (default) and how to opt in. Do not touch `api/.env`.

## Contract Claude's frontend relies on

- No route, request, response or status code changes, apart from the new `mode` field.
- An isolated local API keeps sending the response header
  `x-qi-education-auth-storage: memory` on a failed demo login, as it does today without
  settings. Claude updates the hint the login page shows for it.
- The demo users and the demo course of the in-memory stores are unchanged.

Tests must cover: with real-looking settings present and no opt-in, every factory returns
its local implementation and nothing calls a shared client (use the existing doubles);
with the opt-in, the shared implementations are selected; production and a `VERCEL`
environment ignore the setting in both directions; the health field and the startup line;
no setting value in any log line.

## Requirements

- The hosted API must behave exactly as today. This is the one outcome that must not
  regress: treat any doubt about the hosted detection as a blocker and report it.
- Never touch the shared spreadsheet, MongoDB, Mux, GitHub or Brevo while testing this.
- Reproduce any existing behavior you find broken as a defect before fixing it.

## Files

Yours: `api/src/**`, `api/.env.example`, `scripts/doctor.mjs`, `scripts/run-app-dev.mjs`,
`docs/specs/US-P011-isolated-local-runs.md`, `docs/user_stories.md`,
`docs/architecture.md`, `docs/local_development.md`, your row in `docs/work_queue.md`, and
the version lines the commit hook requires (`package.json`, `app/package.json`,
`package-lock.json`, the `appVersion` line of `app/src/app/services/app-state.service.ts`).
`docs/defect_management.md`: append only, as bytes (the file is not valid UTF-8).

Not yours (Claude is editing them now): everything else under `app/`, including the rest of
`app/src/app/services/app-state.service.ts`, `CLAUDE.md`, `.claude/launch.json`,
`docs/handoffs/**`. Never read out or change `api/.env`.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset, restore or check out changes you did not make. Read the version from
`package.json` right before committing; the later committer bumps again. Isolated in-memory
stores and stubs only. No servers on ports 3001 or 4200. Run `npm run api:test`,
`npm run verify:journeys`, `npm run api:build`, `npm run app:test` and
`npm run app:build:pages`. A frontend failure caused by Claude's unfinished files under
`app/` is reported, not fixed, and does not block your commit. If you need a file outside
your list, do NOT stop: finish and commit everything that does not depend on it, then
describe the exact change you need in your queue row. Do not push. Update your queue row
with your commits, what you verified and what you could not, then stop and summarize,
starting with your commit ID.
