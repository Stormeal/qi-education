# US-P019 Header, Notifications & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the top-right header into a claude.ai-style cluster (bell · Feedback · gear · avatar), back the bell with a real in-app notifications subsystem, and add a `/settings` Notifications tab.

**Architecture:** Notifications are stored per-account in Mongo and created as never-fail side-effects at existing review/org/feedback routes; the unread count rides on `/auth/me` and the list is fetched on bell-open. The header adopts `@ng-icons/lucide` for all icons. Settings reuses the existing account page with one new tab.

**Tech Stack:** Express + Zod + Vitest (api), Angular signals + `@ng-icons/lucide` + Vitest (app).

**Delivered 2026-10-29.** Current behavior: [notifications](../../specs/platform/notifications.md), [UI foundation](../../specs/platform/ui-foundation.md), [profiles](../../specs/accounts/profiles.md). Contract retained in Git at `a2e100b`; frontend ownership transferred to Codex on Alex’s continuation. [Evidence](../../history/verification/2026-10-29-header-signup/README.md).

## Global Constraints

- **Every commit bumps the patch version** (pre-commit hook): same value in `package.json`, `app/package.json`, all three `"version"` lines in `package-lock.json`, and `appVersion` in `app/src/app/services/app-state.service.ts`. Value after the contract commit: **0.1.506**. Read the current value right before each commit and bump from there.
- **Shared tree with Codex:** stage own files by path, never `git add -A`. Group A (`api/src/**`) is Codex-owned; Groups B/C/D (`app/`) are Claude-owned. Root `package.json`/`package-lock.json` are shared — later committer re-bumps.
- **Icons:** all new/migrated icons come from `@ng-icons/lucide` (already a dependency; pattern in `course-builder.ts`). No new icon library.
- **UI foundation:** no hard-coded colours (use `--color-*`/`--shadow-*`/`--radius-*`; `check-ui-foundation.mjs` gates); no component-local focus ring (global `:focus-visible`); one `h1` per page; at 375px no sideways page scroll and nothing cut off; `ui/page-header` must **not** inject `AppStateService` (role via `roleLabel`, identity via `HeaderIdentityService`).
- Load the `design-taste-frontend` skill before any `app/` template/style change (Tasks B2–B4, C2, D1).
- Each new API route needs a `routePermissions.test.ts` entry (route **and** `/api` alias).
- Isolated/test mode uses in-memory repos; never reach Mongo there.
- Exact copy: empty bell state "You're all caught up."; preference groups `reviewActivity` / `organization` / `adminInbox`.

## Review Focus

- **Notification store failure must not fail the trigger:** a publish/invite/submit still succeeds (201/200) even if `NotificationService.create` throws. (Task A6)
- **Caller-scoping:** `POST /notifications/:id/read` and `/read-all` only affect the caller's own rows; another user's notification id is a no-op/404, never marked. (Task A4)
- **Invite to a non-existent account:** `org-invitation` with no matching account creates **no** row (recipient resolves to none), with no error. (Task A6)
- **Mobile ≤375px:** the cluster collapses to brand · bell · avatar with a hamburger drawer and no horizontal page scroll. (Task B3)
- **Unread dot semantics:** opening the bell panel does **not** clear the dot; only clicking an item or Mark-all-read does. (Task C2)

---

## Group A — Notifications backend (Codex, `api/src/**`)

### Task A1: `notificationPrefs` on the account profile

**Files:** Modify `api/src/accountProfile.ts` (schema ~L3, default ~L24); Test: `api/src/*accountProfile*` suite.

**Interfaces:**
- Produces: `accountProfileSchema` gains `notificationPrefs: z.object({ reviewActivity: z.boolean(), organization: z.boolean(), adminInbox: z.boolean() }).default({ reviewActivity:true, organization:true, adminInbox:true })`. Default/never-saved profile returns all three `true`.

- [x] **Step 1:** Failing test — a never-saved profile returns `notificationPrefs` all `true`; `PUT` persisting `{organization:false}` round-trips.
- [x] **Step 2:** Run the accountProfile test — FAIL.
- [x] **Step 3:** Add the field + default to `accountProfileSchema` and the empty-profile constant.
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

### Task A2: Notification repository + type

**Files:** Create `api/src/notificationRepository.ts`, `api/src/notification.ts`; Test: `api/src/notificationRepository.test.ts`.

**Interfaces:**
- Produces: `type Notification = { id: string; userId: string; type: NotificationType; title: string; link: string; createdAt: string; readAt: string | null }`; `type NotificationType = 'review-requested'|'course-submitted'|'review-changes-requested'|'course-published'|'org-invitation'|'org-request-received'|'org-request-approved'|'org-request-declined'|'org-member-joined'`; `interface NotificationRepository { create(n: Omit<Notification,'id'|'createdAt'|'readAt'>): Promise<Notification>; listForUser(userId: string, limit?: number): Promise<Notification[]>; markRead(id: string, userId: string): Promise<boolean>; markAllRead(userId: string): Promise<void>; countUnread(userId: string): Promise<number> }`; `InMemoryNotificationRepository`, `MongoNotificationRepository`, `createNotificationRepository()`.

- [x] **Step 1:** Failing tests (InMemory) — `create` then `listForUser` returns newest-first capped at 50; `countUnread` counts `readAt==null`; `markRead(id, otherUserId)` returns `false` and leaves the row unread; `markAllRead` zeroes the caller's unread only.
- [x] **Step 2:** Run `npm --prefix api test -- src/notificationRepository.test.ts` — FAIL.
- [x] **Step 3:** Implement the type, in-memory repo, Mongo repo (follow an existing `*Repository.ts`), and `createNotificationRepository()` (in-memory when `mode==='isolated'`).
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

### Task A3: NotificationService (create, fan-out, prefs/role gate)

**Files:** Create `api/src/notificationService.ts`; Test: `api/src/notificationService.test.ts`.

**Interfaces:**
- Consumes: `NotificationRepository` (A2), `AuthRepository`, `AccountProfileRepository` (A1 prefs).
- Produces: `NotificationService` with `notify(input: { recipientUserId: string; type: NotificationType; title: string; link: string }): Promise<void>` (single), `notifyAdmins(input)`, `notifyOrgOwners(orgId, input)`. A `TYPE_GROUP: Record<NotificationType, 'reviewActivity'|'organization'|'adminInbox'>` map. `notify` skips silently when the recipient's group pref is `false`; **never throws** (internal try/catch + warn).

- [x] **Step 1:** Failing tests — `notify` with a muted group creates no row; with group on, creates one; `notifyAdmins` fans out one row per admin; a repo that throws does not propagate (resolves, warns); `TYPE_GROUP` maps each type to the group in the spec table.
- [x] **Step 2:** Run — FAIL.
- [x] **Step 3:** Implement using the repos; recipient-not-found (e.g. no account) → no row, no throw.
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

### Task A4: Notification read/write routes

**Files:** Create `api/src/notificationRoutes.ts` (register in `server.ts`); Modify `api/src/routePermissions.test.ts`; Test: `api/src/notificationRoutes.test.ts`.

**Interfaces:**
- Consumes: `NotificationRepository` (A2), `authenticateRequest`.
- Produces: `GET /notifications` (+`/api`) → `{ notifications: Notification[] }` newest-50 for caller; `POST /notifications/:id/read` (+`/api`) → 204, 404 if not the caller's; `POST /notifications/read-all` (+`/api`) → 204.

- [x] **Step 1:** Failing tests — list returns only the caller's rows newest-first; marking another user's id → 404 and row stays unread; read-all zeroes caller's unread; all three in `routePermissions.test.ts` (authenticated, any role) with `/api` aliases.
- [x] **Step 2:** Run the route test + `routePermissions.test.ts` — FAIL.
- [x] **Step 3:** Implement the routes and register them; add permission-table rows.
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

### Task A5: `unreadNotifications` on `/auth/me`

**Files:** Modify `api/src/server.ts` (`/auth/me` handler ~L730); Test: extend the `/auth/me` suite.

**Interfaces:**
- Produces: `/auth/me` response gains `unreadNotifications: number` (= `countUnread(user.id)`).

- [x] **Step 1:** Failing test — `/auth/me` returns `unreadNotifications` reflecting the caller's unread count.
- [x] **Step 2:** Run — FAIL.
- [x] **Step 3:** Add `unreadNotifications` to the handler (tolerate a count failure as `0`, warn).
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

### Task A6: Wire `notify` at the trigger routes

**Files:** Modify the review routes (`registerCourseReviewersRoutes` and the submit/return/publish handlers), `registerOrganizationRoutes` (invite/request/approve/decline/accept), and the feedback create route; Test: extend each route's suite.

**Interfaces:**
- Consumes: `NotificationService` (A3). No new routes.

- [x] **Step 1:** Failing tests, one per trigger — the right `type` is created for the right recipient(s): `review-requested`→reviewer(s); `course-submitted`/`org-request-received`→each admin; `review-changes-requested`/`course-published`→course owner; `org-invitation`→invited account **only if it exists** (none otherwise); `org-request-approved/declined`→requester; `org-member-joined`→org owner(s). Plus: a `NotificationService` that throws does **not** fail the underlying action (publish/invite/submit still 200/201).
- [x] **Step 2:** Run the affected suites — FAIL.
- [x] **Step 3:** Call `notificationService.notify*` at each trigger with a rendered `title` + `link`; trace each route's recipient resolution.
- [x] **Step 4:** Run the suites, then `npm run api:test` and `npm run verify:journeys` — PASS.
- [x] **Step 5:** Commit (bump version).

---

## Group B — Header cluster + Lucide (Claude, `app/`)

### Task B2: Header cluster B (desktop)

**Files:** Modify `app/src/app/ui/page-header/page-header.{ts,html,scss}`; reuse `ui/profile-menu`; Test: `app/src/app/ui/page-header/page-header.spec.ts`. (Load `design-taste-frontend` first.)

**Interfaces:**
- Produces: header renders the right cluster — bell (`lucideBell`, slot; wired in C2), labeled **Feedback** button (`lucideMessageSquare`, emits existing `feedbackOpened`), gear link to `/settings` (`lucideSettings`), avatar pill (existing `profile-menu`). Brand + nav tabs unchanged. New input `unreadCount = input(0)` for the dot; no `AppStateService` injection.

- [x] **Step 1:** Failing tests — cluster shows bell, labeled Feedback, gear linking `/settings`, avatar pill; Feedback click emits `feedbackOpened`; header still does not inject `AppStateService`.
- [x] **Step 2:** Run the page-header spec — FAIL.
- [x] **Step 3:** Implement with `@ng-icons/lucide` (`provideIcons`), design tokens only, global focus ring.
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

### Task B3: Mobile hamburger drawer

**Files:** Modify `page-header.{ts,html,scss}`; Test: `page-header.spec.ts`.

**Interfaces:**
- Produces: at ≤375px, top bar = brand · bell · avatar; a `lucideMenu` button toggles a drawer listing all nav tabs + Feedback + Settings.

- [x] **Step 1:** Failing tests — below the mobile breakpoint the hamburger renders and toggles a drawer containing the tabs + Feedback + Settings; above it the inline tabs render; no element forces horizontal overflow (assert the layout’s wrap/overflow rule, not pixel counts).
- [x] **Step 2:** Run — FAIL.
- [x] **Step 3:** Implement the responsive drawer (tokens, global ring, `aria-expanded`).
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

### Task B4: Lucide migration (remaining inline SVGs)

**Files:** Modify the ~10 templates holding inline `<svg>` (`profile-menu`, `login-page`, `learning-page`, `dashboard-page`, `course-editor-page`, `career-path-page`, `career-map`, `cv-scan`, `brand-link` if generic); Modify `docs/specs/platform/ui-foundation.md`; Test: existing specs for those components + `scripts/check-ui-foundation.mjs`.

**Interfaces:** Consumes B2's `@ng-icons/lucide` pattern. No behavior change — icons swap to Lucide equivalents.

- [x] **Step 1:** For each template, replace inline `<svg>` with the matching `<ng-icon name="lucide…">`, preserving `aria-label`/`title` and size. Keep `brand-link`'s bespoke logo if it is not a generic icon.
- [x] **Step 2:** Run `npm run app:test` (includes `check-ui-foundation.mjs`) — PASS (no new hard-coded colours, focus ring intact); note Lucide as the icon source in `ui-foundation.md`.
- [x] **Step 3:** Commit (bump version). Split across commits per few templates if large.

---

## Group C — Bell + notifications frontend (Claude, `app/`)

### Task C1: `NotificationService` (app) + unread count

**Files:** Create `app/src/app/services/notification.service.ts`; Modify `app/src/app/app.models.ts` (add `Notification` type, `unreadNotifications` on the `/auth/me` response type) and `app-state.service.ts` (expose `unreadNotificationCount` from the `/auth/me` payload); Test: `app/src/app/services/notification.service.spec.ts`.

**Interfaces:**
- Consumes: A4 routes, A5 `/auth/me` field.
- Produces: `NotificationService.list(): Promise<Notification[]>` (cached until invalidated), `markRead(id)`, `markAllRead()`; `AppStateService.unreadNotificationCount` signal fed from `/auth/me`.

- [x] **Step 1:** Failing tests (clear storage in `beforeEach`) — `list()` fetches `/notifications` and caches; `markRead`/`markAllRead` POST and invalidate; `unreadNotificationCount` reflects the `/auth/me` payload.
- [x] **Step 2:** Run the spec — FAIL.
- [x] **Step 3:** Implement against `ApiClientService`.
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

### Task C2: Bell dropdown

**Files:** Create a bell/dropdown UI (e.g. `app/src/app/ui/notification-bell/`), wired into the header from B2; Test: its spec. (Load `design-taste-frontend` first.)

**Interfaces:** Consumes C1 (`NotificationService`, `unreadNotificationCount`). Feeds B2's bell slot.

- [x] **Step 1:** Failing tests — dot shows when count>0; opening the panel lists newest-first and does **not** change the count; clicking a row navigates to `link` and marks it read (count decrements); Mark-all-read clears; empty state shows "You're all caught up."; Escape closes and returns focus to the bell.
- [x] **Step 2:** Run — FAIL.
- [x] **Step 3:** Implement (Lucide icons by type, tokens, menu keyboard contract like `profile-menu`; full-width panel on mobile).
- [x] **Step 4:** Run — PASS.
- [x] **Step 5:** Commit (bump version).

---

## Group D — Settings (Claude, `app/`)

### Task D1: `/settings` route + Notifications tab

**Files:** Modify `app/src/app/pages/profile-page/` (add a Notifications tab) and `app.routes.ts` (a `/settings` route rendering that page, landing on the tab); Test: `profile-page` spec. (Load `design-taste-frontend` first.)

**Interfaces:** Consumes A1 (`notificationPrefs` on the profile) via the existing profile save (`PUT /users/me/profile`).

- [x] **Step 1:** Failing tests (clear storage in `beforeEach`) — the Notifications tab shows role-appropriate toggles (everyone: Organization; teacher/admin: + Review activity; admin: + Admin inbox); toggling and saving round-trips through the profile; existing Profile/Password/Purchases tabs unchanged; `/settings` resolves to this page.
- [x] **Step 2:** Run the profile-page spec — FAIL.
- [x] **Step 3:** Implement the tab + route (tokens, `app-tabs`, global ring).
- [x] **Step 4:** Run `npm run app:test` and `npm run app:build:pages` — PASS.
- [x] **Step 5:** Commit (bump version).

---

## Done when

- `npm run api:test`, `npm run app:test`, `npm run verify:journeys`, `npm run app:build:pages` all pass.
- Spec behavior folded into `docs/specs/platform/ui-foundation.md` (cluster + Lucide), a new notifications area spec, and `docs/specs/accounts/profiles.md` (Notifications tab + prefs); the `docs/stories/US-P019-*.md` contract deleted on delivery.
- Release note added before the push.
