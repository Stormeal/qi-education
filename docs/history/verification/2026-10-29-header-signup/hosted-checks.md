# Hosted release checks — 2026-10-29–30

Owner Codex, release **0.1.532**, branch `main`, deployed commit
`98d4b6addb592135a7f58b993a277979adf22d42`. App/data checks were read-only; the user performed
the real signup and confirmation walkthrough. Cloudflare/Vercel configuration changes were
explicitly authorized. No agent mutation probes against shared application stores.

## Confirmed

- [CI](https://github.com/Stormeal/qi-education/actions/runs/40935230095) completed successfully.
- [GitHub Pages](https://github.com/Stormeal/qi-education/actions/runs/40935230074) completed successfully.
- [Vercel](https://vercel.com/stormeal-3195s-projects/qi-education/CRtqRaKvsuGoa2d1vBaKbkL8sNo7)
  reports success; CLI inspection confirms production deployment
  `dpl_CRtqRaKvsuGoa2d1vBaKbkL8sNo7` Ready, aliased to `qi-education.vercel.app`.
- Pages returns 200. Deployed `main-2OHAS6IG.js` exactly matches the local 0.1.532 Pages build;
  SHA-256 `f29b88975f4f440e85933152636a0a0013e1bca8a4a6a1f93fb008d7e17e3dc5`.
- Initial live signup form loads without page runtime errors. With Turnstile disabled it loads no
  Cloudflare challenge script, matching the agreed open-signup fallback. No account was created.
- `/api/health`, `/api/health/auth` and `/api/health/config` return 200 and `no-store`.
  Hosted accounts/content/assets use configured MongoDB; mail is configured with Brevo;
  payments are configured in **test** mode.
- `/api/notifications`, `/api/users/me/profile` and `/api/teaching/courses` return 401
  `Authentication required` without credentials, with `private, no-store`.
- Config requests with the Pages origin return `Access-Control-Allow-Origin: https://stormeal.github.io`.
- Initial production metadata contained neither Turnstile key; public config returned
  `{ configured: false, siteKey: null }`. Activation is recorded below.
- After the user signed in with an existing admin account, the deployed header bell loaded
  "You're all caught up" with Mark all read disabled. No notification was marked read.
  Escape closed the panel and restored focus to Notifications.
- Compact navigation exposes the permitted primary links, Feedback and Settings. Settings opens
  `/settings` with Notifications selected. All three admin groups load enabled; Save preferences
  remains disabled without edits. Profile, Password, Purchases and Notifications tabs all select
  correctly. Viewport and document width both measured 905px, with no page overflow.
- The header Feedback action opens the existing composer with Settings context; it was closed
  without submitting. The account-page console recorded no errors. No preferences were changed.

## Activation and real signup (2026-10-29–30)

- The user approved creation of `QI Academy production signup` in Cloudflare: hostname
  `stormeal.github.io`, Managed mode, pre-clearance off. The dashboard confirmed creation.
- Both keys were transferred directly from the Cloudflare dashboard into Vercel production:
  `TURNSTILE_SITE_KEY` as Config, `TURNSTILE_SECRET_KEY` as Secret. CLI metadata independently
  confirmed both types and Production scope. Neither value was printed or committed.
- Rebuilt the already-tested release using Vercel redeploy. Deployment
  `dpl_BbP7y8x4GofS7Q3S7uzVuHWDhtZi` became Ready and acquired `qi-education.vercel.app`.
  Public config changed to `configured: true` with a public site key present.
- Rechecked 2026-10-30 after `efd7b24`: [CI](https://github.com/Stormeal/qi-education/actions/runs/41049932873)
  and [Pages](https://github.com/Stormeal/qi-education/actions/runs/41049932755) pass. Current Vercel
  production deployment `dpl_CXTpjqJY7vnXvmXdJ1jxuotDSvYL` is Ready; Turnstile remains enabled.
  The four newer commits contain documentation plans and aligned version changes (0.1.536).
- The real signup page loads one Cloudflare script and shows its human-check widget. The user
  completed the checkbox: the widget showed **Success!** and its response field became nonempty.
  Only a boolean was inspected; the token was not logged.
- The user registered a new learner account and confirmed receipt of the actual confirmation
  email. The app showed the new Student account with zero enrollments and its confirmation notice.
  On ISTQB Foundation 4.0, Buy for 1,234 DKK was disabled with "Confirm your email to enroll"
  and Resend confirmation link.
- The user then opened the emailed confirmation link. After reload, the notice disappeared
  and Buy became enabled. This covers the real provider/signup/mail/confirmation chain and the
  paid-acquisition entrance gate; no checkout or payment was initiated by the agent.
- The user enrolled in the free published Fundamental Postman course. Enroll changed to
  **Start learning**, which persisted after a full reload.
- The user completed [Stripe test-mode checkout](https://docs.stripe.com/testing) for ISTQB
  Foundation 4.0 (1,234 DKK) using the published test card. On return, the page showed
  **Payment received. The course is in My Learning.** and **Start learning**. Access persisted
  after a full reload. My Learning lists both acquired courses. DEF-064 is verified on the
  hosted provider flow; no real-card charge was tested.
- Vercel request records independently show `POST /api/webhooks/stripe` → **200** at
  2026-10-30 15:15:49 UTC, from Stripe's webhook user agent, on the current production deployment.
- The new Student account's Settings initially selects Notifications and shows only Organization;
  Save preferences stays disabled without edits. No preferences or notification read state were changed.
- The walkthrough exposed DEF-066 (hosted career reads reject null milestone revision fields)
  and DEF-067 (an older open tab loses lazy-route navigation after a Pages deployment). Records
  and exact read-only reproduction evidence are in `docs/defects.md`; neither is fixed here.

## Access and coverage limits

- The Vercel app connection requires reauthentication, but existing CLI authentication works
  for the intended team/project. Only the authorized Turnstile pair was added. Secret values were not
  printed or stored in the repository. The metadata check ran through the linked production
  environment, using only Mongo `listCollections` / `listIndexes` operations.
- Direct Mongo metadata inspection stalled; a retry using the project's previous Windows DNS
  workaround exceeded a 30-second deadline. Collection/index existence is **unverified**; this
  is not evidence of a hosted database outage. Hosted health alone does not prove read/write flows.
- Authenticated admin header/bell/settings checks pass as above. Teacher/student-specific
  views, new-event delivery, mutations and cross-device behavior still need their hosted
  acceptance walkthroughs. The admin session cannot prove the teacher overview's positive case.
- No Cloudflare integration was available through connected plugins; setup used the signed-in
  dashboard. The Vercel browser session handled secret transfer; the authenticated CLI handled
  scoped metadata inspection and deployment. The key pair must not be recreated on resume.

## Resume

1. Resolve DEF-066 and DEF-067 with isolated regressions before selecting enhancements.
2. Complete teacher-account overview, all notification recipients and preference/read-state
   checks across devices. Do not mark notices read or save preferences as agent mutation probes;
   the user performs hosted writes. Agent probes use isolated stores.
3. Verify notification indexes through an available read-only database connection, and perform
   the real screen-reader pass.

The [isolated verification record](README.md) remains the evidence for the complete mutable
flows. It is not substituted for hosted/provider acceptance.
