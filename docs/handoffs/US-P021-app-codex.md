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

- Not started.
