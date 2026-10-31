# Privacy and data rights

## Purpose

US-P021 (delivered locally 2026-10-31, release 1, not live). A user exports and deletes their own
personal data without admin help, and controls non-essential cookies. EU storage, processor
agreements and the privacy notice come from US-P018-AC03.

## Behavior

- **Export** (`GET /users/me/privacy/export`, `/api` alias, any signed-in role, own account only):
  one JSON object `{ exportedAt, account, profile, instructorProfile, enrolments, progress, notes,
  lessonFeedback, careers, payments, organizations, feedback, notifications, authoring,
  termsAcceptances }` (US-P022 acceptances are kept on erasure, see [terms](terms.md)). No
  password hash, tokens or card data. Never cached by the API or the app.
- **Erase** (`POST /users/me/privacy/erase`, `/api` alias), body
  `{ password, confirmation: 'DELETE' }`, checked before any change:
  - wrong password → **400** `{ message: 'Your password is not correct.', code: 'password-incorrect' }`
    (not 401: the app signs out on every 401). It counts as a failed sign-in for the sign-in limit;
  - bad body or confirmation other than `DELETE` → 400;
  - owner of an organization with members or billing → **409**
    `{ message: 'transfer-organization-first', organizations: [{ id, name }] }`. Plain members pass;
  - missing, invalid or disabled session → 401; too many attempts → 429 with `Retry-After`; storage
    down → 503; success → 204.
- **Erasure outcome (anonymize and retain, immediate, irreversible).** The account is locked first,
  so a failure leaves it unusable and a retry finishes the job. Then: published courses move to the
  seeded system account and the instructor profile reads "Former instructor"; per-domain disposition
  below; all tokens revoked; the account row is reduced to a tombstone last (no email or name, no
  password, closed), so the email can never sign in again; one audit entry without personal data.
  A coverage test fails if a personal-data repository is not wired into both export and erasure.

  | Domain | On erasure |
  | --- | --- |
  | Account | Tombstone |
  | Private profile, progress, notes, careers, notifications, tokens | Deleted |
  | Instructor profile | "Former instructor" |
  | Enrolments | Kept, under the tombstone id |
  | Lesson feedback | Text deleted, rating kept anonymously |
  | Payments, admin change log | Kept, pseudonymized (accounting and audit) |
  | Organization membership | Removed (owners are blocked first) |
  | Feedback submissions | Submitter anonymized, text kept |

- While an erase is running, every other authenticated change for that account is refused
  (`PrivacyMutationCoordinator`); a refused request answers the route's own 401.
- **Settings → Privacy & data** (last tab):
  - *Download JSON* saves `qi-academy-data-<date>.json` and shows a summary (name, email, role and
    a count per section) with *Print summary*. Printing hides the header, tabs, footer and the
    delete section.
  - *Delete your account* says what is deleted and what is kept for accounting. The button stays
    disabled until a password is entered and the confirmation is exactly `DELETE`. Errors show
    inline and keep the user signed in; a 409 lists the organizations with a link to
    `/organization`. Success shows "Your account and data have been deleted"; Close signs out.
- **Cookie consent** (app shell, also for signed-out visitors): with no stored decision a corner
  banner (not a blocking dialog) says "We use only essential cookies needed to run the site." with
  Accept and Preferences. Preferences lists Essential (always on) and Analytics (off, none in use
  yet). The decision is stored in `localStorage` `qi-education:cookie-consent` as
  `{ version, decidedAt, categories }`; raising `CONSENT_VERSION` asks again. Blocked storage still
  shows the banner with analytics off. Every page footer has a "Cookie preferences" link (the login
  page has no footer). Any future non-essential integration must check
  `ConsentService.hasConsent('analytics')` before it loads.

## Decisions to confirm or change

- Erase wrong password answers 400, like change-password (Claude, 2026-10-31).
- Privacy & data is the last Settings tab; the cookie banner is a corner panel (Claude, 2026-10-31).
- Confirmation phrase is `DELETE`.
- Stripe customer objects are kept; only our copy is pseudonymized. Revisit with payments.

## Limits

- No admin-on-behalf export or erasure, no grace period, no server-side PDF.
- Verified on isolated in-memory stores only (2026-10-31): export, wrong password, delete, Close and
  the deleted account's failed sign-in. Not verified on the hosted site.
