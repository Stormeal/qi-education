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
- After the user signed in with an existing admin account, the deployed header bell loaded
  "You're all caught up" with Mark all read disabled. No notification was marked read.
  Escape closed the panel and restored focus to Notifications.
- Compact navigation exposes the permitted primary links, Feedback and Settings. Settings opens
  `/settings` with Notifications selected. All three admin groups load enabled; Save preferences
  remains disabled without edits. Profile, Password, Purchases and Notifications tabs all select
  correctly. Viewport and document width both measured 905px, with no page overflow.
- The header Feedback action opens the existing composer with Settings context; it was closed
  without submitting. The account-page console recorded no errors. No preferences were changed.

## Access and coverage limits

- The Vercel app connection requires reauthentication, but existing CLI authentication works
  for the intended team/project. No environment values were changed. Secret values were not
  printed or stored in the repository. The metadata check ran through the linked production
  environment, using only Mongo `listCollections` / `listIndexes` operations.
- Direct Mongo metadata inspection stalled; a retry using the project's previous Windows DNS
  workaround exceeded a 30-second deadline. Collection/index existence is **unverified**; this
  is not evidence of a hosted database outage. Hosted health alone does not prove read/write flows.
- Authenticated admin header/bell/settings checks pass as above. Teacher/student-specific
  views, new-event delivery, mutations and cross-device behavior still need their hosted
  acceptance walkthroughs. The admin session cannot prove the teacher overview's positive case.
- The user confirmed no Turnstile widget existed and signed into Cloudflare. The manual form
  is prepared with name `QI Academy production signup`, hostname `stormeal.github.io`, Managed
  mode and pre-clearance off. Create has not been clicked: action-time approval for issuing
  persistent verification keys was requested. No Cloudflare integration is available through
  connected plugins; the signed-in dashboard is the setup path.

## Resume

1. Obtain approval for Create on the prepared Cloudflare widget. Check current page state first
   in case the user created it themselves; do not create a duplicate. Preserve both browser
   handoffs. Do not mark real notices read or save real preferences as mutation probes.
2. Configure both real Turnstile keys in the intended Vercel production project; keep the secret
   out of chat and committed files.
   A configuration change needs a deployment before it reaches runtime.
3. User performs the real signup/mail/confirmation/enrollment and payment walkthroughs, plus
   preference/read-state checks across devices. Agent mutation probes against shared stores
   remain prohibited by AGENTS.md. Record the resulting evidence before closing these checks.
4. Verify notification indexes through an available read-only database connection, and perform
   the real screen-reader pass.

The [isolated verification record](README.md) remains the evidence for the complete mutable
flows. It is not substituted for hosted/provider acceptance.
