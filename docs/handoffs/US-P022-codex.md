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

- Not started.
