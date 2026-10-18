# Browse the catalog

## Purpose

Learners discover published courses; teachers and admins also find their own unpublished work.

## Behavior

- `/courses` shows a featured carousel, popular topics, popular instructors and "Browse all courses".
- **Search** matches every typed word against course text. **Filters**: category, level, language
  (English, Danish), minimum rating (3.0–4.5 & up) and price range. **Sort**: Most popular (default),
  Newest, Highest rated, Price low→high, Price high→low. Search, filters and sort are kept in the
  URL query (`q`, `category`, `level`, `lang`, `rating`, `priceMin`, `priceMax`, `sort`).
- Only published courses appear in the public lists. A teacher or admin who owns unpublished
  courses gets a **My drafts** tab beside **Published**.
- Cards show full titles and badges; nothing is clipped at any width.
- The carousel shows a skeleton until the visible page's thumbnails have loaded, on every carousel
  page (`thumbnailsReady` signal in `courses-page.ts`).

## Rules

- Categories: Software Testing, Automation Testing, Performance Testing, API Testing, Mobile
  Testing, Security Testing, Test Management, Uncategorized. A category is stored metadata, never
  inferred. "Uncategorized" means no category, so category filters will not find the course.
- Prices are in DKK and informational; an empty price shows the course as free. There is no payment.

## Code

- App: `pages/courses-page/`, `routes/courses-route.ts`, constants in `app.models.ts`,
  `services/course.service.ts` (course list, thumbnail warm-up).
- API: `GET /courses` (light published metadata; owners/admins also see their private courses),
  `GET /courses/:id/thumbnail`, `GET /instructors`.

## Limits

- "Popular" and rating come from stored course fields; there are no learner ratings.
