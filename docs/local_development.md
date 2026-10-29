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

Local runs default to **isolated** stores, even when `api/.env` contains shared keys.
Users, courses, content, assets, feedback, career paths, learning progress, instructor
profiles and reset tokens use disposable memory. Mux uploads/webhooks are absent and
GitHub feedback is unconfigured. The three demo accounts and demo course are unchanged.
Restarting discards this data. `AUTH_TOKEN_SECRET`, `PORT` and `CORS_ORIGIN` still load
from the file; mail keeps its existing local recorder outside production.

To opt a nonhosted local run into configured shared services, set exactly `1` and restart:

```powershell
$env:USE_SHARED_SERVICES = '1'
npm run app:dev
```

To return to isolated mode, set `$env:USE_SHARED_SERVICES = '0'` and restart. The setting
can also live in ignored `api/.env`; a defined shell value overrides the file, including
an empty value. `true`, `01` and whitespace around `1` do not opt in. The app-dev script
passes an explicitly set value unchanged to the API child.

Hosted means `NODE_ENV=production` or **any defined** `VERCEL` value, even empty. Hosted
runs ignore the opt-in and retain configured services and unavailable-store protections.
`NODE_ENV=test` takes priority and always isolates stores/integrations, whatever other
settings say. Startup prints `Stores: isolated`, `Stores: shared` or `Stores: hosted`;
`GET /health/config` reports the same `mode` alongside its existing fields.
See [the isolation spec](specs/platform/storage-and-run-modes.md).

For opted-in integrations, use the existing Vercel development environment:
`npm run env:pull`. This writes ignored `api/.env` and requires Vercel access.
Inspect `api/.env.example` for variable names, but do not copy its empty optional
values unchanged in shared/hosted mode: the Zod env schema rejects empty strings
for several optional credentials. Isolated mode removes shared settings before validation.
Either supply real values or omit unused optional variables.
Never commit `.env` or log credentials.

| Area | Configuration |
| --- | --- |
| Auth | `AUTH_TOKEN_SECRET` (required in production) |
| Signup human check (US-P020) | `TURNSTILE_SECRET_KEY` and public `TURNSTILE_SITE_KEY`, both required to enable; stripped in isolated mode, optional; signup stays open until both hosted keys are set |
| Accounts and courses | MongoDB (the Mongo content settings below) in shared and hosted mode; without them those routes answer "unavailable". Isolated runs use the demo users and demo course |
| Maintenance freeze | `USER_STORE_READ_ONLY=1` / `COURSE_STORE_READ_ONLY=1` refuse account or course-detail writes (503 with a retry message). Any value other than `0` or `1` stops start-up |
| Feedback | MongoDB content settings; `FEEDBACK_STORE_READ_ONLY=1` freezes submission/lesson feedback/triage |
| One-time feedback migration only | `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_FEEDBACK_RANGE`; see [cutover](release/feedback-mongodb.md) |
| Mongo content | `MONGODB_URI`, `MONGODB_DB_NAME`, `MONGODB_COURSE_CONTENT_COLLECTION` |
| Mongo assets | Same URI/database plus `MONGODB_COURSE_ASSET_COLLECTION` |
| Mux uploads | `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`; webhook secret for callback verification |
| Mux policy | `MUX_DEFAULT_PLAYBACK_POLICY`; signed key configuration alone does not implement signed player access |
| Feedback issues | `GITHUB_FEEDBACK_TOKEN`, `GITHUB_FEEDBACK_REPOSITORY`; optional project ID |
| Account mail | `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `APP_PUBLIC_URL`; optional `MAIL_FROM_NAME` (default `QI-Education`) |
| HTTP | `PORT`, comma-separated `CORS_ORIGIN` |

Runtime feedback uses MongoDB, never Sheets. The separate migration command reads the legacy
17-column `A:Q` tab without changing it; rehearse with isolated doubles and use the
[cutover runbook](release/feedback-mongodb.md) for an authorized production copy. Health/doctor
report `feedback.storage` and `feedback.readOnly`; no legacy Sheets range is returned by health.

The old Users and Courses tabs stay in Google Drive as a read-only backup of the 2026-10-18
cutover; nothing reads them. The commands that copied them (`users:migrate`, `courses:migrate`)
were removed in US-P016; commit `d1cdcb9` still has them.

The legacy `GOOGLE_SHEET_ID` and `SESSION_SECRET` aliases are accepted; use the preferred names
for new setup.

## Account mail and password recovery

Brevo is selected only with `NODE_ENV=production`; development/tests always
record locally even if real credentials are present. Local stdout displays the
complete recipient, subject and plain-text message, including the fragment link.
Tests inject a recorder/output stub and never call Brevo. Reset tokens use memory
in isolated/test mode, and configured Mongo in shared/hosted mode. Mail follows the
same hosted rule as storage (DEF-048, 2026-10-20): a hosted process (NODE_ENV=production
or a VERCEL marker) uses Brevo or reports mail unavailable, and never prints mail.

Production requires the Brevo key, sender address and frontend `APP_PUBLIC_URL`
without a trailing slash. The agreed sender is `xqiacademy@gmail.com`; Alex
confirms it in Brevo and supplies settings in Vercel. `MAIL_FROM_NAME` defaults
to `QI-Education`. Use an HTTP/HTTPS frontend URL; local messages fall back to
`http://localhost:4200` when omitted. Missing mail settings return 503 on reset
requests and do not affect existing routes. `/health/config` retains configured
and provider under mail, without keys/addresses, alongside its new store mode.
Real acceptance, delivery and
spam placement remain Alex's post-deployment check; no test sends real mail.

Shared/hosted password writes use the MongoDB account store; hashed reset tokens
use configured Mongo and
`<MONGODB_COURSE_CONTENT_COLLECTION>_password_resets`. No raw token is persisted. Links last 60 minutes and one use; checks
do not consume them. The three-per-account rolling-hour limit includes pending
or failed sends because a timeout can follow delivery. A failed password write
after claiming a token leaves it consumed; request a fresh link. Existing signed
sessions survive a reset. Client-address and confirmation-mail limits remain open.
See the [reset spec](specs/accounts/passwords-and-email.md).

## Isolated local audit/demo walkthrough

Normal local startup loads auth/HTTP/mail settings from `api/.env` but ignores shared
service settings. The test-mode walkthrough below also skips the file entirely and
selects in-memory repositories. It is for disposable
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

`NODE_ENV=test` disables shared store, Mux and GitHub configuration even with shell
credentials or USE_SHARED_SERVICES=1. The API audit probe injects isolated repositories
and a GitHub stub explicitly; automatic tests never call shared services.

Keep the local API running before browser mutations. The local frontend now reports
a local API failure instead of falling back to the hosted API (US-P012). To select
an explicit test API, set
`window.qiEducationConfig = { apiBaseUrl: 'http://127.0.0.1:3001' }` in the local
browser before interacting. Browser tests should set that override before app startup.
Do not use production users to create/delete audit courses or trigger issue creation.

## Import a Rise course (US-T015)

Unzip the SCORM export outside the repo first (for example `C:\Users\Alex\scorm-import\<name>`).
The importer only reads Articulate Rise exports (`scormcontent/runtime-data.js`).

```bash
npm --prefix api run import:rise -- "C:/Users/Alex/scorm-import/istqb-foundation" --dry-run
npm --prefix api run import:rise -- "C:/Users/Alex/scorm-import/istqb-foundation" --email teacher@example.com
```

In PowerShell write `npm.cmd` instead of `npm`: PowerShell's `npm` wrapper drops the `--`, so the
importer never receives `--email` and only prints its usage line.

- The dry run prints sections, lesson counts, video minutes, skipped files and problems, and
  sends nothing. A real run refuses to start while there are problems.
- A real run goes to the hosted API (`--api` overrides it, for example `http://localhost:3001`),
  asks for the teacher's password without echoing it (or reads `QI_IMPORT_PASSWORD`) and creates
  a draft owned by that teacher. Videos only finish on the hosted API: Mux reports them there.
- Push the importer's commits and let the hosted API deploy before a real run: the hosted API must
  accept the longer quiz text (answers 600, feedback and explanations 1,500 characters), or saving
  the lessons answers 400.
- After the first video the importer waits up to 2 minutes for Mux's webhook to reach the hosted
  API. If it never does, it stops before sending the rest; check `npx vercel logs`.
- If it stops, it prints `Resume with: --course <id>`. Wait a minute, then run the same command
  with that flag: it uploads only what is missing.
- PDFs over 4 MB are skipped and listed; upload compressed copies in the course editor.

## Checks

| Command | Coverage |
| --- | --- |
| `npm run api:test` | API/repository/schema unit tests |
| `npm run verify:journeys` | US-P001 role journey over HTTP with in-memory stores; prints the tested commit |
| `npm run app:test -- --watch=false` | Angular tests, once |
| `npm run api:build` | API TypeScript compilation |
| `npm run app:build` | Normal frontend bundle |
| `npm run app:build:pages` | Pages base path and generated SPA fallback |
| `npm run doctor` | Local env and running API health/config consistency |

On Windows, use `npm.cmd` when forwarding flags through PowerShell. A directly
forwarded frontend test command is `npm.cmd --prefix app test -- --watch=false`.
Single API file: `npm.cmd --prefix api test -- src/server.test.ts`.
Single frontend file: `npm.cmd --prefix app test -- --watch=false --include=src/app/app.spec.ts`.

Doctor reports the selected mode using shell-over-dotenv precedence; in test mode
it skips the file. Isolated mode permits missing shared settings and the local auth
fallback. Shared/hosted mode retains configuration checks. A running API in another
mode or with a different account or course store fails the check: restart it with the intended
settings. `--skip-server` limits checks to configuration. Doctor does not
prove live provider readiness.

Reproduce the historical API findings safely:

```bash
npm run api:build
node docs/history/audits/2026-10-04/reproduce-api.mjs
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
