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

## Limits

- No browser end-to-end suite; the cross-role journey runs over HTTP with in-memory stores (US-P001).
