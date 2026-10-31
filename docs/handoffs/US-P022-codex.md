# US-P022 terms of service: Codex part

Owner: Codex. Branch: `main`. Started: 2026-10-31. Lead: Claude.
Story: `docs/stories/US-P022-terms-of-service.md`. Plan:
`docs/superpowers/plans/2026-10-30-us-p022-terms-of-service.md` (Group A, Tasks 1–3).
Isolated in-memory stores only; no hosted or shared-service calls.

## Split

| Owner | Scope | Files |
| --- | --- | --- |
| Codex | Acceptance store, version constant, `termsPending`, accept route, signup and checkout recording, privacy export/erasure wiring | `api/src/termsDocuments.ts`, `api/src/termsAcceptanceRepository.ts` (+ test), `api/src/termsRoutes.ts` (+ test), `api/src/server.ts` (wiring, `/auth/me` handler, signup handler only), `api/src/auth.ts` (`signupSchema` only), `api/src/paymentRoutes.ts` (+ its tests), `api/src/privacyService.ts`, `api/src/privacyCoverage.test.ts`, `api/test/privacyFixture.ts`, `api/src/routePermissions.test.ts`, existing signup / `/auth/me` tests, `app/src/app/services/privacy.service.ts` (+ spec, export type only) |
| Claude | Content constants, `/terms` and `/purchase-terms` pages, footer links, signup and checkout checkboxes, re-accept gate | everything else in `app/`, including `app.models.ts`, `app-state.service.ts`, `course.service.ts`, `login-page`, `terms-page`, `ui/**`, `legal/terms.ts`; docs specs |

## Contract Claude relies on

1. **Versions.** `api/src/termsDocuments.ts` exports `TERMS_VERSIONS = { tos: 1, purchase: 1 }`.
   The server always stamps its own current version, never one sent by the client.
2. **Store.** One row per (user, document, version): `{ userId, documentId: 'tos' | 'purchase',
   version, acceptedAt }`. Mongo collection `termsAcceptances` with a unique index on
   `{ userId, documentId, version }`; recording the same row twice is a no-op. In-memory in
   isolated/test runs. No demo-account seeding (demo users meet the gate, which is how Claude tests it).
3. **`GET /auth/me`** (and `/me`, both `/api` aliases) adds `termsPending: boolean`: true when the
   user's highest accepted `tos` version is absent or below `TERMS_VERSIONS.tos`. Every other field
   unchanged. A store failure must not break `/auth/me`: answer the rest and leave `termsPending`
   out (the app treats a missing flag as false).
4. **`POST /users/me/terms/accept`** (+ `/api` alias), signed-in, any role, caller-scoped. Body
   strict `{ documentId: 'tos' | 'purchase' }`. Records the current version → **204**. Bad body →
   400; no session → 401; store down → 503. Route permission entries for both paths.
5. **Signup** (`signupSchema`): `acceptTos: z.literal(true).optional()`. `true` → after the account
   is created, record `('tos', TERMS_VERSIONS.tos)`. **Absent** → account created with no row
   (an old frontend during the deploy window keeps working; that user meets the gate at next load).
   `false` or any other value → 400. Response shape unchanged.
6. **Checkout** `POST /users/me/courses/:id/checkout` (+ alias): body gains required
   `acceptPurchaseTerms: true`; anything else → 400 `{ message: 'Accept the purchase terms to
   continue.' }` with no Stripe call. Record `('purchase', TERMS_VERSIONS.purchase)` **before**
   creating the Stripe session; every checkout records (idempotent per version). `/checkout/confirm`
   and the webhook are unchanged.
7. **Privacy (US-P021).** The new repository joins `PERSONAL_DATA_DOMAINS`: export adds
   `termsAcceptances: { documentId, version, acceptedAt }[]`; on erasure the rows are **kept**
   under the tombstoned account id (evidence of what was agreed; no identifiers in the row). Add
   `termsAcceptances` to `PrivacyExport` in `app/src/app/services/privacy.service.ts`. The coverage
   test must pass.

## Progress

- In progress: Codex, `main`, base `10e0742`, 2026-10-31. History requirement verified.
- Following this handoff where plan/story differ: optional legacy signup acceptance,
  best-effort `termsPending`, idempotent acceptance per version and retention on erasure.
- Tasks 1–3 share one injected repository and server-owned versions. Tests run before each
  implementation piece; delivery will be one local commit after the required final checks.
- Task 1: repository tests fail before the module exists, then pass 10/10 (memory and Mongo
  boundary double; unique index, immutable timestamps, caller scoping and failed writes).
- Task 2: missing flag/route regressions fail before implementation, then repository/routes/
  permission checks pass 276/276. All four session aliases and both acceptance aliases covered.
- Task 3: signup, checkout and privacy regressions fail for absent recording/guards/export,
  then focused API checks pass 344/344. Privacy type fixture fails compilation before adding
  `termsAcceptances`, then the Angular privacy-service spec passes 9/9. API build passes.
- Implementation decision: after account creation, a failed signup acceptance write preserves
  signup's 201/session and leaves acceptance pending (tested); retrying signup would otherwise
  collide with the already-created account. Checkout and explicit acceptance fail closed (503).
- Existing checkout-route tests in enrollment, journey, multi-instance payment, organization,
  refund and error-branch suites now send the required flag; their original assertions remain.
- Full API run: 3,072 passed, 3 timed out at the existing 5-second limit (signInLimit cases
  03 and 05; databaseBackup large UTF-8 chunk/batch case). These files are unchanged; isolated
  rerun passes 47/47 across those two files. The default-concurrency retry also passes 3,072
  with three timing failures: clientLimitRoutes AC06 (5-second timeout), signInLimit 03
  (5-second timeout) and DEF-034 /11 `/auth/login` (250-ms abort). All remain unchanged.
  Complete-suite rerun with `(cd api && npx vitest run --maxWorkers=4)` passes all 3,075 tests
  across 128 files (180.83 seconds); no timeout or unrelated implementation changes were made.
- Final fresh review: no critical/important findings. Deferred minor test gaps: direct Mongo
  initialization retry and hosted-without-Mongo factory coverage. Real providers/Mongo and
  Claude-owned UI/browser/legal content remain outside this increment's verification.
- No shared-provider probes. Final checks passed; local delivery commit and version bump next.
