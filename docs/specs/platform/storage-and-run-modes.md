# Storage and run modes

## Purpose

The same API runs hosted, locally and in tests; each mode picks safe stores so a local run or a
test can never change live data.

## Run modes (`config.ts`)

| Mode | When | Stores |
| --- | --- | --- |
| **Test** | `NODE_ENV=test` | Always isolated: in-memory stores, provider doubles, no `.env` loaded |
| **Hosted** | `NODE_ENV=production` or any `VERCEL` marker | Configured stores; a missing required setting fails closed (503), never demo data |
| **Isolated local** | default for `npm run app:dev` / `api:dev` | In-memory stores with demo users and one demo course; Google, Mongo, Mux and GitHub settings are ignored |
| **Shared local** | exactly `USE_SHARED_SERVICES=1` | Configured shared stores. Use read-only checks only: never mutate shared data |

Startup prints one `Stores:` line; `/health/config` reports `mode`.

## Stores (hosted)

| Data | Store |
| --- | --- |
| Accounts and enrollments | MongoDB `<collection>_users` (cut over 2026-10-18) |
| Course details (metadata, owner, price, catalog fields) | MongoDB `<collection>_courses` (cut over 2026-10-18) |
| Course content, live/working snapshots, review history | MongoDB course-content collection |
| Thumbnails and attachments | MongoDB asset repository |
| Lesson notes, learning progress, career paths, account careers, profiles, instructor descriptions, reset tokens, sign-in attempts, user change log | MongoDB, one collection each named `<collection>_<purpose>` |
| Feedback | Google Sheets (Feedback tab) |

`<collection>` is `MONGODB_COURSE_CONTENT_COLLECTION`. Shared and hosted mode without the MongoDB
settings answer "unavailable" (503) for accounts and courses, never demo data. Feedback is the only
Google Sheets store (US-P016); the old Users and Courses tabs stay in Google Drive as a read-only
backup that nothing reads.

## Maintenance freeze

- `USER_STORE_READ_ONLY=1` / `COURSE_STORE_READ_ONLY=1` refuse account or course-detail writes with a
  503 maintenance message; reads keep working.
- The Sheets-to-MongoDB copy commands were removed in US-P016; the cutover runbooks are in
  [history/release](../../history/release/) and commit `d1cdcb9` has the code.

## Health and diagnostics

- `GET /health`, `/health/config`, `/health/auth` (`{ status, store, readOnly }`), `/health/content`.
  They prove configuration, not a full read/write journey.
- `npm run doctor` checks local settings and that the running API's mode and stores match.

## Code

- API: `config.ts`, `authStore.ts`, `courseStore.ts`, `mongo.ts`, `googleSheets.ts`, the
  `*Repository.ts` files, `health/`.
- Scripts: `scripts/doctor.mjs`, `scripts/run-app-dev.mjs`.
- Setup: [local_development.md](../../local_development.md).
