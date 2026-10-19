# Tech stack

Versions are the ones pinned in the `package.json` files; check there before relying on a feature.

## Runtime and workspace

| Piece | Choice |
| --- | --- |
| Runtime | Node.js 22.x (`engines`), npm 10 workspaces: `app/` and `api/` |
| Language | TypeScript (app ~5.9, API 6.0), strict |
| Dev orchestration | `concurrently` via `scripts/run-app-dev.mjs` (`npm run app:dev`) |

## Frontend (`app/`)

| Piece | Choice |
| --- | --- |
| Framework | Angular 21 (standalone components, signals, OnPush, new control flow) |
| Build | `@angular/build` / Angular CLI 21 |
| Styling | Tailwind CSS 4 (`@theme` design values in `src/tailwind.css`) + component SCSS |
| Icons | `@ng-icons/core` with Lucide |
| Video | `@mux/mux-player` (playback), `@mux/upchunk` (direct chunked upload) |
| State | Angular signals in services; no NgRx or other state library |
| HTTP | `fetch` through `ApiClientService`; attachment uploads use `XMLHttpRequest` for progress |
| Tests | Vitest 4 through the Angular builder, jsdom; Node test runner for `scripts/ui-foundation` |
| Formatting | Prettier |

## API (`api/`)

| Piece | Choice |
| --- | --- |
| Server | Express 5, `cors` |
| Validation | Zod 4 |
| Auth | Node `crypto`: salted scrypt password hashes, HMAC-signed JWT-shaped tokens (12 h) |
| Databases | MongoDB driver 7 (accounts, courses, content, assets, everything else); `googleapis` Google Sheets (feedback only) |
| Video | `@mux/mux-node` (direct uploads, signed webhooks) |
| Mail | Brevo HTTP API via `fetch` (production only) |
| Issues | GitHub REST and GraphQL via `fetch` (feedback triage) |
| Config | `dotenv` (`api/.env`, pulled with `npm run env:pull`) |
| Dev / tests | `tsx` watch, Vitest 4 |

## Hosting and tooling

| Piece | Choice |
| --- | --- |
| Frontend hosting | GitHub Pages (`/qi-education/`), built by `.github/workflows/pages.yml` |
| API hosting | Vercel serverless function `api/[...path].ts`, Hobby plan (30-minute log) |
| Database hosting | MongoDB Atlas |
| CI | GitHub Actions `ci.yml` (PRs and `main`), Ubuntu, Node 22 |
| Git hooks | `.githooks/` requires a version bump on every commit and push |
| AI agents | Claude Code (lead) and Codex share one working tree; see [AGENTS.md](../AGENTS.md) |
