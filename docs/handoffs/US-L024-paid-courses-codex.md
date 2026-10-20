# US-L024 paid courses — Codex handoff (API)

Assigned 2026-10-20 by Claude Code (lead). Claude builds the app side (purchase flow, course page,
profile) at the same time in this working tree on `main`. Read `AGENTS.md` ("Two agents in one
working tree") first.

- Decisions and scenarios US-L024-AC01…AC07: [docs/stories/US-L024-paid-courses.md](../stories/US-L024-paid-courses.md)
- Your tasks: **Tasks 1–4** of [docs/superpowers/plans/2026-10-20-US-L024-paid-courses.md](../superpowers/plans/2026-10-20-US-L024-paid-courses.md).
  The plan's "Global Constraints", "HTTP contract" and "Review Focus" sections apply to you.

## Contract Claude's app is built against (do not change without recording it here)

The plan's **HTTP contract** table, exactly. In short:

- `POST /users/me/courses/:id/checkout` `{ returnUrl }` → `{ url }`; 400/403/404/409/503 `{ message }`.
- `POST /users/me/courses/:id/checkout/confirm` `{ sessionId }` → `{ paid: true, user, permissions }`
  (same shape as the enroll answer) or `{ paid: false }`; 404 foreign session; 503.
- `POST /users/me/billing-portal` `{ returnUrl }` → `{ url }`; 404 `No payments yet.`; 503.
- Enroll in a priced course (not author/admin) → 402 `This course must be bought.`
- 503 text everywhere: `Purchases are temporarily unavailable.`
- Fake service (isolated mode): checkout URL = success URL with a `fake_cs_…` session id, and that
  session reads as paid. Claude's browser check depends on this.

## Files Codex owns

- New: `api/src/paymentRepository.ts`, `api/src/paymentService.ts`, `api/src/paymentRoutes.ts` and
  their `.test.ts` files.
- `api/src/server.ts`: the `ServerDependencies` type (~line 131), the Stripe webhook next to the Mux
  webhook (~line 238), route registration next to `registerAccountProfileRoutes` (~line 670), the
  402 guard in the enroll route (~line 683), `payments` in `/health/config` (~line 515).
- `api/src/config.ts`, `api/package.json`, `api/src/journey.test.ts`, `scripts/doctor.mjs`.
- Any existing `api/src/*.test.ts` or `api/test/**` that breaks because a priced course now answers 402.
- `package-lock.json`: commit the `stripe` install **as your first commit**, on its own, so the lock
  file is not left half-changed while Claude bumps versions.
- Your row under Active work in `docs/work_queue.md`; this handoff's "Result" section.

## Files Codex must not edit

Everything under `app/`, `docs/stories/**`, `docs/specs/**`, `docs/user_stories.md`, `CLAUDE.md`,
`AGENTS.md`, the plan. If you need one of them, finish everything else first and report the need.

## Result

(Codex: commits, checks run, anything not verified.)
