# Local development and verification

Use Node 22 and npm. Commands run from the repository root unless stated otherwise.
Do not introduce another package manager. Install with `npm ci` (CI includes optional
native dependencies with `npm ci --include=optional`).

## Normal development

```bash
npm run app:dev
```

This starts Angular on port 4200 and the API on port 3001. Alternatives:
`npm run app:dev:frontend` and `npm run api:dev`.

For configured integrations, use the existing Vercel development environment:
`npm run env:pull`. This writes ignored `api/.env` and requires Vercel access.
Inspect `api/.env.example` for variable names, but do not copy its empty optional
values unchanged: the Zod env schema rejects empty strings for several optional
credentials. Either supply real values or omit unused optional variables.
Never commit `.env` or log credentials.

| Area | Configuration |
| --- | --- |
| Auth | `AUTH_TOKEN_SECRET` (required in production) |
| Sheets | `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` |
| Sheet tabs | `GOOGLE_SHEETS_COURSES_RANGE`, `GOOGLE_SHEETS_USERS_RANGE`, `GOOGLE_SHEETS_FEEDBACK_RANGE` |
| Mongo content | `MONGODB_URI`, `MONGODB_DB_NAME`, `MONGODB_COURSE_CONTENT_COLLECTION` |
| Mongo assets | Same URI/database plus `MONGODB_COURSE_ASSET_COLLECTION` |
| Mux uploads | `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`; webhook secret for callback verification |
| Mux policy | `MUX_DEFAULT_PLAYBACK_POLICY`; signed key configuration alone does not implement signed player access |
| Feedback issues | `GITHUB_FEEDBACK_TOKEN`, `GITHUB_FEEDBACK_REPOSITORY`; optional project ID |
| HTTP | `PORT`, comma-separated `CORS_ORIGIN` |

Use the header order exported in `api/src/course.ts`, `auth.ts`, and `feedback.ts`.
Current sheet widths: Courses `A:U`, Users `A:H`, Feedback `A:M`. Column U is
`ownerUserId`; old rows default to an empty owner and admin-only editing. Share a test sheet
with the service account before running integration checks. Shared Sheets plus
memory content/assets will block some authoring operations by design.

The legacy `GOOGLE_SHEET_ID`, `GOOGLE_SHEETS_COURSES`, `GOOGLE_SHEETS_USERS`, and
`SESSION_SECRET` aliases are accepted; use the preferred names for new setup.

## Isolated local audit/demo walkthrough

This mode skips `api/.env` and selects in-memory repositories. It is for disposable
testing, not production configuration. Data disappears when the API restarts.
Stop any previous local listener before starting; do not replace another task's server.

PowerShell, terminal 1:

```powershell
npm run api:build
$env:NODE_ENV = 'test'
$env:PORT = '3001'
node api/dist/index.js
```

PowerShell, terminal 2:

```powershell
npm.cmd --prefix app run start -- --host 127.0.0.1 --port 4200
```

Open `http://127.0.0.1:4200/`. Demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@qi-education.local` | `Password123!` |
| Teacher | `teacher@qi-education.local` | `Password123!` |
| Admin | `admin@qi-education.local` | `Password123!` |

Keep GitHub integration credentials out of the shell environment for this mode.
`NODE_ENV=test` disables Sheets/Mongo/Mux factories, but the GitHub factory has no
equivalent test-mode guard. Do not mark feedback for work with a real token present.
The saved API audit probe injects isolated repositories and a GitHub stub explicitly.

Keep the local API running before browser mutations: the frontend has a hosted
API fallback on network failure. For stricter isolation, set
`window.qiEducationConfig = { apiBaseUrl: 'http://127.0.0.1:3001' }` in the local
browser before interacting. Browser tests should set that override before app startup.
Do not use production users to create/delete audit courses or trigger issue creation.

## Checks

| Command | Coverage |
| --- | --- |
| `npm run api:test` | API/repository/schema unit tests |
| `npm run app:test -- --watch=false` | Angular tests, once |
| `npm run api:build` | API TypeScript compilation |
| `npm run app:build` | Normal frontend bundle |
| `npm run app:build:pages` | Pages base path and generated SPA fallback |
| `npm run doctor` | Local env and running API health/config consistency |

On Windows, use `npm.cmd` when forwarding flags through PowerShell. A directly
forwarded frontend test command is `npm.cmd --prefix app test -- --watch=false`.
Single API file: `npm.cmd --prefix api test -- src/server.test.ts`.
Single frontend file: `npm.cmd --prefix app test -- --watch=false --include=src/app/app.spec.ts`.

The doctor inspects `api/.env`; it can disagree with an intentionally isolated
`NODE_ENV=test` server while shared credentials exist in that file. That is not
production readiness evidence. Use it with the actual intended integration config.
`--allow-demo` permits demo auth; `--skip-server` limits checks to configuration.

Reproduce the historical API findings safely:

```bash
npm run api:build
node docs/audits/2026-10-04/reproduce-api.mjs
```

The probe reports observed statuses and exits zero when it runs successfully;
zero does not mean the application is defect-free. Parser error stack output on
stderr is expected at the audit baseline. Convert each finding into a real
regression test when implementing its fix.

## Release checks

Run frontend/API tests, API build, and Pages build for cross-package releases.
Verify the intended configuration with the doctor, then exercise the affected
teacher/admin/learner flow in an appropriate environment. Record the tested
commit and any unavailable integrations. Unit mocks do not validate live Sheets,
MongoDB, Mux webhooks, signed playback, or GitHub permissions.

Pushing `main` deploys the Pages site through GitHub Actions. API deployment is
handled by Vercel; confirm hosted API compatibility before publishing a dependent
frontend. The deployed frontend calls `https://qi-education.vercel.app/api`.
This audit does not deploy or validate production write flows.
