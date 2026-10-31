# Terms of service and purchase terms

## Purpose

US-P022 (release 1, not live). Users read and accept the platform's Terms of Service at signup
and the Purchase & Refund Terms at each checkout; acceptance is recorded per version, and a new
Terms of Service version asks everyone to accept again. In release 1 courses stay free, so the
checkout half is dormant until charging is enabled (release 2).

## Behavior

- **Content in code.** `app/src/app/legal/terms.ts` holds both documents
  (`{ id, version, effectiveDate, title, intro, sections }`). `/terms` shows the Terms of Service,
  `/purchase-terms` the purchase terms (one page component; the route's `document` data picks the
  document). Both show "Version N, effective DATE". Wording is placeholder until Alex/legal supply it.
- **Versions are the API's.** `api/src/termsDocuments.ts` `TERMS_VERSIONS = { tos, purchase }`.
  A wording change bumps the version in both files in one commit. The server always stamps its own
  current version; the client only says "I accept".
- **Acceptance store** (`termsAcceptances`, Mongo; in-memory in isolated runs): one row per
  `{ userId, documentId, version, acceptedAt }`, unique per user, document and version; recording
  the same version again changes nothing.
- **Signup**: a required "I agree to the Terms of Service" checkbox (linking `/terms`) enables
  Create Student Account and sends `acceptTos: true`; the API records the current ToS version after
  the account is created. A signup without the field (an old frontend during a deploy) still
  creates the account with nothing recorded; `acceptTos: false` answers 400. If the record write
  fails after the account exists, signup still succeeds and the acceptance stays pending.
- **Checkout** (`POST /users/me/courses/:id/checkout`): an "I agree to the Purchase & Refund Terms"
  checkbox above Buy enables it and sends `acceptPurchaseTerms: true`. Anything else answers 400
  "Accept the purchase terms to continue." with no Stripe call. The current purchase version is
  recorded before the Stripe session is created, on every checkout.
- **Re-accept** (`POST /users/me/terms/accept`, `/api` alias, any signed-in role, caller-scoped):
  strict `{ documentId: 'tos' | 'purchase' }` records the current version → 204; bad body 400,
  no session 401, store down 503.
- **Gate.** `/auth/me` (and `/me`) carries `termsPending: true` when the account's highest accepted
  ToS version is missing or older than `TERMS_VERSIONS.tos`. A store failure leaves the flag out,
  and a missing flag means accepted. The app reads it only at sign-in and page load, so the gate
  never interrupts work in progress. The gate is a blocking dialog over an inert page: the full
  current Terms of Service, **I accept** (a failed save shows "Your acceptance could not be saved.
  Please try again." and keeps the gate) and **Log out**.
- **Footer.** Every page footer links Terms of Service, Purchase terms and Cookie preferences
  (`ui/legal-links`). The login page has no footer; its signup checkbox links the terms.
- **Privacy (US-P021).** Acceptance rows are in the data export (`termsAcceptances`) and are kept
  on erasure under the tombstoned account id; they hold no name or email.

## Decisions to confirm or change

- Every existing account meets the gate once after release (nobody has accepted versioned terms).
- A signup without `acceptTos` (old frontend) creates the account and the gate asks later.
- Acceptance rows are kept on erasure as evidence of what was agreed.
- The legal wording itself (Alex/legal).

## Limits

- No admin-editable terms, no per-document history page, purchase terms never re-prompted outside
  checkout.
