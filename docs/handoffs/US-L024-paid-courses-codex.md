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

API Tasks 1–4 implemented on `main`, from `3102208`, 2026-10-20. No push. The HTTP
contract is unchanged. Claude's concurrent app changes were preserved; only the explicitly
required version line was staged from `app-state.service.ts` on each Codex commit.

### Commits

- `9e74a7d` — dependency-only install: exact `stripe@23.0.0`; installed SDK's API version
  verified as `2026-09-30.endive`. Includes the required four-place version bump.
- `95b255b` — in-memory/Mongo payments repository, majority writes and duplicate handling.
- `6af4729` — Stripe adapter, offline fake, isolated configuration and key-mode reporting.
- `2e17a32` — checkout, confirmation, both raw-body webhook paths, billing portal, health and 402 guard.
- `34d83b0` — ignore unrelated webhook events; duplicate purchase, customer reuse and validation coverage.
- `369b5a9` — paid-course release journey and doctor Stripe checks. Doctor resolves `dotenv`
  from its owning API workspace, so a non-hoisted install works.

### Verification

- TDD: repository and service tests failed on missing modules before implementation; route
  tests failed on missing routes / missing 402 before implementation. Unrelated-event regression
  failed before its fix. Payment storage followed by a failed enrollment is retried safely.
- Payment tests: **39 passed** (repository 4, service 12, routes 23). AC01–AC07 are mapped in
  the route test names. Covers both delivery orders and a confirm/two-webhook race, foreign
  sessions/origins, unpaid/unavailable providers, bad signatures, duplicate purchases, storage
  failure/retry, saved customer reuse, disabled accounts and course price/archive changes.
- `npm run verify:journeys`: **16 passed**, including paid purchase plus earlier free access
  in memory and the isolated Mongo collection double. No real Mongo connection.
- `npm run api:build`: **passed**.
- `npm run doctor`: **passed**, against an isolated API on an ephemeral port. A separate
  offline fixture verified both secret-presence messages and the local live-key warning;
  no real keys or provider calls. The first doctor attempt exposed a missing root `dotenv`
  dependency; resolving it from the API workspace fixed startup.
- `npm run api:test`: first run **1718 passed / 3 failed (1721)**. After supplemental tests,
  **1721 passed / 4 failed (1725)**: the same three health assertions, plus a 5-second
  timeout in `clientLimitRoutes.test.ts`'s parallel Mongo budget case under concurrent load.
  That file passed alone **20/20**. Final `npm run api:test` with four Vitest workers:
  **1722 passed / 3 failed (1725), 73 files passed / 2 failed (75)**. Only the three
  health-shape assertions below remain; the timeout did not recur.

### Needed outside the assigned files

Three existing exact health-response assertions omit the new
`payments: { configured: true, keyMode: null }` field:

- `api/src/server.test.ts:204`, `reports non-secret runtime configuration for diagnostics`.
- `api/src/isolatedServices.test.ts:113`, `AC04 adds only health mode, preserves failed-demo-login
  memory header`, for both root and `/api` paths.

These are not priced-enrollment/402 failures, so the user's file boundary does not authorize
editing them. Claude or Alex must update them before calling the whole API suite green.

### Independent review and release limitations

One independent, read-only API review found no Critical issues and confirmed the assigned
race, foreign-session and redirect safeguards. Two Important design gaps remain; neither was
silently folded into the agreed plan:

1. **Portal purchase documents:** Checkout currently follows the plan and does not set
   `invoice_creation.enabled`. Stripe's portal offers invoice history, and one-time Checkout
   invoices require explicit opt-in. Invoice creation is separately priced, so Alex must decide
   whether to enable it or revise the receipts promise before release. This is inferred from
   the adapter parameters and official docs, not a hosted reproduction:
   [portal features](https://docs.stripe.com/customer-management),
   [one-time invoices and pricing note](https://docs.stripe.com/receipts#paid-invoices).
2. **Overlapping first purchases:** open checkouts for two courses before completing either.
   Both have no recorded customer, so the prescribed `customer_creation: always` creates
   separate customers. Completing both leaves the portal pointing at only the latest payment's
   customer, hiding the other's cards/history. A stable customer before payment requires a
   revised persistence/provider design; current behavior retains the plan's latest-payment
   lookup. The fake's deterministic per-user customer cannot prove this hosted behavior.

Record these findings in the defect/product decision records during Claude's integration pass;
those documents are outside Codex's assigned edit scope. Deferred Minor: focused offline SDK
adapter tests (the assigned behavior tests use `FakePaymentService`).

Rulings: enrollment retries even for an existing payment, because insert success does not prove
enrollment success (cost: repeated harmless add-only writes); exact health tests remain untouched
(cost: red full suite); invoice opt-in and stable customer storage await explicit design decisions
(cost: incomplete portal history). Claude's UI/reload behavior, hosted signatures/Checkout/portal,
and real Mongo remain outside this isolated API review. The new X1–X7 handoff was not selected:
this assignment authorizes Tasks 1–4 only.

Still not verified: browser integration (Claude's Task 7), live/test Stripe Checkout, actual
signature verification against Stripe delivery, real MongoDB, portal activation/settings,
receipt history and saved-card behavior. No shared-service mutation probes were run. Customer
Portal activation and the hosted test-card check remain Alex's release steps.
