# QI-Education

QI-Education is a portal for students and teachers to create, discover, and participate in courses.

- `app`: Angular frontend.
- `api`: Node/Express API with Google Sheets for account/course metadata/feedback and MongoDB for course content/assets; isolated in-memory implementations support tests.

## Project documentation and next work

Start with [docs/README.md](docs/README.md) and [the work queue](docs/work_queue.md).
The adjacent [user stories](docs/user_stories.md) and [defect log](docs/defect_management.md)
record product behavior, BDD acceptance criteria, priorities, and audit findings.
Read the [development workflow](docs/development_workflow.md) before implementing
an item and [architecture](docs/architecture.md) for the current code map.

The current delivery order is teacher journey, learner journey, then platform
reliability, with confirmed defects before enhancements. Teachers edit their own
courses and admins all courses; legacy courses without an owner are admin-only
for editing. See DEF-001 for implementation and release verification. Work and
commits use `main`, unless another branch is requested.

## Local Development

Install dependencies:

```bash
npm ci
```

Run the frontend:

```bash
npm run app:dev
```

This starts both the Angular dev server at `http://localhost:4200` and the local API at `http://localhost:3001`.

Run the API:

```bash
npm run api:dev
```

Use `npm run app:dev:frontend` only when you intentionally want to run the Angular dev server without starting the local API.

Check local release readiness:

```bash
npm run doctor
```

The doctor checks `api/.env`, local API health, auth storage, CORS, and content storage configuration. Use `npm run doctor -- --allow-demo` only when you intentionally want local login to use the demo users instead of the shared Google Sheets users.

## Google Sheets Setup

The API expects one Google Sheet with a `Courses` worksheet. Add this header row:

```text
id,title,description,level,teacher,careerGoals,status,createdAt,requirements,audience,priceDkk,partOfCareer,whatYoullLearn,thumbnailAssetId,isPremium,isBestseller,rating,ratingCount,category,languages,ownerUserId
```

Authentication uses a separate `Users` worksheet. Add this header row:

```text
id,email,displayName,passwordHash,role,status,createdAt,enrolledCourseIds
```

Feedback submissions use a `Feedback` worksheet. The API will create it automatically when Google Sheets is configured. It stores:

```text
ID,Created At,User ID,User Email,User Role,Page,Rating,Message,User Agent,Work Status,Priority,GitHub Issue Number,GitHub Issue URL
```

Supported roles:

- `student`: regular learner access.
- `teacher`: learner access plus course creation.
- `admin`: unrestricted platform access.

Supported statuses:

- `active`
- `disabled`

When the API runs against Google Sheets, the auth repository will create the `Users` worksheet automatically if it does not already exist.

To generate a password hash for a sheet row:

```bash
npm --prefix api run auth:hash-password -- "Password123!"
```

Create `api/.env` from Vercel development variables:

```bash
npm run env:pull
```

Share the sheet with the configured Google service account email.

Set an `AUTH_TOKEN_SECRET` value in the API environment before using login in shared or production environments.

For setup details and an isolated demo walkthrough that skips shared credentials,
see [local development](docs/local_development.md). Do not copy empty optional
credentials from `.env.example` unchanged; omit unused optional values or provide
valid ones. Current worksheet widths are Courses `A:U`, Users `A:H`, Feedback `A:M`.

Preferred environment variable names:

```text
AUTH_TOKEN_SECRET
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_SHEETS_COURSES_RANGE
GOOGLE_SHEETS_USERS_RANGE
GOOGLE_SHEETS_FEEDBACK_RANGE
MONGODB_URI
MONGODB_DB_NAME
MONGODB_COURSE_CONTENT_COLLECTION
```

The API still accepts the legacy `GOOGLE_SHEET_ID`, `GOOGLE_SHEETS_COURSES`, `GOOGLE_SHEETS_USERS`, and `SESSION_SECRET` names, but new configuration should use the preferred names above.

The feedback worksheet range defaults to `Feedback!A:M`; override it with `GOOGLE_SHEETS_FEEDBACK_RANGE` if needed.

To create GitHub issues automatically when an admin marks feedback as `Mark for work`, configure:

```text
GITHUB_FEEDBACK_TOKEN
GITHUB_FEEDBACK_REPOSITORY
GITHUB_FEEDBACK_PROJECT_ID
```

`GITHUB_FEEDBACK_REPOSITORY` must use the `owner/repo` format. `GITHUB_FEEDBACK_PROJECT_ID` is optional; when it is set, new feedback issues are also added to that GitHub Project.

## Demo Authentication

When Google Sheets is not configured, the API falls back to in-memory demo users so the login flow can still be developed locally:

- `student@qi-education.local` / `Password123!`
- `teacher@qi-education.local` / `Password123!`
- `admin@qi-education.local` / `Password123!`

## Student Sign Up

Public sign up is enabled for student accounts in local and production environments. New accounts are created with:

- `role`: `student`
- `status`: `active`
- `enrolledCourseIds`: empty

Teacher and admin access should be granted later through admin tooling rather than public registration.

Passwords must be at least 8 characters and include at least one capital letter and one number.

## First Product Scope

The current foundation intentionally starts with courses only. Career paths should build on top of real course and goal data once we settle the exact student profile fields and teacher workflow.

## Deployment

GitHub Actions runs build and test checks for pull requests.

Merges to `main` deploy the Angular app to GitHub Pages from the `app/dist/qi-education-app/browser` build output.

The published site will be available at `https://stormeal.github.io/qi-education/` once GitHub Pages is enabled for the repository.

The API still uses Vercel environment variables for local development through `npm run env:pull`, but the site itself is now deployed through GitHub Pages.

The GitHub Pages build calls `https://qi-education.vercel.app/api` for login and course data. The Vercel deployment exposes the Express API through `api/[...path].ts`, so make sure the Vercel project has the same Google Sheets and auth environment variables configured for production.

The Pages deployment workflow checks `https://qi-education.vercel.app/api/health/auth` before publishing. If that check fails, fix or redeploy the Vercel API first so GitHub Pages does not publish a frontend that cannot sign users in.

Before release, run:

```bash
npm run doctor
npm run app:test -- --run
npm run api:test
npm run app:build:pages
```

Then verify a real login against the published Pages URL after the API has been deployed.
