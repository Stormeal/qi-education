# US-P022: Terms of service and purchase-terms page

Designed with Alex on 2026-10-30 (brainstorming). **As a user, I want to read the platform's terms
and purchase terms, so that I know the rules before I sign up or buy.** Builds on the existing
static `/terms` placeholder page (linked from signup today) and the checkout flow. Relevant current
behavior: [sign-in and sessions](../specs/accounts/sign-in-and-sessions.md),
[payments](../specs/payments/payments.md), [ui foundation](../specs/platform/ui-foundation.md).

## Why

A paid public launch (release 2) needs terms that are real and, where money is involved, provably
accepted. Today `/terms` is a static placeholder with generic sections and no purchase/refund terms,
no versioning, and no recorded acceptance (signup only says "by creating an account you agree"). This
story adds purchase/refund terms, versioned documents, recorded acceptance at the two moments that
matter (signup, checkout), and the links a public site needs (footer, checkout).

## Release

Suggested **release 2** (purchase terms matter at public launch; the basic ToS page already exists) —
confirm or change at planning.

## Scope decisions (confirmed by Alex, 2026-10-30)

- **Two documents**, versioned independently: **Terms of Service** (accepted at signup) and
  **Purchase & Refund Terms** (accepted at checkout). A free learner only ever accepts ToS; a buyer
  also accepts purchase terms.
- **Recorded, versioned acceptance.** Store `{ userId, documentId, version, acceptedAt }` per
  (user, document, version). Explicit checkbox at signup and at checkout; the **server stamps the
  current version** (the client only sends "I accept").
- **Content in-code, versioned.** Each document is a typed constant (the `release-notes.ts` pattern),
  so changing binding legal text is a reviewed PR + deploy — not a silent live edit. Admin-editable
  terms are a possible later story, out of scope here.
- **Re-accept on version bump: ToS blocks, purchase at checkout.** A ToS version bump surfaces a
  blocking re-accept gate at next login/app-load; purchase terms are simply required at each checkout
  against the current version, so they need no separate re-prompt.
- **Legal wording is Alex/legal's** to supply; this story designs the structure, placeholders, and
  the acceptance plumbing.

## Architecture

One new stored thing — the **acceptance record** — plus two in-code content constants and acceptance
captured at the two existing moments (signup, checkout). A `termsPending` flag on `/auth/me` drives
the re-accept gate. No subsystem beyond the acceptance record; follows the standard repository +
injection pattern.

## Section 1 — Data model & content

- **Content (in-code):** `legal/terms.ts` exports two documents, each
  `{ id: 'tos' | 'purchase', version: number, effectiveDate, title, sections: { heading, body }[] }`.
  The existing `/terms` page renders the ToS document; a new `/purchase-terms` page renders the other.
  `version` is a plain integer, bumped on any change.
- **Acceptance record (Mongo, per-account):** `termsAcceptances` — `{ userId, documentId, version,
  acceptedAt }`, one row per (user, document, version). In-memory repo for isolated/test, Mongo in
  prod.
- **Derived state:** a user's current accepted ToS version is the highest `version` row for
  `documentId: 'tos'`. `termsPending` (on `/auth/me`) is `true` when that is absent or below the
  current `terms.ts` ToS version.

## Section 2 — Acceptance capture & API

- **Signup** gains a required checkbox "I agree to the Terms of Service" (replacing the passive line),
  linking `/terms`. The request carries `acceptTos: true`; the server records a
  `('tos', currentVersion)` row at account creation. Missing acceptance → `400`.
- **Checkout** start gains `acceptPurchaseTerms: true`; the server records
  `('purchase', currentPurchaseVersion)` **before** creating the Stripe checkout. Missing → `400`.
  Every purchase records acceptance of the then-current purchase terms.
- **Re-accept route:** `POST /users/me/terms/accept` body `{ documentId }` → records the current
  version of that document for the caller, `204`. Caller-scoped; new `routePermissions.test.ts`
  entry + `/api` alias.
- **`/auth/me`** gains `termsPending: boolean` (ToS only).
- Signup and checkout are existing routes — their **Zod bodies** gain the acceptance field; no new
  permission rows for those two.

## Section 3 — Re-accept gate, footer & frontend surfaces

- **Blocking ToS gate:** when `termsPending` is `true`, the app shows a blocking screen after
  login/app-load — "Our Terms of Service have been updated", a summary + link to `/terms`, and an
  **I accept** button that calls `POST /users/me/terms/accept` and clears the flag. Until accepted,
  only the terms page and logout are reachable (enforced at the shell, like a guard). It gates at
  load, never mid-action.
- **New site footer** (`ui/footer`, presentational — no `AppStateService`, static `routerLink`s):
  Terms of Service, Purchase & Refund Terms, a **Cookie preferences** slot (hook for US-P021), and a
  © line. Added to the app shell across pages; obeys the 375 px rule (no sideways scroll).
- **New `/purchase-terms` route + page**, mirroring the existing `terms-page` styling. The existing
  `/terms` page keeps rendering the ToS document, now from the `terms.ts` constant instead of
  hard-coded HTML.
- **Signup checkbox** and **checkout checkbox**; both disable submit until ticked.
- `app.models.ts` gains `termsPending` on the auth/me model and the acceptance types.

## Testing

- **API (`api/src/**`):** `termsAcceptances` repo unit (record, latest version per document,
  caller-scoped, in-memory in isolated); signup rejects `400` without `acceptTos` and writes a
  `('tos', currentVersion)` row on success; checkout rejects `400` without `acceptPurchaseTerms` and
  writes a `('purchase', currentVersion)` row before Stripe; `POST /users/me/terms/accept` records the
  current version → `204` (+ `/api` alias, `routePermissions.test.ts` entry); `/auth/me` returns
  `termsPending` true when stored ToS version is absent or below the constant, false when equal.
- **App (`app/`):** clear `localStorage`/`sessionStorage` in `beforeEach`; signup submit disabled
  until the ToS checkbox is ticked and checkout until purchase terms; `termsPending` drives the
  blocking gate (app unusable until **I accept**, which clears it); footer renders all links;
  `/purchase-terms` and `/terms` render from the constant; `check-ui-foundation.mjs` stays green;
  footer has no sideways scroll at 375 px.

## Review focus (carry into the plan)

- A logged-in user when the ToS version bumps — the gate appears at next load, not mid-action.
- A user who accepted an older version (pending until re-accept).
- Signup/checkout version race — client displayed `vN`, server at `vN+1`: server stamps its current
  version.
- Purchase-terms acceptance recorded on every purchase.
- Footer and the blocking gate at 375 px.

## Open decisions (confirm or change)

- Release assignment: **R2** (suggested) — reconfirm at planning; a basic ToS page already ships, so
  the recorded-acceptance + purchase-terms work is the R2 part.
- The legal content itself (owner: Alex/legal) — placeholders until supplied.
- Relationship to the privacy notice (US-P018) and the US-P021 cookie-preferences link — the footer
  leaves a slot; wording aligned when US-P021 lands.

## Codex split (at implementation)

- **Codex (`api/src/**`):** `termsAcceptanceRepository.ts` (+ in-memory/Mongo impls), the
  `POST /users/me/terms/accept` route, `termsPending` on `/auth/me`, and the acceptance recording +
  `400` guards folded into the existing signup and checkout handlers (Zod body changes). Trace the
  signup handler, the checkout-start handler, and `/auth/me`.
- **Claude (`app/`):** the `legal/terms.ts` constants, the `/terms` and new `/purchase-terms` pages,
  the signup and checkout checkboxes, the blocking re-accept gate at the shell, the new `ui/footer`,
  and `app.models.ts`. Trace: `login-page`, the checkout/payment page, the app shell/guards,
  `app-state.service.ts` (termsPending from `/auth/me`), and `terms-page`.
