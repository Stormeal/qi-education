# Home and My Learning

## Purpose

A signed-in learner sees where they are and what to do next, and finds every course they joined.

## Behavior

- **Home** (`/`): a welcome, the active course with real progress, enrolled course count and the
  career path tile. The tile shows the focused career's next step (see
  [careers](../career-paths/careers.md)) or "Choose a career path" when none is followed.
  With no enrollments it shows an honest empty state ("No courses enrolled", "Find a course").
- **Admin Home** (2026-10-25): admins do not enroll, so for the admin role Home shows "Needs your
  attention" in place of the learning summary and course list (teachers and students keep the page
  above; the email notice stays). Three cards, each with a count, the 5 newest items, "Nothing
  waiting" when empty and its own error with **Try again**, so one failing source never hides the
  others: **Courses waiting for review** (`GET /admin/review-queue`: first submissions and new
  versions of live courses, whose catalog status stays published; a title opens the editor and its
  review panel; **Show all** lists the rest), **Organization requests** (pending; **Open all** opens
  Admin on Organizations) and **New feedback** (not yet triaged; **Open all** opens Admin on
  Feedback; read from the cached copy so Home spends no extra Google Sheets reads).
- **Confirm your email address**: while the account is unconfirmed, Home shows a notice naming
  the address, with **Send a new link** and the API's answer (US-L014). It disappears as soon as
  the link is opened in the same browser.
- **Your learning** lists every enrolled course. The **recommended** course comes first with a
  "Recommended" corner ribbon: the first course in progress with a lesson done, else the first at
  0%. A completed course or one whose progress is unavailable is never recommended; then there is
  no ribbon and the list keeps its order.
- **My Learning** (`/library`): every enrolled course once, organization courses included while
  the membership is active ([organizations](../organizations/organizations.md)), with its progress and a resume link,
  and a **Refresh progress** action. Empty library: "No courses in your library yet" with a link
  to the catalog.
- Loading, unavailable and empty are different states. A failed progress read says "Progress
  unavailable"; it is never shown as 0%.
- Nothing on these pages is fixture data: activity, counts and progress come from the account.

## Code

- App: `pages/dashboard-page/`, `pages/library-page/`, `routes/dashboard-route.ts`,
  `routes/library-route.ts`, `pages/progress-sync-notice.ts`, `services/learning-progress.service.ts`,
  `services/career-path.service.ts`. Admin Home: `ui/admin-attention/`.
- API: `GET /users/me/learning-progress`, enrolled courses through `GET /auth/me` and `GET /courses`.
  Admin Home: `GET /admin/review-queue` (admin only), `GET /admin/organization-requests`, `GET /feedback`.

## Limits

- None known.
