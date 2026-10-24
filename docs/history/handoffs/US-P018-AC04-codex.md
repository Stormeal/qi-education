# US-P018-AC04: Codex handoff (API production dependencies)

Started 2026-10-24. Owner: Codex. Claude Code builds US-A004-AC06 (changed career criteria) at the
same time in the same working tree.

- Story: US-P018-AC04 in [user_stories.md](../../user_stories.md): every high or critical finding in
  the API's production dependencies is fixed or accepted with a reason before release 1.
- Starting point: [audits/2026-10-dependencies.md](../../audits/2026-10-dependencies.md) (X7) and a fresh
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
| Investigation / implementation plan (2026-10-24) | Base `3953dfb`, `main`, Codex | Required commit present; clean starting tree; fresh production audit: 3 high, 0 critical | Reproduce Zod omitted-points compatibility before changing its schema; preserve validation messages; isolate patched ip-address under MongoDB without moving the driver or app dependencies; fix or explicitly accept body-parser within the no-major constraint; run all requested checks, patch bump and commit only owned changes. |
| ip-address fixed | `0baf101` | Normal install and independent clean production `npm ci` resolve MongoDB → SOCKS 2.8.9 → ip-address 10.7.4; leading-zero IPv4 rejected; optional GCP peer stays absent | Private nested copies keep MongoDB 7.7.0 in its original location; app graph unchanged (602 nodes / 1,201 edges). No major upgrade. |
| Zod accepted; tested update removed | `0baf101` | 4.6.7 plus a temporary points default passed the suite, but independent review reproduced a 4,205-byte, 51-question invalid-image request changing the public error message and envelope | Retain 4.3.6 to keep the strict response contract. Validation amplification is reachable despite 100 KB / 4 MB body bounds; course-content path requires author access. Accepted bounded resource risk; revisit validation-error contract before release 1. No source changes retained. |
| body-parser accepted | `0baf101` | Invalid-limit trigger absent: valid default 100 KB / literal 2mb / 4mb; compressed-body high advisory remains potentially reachable with default inflation | Supported fixes require content-type major 2, disallowed here. Disabling inflation changes accepted compressed requests to 415 and requires protected `server.ts`; not applied. Accepted availability risk recorded in audit; revisit parser major before release 1. |
| Final verification, 2026-10-24 | `0baf101` | API 2,568 passed + 2 expected failures / 101 files; app 504 + 23 UI-foundation tests; journeys 18; API build and Pages build pass. Audit 3 high / 0 critical → 2 high / 0 critical (Zod and body-parser explicitly accepted) | Initial career assertion failures were corrected by Claude in `5b040de`; API backup and app course-review 5 s timeouts during simultaneous checks both pass in full serial reruns without code changes. No shared services, secrets, push or deployment; no protected source change required. Not verified: hosted/proxy/provider integrations, gateway protections, Linux execution or browser UI. |
