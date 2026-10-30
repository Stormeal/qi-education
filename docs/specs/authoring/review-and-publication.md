# Review and publication

## Purpose

Admins review what teachers submit before learners see it, and own pricing and catalog placement.

## Behavior

- Statuses: `draft → ready-for-review → published → archived`, changed only through review actions
  (`POST /courses/:id/review`), never by a plain edit.
- **Revisions**: a published or archived course keeps its live version while one private working
  revision is edited beside it. Learners keep full access to the live version throughout.
- **Submit** (owner or admin) freezes the revision; it shows as a read-only preview of lessons,
  quizzes, media and files. Quiz readiness is checked first (see [quizzes](quizzes.md)).
- **Return** (admin) requires a reason, which only the owner and admins see. **Publish** (admin)
  replaces the live metadata, lessons and thumbnail in one write and keeps every enrollment.
  **Archive** (admin) takes the course out of the catalog and stops new enrollment; enrolled
  learners keep access.
- Publishing a course whose category is "Uncategorized" asks first ("Publish anyway" / Cancel),
  because category filters would not find it.
- **Review history**: every action is stored with the revision, actor, date and return reason, and
  is never trimmed. Owners and admins see it; the public and learners do not.
- **Admin-only fields**: price (`PATCH /courses/:id/price`, DKK; empty or 0 = free, otherwise a
  whole number from 3 to 999,999, because Stripe cannot charge less than 2.50 DKK) and catalog metadata
  such as category (`PATCH /courses/:id/catalog-metadata`). Teachers' new courses get the defaults.
- Review actions carry the loaded revision and version; a stale action is refused without a change.
- **Reviewers** (US-A007): an admin assigns 0–20 reviewers per course from active teacher and admin
  accounts (`GET|PUT /courses/:id/reviewers`, admin only, shown in the editor under Teachers). A
  course's teachers cannot review it, and a reviewer cannot be made one of its teachers. Newly
  assigned reviewers, and every reviewer on each Submit, get an email with a link to the course; a
  failed email keeps the assignment and the admin sees a warning.
- A reviewer opens the course read-only (course, content and files in the author view, no writes)
  and, while the revision is ready for review, sends **Approve** (comment optional) or **Request
  changes** (comment required) through `POST /courses/:id/review`. Verdicts are review-history
  events. Home lists the viewer's courses to review (`GET /reviews/mine`) with their verdict, or the
  course's state once it left review.
- **Publish gate**: publishing waits until every assigned reviewer's latest verdict since the latest
  Submit is Approve ("Waiting for N of M reviewers", API 409). Return and Archive are never blocked.
  A new Submit resets all verdicts; removing a reviewer removes them from the gate; a disabled or
  demoted reviewer still counts until removed. A course with no reviewers publishes as before.
- Only admins receive a course's `reviewerIds`; review state carries `reviewers: { total, approved,
  viewerVerdict }` for everyone who may read it.
- The US-P019 backend adds preference-controlled private notices for newly assigned reviewers,
  admins on submission, and course owners on requested changes or publication. Delivery failure
  preserves the action; the header bell displays them. See [notifications](../platform/notifications.md).
- Defaults built 2026-10-26 (confirm or change): at most 20 reviewers; comment required only for
  Request changes; admins cannot publish over a missing approval (remove the reviewer instead).

## Code

- API: `courseReview.ts` (`CourseReviewService`: live/working snapshots, history, publication,
  reviewer verdicts and gate), `courseReviewersRoutes.ts`, `courseReviewerMail.ts`,
  `courseAccess.ts`, `course.ts`, `courseRepository.ts`, `mongoCourseRepository.ts`.
- App: `ui/course-review-panel/`, `ui/course-teachers/` (also the Reviewers panel), `ui/my-reviews/`, Publishing step of `pages/course-editor-page/`, Catalog settings
  and price dialogs in `pages/course-view-page/`.
