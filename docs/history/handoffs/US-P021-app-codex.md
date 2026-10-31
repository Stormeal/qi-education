# US-P021 app increment: Codex part

Owner: Codex. Branch: `main`. Started: 2026-10-31. Lead: Claude.
Story: `docs/stories/US-P021-gdpr-data-rights.md`. Plan: `docs/superpowers/plans/2026-10-30-us-p021-gdpr-data-rights.md` (Task 7).

## Split

| Owner | Scope | Files |
| --- | --- | --- |
| Codex | Erase route wrong-password status; app privacy data service (Task 7) | `api/src/privacyRoutes.ts`, `api/src/privacyRoutes.test.ts`, `app/src/app/services/privacy.service.ts`, `app/src/app/services/privacy.service.spec.ts` |
| Claude | Privacy & data tab (Task 8), cookie consent (Task 9) | `app/src/app/pages/profile-page/*`, `app/src/app/services/consent.service.ts` (+ spec), `app/src/app/ui/cookie-consent/*`, app shell and footer files, `app.models.ts`, `app-state.service.ts`, docs specs |

## Contract Claude relies on

1. **API.** `POST /users/me/privacy/erase` (and `/api` alias): a wrong password answers
   **400** `{ message: 'Your password is not correct.', code: 'password-incorrect' }`, not 401.
   Reason: `ApiClientService.fetch` logs the user out on any 401, so a typo would sign them out.
   Change-password already uses this pattern (`changePasswordRoutes.ts` line 21). Everything else
   stays: missing/invalid/disabled session 401, bad body or confirmation ≠ `DELETE` 400, org owner
   409 `{ message: 'transfer-organization-first', organizations: [{ id, name }] }`, 429 with
   `Retry-After`, 503, success 204. The sign-in limit still counts a wrong password as a failure.
2. **App service** `app/src/app/services/privacy.service.ts`, same style as `organization.service.ts`
   (token passed in, `ApiClientService.fetch`, never cached):

   ```ts
   export type PrivacyExport = { /* mirrors api PrivacyExport (privacyService.ts exportUserData) exactly */ };
   export type PrivacyBlockingOrganization = { id: string; name: string };
   export type PrivacyResult<T> =
     | { ok: true; body: T }
     | { ok: false; status: number; message: string; code?: string; organizations?: PrivacyBlockingOrganization[] };
   @Injectable({ providedIn: 'root' }) export class PrivacyService {
     exportMyData(token: string): Promise<PrivacyResult<PrivacyExport>>;            // GET /users/me/privacy/export
     eraseMyAccount(token: string, password: string, confirmation: string): Promise<PrivacyResult<void>>; // POST erase
   }
   ```

   A network failure resolves `{ ok: false, status: 0, message }` (never throws). Messages are
   plain and safe to show. `organizations` and `code` are passed through from the error body.

## Progress

- Done locally: Codex on `main`, base `a72845a` (contains `c0be8e0`), 2026-10-31.
  Delivery commit: `74ed267`, version `0.1.554`. No push or deployment.
- Contract precedence: this handoff and Alex's request supersede Task 7's older signatures
  and the story's older wrong-password 401 wording. No app-state integration in this part.
- Implemented both pieces: wrong-password 400 with the exact message/code, after awaited
  failure recording; typed `PrivacyService` with the full export shape (including `authoring`),
  supplied bearer tokens, uncached requests, 204 support and safe error results.
- Route regressions first failed on the old 401 for both aliases, then passed. Coverage also
  preserves missing/invalid/disabled session 401s, pending-erasure retries and 429/Retry-After.
- Checks: `npm run api:test` passes 3,024/3,024 tests across 126 files;
  `(cd app && npx ng test --watch=false --include src/app/services/privacy.service.spec.ts)`
  passes 9/9. Angular reports the existing `src/test-setup.ts` compilation warning.
- Fresh read-only review found no critical, important or minor issues. Tests use isolated
  in-memory stores and fetch spies; no hosted/shared mutation probes or fixed-port servers.
- Version bump read the current `0.1.553` immediately before commit and aligned root/app package
  versions, all three matching lockfile entries, and only `AppStateService.appVersion`.
- Delivery commit recorded here and in Codex's queue row after committing, as requested;
  those post-commit record updates remain uncommitted. Claude's Settings files were preserved
  and excluded from this commit. No additional file access was needed for implementation.
- Next: Claude owns Settings integration, remaining whole-story checks and final story closure.
