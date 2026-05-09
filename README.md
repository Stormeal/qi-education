# QI-Education

QI-Education is a portal for students and teachers to create, discover, and participate in courses. The first foundation keeps the stack small:

- `app`: Angular frontend.
- `api`: Node/Express API that uses Google Sheets as the backing store.

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

## Google Sheets Setup

The API expects one Google Sheet with a `Courses` worksheet. Add this header row:

```text
id,title,description,level,teacher,careerGoals,status,createdAt
```

Authentication uses a separate `Users` worksheet. Add this header row:

```text
id,email,displayName,passwordHash,role,status,createdAt
```

Feedback submissions use a `Feedback` worksheet. The API will create it automatically when Google Sheets is configured. It stores:

```text
ID,Created At,User ID,User Email,User Role,Page,Rating,Message,User Agent
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
npx vercel env pull api/.env --environment=development --yes
```

Share the sheet with the configured Google service account email.

Set an `AUTH_TOKEN_SECRET` value in the API environment before using login in shared or production environments.

The feedback worksheet range defaults to `Feedback!A:I`; override it with `GOOGLE_SHEETS_FEEDBACK_RANGE` if needed.

## Demo Authentication

When Google Sheets is not configured, the API falls back to in-memory demo users so the login flow can still be developed locally:

- `student@qi-education.local` / `Password123!`
- `teacher@qi-education.local` / `Password123!`
- `admin@qi-education.local` / `Password123!`

## First Product Scope

The current foundation intentionally starts with courses only. Career paths should build on top of real course and goal data once we settle the exact student profile fields and teacher workflow.

## Deployment

GitHub Actions runs build and test checks for pull requests.

Merges to `main` deploy the Angular app to GitHub Pages from the `app/dist/qi-education-app/browser` build output.

The published site will be available at `https://stormeal.github.io/qi-education/` once GitHub Pages is enabled for the repository.

The API still uses Vercel environment variables for local development through `npm run env:pull`, but the site itself is now deployed through GitHub Pages.

The GitHub Pages build calls `https://qi-education.vercel.app/api` for login and course data. The Vercel deployment exposes the Express API through `api/[...path].ts`, so make sure the Vercel project has the same Google Sheets and auth environment variables configured for production.

The Pages deployment workflow checks `https://qi-education.vercel.app/api/health/auth` before publishing. If that check fails, fix or redeploy the Vercel API first so GitHub Pages does not publish a frontend that cannot sign users in.
