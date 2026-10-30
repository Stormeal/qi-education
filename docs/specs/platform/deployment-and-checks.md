# Deployment and checks

## Purpose

Every change is tested before it reaches users, and the frontend and API stay compatible.

## Behavior

- **Frontend** → GitHub Pages (`npm run app:build:pages`, base href `/qi-education/`, generated
  `404.html` SPA fallback). The Pages workflow runs on pushes to `main`: app tests, API build and
  tests, hosted `/api/health/auth` and config checks, then the Pages build and publish.
- **API** → Vercel serverless (`api/[...path].ts`, routes in `vercel.json`). A push to `main`
  deploys it immediately, even when the Pages workflow later fails, so API changes must stay
  backward compatible with the deployed frontend.
- **Older open tabs** (DEF-067): a failed lazy-route import shows a root-level recovery message
  while keeping the current page. **Reload page** explicitly reloads the current address, including
  fragment-bearing links; it never reloads or redirects automatically. Unsaved course changes
  disable the action until saved or reverted; existing navigation and browser-departure guards
  remain in force. Successful navigation clears the message. Failed navigation resolves `false`,
  and unrelated errors still reach the normal error reporter. Tabs opened before this handling
  was deployed need one manual browser reload to acquire it.
- **CI** (`ci.yml`) on pull requests and pushes to `main`: app build, Pages build, app tests, API
  build, API tests (Ubuntu, Node 22).
- **Version hook**: `.githooks` pre-commit and pre-push require a semver change, also for docs.
  Bump root `package.json`, `app/package.json`, their `package-lock.json` entries and
  `AppStateService.appVersion` together. Never bypass with `--no-verify`.
- **Local checks before a push**: `npm run api:test`, `npm run app:test`, `npm run verify:journeys`,
  `npm run app:build:pages`.
- **Hosted log**: `npx vercel logs` after `npx vercel login`; the plan keeps only 30 minutes.

## Code

- `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `.githooks/`, `vercel.json`,
  `api/[...path].ts`, `scripts/create-pages-fallback.mjs`.
- App routing: `app.config.ts`, `services/navigation-recovery.service.ts`, root `app.html`.

## Limits

- No browser end-to-end suite; the cross-role journey runs over HTTP with in-memory stores (US-P001).
