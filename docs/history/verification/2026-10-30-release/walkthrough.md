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

## Review-event walkthrough

Alex created/submitted **Test Course** (`8ace9b8b-a71d-4dc0-9b7a-3b40c1b35995`) and used a
separate reviewer/admin session to request changes with **This is a test**. The teacher's
inbox displayed **Changes requested: Test Course** and the header showed **1 unread**.
The course's Publishing step showed **Changes requested by reviewer**, the exact comment,
and **Waiting for 1 of 1 reviewer**; the course stayed Ready for review as expected for a
reviewer verdict (an admin Return is the action that unlocks teacher editing).

Alex then clicked the notification. He reported navigation/unread clearing; reopening the
teacher inbox showed the row retained, no unread indicator and Mark all read disabled. The
agent did not perform a shared read-state mutation. This establishes real reviewer-change
delivery and persisted read state.

On 2026-10-31 Alex used the admin **Return for changes** action with **Return notification test**.
Reopening the teacher inbox showed a second **Changes requested: Test Course** row; subsequent
header refresh showed **1 unread**. The editor freshly loaded **Draft**, enabled editing controls,
and offered **Submit for review**. Publishing history contained **Returned for changes** with
the exact reason. The agent did not click a notification or mutate course/read state.
The never-published test draft was absent from the anonymous public catalog. A separate
`GET /api/courses/:id` probe returned 404 because that route does not exist; it is not
access-control evidence. Course metadata is supplied by `GET /api/courses`.

Alex disabled/saved teacher **Review activity**. After a full Settings reload, Review activity
remained off, Organization remained on and Save preferences was disabled. Reopening the inbox
still showed the two existing notices with **1 unread**, establishing the baseline for suppression.

The muted cycle completed 2026-10-31. Alex reported that the admin received the resubmission
notice. Fresh editor history showed a new Submit followed by Return; the actual recorded return
reason was **Return for changes**. Draft/editing and Submit for review were restored. A fresh
teacher inbox read still showed exactly **2 notices, 1 unread**, matching the pre-action baseline;
no third notice was created. This verifies preference suppression for admin Return and
user-reported submission delivery to an admin while the teacher group was muted.

Alex restored/saved teacher Review activity, resubmitted and obtained reviewer approval, then
published free on 2026-10-31. Fresh editor history shows Submitted at 00:47:04, Approved by
reviewer at 00:47:25 and Published at 00:47:30 (displayed local times). The teacher inbox now
contains **Course published: Test Course**, three total notices and **2 unread**. A fresh Settings
load shows Review activity enabled and Save preferences disabled. Anonymous `GET /api/courses`
returns the course with `status: published` and `priceDkk: null` (free).

Alex completed the learner check. The learner page shows **1 learner**, **2 of 2 lessons complete**,
**100%**, and **Thanks for rating this lesson** on New component 2. Both the quiz and text lesson
are complete, so the expected teacher average is 100%, rather than the originally requested 50%.
Teacher Home then showed **Published, 1 enrolled, 1 started, 1 completed**, **Average progress 100%**,
and **1 helpful, 0 not helpful, 0 problems** for Test Course. Expanding its feedback displayed
**Helpful New component 2 · 31 Oct**, without learner identity. This verifies the hosted MongoDB
enrollment/progress/feedback path after the user-performed learner actions.

The selected teacher/review/learner walkthrough is complete. Organization-event checks remain
separate, alongside index metadata, cross-device preferences and the later-deployment DEF-067 check.

Alex observed slow notification loading and requested background loading at sign-in. This
follow-up is implemented locally as US-P024; production remains 0.1.542. Test Course is now
published and free.

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
