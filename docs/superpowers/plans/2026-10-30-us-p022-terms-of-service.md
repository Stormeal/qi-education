# US-P022 Terms of Service + Purchase Terms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two in-code versioned legal documents (Terms of Service, Purchase & Refund Terms) with recorded, versioned acceptance at signup and checkout, a blocking re-accept gate on a ToS version bump, and a shared site footer.

**Architecture:** One new stored thing — a per-account `termsAcceptances` record. The API owns the authoritative version numbers and stamps them when the user ticks a checkbox at signup/checkout; `/auth/me` carries a `termsPending` flag (ToS only) that drives a load-time blocking gate. Document content lives in typed constants (the `release-notes.ts` pattern).

**Tech Stack:** Express + Zod + repository pattern; Angular signals frontend.

**Spec:** `docs/stories/US-P022-terms-of-service.md`

## Global Constraints

- **Version bump every commit:** `package.json`, `app/package.json`, the three `"version"` lines in `package-lock.json`, and `appVersion` in `app-state.service.ts`. Read the current version right before committing.
- **New routes** need `routePermissions.test.ts` entries for the route and its `/api` alias; protected routes are bearer-authenticated and caller-scoped.
- **Repositories injected** in `server.ts`; in-memory for isolated/test, Mongo in prod.
- **Authoritative version numbers live in the API** (`api/src/termsDocuments.ts`). The app's content constant (`app/src/app/legal/terms.ts`) holds the display content and the same version numbers and is edited in the same change; the server is the source of truth and stamps its own current version on acceptance.
- **Frontend UI:** design tokens only (no new hard-coded colours), no component `:focus` ring (`check-ui-foundation.mjs`); a new page lists `'../../app.scss'` first in `styleUrls`; the footer obeys the 375 px rule (no sideways scroll).
- **Frontend specs** clear `localStorage`/`sessionStorage` in `beforeEach`; no module-level library mocks.

## Review Focus

- **ToS bump mid-session:** a user already logged in when the ToS version increments meets the gate at next app-load, never mid-action. (Test in Task 6.)
- **Stale accepted version:** a user whose latest accepted ToS version is below the current constant is `termsPending`. (Test in Task 2.)
- **Signup/checkout version race:** the client displayed `vN` but the server is at `vN+1` — the server stamps **its** current version, not the client's. (Test in Task 3.)
- **Every purchase records acceptance:** acceptance of the current purchase-terms version is written on each checkout, before Stripe. (Test in Task 3.)
- **Footer + gate at 375 px:** no horizontal scroll, nothing cut off. (Test in Tasks 5–6.)

---

## Group A — API (owner: Codex, `api/src/**`)

### Task 1: Terms acceptance repository + version constant

**Files:**
- Create: `api/src/termsDocuments.ts`, `api/src/termsAcceptanceRepository.ts`, `api/src/termsAcceptanceRepository.test.ts`
- Modify: `api/src/server.ts` (construct + inject)

**Interfaces:**
- Produces: `TERMS_VERSIONS = { tos: number; purchase: number }` (authoritative). `TermsAcceptanceRepository` with `record(userId, documentId: 'tos' | 'purchase', version: number): Promise<void>`, `latestAccepted(userId, documentId): Promise<number | null>`, `listForUser(userId): Promise<Acceptance[]>` — all caller-scoped. In-memory + Mongo impls.

- [ ] **Step 1: Write failing tests** — `record` then `latestAccepted` returns the version; a later higher version supersedes; a second user's rows are not returned; `listForUser` is caller-scoped.
- [ ] **Step 2: Run, verify fail** (`npm --prefix api test -- termsAcceptanceRepository`).
- [ ] **Step 3: Implement the constant + repository** (in-memory + Mongo).
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** (+ version files).

### Task 2: `termsPending` on `/auth/me` + re-accept route

**Files:**
- Modify: `api/src/server.ts` (the `/auth/me` handler), add router for the accept route; `api/src/routePermissions.test.ts`
- Create: `api/src/termsRoutes.ts`, `api/src/termsRoutes.test.ts`

**Interfaces:**
- Consumes: `TermsAcceptanceRepository`, `TERMS_VERSIONS` (Task 1).
- Produces: `/auth/me` response gains `termsPending: boolean` = `latestAccepted(user, 'tos')` is null or `< TERMS_VERSIONS.tos`. Route `POST /users/me/terms/accept` body `{ documentId: 'tos' | 'purchase' }` → records `TERMS_VERSIONS[documentId]` for the caller → `204` (+ `/api` alias).

- [ ] **Step 1: Write failing tests** — `/auth/me` returns `termsPending: true` when no ToS acceptance or a stale one, `false` when equal to current; `POST /users/me/terms/accept` records the current version and flips `termsPending` to false; alias resolves; entry in `routePermissions.test.ts`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the flag + route**; add route + alias to `routePermissions.test.ts` (authenticated, any role).
- [ ] **Step 4: Run `npm run api:test`, verify pass.**
- [ ] **Step 5: Commit.**

### Task 3: Record acceptance at signup and checkout

**Files:**
- Modify: the signup handler and the checkout-start handler in `api/src/server.ts` / `api/src/paymentRoutes.ts`; their Zod schemas (`api/src/auth.ts` signup schema, the checkout body schema); the matching `*.test.ts`.

**Interfaces:**
- Consumes: `TermsAcceptanceRepository`, `TERMS_VERSIONS`.
- Produces: signup body gains `acceptTos: true` (Zod: must be literal `true`); on success records `('tos', TERMS_VERSIONS.tos)`. Checkout-start body gains `acceptPurchaseTerms: true`; records `('purchase', TERMS_VERSIONS.purchase)` **before** creating the Stripe checkout.

- [ ] **Step 1: Write failing tests** — signup without `acceptTos` → `400`; with it, a `('tos', current)` row is written and the account is created. Checkout without `acceptPurchaseTerms` → `400`; with it, a `('purchase', current)` row is written before Stripe is called; the server stamps its current version even if a (hypothetical) client version differs; a second checkout writes another acceptance row.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the Zod fields + recording.**
- [ ] **Step 4: Run `npm run api:test`, verify pass.**
- [ ] **Step 5: Commit.**

---

## Group B — App (owner: Claude, `app/`)

### Task 4: Content constants, types & terms pages

**Files:**
- Create: `app/src/app/legal/terms.ts`, `app/src/app/pages/purchase-terms-page/*` (+ spec), `app/src/app/routes/purchase-terms-route.ts`
- Modify: `app/src/app/pages/terms-page/terms-page.{ts,html}` (render from the constant), `app/src/app/app.routes.ts` (add `/purchase-terms`), `app/src/app/app.models.ts` (acceptance types, `termsPending` on the auth/me model)

**Interfaces:**
- Produces: `TERMS_DOCUMENTS: { tos: TermsDoc; purchase: TermsDoc }` where `TermsDoc = { id, version, effectiveDate, title, sections: { heading, body }[] }`. Version numbers match `TERMS_VERSIONS` in the API.

- [ ] **Step 1: Write failing spec** — `/terms` renders the ToS doc's title + sections from the constant; `/purchase-terms` renders the purchase doc; both show the version/effective date.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the constant, convert `terms-page` to render from it, add the purchase-terms page + route** (`'../../app.scss'` first; tokens only).
- [ ] **Step 4: Run `npm run app:test`, verify pass.**
- [ ] **Step 5: Commit.**

### Task 5: Shared site footer

**Files:**
- Create: `app/src/app/ui/footer/*` (+ spec)
- Modify: the app shell/root template to mount the footer.

**Interfaces:**
- Presentational (no `AppStateService`); static `routerLink`s.

- [ ] **Step 1: Write failing spec** — the footer renders links to `/terms`, `/purchase-terms`, a Cookie-preferences trigger slot (hook for US-P021), and a © line; no sideways scroll at 375 px (assert layout classes / overflow).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the footer** and mount it in the shell.
- [ ] **Step 4: Run `npm run app:test`, verify pass (incl. `check-ui-foundation.mjs`).**
- [ ] **Step 5: Commit.**

### Task 6: Signup/checkout checkboxes + blocking re-accept gate

**Files:**
- Modify: `app/src/app/pages/login-page/login-page.{ts,html}` (signup checkbox), the checkout/payment page (purchase checkbox), `app/src/app/services/app-state.service.ts` (read `termsPending` from `/auth/me`, call accept), the app shell/guard; their specs.

**Interfaces:**
- Consumes: `termsPending` (Task 2 via `/auth/me`), `POST /users/me/terms/accept`.

- [ ] **Step 1: Write failing specs** —
  - Signup submit stays disabled until the ToS checkbox is ticked; ticking sends `acceptTos: true`.
  - Checkout submit stays disabled until the purchase-terms checkbox is ticked; ticking sends `acceptPurchaseTerms: true`.
  - When `termsPending` is true, a blocking gate renders at app-load and only `/terms` + logout are reachable; **I accept** calls the accept route and clears the gate; a user who was mid-session sees it only at next load, not mid-action.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the two checkboxes, the `termsPending` read, and the shell gate (a guard/overlay; tokens only).
- [ ] **Step 4: Run `npm run app:test`, verify pass.**
- [ ] **Step 5: Commit.**

---

## Done when

`npm run api:test`, `npm run app:test`, `npm run verify:journeys` and `npm run app:build:pages` pass; signup and checkout record versioned acceptance; a ToS version bump forces a load-time re-accept; `/terms` and `/purchase-terms` render from the constant; the footer links both from every page. Legal wording remains placeholder until Alex/legal supplies it.
