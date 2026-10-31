# US-L028 — Learner course ratings and reviews

State: In progress (selected by Alex 2026-10-31). Backlog entry and scenarios AC01–AC03 in
[user_stories.md](../user_stories.md#us-l028--learner-course-ratings-and-reviews).
Codex handoff: [handoffs/US-L028-codex.md](../handoffs/US-L028-codex.md).

## Decisions (Claude, 2026-10-31, confirm or change)

- **Who may rate:** an enrolled learner with at least one completed lesson in the course (the
  account's stored completion). Teachers of the course (owner or assigned) cannot rate it.
- **One rating per learner and course:** 1–5 whole stars and an optional comment (up to 1,000
  characters). Sending again replaces it.
- **Shown publicly** on the course details page with the learner's first name only (first word of
  the display name), stars, comment and date. Newest first, the latest 50.
- **Admins can hide a review.** A hidden review leaves the list and the average for everyone except
  admins (who see it marked Hidden and can show it again) and its author (who still sees their own).
- **The catalog's numbers are real.** A course's `rating` and `ratingCount` become the average (one
  decimal) and count of its visible ratings, recomputed on every change. Admins no longer type them
  in catalog settings; the API ignores them in old requests.
- **Where to rate:** a "Rate this course" panel on the learning page (`/library/:id`).
- **Privacy:** ratings are in the data export; on erasure the comment is deleted and the stars are
  kept anonymously (like lesson feedback).

## Out of scope

Replies from teachers, helpful votes on reviews, rating notifications, a teacher-only summary on
Home, deleting one's own rating.
