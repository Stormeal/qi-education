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
| Accounts and enrollments | MongoDB `<collection>_users` (`USER_STORE=mongodb`, cut over 2026-10-18) |
| Course details (metadata, owner, price, catalog fields) | MongoDB `<collection>_courses` (`COURSE_STORE=mongodb`, cut over 2026-10-18) |
| Course content, live/working snapshots, review history | MongoDB course-content collection |
| Thumbnails and attachments | MongoDB asset repository |
| Lesson notes, learning progress, career paths, account careers, profiles, instructor descriptions, reset tokens, sign-in attempts, user change log | MongoDB, one collection each named `<collection>_<purpose>` |
| Feedback | Google Sheets (Feedback tab) |

`<collection>` is `MONGODB_COURSE_CONTENT_COLLECTION`. The code default for `USER_STORE` and
`COURSE_STORE` is still `google-sheets`; the old Users and Courses tabs are a read-only backup.
Retiring that code is US-P016.

## Maintenance freeze and migration

- `USER_STORE_READ_ONLY=1` / `COURSE_STORE_READ_ONLY=1` refuse account or course-detail writes with a
  503 maintenance message; reads keep working.
- `npm --prefix api run users:migrate -- <--dry-run|--apply|--verify|--restore-sheet>` and
  `courses:migrate` copy between Sheets and MongoDB. Every mode needs `USE_SHARED_SERVICES=1`;
  writing modes need the freeze. `--verify` must print `Verified: N … identical` before a switch.
  Runbooks: [history/release](../../history/release/).

## Health and diagnostics

- `GET /health`, `/health/config`, `/health/auth` (`{ status, store, readOnly }`), `/health/content`.
  They prove configuration, not a full read/write journey.
- `npm run doctor` checks local settings and that the running API's mode matches.

## Code

- API: `config.ts`, `authStore.ts`, `courseStore.ts`, `mongo.ts`, `googleSheets.ts`, the
  `*Repository.ts` files, `usersMigration.ts`, `coursesMigration.ts`, `migrateUsers.ts`,
  `migrateCourses.ts`, `health/`.
- Scripts: `scripts/doctor.mjs`, `scripts/run-app-dev.mjs`.
- Setup: [local_development.md](../../local_development.md).
