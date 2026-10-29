# Hosted release checks — 2026-10-29

Owner Codex, release **0.1.532**, branch `main`, deployed commit
`98d4b6addb592135a7f58b993a277979adf22d42`. Read-only checks only; no shared mutation probes.

## Confirmed

- [CI](https://github.com/Stormeal/qi-education/actions/runs/40935230095) completed successfully.
- [GitHub Pages](https://github.com/Stormeal/qi-education/actions/runs/40935230074) completed successfully.
- [Vercel](https://vercel.com/stormeal-3195s-projects/qi-education/CRtqRaKvsuGoa2d1vBaKbkL8sNo7)
  reports success; CLI inspection confirms production deployment
  `dpl_CRtqRaKvsuGoa2d1vBaKbkL8sNo7` Ready, aliased to `qi-education.vercel.app`.
- Pages returns 200. Deployed `main-2OHAS6IG.js` exactly matches the local 0.1.532 Pages build;
  SHA-256 `f29b88975f4f440e85933152636a0a0013e1bca8a4a6a1f93fb008d7e17e3dc5`.
- Live signup form loads without page runtime errors. With Turnstile disabled it loads no
  Cloudflare challenge script, matching the agreed open-signup fallback. No account was created.
- `/api/health`, `/api/health/auth` and `/api/health/config` return 200 and `no-store`.
  Hosted accounts/content/assets use configured MongoDB; mail is configured with Brevo;
  payments are configured in **test** mode.
- `/api/notifications`, `/api/users/me/profile` and `/api/teaching/courses` return 401
  `Authentication required` without credentials, with `private, no-store`.
- Config requests with the Pages origin return `Access-Control-Allow-Origin: https://stormeal.github.io`.
- Vercel production environment metadata contains neither `TURNSTILE_SITE_KEY` nor
  `TURNSTILE_SECRET_KEY`; public config returns `{ configured: false, siteKey: null }`.

## Access and coverage limits

- The Vercel app connection requires reauthentication, but existing CLI authentication works
  for the intended team/project. No environment values were changed. Secret values were not
  printed or stored in the repository. The metadata check ran through the linked production
  environment, using only Mongo `listCollections` / `listIndexes` operations.
- Direct Mongo metadata inspection stalled; a retry using the project's previous Windows DNS
  workaround exceeded a 30-second deadline. Collection/index existence is **unverified**; this
  is not evidence of a hosted database outage. Hosted health alone does not prove read/write flows.
- A QI Academy browser panel is open for the user to sign into an existing test account. It
  remained signed out at the last check. Authenticated header/bell/settings/teacher-overview
  checks have therefore not been performed on production.
- No Cloudflare integration is available through connected plugins. Whether a real Turnstile
  widget already exists is awaiting the user's answer. Real keys cannot be invented or replaced
  with synthetic test keys for the production acceptance check.

## Resume

1. User signs into the open QI Academy panel with an existing test account; continue read-only
   header, inbox, role-specific Settings and teacher-overview checks. Do not mark real notices
   read or save real preferences as mutation probes.
2. Obtain the user's Cloudflare widget setup/access and configure both real Turnstile keys in
   the intended Vercel production project; keep the secret out of chat and committed files.
   A configuration change needs a deployment before it reaches runtime.
3. User performs the real signup/mail/confirmation/enrollment and payment walkthroughs, plus
   preference/read-state checks across devices. Agent mutation probes against shared stores
   remain prohibited by AGENTS.md. Record the resulting evidence before closing these checks.
4. Verify notification indexes through an available read-only database connection, and perform
   the real screen-reader pass.

The [isolated verification record](README.md) remains the evidence for the complete mutable
flows. It is not substituted for hosted/provider acceptance.
