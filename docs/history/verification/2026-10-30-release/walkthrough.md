# Hosted release walkthrough — 2026-10-30

Owner: Codex with Alex. Alex authorized push and the walkthrough. Release **0.1.542**,
commit `9610f47`, includes DEF-066 (`99cb544`) and DEF-067 (`5e4683a`), release notes and earlier
verification records. No new feature scope or shared-data repair.

## Release checks

Fresh local checks before push: API **2,916/2,916**, frontend **620/620** plus UI-foundation
checks, release journeys **20/20**, API and Pages builds passed. Existing test-setup/scrollTo
and CommonJS warnings were non-blocking. Working tree was clean after push.

- [Pages deployment](https://github.com/Stormeal/qi-education/actions/runs/41087811930).
- [CI](https://github.com/Stormeal/qi-education/actions/runs/41087811977).
- Vercel production target: `qi-education`, team `stormeal-3195s-projects`,
  deployment `dpl_4uaGy3jLhWefkts5idrydJu2TfDY`.
- Before deployment, hosted health/config returned 200 with MongoDB accounts/courses and
  configured Mux; public career list still reproduced DEF-066 (400, eight null-field issues).

Both Pages and CI completed successfully. Vercel production is Ready; Pages serves
`main-BESJGI5I.js` and the authenticated teacher footer displays **0.1.542**.

## Completed hosted checks

- DEF-066: public list returns 200 with three careers. All three detail routes return 200,
  with valid integer requirement versions and array histories across 4/4/3 steps. The original
  new learner's Home now shows **Not chosen / Choose a career path**, retaining both enrolled
  courses. The teacher's Home shows the existing Test Manager career and next course. Neither
  displays Career path Unavailable. This also worked with the old 0.1.536 frontend before the
  new Pages bundle arrived, establishing API backward compatibility.
- Teacher Home on 0.1.542: Your teaching shows the assigned draft, **No learners yet**, and
  **0 helpful, 1 not helpful, 0 problems**. Expanding feedback shows the historical Not helpful
  item with lesson/date, without learner identity. Non-empty enrollment/progress metrics still
  need a course with learners.
- Teacher header: mobile menu exposes Home, About, Catalog, My Learning, Roadmap, Feedback and
  Settings. The desktop Settings page also has the expected header actions.
- Teacher inbox loads **You're all caught up.**; Mark all read is disabled. Escape dismisses
  it. No read-state action was taken.
- Teacher Settings opens directly on Notifications; Organization and Review activity are enabled,
  Admin inbox is absent and Save preferences is disabled without edits. No preferences changed.

Real notification-event and preference-persistence walkthrough: awaiting Alex's prepared
disposable course and separate admin session. Alex performs the real mutations; the agent
observes the outcomes. The course preparation form was left untouched.

## Walkthrough scope and limits

Read-only checks of learner career guidance, public careers, teacher overview/feedback counts,
header navigation, notification list and Settings. Alex signs in to real accounts; no password
or bearer token is captured in the record. Agent mutations remain isolated. Sending notifications
requires Alex to perform real review/organization actions; opening an inbox alone does not prove
event delivery, preference suppression or cross-device persistence.

Direct read-only notification-index inspection was attempted with local connection settings but
timed out; the helper was stopped. No collection, index or row was created or changed by it.

DEF-067 requires a tab already running the fix to stay open across a later Pages deployment.
Tabs opened on 0.1.536 need a manual reload once to acquire the new handling.
