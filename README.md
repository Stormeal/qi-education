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

Run the API:

```bash
npm run api:dev
```

## Google Sheets Setup

The API expects one Google Sheet with a `Courses` worksheet. Add this header row:

```text
id,title,description,level,teacher,careerGoals,status,createdAt
```

Create `api/.env` from Vercel development variables:

```bash
npx vercel env pull api/.env --environment=development --yes
```

Share the sheet with the configured Google service account email.

## First Product Scope

The current foundation intentionally starts with courses only. Career paths should build on top of real course and goal data once we settle the exact student profile fields and teacher workflow.

## Deployment

GitHub Actions runs build and test checks for pull requests and pushes to `main`.

Production deployment should be handled by the Vercel GitHub integration:

- Pull requests create Vercel preview deployments.
- Merges to `main` create production deployments.
