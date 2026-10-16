# QI Academy rename

## Implemented in the repository

- Product text, document titles, shared wordmark and accessible home labels use QI Academy.
- Workspace packages use `qi-academy`, `@qi-academy/app` and `@qi-academy/api`. Lockfiles use the same names.
- The Angular project is `qi-academy-app`. Vercel, GitHub Pages and the Pages fallback generator consume `app/dist/qi-academy-app/browser`.
- Local diagnostics accept `QI_ACADEMY_LOCAL_API`; the previous environment variable remains supported.
- Password reset and password-changed emails use QI Academy, and `MAIL_FROM_NAME` defaults to `QI Academy`. Deployments that set `MAIL_FROM_NAME` explicitly keep their configured sender name.

## Compatibility during rollout

The existing GitHub repository, Pages base path and Vercel API URL remain active until their replacements are provisioned. Replacing their strings alone would send users to endpoints that do not exist.

Keep the MongoDB database `QIEducation`, collection names, Google Sheets IDs, authentication secrets and asset references unchanged. These are storage identifiers, not product branding. Changing the database name would select a different database and make existing content appear missing.

The `qiEducationSession` browser key, `qi-education:course-progress:*` keys, `qiEducationConfig` runtime override and `X-QI-Education-*-Storage` response headers remain compatibility contracts. Keeping them preserves sessions, local progress, configuration and clients during a staggered deployment. Demo account emails remain unchanged so documented local credentials still work. The support link is still the existing `.local` placeholder and needs an approved working mailbox before release.

## External cutover checklist

1. Confirm the new public domain, support mailbox and intended repository slug. Provision the domain/mailbox before changing links. A product rename does not require moving storage or renaming the repository.
2. If renaming the GitHub repository, update local git remotes, `GITHUB_FEEDBACK_REPOSITORY`, the Vercel Git integration and any external automation references. Update the root `app:build:pages` base/deploy paths to the actual new Pages path. Verify old Pages links separately; do not assume repository redirects cover the hosted site.
3. Add the approved domain to the existing Vercel project and configure DNS/TLS. Keep the old domain serving or redirecting during migration. Preserve production secrets, MongoDB configuration and Google Sheets access.
4. Update the API fallback in `app/src/app/services/api-client.service.ts`, its tests, `.github/workflows/pages.yml` health-check URLs, README URLs and production `CORS_ORIGIN` together once the API destination is live. Vercel subdomains already derive `/api` from their origin. For a custom domain, configure the existing `window.qiEducationConfig.apiBaseUrl` override or extend the resolver to recognize the approved domain; otherwise it will try port 3001 before the legacy fallback. Keep both origins allowed during the transition.
5. Replace the login page support address with the approved mailbox. Review existing database content for editable teacher names or course copy using the old brand; update only confirmed branding fields, not IDs or user accounts.
6. Run app/API tests, production builds and the Pages build. Verify login, course thumbnails, feedback submission and course progress on the deployed domain. Browser storage is scoped to an origin: changing domains requires signing in again, and locally stored progress does not automatically transfer to the new domain.
7. Retain the old endpoint and configuration until the new deployment is verified. Rollback should restore the previous deployment and routing without requiring a data migration.

No remote repository, hosting, DNS, mailbox or database changes have been performed by this code rename.
