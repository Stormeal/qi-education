# Course details and enrollment

## Purpose

A learner reads what a course offers, then joins it so it appears in My Learning.

## Behavior

- `/courses/:id` shows the description, what you'll learn, requirements, who it is for, the
  course content outline (lesson titles only), what the course includes, the instructor, the
  price and an **Enroll** action with a confirmation. A priced course shows **Buy for N DKK**
  instead (see [payments](../payments/payments.md)).
- Anyone can read a published course's details and outline. Owners and admins can also open
  their unpublished courses. A learner already enrolled in an archived course keeps access.
- **Enroll** (`POST /users/me/courses/:id`) requires a signed-in active account and a published
  course. Enrolling again is harmless: the course appears once. A priced course answers 402
  unless the caller is its author or an admin, or an organization opens it to them (**Enroll
  (included by {Organization})**, free; see [organizations](../organizations/organizations.md)).
- After enrolling, the course opens from My Learning at `/library/:id` (see
  [learning page](../learning/learning-page.md)).
- Owners and admins see management actions here: Edit, and for admins **Catalog settings** and
  **Set course price** (see [review and publication](../authoring/review-and-publication.md)).
- A direct link or refresh of a course URL restores the session first, then loads the course;
  "missing", "failed to load" and "not entitled" are shown as different states.

## Rules

- Enrollment never comes from a career path or a declaration. A priced course is enrolled by
  buying it (US-L024, 2026-10-20); enrollments made before a price was set are kept.
- Access policy (US-L001, 2026-10-19): the public preview is the outline only (titles, types,
  durations); a learner enrolled before archival keeps full access while nobody new can enroll.
- Draft lesson content and quiz answers are never sent to anyone but owners and admins.

## Code

- App: `pages/course-view-page/`, `routes/course-view-route.ts`, enrollment and loading in
  `AppStateService`.
- API: `GET /courses`, `GET /courses/:id/outline`, `POST /users/me/courses/:id`; access rules in
  `courseAccess.ts`.

## Limits

- No free preview lessons. Tests: LC-03/LC-04 in `api/src/courseLifecycle.test.ts`, the buy
  button cases in `course-view-page.spec.ts`.
