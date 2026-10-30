# US-P021: GDPR data rights — export, erasure and cookie consent

Designed with Alex on 2026-10-30 (brainstorming). **As a user in the EU, I want to see, export and
delete my personal data and control non-essential cookies, so that the platform meets GDPR.**
One story, three prongs: **export** (right of access + portability), **erasure** (right to be
forgotten), and a **cookie-consent** mechanism. Relevant current behavior:
[admin users](../specs/admin/users.md), [profiles](../specs/accounts/profiles.md),
[payments](../specs/payments/payments.md), [organizations](../specs/organizations/organizations.md),
[storage and run modes](../specs/platform/storage-and-run-modes.md).

## Why

Public launch (release 2) sells to individuals in the EU, so data-subject rights must be real and
**self-service**: a user exports and deletes their own data without admin help, and controls any
non-essential cookies. EU-region storage, processor data-processing agreements and the privacy
notice already ship in release 1 (US-P018-AC03); this story adds the rights on top.

## Release

**Release 2**, full self-service, highest rigor (confirmed by Alex, 2026-10-30).

## Scope decisions (confirmed by Alex, 2026-10-30)

- **Erasure mechanism: anonymize and retain.** Delete direct identifiers and personal content;
  keep legally-required rows (payments, audit log) pseudonymized under an opaque id. The account can
  never log in again.
- **Teacher authored content: anonymize author, keep courses.** Published courses stay published and
  enrolled students keep access; the instructor name/bio/avatar become "Former instructor" and
  ownership transfers to a built-in **system account** so courses stay editable.
- **Org owner: blocked until transferred.** An owner of an organization with members or active
  billing cannot self-erase (409); plain members are removed on erasure.
- **Export: JSON + readable summary.** One machine-readable JSON object (portability) plus a
  human-readable, printable rendering in the app.
- **Cookie consent: minimal, extensible, client-only.** No non-essential cookies exist today; build a
  consent store + banner that is honest now and gates any future category (analytics) behind opt-in.
- **Erasure gate: re-auth + typed confirmation, immediate.** Password re-entry plus a typed phrase;
  erasure runs immediately and irreversibly. No grace period, no scheduled purge (no new cron).

## Architecture — central `PrivacyService` composing per-repo methods (Approach 1)

Both export and erasure are cross-cutting: they touch every personal-data repository. A new injected
`PrivacyService` (api) depends on each such repository and composes small, domain-owned methods:

- `collectForExport(userId)` — returns that user's rows for export.
- `anonymizeForUser(userId)` or `removeForUser(userId)` — the erasure disposition the domain owns.

The service enforces the gates (org-owner block, teacher-ownership transfer) before any mutation. A
**coverage test** enumerates every personal-data repository and fails CI if one is not wired into
both export and erasure — so adding a new data domain later forces someone to handle privacy for it.

### Supporting concepts

- **Tombstone account row.** The account record is not physically deleted — it is reduced to an
  opaque id with identifiers stripped (email → null, display name → "Deleted user", password hash
  cleared, status → permanently closed). Keeps foreign references resolvable without holding personal
  data, and guarantees the email cannot log in again.
- **System owner account.** A built-in, non-personal, seeded account that inherits erased teachers'
  published courses so they stay editable and published.

## Prong 1 — Export (right of access + portability)

- **`GET /users/me/privacy/export`** — authenticated, strictly caller-scoped (a user exports only
  themselves; no admin-on-behalf route in scope). `PrivacyService.exportUserData(userId)` composes
  `collectForExport` across every repo in the disposition table.
- **Payload:** one point-in-time JSON object —
  `{ exportedAt, account, profile, instructorProfile, enrolments, progress, notes, lessonFeedback,
  careers, payments, organizations, feedback, notifications }`. Excludes secrets (no password hash,
  no tokens); never contained card data (Stripe holds that).
- **Generation is synchronous** — per-user data is text and metadata only (no video bytes; those live
  at Mux), so it is small.
- **Two outputs, one source.** The API returns the JSON. The app's Privacy tab offers **Download
  JSON** (portable) and renders a **human-readable summary** — grouped sections with a **Print**
  button (print-to-PDF via the browser). No server-side PDF generator.

## Prong 2 — Erasure (anonymize-and-retain, immediate)

- **`POST /users/me/privacy/erase`** — authenticated, caller-scoped. Body `{ password, confirmation }`.
- **Gates, all checked before any mutation:**
  1. **Re-auth** — verify `password` (reuse the auth verifier); wrong → `401`.
  2. **Typed confirmation** — `confirmation` must equal the required phrase (`DELETE`); else `400`.
  3. **Org-owner block** — if the account owns any org with members or active billing →
     `409 { message: 'transfer-organization-first', organizations: [...] }` naming them. Plain
     membership passes. (Teacher-owned courses are not a block.)
- **Execution — `PrivacyService.eraseUser(userId)`:**
  1. **Lock the account first** (close/flag it) so the session dies immediately and the operation is
     safe to retry.
  2. Transfer owned published courses → **system account**; anonymize the instructor profile.
  3. Run each repo's `anonymizeForUser` / `removeForUser` per the disposition table (course-ownership
     changes use the existing `withCourseLock`).
  4. Revoke all tokens.
  5. **Tombstone the account row last**, so earlier steps can still resolve the userId.
  6. Write one audit entry — "account erased", timestamp, **no personal data**.
- **Partial-failure safety:** no cross-collection transaction on serverless, so every step is
  **idempotent** and the account is locked from step 1 — a failure returns `500`, the account stays
  unusable, and a retry finishes cleanly. No half-usable account.
- **Result:** `204`. The app logs the user out and shows a terminal "Your account and data have been
  deleted" screen. Irreversible, no undo.

### Per-domain disposition

| Domain (repository) | In export | On erasure |
|---|---|---|
| Account — email, name, role, status | ✅ identifiers | **Anonymize → tombstone** (strip email/name, clear hash, close) |
| Account profile — bio, job, company, goals, avatarColor, notification prefs | ✅ | **Delete** |
| Instructor profile — public bio/description/avatar | ✅ | **Anonymize → "Former instructor"** |
| Enrolments — courses + dates | ✅ | **Retain, re-keyed to tombstone** (payment integrity, course counts) |
| Learning progress | ✅ | **Delete** |
| Lesson notes | ✅ | **Delete** |
| Lesson feedback — ratings/comments | ✅ | **Delete text; keep anonymized rating** where it feeds course aggregates |
| Careers — followed, focus, declarations | ✅ | **Delete** |
| Payments — invoices, amounts, Stripe ids | ✅ purchase history | **Retain, pseudonymized** (accounting law; strip name/email, keep amount/date/course/invoice no.) |
| Organizations — membership / ownership | ✅ | Member: **remove**. Owner: **blocked pre-check** |
| Feedback (Google Sheets) | ✅ their submissions | **Anonymize submitter** (strip name/email, keep text) |
| Notifications | ✅ | **Delete** |
| Session / reset tokens | ❌ | **Delete** (revoke all) |
| Admin change-log about the user | ❌ (admin-internal) | **Retain, pseudonymized** (audit integrity; keep action/actor, strip target name/email) |

## Prong 3 — Cookie consent (minimal, extensible, client-only)

Only essential first-party storage exists today (the login session), so this prong is entirely
frontend — no API route.

- **`ConsentService` (app).** Decision stored in `localStorage`
  (`{ version, decidedAt, categories: { essential: true, analytics: false } }`), exposed as a signal,
  reads wrapped in try/catch. `essential` is always on and not togglable; `analytics` defaults
  **off**.
- **The gate that makes it real:** any future non-essential integration must call
  `consent.hasConsent('analytics')` before loading — opt-in by construction.
- **Banner** on first visit (no stored decision): "We use only essential cookies needed to run the
  site." with **Accept** and **Preferences**. Accept records the decision; Preferences opens a dialog
  listing categories (Essential — always on; Analytics — off, "none in use yet"). Keyboard
  accessible, not a focus-trapping blocker.
- **Versioned:** bumping `version` re-prompts, for when a category is later added. A footer **"Cookie
  preferences"** link reopens the dialog.

## Routes, permissions and frontend surfaces

- **API (`api/src/**`):** `GET /users/me/privacy/export` (`200`), `POST /users/me/privacy/erase`
  (`204`/`400`/`401`/`409`). Both get `/api` aliases and `routePermissions.test.ts` entries —
  authenticated, any role, caller-scoped. New files: `privacyService.ts`, `privacyRoutes.ts`
  (+ tests), the per-repo `collectForExport` / `anonymizeForUser` / `removeForUser` methods on
  existing repositories, and a seeded **system account** constant. Cookie consent adds no API route.
- **Frontend (`app/`):** a new **"Privacy & data" tab** on the existing account/settings page
  (joining Profile · Password · Purchases · Notifications), reached via the `/settings` gear.
  - *Export:* "Download your data" → Download JSON + the readable/printable summary view.
  - *Delete account:* a clearly-marked danger zone stating what is deleted vs kept-for-accounting, a
    password field + type-`DELETE` confirmation, final button; on `409` it lists the blocking org(s)
    with a link to transfer ownership.
  - **Cookie consent** lives at the **app-shell level** (banner + footer link + dialog) because it
    applies to logged-out visitors too.

## Testing

- **API (`api/src/**`):** `privacyService` unit (export composes every domain; erasure applies the
  disposition table; the **coverage test** fails if a personal-data repo is not wired into both);
  per-repo `collectForExport` / `anonymizeForUser` / `removeForUser`; gates (wrong password → 401,
  bad phrase → 400, org-owner-with-members → 409 naming orgs, plain member passes); erasure outcomes
  (account tombstoned so later login answers like a wrong password, tokens revoked, payments retained
  but pseudonymized, change-log retained pseudonymized, teacher courses still published and owned by
  the system account, instructor profile anonymized, feedback submitter anonymized); **idempotency**
  (running erase twice is safe); routes + `/api` aliases in `routePermissions.test.ts`; isolated mode
  uses in-memory repos.
- **App (`app/`):** clear `localStorage`/`sessionStorage` in `beforeEach`. Privacy tab renders;
  export offers JSON download + readable summary groups; delete danger zone stays disabled until
  password + `DELETE` are entered; the 409 lists blocking orgs. `ConsentService`: analytics defaults
  off, banner appears with no stored decision, Accept records it, Preferences dialog toggles, version
  bump re-prompts, footer link reopens, reads wrapped so a blocked `localStorage` still renders.
  `check-ui-foundation.mjs` stays green (no new hard-coded colours, no component focus ring).

## Review focus (carry into the plan)

- Caller-scoping: export never leaks another user's data.
- Erasing an account other users' enrolments reference — course counts stay intact.
- A user who is **both** a teacher and an org owner (ownership transfer + org block together).
- Retry after partial failure (idempotent re-run completes).
- Export of an empty vs data-heavy account.
- Consent read when `localStorage` is blocked or throws.

## Open decisions (confirm or change)

- Release assignment: **R2** (suggested and confirmed in brainstorming) — reconfirm at planning.
- Stripe-side data: whether erasure also deletes the Stripe customer object (vs retaining it for the
  accounting record it anchors). Default: retain, pseudonymize our copy; revisit with payments.
- The required confirmation phrase wording (`DELETE` assumed).

## Codex split (at implementation)

- **Codex (`api/src/**`):** `privacyService.ts` (+ fan-out across repos, gates), `privacyRoutes.ts`,
  the two routes, the per-repo `collectForExport` / `anonymizeForUser` / `removeForUser` methods, the
  seeded system account, and `unreadNotifications`-style wiring where export/erase need it. Trace each
  personal-data repository and its ownership/scoping.
- **Claude (`app/`):** the Privacy & data tab (export download + printable summary, delete danger
  zone), the app-shell cookie-consent banner/dialog + `ConsentService`, and footer link. Trace:
  the account/settings page tabs, `app-state.service.ts`, the app shell, and the footer.
