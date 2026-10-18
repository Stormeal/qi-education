# Course details and enrollment

## Purpose

A learner reads what a course offers, then joins it so it appears in My Learning.

## Behavior

- `/courses/:id` shows the description, what you'll learn, requirements, who it is for, the
  course content outline (lesson titles only), what the course includes, the instructor, the
  price and an **Enroll** action with a confirmation.
- Anyone can read a published course's details and outline. Owners and admins can also open
  their unpublished courses. A learner already enrolled in an archived course keeps access.
- **Enroll** (`POST /users/me/courses/:id`) requires a signed-in active account and a published
  course. Enrolling again is harmless: the course appears once.
- After enrolling, the course opens from My Learning at `/library/:id` (see
  [learning page](../learning/learning-page.md)).
- Owners and admins see management actions here: Edit, and for admins **Catalog settings** and
  **Set course price** (see [review and publication](../authoring/review-and-publication.md)).
- A direct link or refresh of a course URL restores the session first, then loads the course;
  "missing", "failed to load" and "not entitled" are shown as different states.

## Rules

- Enrollment never comes from a career path, a declaration or a price.
- Draft lesson content and quiz answers are never sent to anyone but owners and admins.

## Code

- App: `pages/course-view-page/`, `routes/course-view-route.ts`, enrollment and loading in
  `AppStateService`.
- API: `GET /courses`, `GET /courses/:id/outline`, `POST /users/me/courses/:id`; access rules in
  `courseAccess.ts`.

## Limits

- Open product decisions in US-L001: public preview limits, access after archival, and whether a
  price should ever require payment.
