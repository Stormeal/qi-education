# US-L028 course ratings: Codex part

Owner: Codex. Branch: `main`. Started: 2026-10-31. Lead: Claude.
Story: [docs/stories/US-L028-course-ratings.md](../stories/US-L028-course-ratings.md) (decisions)
and `docs/user_stories.md` US-L028 (scenarios AC01–AC03).
Isolated in-memory stores only; no hosted or shared-service calls.

## Split

| Owner | Scope | Files |
| --- | --- | --- |
| Codex | Rating store, rating routes, eligibility, aggregate written to the course, catalog settings ignoring rating input, admin hide, privacy export/erasure, permission table | `api/src/courseRatings.ts` (new: schemas, eligibility, aggregate), `api/src/courseRatingRepository.ts` (new, + test), `api/src/courseRatingRoutes.ts` (new, + test), `api/src/server.ts` (wiring, and the catalog-settings / course-update handlers only where they take `rating`/`ratingCount`), `api/src/course.ts` (only if the update schema must change), `api/src/privacyService.ts`, `api/src/privacyCoverage.test.ts`, `api/test/privacyFixture.ts`, `api/src/routePermissions.test.ts`, existing API tests that set `rating`/`ratingCount` through catalog settings, `app/src/app/services/privacy.service.ts` (+ spec, export type only) |
| Claude | Rating panel on the learning page, reviews and admin hide on the course details page, removing the rating inputs from catalog settings, app models and service calls, docs specs | everything else in `app/` (including `app.models.ts`, `course.service.ts`, `learning-page/**`, `course-view-page/**`) and `docs/specs/**` |

## Contract Claude relies on

1. **Store.** One row per (course, user): `{ id, courseId, userId, stars: 1–5 integer, comment?:
   string, hidden: boolean, createdAt, updatedAt }`. Mongo collection `courseRatings`, unique index
   on `{ courseId, userId }`, index on `{ courseId, updatedAt: -1 }`. In-memory in isolated/test
   runs. No seeded ratings.
2. **Eligibility** (`canRate`): signed in, enrolled in the course, at least one lesson ID of that
   course in the account's stored learning progress, and not the course owner or an assigned
   teacher. Admins follow the same rule.
3. **`GET /users/me/courses/:id/rating`** (+ `/api` alias, any signed-in role) → 200
   `{ canRate: boolean, rating: { stars, comment?, hidden, updatedAt } | null }`.
   401 without session; 404 when the course does not exist. `Cache-Control: private, no-store`.
4. **`PUT /users/me/courses/:id/rating`** (+ alias), strict body `{ stars: 1..5 integer, comment?:
   string }`; comment trimmed, max 1,000 characters, empty after trimming means no comment.
   - 200 `{ rating: { stars, comment?, hidden, updatedAt }, average, count }` (the course's new
     visible numbers). Sending again replaces stars and comment and keeps `createdAt` and `hidden`.
   - 400 bad body; 401 no session; 404 no course;
   - 403 `{ message: 'Complete a lesson in this course before rating it.' }` when not enrolled or
     no completed lesson; 403 `{ message: 'Teachers cannot rate their own course.' }` for its
     teachers. Nothing stored on any refusal (AC03).
5. **`GET /courses/:id/reviews`** (+ alias), signed in or not, for a course the caller may see
   (same visibility rule as `GET /courses/:id`; otherwise 404) → 200
   `{ average, count, reviews: [{ id, firstName, stars, comment?, updatedAt, hidden?, mine? }] }`.
   Newest `updatedAt` first, at most 50. `firstName` is the first word of the author's display
   name (`'Learner'` if none or the account is erased). Hidden reviews are left out, except for
   admins (included with `hidden: true`) and for their author (`mine: true`, `hidden: true`).
   `mine: true` marks the caller's own review. No user IDs or emails. Course-detail cache rules.
6. **`PATCH /admin/courses/:id/reviews/:reviewId`** (+ alias), admin only, strict `{ hidden:
   boolean }` → 204; 400 bad body, 401, 403 non-admin, 404 unknown course or review.
7. **Aggregate.** After every PUT and PATCH, the course's stored `rating` (average of visible stars,
   rounded to one decimal; 0 when none) and `ratingCount` (visible count) are rewritten, so the
   catalog list, filter, sort and instructor ratings use them unchanged (AC02). This write must not
   change the course status, revision or review state, and must work for published courses.
8. **Catalog settings and other course updates** keep accepting `rating`/`ratingCount` in the body
   (an old frontend still sends them during a deploy) but ignore them; they no longer count as a
   catalog change on their own.
9. **Privacy (US-P021).** Ratings in the export as `courseRatings: [{ courseId, stars, comment?,
   hidden, createdAt, updatedAt }]`; on erasure the comment is deleted and the row kept under the
   tombstone id (stars still count). Add the repository to `PERSONAL_DATA_DOMAINS`.

## Done when

- AC01–AC03 covered by API tests on both path prefixes, including replace-on-resend, the 403
  refusals storing nothing, hidden reviews leaving the average, and the aggregate on the course.
- `npm run api:test` and `npm run api:build` pass; permission table entries for all four routes.
- Your row in `docs/work_queue.md` updated. Commit locally, do not push.
