# Course ratings and reviews

## Purpose

US-L028 (delivered 2026-11-01, live since 0.1.566). Learners rate courses they have started; the
catalog's stars, rating filter, "Highest rated" sort and instructor ratings use those real ratings.

## Behavior

- **Who may rate:** an enrolled account with at least one completed lesson of the course (stored
  learning progress). The course's owner and assigned teachers may not rate it ("Teachers cannot
  rate their own course."). Others get 403 "Complete a lesson in this course before rating it." and
  nothing is stored.
- **One rating per account and course:** 1–5 whole stars and an optional comment (trimmed, up to
  1,000 characters). Sending again replaces stars and comment.
- **Learning page** (`/library/:id`, Overview tab, enrolled learners only): "Rate this course" with
  five star buttons, a comment box and Send rating. Before a completed lesson it says "Complete a
  lesson to rate this course."; local completion unlocks the form at once. After saving the heading
  reads "Your rating" and the button Update rating.
- **Course details** (`/courses/:id`): "Learner reviews" shows the average and count, then the
  newest 50 reviews with first name (first word of the display name, "Learner" for erased
  accounts), stars, date and comment. The rating in the hero and enroll card use the same numbers.
  The author sees their own review marked "(you)".
- **Admins** see every review and can **Hide** or **Show** each one. A hidden review leaves the list
  and the average for everyone except admins (marked Hidden) and its author.
- **Course numbers are derived.** After every rating or hide/show the course's stored `rating`
  (average of visible stars, one decimal, 0 when none) and `ratingCount` are rewritten under the
  course mutation lock, without changing status, revision or review state. Catalog settings no
  longer offer them; the API ignores them in catalog requests.
- **Privacy:** ratings are in the data export (`courseRatings`); on erasure the comment is deleted
  and the stars stay under the tombstone id.

## Code

- App: `services/course-ratings.service.ts`, `ui/star-rating/`, the rating box in
  `pages/learning-page/`, the reviews section in `pages/course-view-page/`.
- API: `courseRatings.ts` (input, eligibility, aggregate), `courseRatingRepository.ts` (MongoDB
  `courseRatings`, unique `{ courseId, userId }`; in-memory in isolated runs), `courseRatingRoutes.ts`:
  `GET`/`PUT /users/me/courses/:id/rating`, `GET /courses/:id/reviews` (signed in or not),
  `PATCH /admin/courses/:id/reviews/:reviewId` `{ hidden }`, each with its `/api` alias.

## Decisions to confirm or change

- Rating after one completed lesson; teachers cannot rate their own course.
- First name only on public reviews.
- Hiding a review also removes its stars from the average.
- On erasure the comment goes and the stars stay.

## Limits

- No teacher replies, helpful votes, rating notifications or deleting one's own rating.
- Ratings typed by admins before this release stay on the course until its first learner rating
  or hide/show recomputes them.
- Verified on isolated in-memory stores only (2026-11-01); the Mongo collection and index are
  created on first use on the hosted site.
