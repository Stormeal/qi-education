# Defect fix pass 1 — Codex handoff (API)

Assigned 2026-10-20 by Claude Code (lead). Claude does the app side of the price range at the same
time in this working tree on `main`. Read `AGENTS.md` ("Two agents in one working tree") first.

## Scope

Fix the open defects in `docs/defects.md`, in this order, **one commit per item**, each with a
regression test that fails before the fix and passes after it. Each defect row already holds the
reproduction, the expected behavior and a suggested fix (details in
`docs/audits/2026-10-api-audit.md` for DEF-047 to DEF-052).

1. **DEF-047** (P1) stale reset overwrites a newer password: make the final password write
   conditional on the expected current credential; a mismatch refuses the reset (link consumed,
   newer password kept). Apply the same compare-and-set to the signed-in password change.
2. **DEF-048** (P1) hosted mode can select console mail: mail selection follows the same hosted
   policy as storage; hosted mode never prints mail and reports mail unavailable without Brevo.
3. **DEF-052** (P3, small) malformed multibyte token gives 500: answer 401.
4. **DEF-053** (P2) password-reset routes turn a MongoDB outage into 500: answer the standard
   retryable 503 (`specs/platform/reliability.md`).
5. **DEF-049** (P2) raw exceptions in logs: one redacting logger (operation, error class/code,
   no headers, bodies, causes or bearer links) used by the global and provider error paths.
6. **DEF-050** (P2) cross-instance duplicate purchase warning: decide "first purchase or
   duplicate" atomically in storage (for example an enrollment write that reports whether it
   added the course), not from a snapshot read before the insert.
7. **DEF-051** (P2) course save refused at 100 KB: the content save route accepts JSON up to
   **4 MB** (decision below); other routes keep their limits. Add a realistic multi-lesson test.
8. **DEF-054** (P3) invalid stored career blamed on the learner: a stored-data validation error is
   a server-side failure (500 or 503, not 400 "Invalid request body"); log it with the career id.
9. **DEF-055** (P3) unreachable 404 checks after review-adapter updates: remove the dead checks.
10. **Price range (audit R3)**: `PATCH /courses/:id/price` accepts `null` or `0` (free) or a whole
    number from **3 to 999999**; anything else answers 400 with exactly
    `{ "message": "Enter 0 for free, or a whole number of DKK from 3 to 999,999." }`.
    Checkout also refuses an out-of-range stored price with 400 and the same message.

When an item is fixed, set its row in `docs/defects.md` to Fixed with the commit and the test name.

## Decisions (confirm or change, Alex)

- DEF-051: a course content save may be up to 4 MB, the same as an attachment and under Vercel's
  4.5 MB request limit.
- Prices: empty or 0 is free; otherwise 3–999,999 whole DKK (Stripe's DKK minimum is 2.50 DKK).

## Contract Claude's app relies on

- Item 10 exactly: status 400 and that message text for an out-of-range price.
- No other HTTP shape changes. DEF-047 may add a refusal status for a reset whose credential
  changed; use the existing "link no longer valid" answer of the reset confirm route.

## Files Codex owns

`api/src/**`, `api/test/**`, the rows DEF-047 to DEF-055 in `docs/defects.md`, your row in
`docs/work_queue.md`, and the "Result" section below.

## Files Codex must not edit

`app/**`, `docs/specs/**`, `docs/stories/**`, `docs/user_stories.md`, `CLAUDE.md`, `AGENTS.md`.
If one is needed, finish everything else first, then report the need.

## Result

Completed 2026-10-20 on `main`; required ancestor `3129083` confirmed. Local commits only; no push.
Claude's concurrent commits and files were preserved. Only the four explicitly authorized version
files were changed outside the API/document ownership list.

| Item | Delivery commit | Regression evidence |
| --- | --- | --- |
| DEF-047 | `ff6f4a8` | `changePassword.test.ts`: final-write reset and signed-in change barriers; 6 failed before, 76 focused tests passed after |
| DEF-048 | `c764add` | `mailSender.test.ts`: hosted-marker local-mail refusal; 2 failed before, 24 focused tests passed after |
| DEF-052 | `e0b94ff` | `requestErrors.test.ts`: malformed signatures return 401 without error logs; multibyte case failed before, 19 tests passed after |
| DEF-053 | `94a2195` | `passwordReset.test.ts`: request/check/confirm Mongo failures; 6 failed before, 124 focused tests passed after |
| DEF-049 | `05ef437` | Global/provider nested canaries, Mux cleanup, GitHub project failure and allowlisted logger; 5 failed before, 80 focused tests and build passed after |
| DEF-050 | `57ba355`, completed by review correction in this final delivery commit | `multiInstancePayments.test.ts`: distinct purchases, same-session replay and replay followed by a distinct purchase on both aliases; 2 original and 2 replay cases failed before their fixes; 6 final interleavings pass |
| DEF-051 | `6f4f53a` | `requestErrors.test.ts`: schema-valid six-lesson save at exactly 4 MiB and refusal one byte over; 4 failed before, 191 focused tests passed after |
| DEF-054 | `7eddf52` | `x4LearningErrorBranches.test.ts`: six valid operations against corrupt stored career data on both aliases; 12 failed before, 108 tests passed after |
| DEF-055 | `1e1fdf5` | `reviewAdapterContract.test.ts`: compiler-derived nullable-result regression failed before; non-null contract and genuine missing-course 404s pass, with 40 existing review tests and build |
| Price range R3 | This commit: `fix(R3): enforce API price range and finish defect verification` | `paymentRoutes.test.ts`: exact 400 message, valid boundaries, invalid stored prices and no provider call; 4 failed before, 39 focused payment tests passed after |

Final checks after all API changes:

- `npm run api:test`: **85 files, 2,241 tests passed**, no failures.
- `npm run verify:journeys`: **1 file, 16 tests passed**, memory and isolated Mongo-operation doubles.
- `npm run api:build`: passed (exit 0).
- `git diff --check`: passed.
- Independent read-only code review: found the DEF-050 same-session replay race; reproduced it,
  corrected it, and reviewed the correction. The source checkout session is now stored atomically
  alongside its first enrollment in internal account metadata (`enrollmentPurchases`, course IDs
  hashed as field keys); account projections never expose it. No migration is needed for old enrollments.

The final delivery commit also aligns existing hosted-mail fixtures and the price error expectation.
The initial full run exposed seven such outdated expectations (five hosted-mail cases, two price
responses); all pass in the final full run. The review correction above was folded into this final
commit to retain ten local delivery commits without rewriting shared `main` history.

Not verified: hosted behavior, real MongoDB/indexes/failover, Stripe, Mux, Brevo, GitHub or browser UI.
All mutations used isolated in-memory stores/doubles and ephemeral ports; no shared-service probes,
secrets, ports 3001/4200, provider calls, push or deployment.

Claude follow-up (outside Codex's ownership): update the relevant specs and
`docs/local_development.md` for hosted mail selection, the 4 MiB content-save limit and API price
validation. In particular, the local-development text claiming that a VERCEL-only hosted process
keeps console mail is obsolete. Defect records remain Fixed in `docs/defects.md` as Alex requested;
no resolved-record move or spec edit was made by Codex.
