# X8 fixes (Codex)

Written 2026-10-24 by Claude after checking the X8 audit. Owner: Codex. Base: `a65bfa0`.

## Part 1: commit the X8 audit

The audit report, the DEF-059–DEF-063 rows and the X8 queue row are written but were never
committed (the commit hook refuses commits without a version bump). Claude checked them: only
Codex's files, the brief kept, and all four checks pass on `42406c0` (API 2,568 + 2 expected
failures, app 524, journeys 18, Pages build).

Before committing, in `docs/defects.md` mark **DEF-061** and **DEF-063** as `P2 / Fixed`: fixed by
Claude in `a65bfa0`. Regressions: `DEF-061 ignores a stale check, so the shown invitation is the one
accepted` in `join-organization-page.spec.ts` (failed before: page showed the older organization);
`DEF-063 loads the edited course content while an unrelated thumbnail never finishes` in
`course-navigation.spec.ts` (failed before: content never loaded). DEF-063's broader suggestions
(visible-only images, a concurrency cap) are not done; leave them in the row as remaining work.

In `docs/work_queue.md`, delete the stale sentence starting "**Claude** (same day): US-L026…" at
the end of the X8 paragraph (US-L026 is delivered in `42406c0`).

## Part 2: fix the three API defects

One commit per defect, in this order, each with the regression the report describes failing
before the fix and passing after, on both the plain and `/api` paths where HTTP is involved.

1. **DEF-059 (P1)** Rise import path escape. Validate every attachment, video and cover path
   against the canonical export/assets root before `stat` or reading; refuse `..`, absolute,
   drive/UNC paths and symlinks that leave the root, and report them as import problems.
   Files: `api/src/riseImport.ts`, `api/src/riseImportRun.ts`, their tests.
2. **DEF-060 (P1)** Invitation recovery undoes a removal. Removal must retire the accepted
   invitation's claim so a replay of the same token after removal is refused (410), while a
   retry after an interrupted acceptance that never inserted the membership still recovers.
   Files: `api/src/organizationService.ts`, `api/src/organizationRepository.ts` (only if a stored
   field is needed; additive, old documents keep working), organization tests.
3. **DEF-062 (P2)** Retired action ID reused with a new meaning. Keep every action identity ever
   published for a career (ID, kind, title, course) in the stored career document, additively,
   and refuse a publish that reuses a known ID with a different kind or course, with a plain
   message asking for a new action ID. A changed title alone is allowed. Existing published
   careers must still load and publish. Files: `api/src/careerPath.ts`, the publish route in
   `api/src/server.ts` (that handler only), `api/src/careerPathRepository.ts` (only if needed),
   tests. Default chosen by Claude; Alex may change it: "kind or course changed = new ID".

## Contract Claude relies on

No route, response shape or permission changes. New refusals use the existing error format
(`{ message }`, 400 for an import problem or a refused publish, 410 for a refused invitation).
`npm run api:test`, `npm run api:build`, `npm run verify:journeys` and `npm run app:build:pages`
pass after each commit.
