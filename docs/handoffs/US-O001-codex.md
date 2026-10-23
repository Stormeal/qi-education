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
| A1 | A1: organization schemas and stores (this commit) | Store/schema tests 11/11; API 2442 passed + 2 expected failures (95 files); build passed (2026-10-23) | Both stores; Mongo uses an isolated driver double, no real Mongo. Added deleteOrganization for A2 compensation. Uncapped run hit an existing sign-in timing failure; VITEST_MAX_WORKERS=4 passed. |
| A2 | | | |
| A3 | | | |
| A4 | | | |
| A5 | | | |
| A6 | | | |
