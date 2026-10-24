# US-P018-AC04: Codex handoff (API production dependencies)

Started 2026-10-24. Owner: Codex. Claude Code builds US-A004-AC06 (changed career criteria) at the
same time in the same working tree.

- Story: US-P018-AC04 in [user_stories.md](../user_stories.md): every high or critical finding in
  the API's production dependencies is fixed or accepted with a reason before release 1.
- Starting point: [audits/2026-10-dependencies.md](../audits/2026-10-dependencies.md) (X7) and a fresh
  `npm audit --omit=dev --workspace api` on 2026-10-24, which reports 3 high, 0 critical:
  - `zod` (direct): memory exhaustion while validating oversized constrained collections. Zod 4.6
    was reverted in X7 after 163 test failures.
  - `body-parser` (through `express`): invalid `limit` value silently disables size enforcement.
  - `ip-address` (through the MongoDB driver's `socks`): leading-zero octets decoded as decimal.
- Done means: each finding is fixed by a compatible update, or accepted with a reason that shows
  whether this API can reach it (for example the body limits in `server.ts`, whether SOCKS is
  configured). Dev-only and app findings stay out of scope. No major upgrades.
- Contract Claude relies on: no route, status code, response shape or error message changes; every
  existing API and app test passes; `npm run verify:journeys` passes.

## Files

- Codex owns: `api/package.json`, `package-lock.json` (dependency entries, and its three version
  lines when committing), `docs/audits/2026-10-dependencies.md` (a new US-P018-AC04 section), this
  file's Progress section, its row in `docs/work_queue.md`, and the version lines in `package.json`,
  `app/package.json` and `app/src/app/services/app-state.service.ts` when committing.
- Codex may edit other `api/src/**` files only where an update needs a compatible code change.
- Not Codex's (Claude is changing them): `api/src/careerPath.ts`, `api/src/careerPathRepository.ts`,
  `api/src/accountCareers.ts`, `api/src/accountCareersRoutes.ts`, `api/src/server.ts`, every
  `api/src/career*.test.ts` and `api/src/accountCareers*.test.ts`, `app/**` (except the version
  line), `docs/stories/**`, `docs/specs/**`, `docs/user_stories.md`, `CLAUDE.md`, `AGENTS.md`.
  If an update needs a change in one of these, finish everything else, then report the exact change
  (file, line, before and after) here and in the summary.

## Progress

| Step | Commit | Checks | Notes |
| --- | --- | --- | --- |
