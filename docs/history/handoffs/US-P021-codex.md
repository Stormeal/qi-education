# US-P021 privacy API execution record

Owner: Codex. Branch: main. Base: 195d7fc. Started: 2026-10-31.
Contract: docs/stories/US-P021-gdpr-data-rights.md.
Plan: docs/superpowers/plans/2026-10-30-us-p021-gdpr-data-rights.md.
Scope: API tasks 1–6; frontend tasks 7–9 remain assigned to Claude.

## Preflight

| Tasks | Interface / finding |
| --- | --- |
| 1 | Existing account status is active/disabled; email is a non-null string and uniquely indexed. Seeding at synchronous server construction would create unawaited shared writes. |
| 2–3 | Export/disposition share repository interfaces. Update them together per domain, with RED/GREEN evidence. Include both memory and Mongo adapters. |
| 4 | Registry must cover real stores rather than merely compare a list against itself. |
| 5 | Disabling login before cleanup makes ordinary authenticated HTTP retry impossible. A narrowly scoped retry path must authenticate the pre-erasure session and password while permanently refusing other account actions. |
| 6 | Preserve caller scoping, no-store headers, aliases, rate limits, write freezes and generic failures. |
| 1 / 5 | Seed the system owner lazily, awaited before transfer, preserving server construction and read-only startup. |
| 2–3 / 4–6 | One owner per file; repository adapters expose collectForExport and the named disposition. Service composes them. |
| 7–9 | Reserved for Claude; no app behavior changes in this increment. |

Ruling: implement on main as required by project instructions; no worktree.
Ruling: combine repository export/disposition edits per domain and consolidate API commits to avoid transient interface breakage. Cost: larger review unit.
Ruling: system account is seeded lazily during erasure, not at server construction; avoids unsolicited shared writes and startup failures. Cost: first erasure must complete seeding.

## Progress

- Preflight and repository inventory underway. No implementation complete yet.
- 2026-10-31 (Claude): Codex stopped; Claude reviewed and committed the API. One fix: refused
  admission no longer answers its own 401 (it set one cache header for every route); the request
  falls through to the route's fresh authentication, which answers with that route's headers.
  `npm run api:test` 3016/3016, `npm run verify:journeys` 20/20.
