# US-P019: Navigation header, notifications and settings

Designed with Alex on 2026-10-29 (brainstorming, visual companion). One story, three sub-areas:
the header **cluster** redesign, an in-app **notifications** subsystem, and a **settings** home.
Mockups persist under `.superpowers/brainstorm/`. Relevant current behavior:
[ui-foundation](../specs/platform/ui-foundation.md), [profiles](../specs/accounts/profiles.md),
[review and publication](../specs/authoring/review-and-publication.md),
[organizations](../specs/organizations/organizations.md).

## Why

Alex wants the top-right of the header to look and work like claude.ai's control cluster
(bell · Feedback · gear · avatar), and — decided during brainstorming — the bell and gear to be
**real features**, not chrome: operational **notifications** and a **settings** home. Kept as one
story at Alex's choice; expect separate implementation plans per sub-area.

## Release

Suggested **release 1** — confirm or change. The triggering actions (review, org, feedback) already
exist, so the notifications are an in-app mirror of events shipping anyway.

## Sub-area 1 — Header cluster (chosen: layout B)

- Brand + primary nav tabs (Home, About, Catalog, My Learning, Roadmap) stay on the **left**,
  unchanged. The right side becomes a cluster: **bell** (notifications) · **Feedback** (labeled
  button + caret, opens the existing feedback dialog/dropdown) · **gear** (→ `/settings`) · **avatar
  pill** (org name + coloured initial + chevron). Layout B = Feedback keeps its text label (chosen
  over all-icon A for discoverability).
- `page-header` keeps its no-`AppStateService` rule; new controls use the existing inputs/outputs
  and `HeaderIdentityService` for identity. The avatar pill is today's `profile-menu` (identity,
  role links, logout) — unchanged in content.
- **Mobile (≤375 px): hamburger drawer** (chosen over a scrollable tab row). Top bar collapses to
  brand · bell · avatar; a left hamburger opens a drawer with all nav tabs + Feedback + Settings.
  Obeys the UI-foundation 375 px rule (no sideways page scroll, nothing cut off). Org name stays
  hidden below 640 px as today.

## Sub-area 2 — Lucide icon foundation (site-wide)

- Standardize on `@ng-icons/lucide` (already a dependency, already used in `course-builder` and
  `career-tree`). The new cluster uses `lucideBell`, `lucideMessageSquare`, `lucideSettings`,
  `lucideChevronDown`, `lucideMenu`.
- Migrate the remaining hand-rolled inline `<svg>` (~20 across ~10 templates: `profile-menu`,
  `login-page`, `learning-page`, `dashboard-page`, `course-editor-page`, `career-path-page`,
  `career-map`, `cv-scan`, `brand-link`) to the same `@ng-icons/lucide` pattern, so every icon comes
  from one source. Mechanical and low-risk; its own implementation task, per template. Update
  `ui-foundation.md` to name Lucide as the icon source. `brand-link`'s logo mark may stay bespoke if
  it is not a generic icon (confirm per case).

## Sub-area 3 — Notifications

### Storage (Mongo, per-account) — `notifications` collection

```
{ id, userId, type, title, link, createdAt, readAt | null }
```

- `title` and `link` are **rendered at creation** (point-in-time snapshot; no i18n; a later rename
  does not rewrite old notices). `type` drives the Lucide icon and the preference group.
- In-memory repo for isolated/test, Mongo in prod — the standard repository + injection pattern.
- Retention: `GET /notifications` returns the newest 50. No hard deletion in R1 (a cleanup sweep is
  a deferred open decision).

### Event types → recipients → trigger

| Type | Recipient(s) | Fired at (existing action) | Group |
|---|---|---|---|
| `review-requested` | assigned reviewer(s) | admin assigns reviewers (US-A007) | reviewActivity |
| `course-submitted` | all admins | teacher submits for review | reviewActivity |
| `review-changes-requested` | course owner | reviewer/admin returns with changes | reviewActivity |
| `course-published` | course owner | admin publishes | reviewActivity |
| `org-invitation` | invited account (if it exists) | owner invites by email | organization |
| `org-request-received` | all admins | user requests an organization | adminInbox |
| `org-request-approved` / `org-request-declined` | requester | admin decides | organization |
| `org-member-joined` | org owner(s) | invitee accepts | organization |

- Fan-out helper creates one row per recipient for the "all admins" / "org owners" cases.
- **Creation is a safe side-effect:** each trigger route calls
  `NotificationService.create({ userId, type, title, link })` in try/catch — like the
  confirmation-mail pattern, a notification failure logs a warning and **never fails** the
  underlying action (publish/invite/submit still succeed).
- **Prefs + role gate:** `create()` maps `type → group`, checks the recipient's `notificationPrefs`
  (default all on), and skips silently if muted. Role implicitly gates (a student is never a
  recipient of `adminInbox` types).

### Delivery and the bell (read side)

- **Unread count rides on `/auth/me`** (Approach A): the response gains
  `unreadNotifications: number` (count of `readAt == null`), so the bell dot updates on the existing
  background poll — no new poller. No websockets (Vercel serverless).
- Routes (authenticated, caller-scoped; each needs a `routePermissions.test.ts` entry + `/api`
  alias):
  - `GET /notifications` → newest 50 for the caller.
  - `POST /notifications/:id/read` → 204 (own notifications only).
  - `POST /notifications/read-all` → 204.
- App `NotificationService`: `unreadCount` signal fed from the `/auth/me` payload via
  `AppStateService`; lazily fetches the list on bell-open, refetches on reopen.
- Bell dropdown: `lucideBell` + orange dot when `unreadCount() > 0`. Rows = type icon + `title` +
  relative time; a click navigates to `link` and marks that one read (optimistic local decrement).
  A **Mark all read** action at the top. Empty state: "You're all caught up."
- State model: **opening the panel changes nothing**; the dot reflects `readAt == null`; clicking an
  item or Mark-all-read clears it. Menu keyboard contract like `profile-menu` (Escape closes, focus
  returns to the bell). On mobile the bell stays in the top bar; the panel renders full-width beneath.

## Sub-area 4 — Settings (`/settings`)

- The profile page is already the account home (tabs: Profile — avatar colour, about, job, company,
  goals; Password; Purchases). **Do not duplicate it.** Add **one new tab — "Notifications"** — to
  that page, and point the gear at it via a `/settings` route (the page may be titled "Settings").
- Notifications tab: the three group toggles, shown **role-appropriately** — everyone sees
  *Organization*; teachers/admins also see *Review activity*; only admins see *Admin inbox*. Default
  all on. Saved on the account profile (same `PUT /users/me/profile`-style flow, last-write-wins).
- Account settings (avatar colour, password, purchases, profile fields) stay as the existing tabs —
  no migration. The avatar pill menu keeps identity, role links and logout. So: gear = settings /
  preferences, avatar = who you are + where you go.

## Testing

- API (`api/src/**`): notification repo unit (create, list newest-50, mark one/all read,
  caller-scoping); each trigger creates the right type for the right recipient(s) and fan-out for
  admins/owners; a notification-store failure does not fail publish/invite/submit; muted group →
  no row; role gate; `/auth/me` returns `unreadNotifications`; the three routes + `/api` aliases in
  `routePermissions.test.ts`. Isolated mode uses the in-memory repo.
- App (`app/`): clear `localStorage`/`sessionStorage` in `beforeEach`. Header renders cluster B;
  bell dot reflects `unreadCount`; dropdown lists, click marks-read + navigates, Mark-all-read
  clears; `page-header` still does not inject `AppStateService`; mobile hamburger opens the drawer
  with no sideways scroll; `/settings` Notifications tab shows role-appropriate toggles and saves;
  Lucide migration keeps `check-ui-foundation.mjs` green (no new hard-coded colours; global focus
  ring unchanged).

## Open decisions (confirm or change)

- Release assignment: suggested R1 (above).
- Notification retention: newest-50 list, no hard delete in R1 — add a cleanup sweep later?
- `/settings` as a new route rendering the account page (recommended) vs reusing the profile route.

## Codex split (at implementation)

- Codex (`api/src/**`): `notificationRepository.ts` + in-memory/Mongo impls, `notificationService.ts`
  (+ fan-out, prefs/role gate), the three routes, `unreadNotifications` on `/auth/me`,
  `notificationPrefs` on the account profile, and the `create()` side-effect calls at the review,
  organization and feedback trigger routes. Trace each trigger route and its recipient resolution.
- Claude (`app/`): header cluster B + mobile hamburger, Lucide site-wide migration, bell
  `NotificationService` + dropdown, the `/settings` Notifications tab, and `ui-foundation.md`. Trace:
  `ui/page-header`, `ui/profile-menu`, `app-state.service.ts` (unread count from `/auth/me`), the
  profile page tabs, and the ~10 templates holding inline SVGs.
