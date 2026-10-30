# US-P021 GDPR Data Rights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users self-service export of their personal data, self-service account erasure (anonymize-and-retain), and a minimal extensible cookie-consent mechanism.

**Architecture:** A central injected `PrivacyService` (api) composes per-repository `collectForExport` / `anonymizeForUser` / `removeForUser` methods; a coverage test fails CI if a personal-data repository is not wired into both export and erasure. Erasure locks the account first and tombstones it last for idempotent retry. Cookie consent is an app-only `ConsentService`.

**Tech Stack:** Express + Zod + the pluggable repository pattern (in-memory for isolated/test, Mongo in prod); Angular signals frontend.

**Spec:** `docs/stories/US-P021-gdpr-data-rights.md`

## Global Constraints

- **Version bump every commit:** patch-bump `package.json`, `app/package.json`, the three `"version"` lines in `package-lock.json`, and `appVersion` in `app/src/app/services/app-state.service.ts`. Read the current version right before committing (a parallel committer may have bumped it).
- **Every new route** needs an entry in `api/src/routePermissions.test.ts` for both the route and its `/api` alias, or `npm run api:test` fails. Protected routes require a bearer token and are **caller-scoped**.
- **Repositories are injected** in `api/src/server.ts`; nothing touches storage from a route handler directly. Isolated/test runs use in-memory repos.
- **Frontend UI:** no new hard-coded colours (use `--color-*` / `--shadow-*` / `--radius-*` tokens in `tailwind.css`), no component-local `:focus` ring — `check-ui-foundation.mjs` runs in `npm run app:test`. A new page component lists `'../../app.scss'` first in `styleUrls`.
- **Frontend specs** clear `localStorage` and `sessionStorage` in `beforeEach`. Do not `vi.mock` a library at module level; override a replaceable service member instead.
- **Caller-scoped only:** no admin-on-behalf export/erase route in this story.
- Session tokens are stateless signed tokens, so closing the account (status) invalidates existing sessions implicitly (closed account → 401). "Revoke tokens" means deleting stored reset/confirmation tokens.

## Review Focus

- **Cross-user leak:** `collectForExport(userId)` / erasure must touch only the caller's rows — a filter that returns another user's data is the worst failure. (Test in Task 4 and Task 6: a second seeded user's data never appears in the first user's export; the erase route rejects any id but the caller's.)
- **Dangling references after erasure:** a published course whose author is erased must stay published with its enrolment count intact; other learners' enrolments unaffected. (Test in Task 3/Task 5.)
- **Teacher who is also an org owner:** the org-owner block must be evaluated before any mutation, so a teacher-owner is blocked and nothing (courses, profile) is changed. (Test in Task 5.)
- **Idempotent retry:** running `eraseUser` twice (simulating a mid-way failure + retry) completes without error and without double effects. (Test in Task 5.)
- **Consent read when storage throws:** `ConsentService` must render defaults (analytics off, banner shown) when `localStorage` access throws. (Test in Task 9.)

---

## Group A — API (owner: Codex, `api/src/**`)

### Task 1: System owner account

**Files:**
- Create: `api/src/systemAccount.ts`
- Modify: `api/src/server.ts` (seed on construction)
- Test: `api/src/systemAccount.test.ts`

**Interfaces:**
- Produces: `SYSTEM_ACCOUNT_ID: string` constant; `ensureSystemAccount(authRepository): Promise<void>` that creates a non-personal, non-login account (role `admin`, status closed-to-login) if absent.

- [ ] **Step 1: Write the failing test** — `ensureSystemAccount` creates the account once and is idempotent (second call writes nothing); the account cannot be logged into.
- [ ] **Step 2: Run it, verify it fails** (`npm --prefix api test -- systemAccount`). Expected: FAIL (module missing).
- [ ] **Step 3: Implement `SYSTEM_ACCOUNT_ID` and `ensureSystemAccount`** in `systemAccount.ts`; call it where repositories are constructed in `server.ts`.
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** (`git add api/src/systemAccount.ts api/src/systemAccount.test.ts api/src/server.ts` + version files).

### Task 2: `collectForExport` across personal-data repositories

**Files:**
- Modify (+ matching `*.test.ts`): `authRepository.ts` (account + enrolments), `accountProfileRepository.ts`, `instructorProfileRepository.ts`, `learningProgressRepository.ts`, `lessonNotesRepository.ts`, `accountCareersRepository.ts`, `paymentRepository.ts`, `organizationRepository.ts`, `feedbackRepository.ts`, `notificationRepository.ts`, plus the lesson-feedback store. (Confirm each exact file against `server.ts` wiring.)

**Interfaces:**
- Produces: on each repo, `collectForExport(userId: string): Promise<unknown>` returning only that user's rows (plain serializable data; no secrets — never the password hash or raw tokens).

- [ ] **Step 1: Write failing tests** — for each repo, `collectForExport` returns the seeded user's rows and excludes a second user's rows; account export excludes `passwordHash`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `collectForExport` on each repo** (in-memory and Mongo impls).
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** (stage the touched repos + their tests + version files).

### Task 3: Erasure dispositions across repositories

**Files:**
- Modify (+ tests): same repositories as Task 2, plus `userChangeRepository.ts`, `emailConfirmationRepository.ts`, `passwordResetRepository.ts`.

**Interfaces:**
- Produces, per the spec disposition table, on each repo one of:
  - `removeForUser(userId)` — profile, progress, notes, careers, notifications, reset/confirmation tokens, lesson-feedback text.
  - `anonymizeForUser(userId)` — account → tombstone (email null, display name "Deleted user", hash cleared, status closed); instructor profile → "Former instructor" (strip bio/avatar/description); feedback submitter identity stripped (text kept); change-log target name/email stripped (action/actor kept).
  - `retainForUser(userId)` / re-key — enrolments re-keyed to the tombstone (kept); payments pseudonymized (strip name/email, keep amount/date/course/invoice); lesson-feedback rating kept anonymized where it feeds aggregates.

- [ ] **Step 1: Write failing tests** — each repo's method produces the disposition above; e.g. payments retain amount/date but drop name/email; account becomes a tombstone that can no longer log in; a published course's enrolment count is unchanged when its author's instructor profile is anonymized; a second user's rows are never touched.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the methods** (in-memory + Mongo); make each idempotent (re-running is a no-op after the first).
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit.**

### Task 4: `PrivacyService.exportUserData` + coverage test

**Files:**
- Create: `api/src/privacyService.ts`, `api/src/privacyService.test.ts`
- Modify: `api/src/server.ts` (construct + inject the service)

**Interfaces:**
- Consumes: every repo's `collectForExport` (Task 2).
- Produces: `PrivacyService.exportUserData(userId): Promise<ExportPayload>` where `ExportPayload = { exportedAt, account, profile, instructorProfile, enrolments, progress, notes, lessonFeedback, careers, payments, organizations, feedback, notifications }`. Also a `PERSONAL_DATA_DOMAINS` registry array the coverage test enumerates.

- [ ] **Step 1: Write failing tests** — `exportUserData` returns every domain key for a data-heavy user and empty/absent sections for a fresh user; a second user's data never appears; **coverage test** asserts every entry in `PERSONAL_DATA_DOMAINS` is present in the payload and wired to a `collectForExport`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `exportUserData`** composing the repos via the registry.
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit.**

### Task 5: `PrivacyService.eraseUser` with gates

**Files:**
- Modify: `api/src/privacyService.ts`, `api/src/privacyService.test.ts`

**Interfaces:**
- Consumes: Task 3 methods; `SYSTEM_ACCOUNT_ID` (Task 1); `courseRepository` + `withCourseLock` for ownership transfer; `organizationRepository` for the owner check.
- Produces: `PrivacyService.eraseUser(userId): Promise<void>`; `PrivacyService.erasureBlockers(userId): Promise<{ organizations: OrgRef[] }>` (empty when none). The route uses `erasureBlockers` for the 409.

- [ ] **Step 1: Write failing tests** —
  - `erasureBlockers` returns the org(s) when the user owns an org with members/billing; empty for a plain member.
  - `eraseUser` on a teacher-owner **throws/refuses** and mutates nothing (courses, profile unchanged) — the block precedes all work.
  - Happy path: account tombstoned (later auth fails), tokens removed, payments pseudonymized, change-log pseudonymized, owned published courses re-owned by `SYSTEM_ACCOUNT_ID` and still published, instructor profile anonymized, feedback submitter anonymized.
  - **Idempotency:** calling `eraseUser` twice completes and leaves the same end state.
  - Order: the account is locked before per-domain work and tombstoned last.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `eraseUser`** — lock account → transfer courses (`withCourseLock`) + anonymize instructor profile → run each domain's disposition via the registry → remove tokens → tombstone account → write one "account erased" audit entry (no personal data).
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit.**

### Task 6: Privacy routes

**Files:**
- Create: `api/src/privacyRoutes.ts`, `api/src/privacyRoutes.test.ts`
- Modify: `api/src/server.ts` (mount), `api/src/routePermissions.test.ts`

**Interfaces:**
- Consumes: `PrivacyService` (Tasks 4–5); the auth password verifier from `auth.ts`.
- Produces routes (each also under `/api`):
  - `GET /users/me/privacy/export` → `200` `ExportPayload` for the caller.
  - `POST /users/me/privacy/erase` body `{ password: string, confirmation: string }` → `204`; `401` wrong password; `400` confirmation ≠ `DELETE`; `409 { message: 'transfer-organization-first', organizations }` when blocked.

- [ ] **Step 1: Write failing tests** — export returns the caller's payload and never another user's; erase gates in order (wrong password → 401, bad phrase → 400, org-owner → 409 naming orgs), happy path → 204 then login fails; both aliases resolve.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the router**; add the two routes + `/api` aliases to `routePermissions.test.ts` (authenticated, any role).
- [ ] **Step 4: Run `npm run api:test`, verify pass.**
- [ ] **Step 5: Commit.**

---

## Group B — App (owner: Claude, `app/`)

### Task 7: Privacy client + types

**Files:**
- Modify: `app/src/app/app.models.ts`, `app/src/app/services/app-state.service.ts`
- Create: `app/src/app/services/privacy.service.ts`, `app/src/app/services/privacy.service.spec.ts`

**Interfaces:**
- Produces: `PrivacyExport` type (mirrors `ExportPayload`); `PrivacyService` (app) with `exportMyData(): Promise<PrivacyExport>` (GET) and `eraseMyAccount(password, confirmation): Promise<void>` (POST, surfaces 401/400/409 distinctly). Uses `ApiClientService` with a replaceable member (no module-level mock).

- [ ] **Step 1: Write failing spec** — `exportMyData` calls the export endpoint and returns the payload; `eraseMyAccount` posts the body and maps a 409 to a typed `{ organizations }` error.
- [ ] **Step 2: Run, verify fail** (`cd app && npx ng test --watch=false --include src/app/services/privacy.service.spec.ts`).
- [ ] **Step 3: Implement the service + types.**
- [ ] **Step 4: Run spec, verify pass.**
- [ ] **Step 5: Commit.**

### Task 8: Privacy & data tab (export + delete)

**Files:**
- Modify: the account/settings page (`app/src/app/pages/profile-page/*`) — add a "Privacy & data" tab; its `*.spec.ts`.

**Interfaces:**
- Consumes: `PrivacyService` (Task 7).

- [ ] **Step 1: Write failing spec** — the tab renders; **Download JSON** calls `exportMyData` and offers the file; a readable summary lists the export's grouped sections with a Print control; the delete danger zone stays disabled until the password field is filled and the confirmation equals `DELETE`; a 409 lists the blocking organizations with a transfer link; success triggers logout + a terminal "deleted" state.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the tab** (download via a Blob; printable summary is a styled section with `window.print()`; danger zone validation; 409 handling). Tokens only, no component `:focus` ring.
- [ ] **Step 4: Run `npm run app:test`, verify pass (incl. `check-ui-foundation.mjs`).**
- [ ] **Step 5: Commit.**

### Task 9: Cookie consent (ConsentService + banner + footer link)

**Files:**
- Create: `app/src/app/services/consent.service.ts` (+ spec), `app/src/app/ui/cookie-consent/*` (banner + preferences dialog, + spec)
- Modify: the app shell (mount the banner) and the footer (a "Cookie preferences" trigger) — if no footer exists yet, this task adds a minimal shell footer slot.

**Interfaces:**
- Produces: `ConsentService` with `hasConsent(category: 'essential' | 'analytics'): boolean` (signal-backed), `record(categories)`, and a `pending` signal (no stored decision). Storage in `localStorage` under a versioned key, all reads/writes in try/catch.

- [ ] **Step 1: Write failing spec** — analytics defaults off; `pending` true with no stored decision (banner shows); Accept records the decision and clears `pending`; the preferences dialog toggles analytics; a version bump re-sets `pending`; **when `localStorage` throws, the service still returns defaults and renders the banner**; the footer trigger reopens the dialog.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `ConsentService` + banner/dialog + footer trigger.**
- [ ] **Step 4: Run `npm run app:test`, verify pass.**
- [ ] **Step 5: Commit.**

---

## Done when

`npm run api:test`, `npm run app:test`, `npm run verify:journeys` and `npm run app:build:pages` pass; a user can export their data (JSON + printable) and erase their account per the disposition table; the coverage test guards completeness; cookie consent is honest and analytics is opt-in by construction.
