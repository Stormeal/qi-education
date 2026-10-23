# US-O001 release 1: Codex handoff (Track A, API)

Started 2026-10-23. Owner: Codex. Claude Code builds Track B (`app/**`) at the same time.

- Contract: [stories/US-O001-release-1.md](../stories/US-O001-release-1.md) (approved by Alex). Its
  route table, shapes and status codes are what the app is built against: do not change them. If
  one cannot work, finish everything else and report it.
- Plan: [superpowers/plans/2026-10-23-organizations-release-1.md](../superpowers/plans/2026-10-23-organizations-release-1.md),
  **Track A, tasks A1–A6**, one commit per task, message starting with the task ID (`A1: …`).
- Scenarios: US-O001-AC01 to AC12 plus the plan's Review Focus 1–5.
- Files Codex owns: new `api/src/organization*.ts` files and their tests; the listed changes in
  `api/src/server.ts`, `courseAccess.ts`, `learningProgress.ts`, `lessonExtrasRoutes.ts`,
  `emailConfirmationRoutes.ts`, the sign-in route, `journey.test.ts`; its row in `docs/work_queue.md`;
  version files when committing.
- Not Codex's: `app/**`, `docs/stories/**`, `docs/specs/**`, `docs/user_stories.md`,
  `docs/defects*.md`, `CLAUDE.md`, `AGENTS.md`.
- Isolated in-memory stores and fake mail only (plus the existing Mongo test setup used by
  `journey.test.ts`); no real MongoDB, Brevo, Stripe, Mux or GitHub; ports 3001 and 4200 are Claude's.

## Progress

| Task | Commit | Checks | Notes |
| --- | --- | --- | --- |
| A1 | 0d80dea | Store/schema tests 11/11; API 2442 passed + 2 expected failures (95 files); build passed (2026-10-23) | Both stores; Mongo uses an isolated driver double, no real Mongo. Added deleteOrganization for A2 compensation. Uncapped run hit an existing sign-in timing failure; VITEST_MAX_WORKERS=4 passed. |
| A2 | df36ee1 | Service 7/7; API 2449 passed + 2 expected failures (96 files); build passed | AC01–03, AC11–12; fake mail; approval compensation verified. |
| A3 | 89ce8b7 | Invitation tests 8/8; API 2457 passed + 2 expected failures (97 files); build passed | AC04–06; Review Focus 1–2; SHA-256 tokens, exact consent, fake mail, conditional acceptance/activation. |
| A4 | a59317c | Members/access 10/10; API 2467 passed + 2 expected failures (98 files); build passed | AC07–10, AC12; Review Focus 3,5. Membership writes use existing Mongo lock mechanism in organization_locks. Contract gap: no response field exposes started courses, so My Learning cannot distinguish started/open or retain locked entries from this API alone; contract unchanged. |
| A5 | A5: organization routes and course access (this commit) | HTTP matrix 21/21; recovery and related tests 74/74; permission inventory 222/222; API 2547 passed + 2 expected failures (100 files); build passed | Independent review: 4 important findings reproduced RED then fixed (resumable approval/joining, ambiguous Mongo writes retain ownership, retire pending course requests on departure). Fixed redundant authentication read and unique update parity. Alex approved 25 permission entries in routePermissions.test.ts. Contract frozen at ecf1eb6; concurrent 3693445 amendments intentionally not implemented pending human direction. |
| A6 | | | |
