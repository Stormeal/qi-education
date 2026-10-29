# Profiles

## Purpose

Each account has a private profile for itself. Teachers and admins can also write a short
public instructor description shown with their published courses.

## Behavior

- **Private profile** (`GET/PUT /users/me/profile`, every role, own account only): bio and
  learning goals (≤280 characters each), job title and company (≤120), avatar color (`#rrggbb`).
  A never-saved profile reads as empty texts, color `#2f4f43` and `updatedAt: null`. PUT replaces
  the whole profile; invalid input changes nothing (400). Storage failure answers 503 and the page
  keeps the unsaved edits.
- **Notification preferences** (US-P019 API): private profiles additionally carry
  `notificationPrefs: { reviewActivity, organization, adminInbox }`. Each boolean defaults to true,
  including absent/legacy profiles. A partial preference object fills missing groups with true;
  an old client that omits the whole object preserves the stored preferences. Invalid booleans
  answer 400 without writing. The Notifications tab is still pending in the story.
- **Instructor description** (`GET/PUT /users/me/instructor-profile`, teacher/admin only): one
  trimmed text of 0–280 characters; empty clears it. Saving publishes immediately, no approval.
- **Public instructors** (`GET /instructors`): only non-empty descriptions of people who own at
  least one published course, as `{ description, courseIds }`. No account fields are exposed.
- **Moderation**: admins list every stored description and can clear one
  (`GET/DELETE /admin/instructor-profiles…`).
- The private bio never flows into the public description.
- The profile page has three tabs: **Profile** (avatar colour, about you, job, company, goals),
  **Password** and **Purchases**. Unsaved edits survive switching tabs.
- **Purchases** (every role): each bought course with date, amount and "Refunded" when refunded,
  newest first, and a **Receipt** button that opens Stripe's receipt page; **Manage saved card**
  opens Stripe's customer portal (see [payments](../payments/payments.md)).

## Code

- API: `accountProfile.ts`, `accountProfileRepository.ts`, `accountProfileRoutes.ts`,
  `instructorProfile.ts`, `instructorProfileRepository.ts`, `instructorProfileRoutes.ts`.
- App: `pages/profile-page/`, `services/profile.service.ts` (per-user browser cache),
  `services/instructor-profile.service.ts`; moderation in `pages/admin-page/`.

## Limits

- Concurrent saves are last-write-wins; there is no revision check.
