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

## Code

- API: `courseReview.ts` (`CourseReviewService`: live/working snapshots, history, publication),
  `courseAccess.ts`, `course.ts`, `courseRepository.ts`, `mongoCourseRepository.ts`.
- App: `ui/course-review-panel/`, Publishing step of `pages/course-editor-page/`, Catalog settings
  and price dialogs in `pages/course-view-page/`.
