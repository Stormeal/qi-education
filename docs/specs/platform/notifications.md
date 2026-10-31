# Notifications

## Purpose

Mirror review and organization events in a private inbox, reached from the header bell (US-P019).

## Behavior

- `GET /notifications` returns `{ notifications }`, newest 50 for the authenticated account.
  Opening the list does not change read state. `POST /notifications/:id/read` marks an own row
  read (204, repeatable); a foreign or unknown ID answers 404. `POST /notifications/read-all`
  marks only that account's rows. All routes also work under `/api`, with private/no-store and
  `Vary: Authorization`. Storage failure answers a retryable 503.
- **Live count** (2026-10-31): `GET /notifications/stream` is a server-sent event stream that
  sends `event: count` with the caller's unread count on connect and after every change to the
  caller's rows (new, read, all read). Memory mode uses an in-process emitter; Mongo uses a change
  stream filtered on `userId`, so a notice written by another server instance still arrives. A
  stream ends after 50 seconds (under Vercel's shortest limit) with a 20-second keep-alive; the app
  reconnects at once and gets a fresh count, backing off up to 30 seconds after failures. The app
  reads it with `fetch` (EventSource cannot send the bearer token), opens it from sign-in/restore
  preload, closes it while the tab is hidden and on logout. A changed count refreshes an
  already-loaded list.
- **Saved inbox** (2026-10-31): the list and count are kept in `sessionStorage`
  (`qi-education:notifications`) labelled with the account id. A reload shows them at once; a
  different account or logout discards them. Blocked storage falls back to loading from the API.
- `/auth/me` and `/me` add top-level `unreadNotifications`, counting all unread rows, including
  those older than the displayed 50. A failed count logs a generic warning and falls back to zero;
  it does not fail session refresh.
- Rows snapshot `{ id, userId, type, title, link, createdAt, readAt }` at creation. Read timestamps
  preserve the first read. Renaming a course or organization does not rewrite old notices.

| Event | Recipient | Preference group |
| --- | --- | --- |
| Newly assigned reviewer | Active reviewer | `reviewActivity` |
| Course submitted | Active admins | `reviewActivity` |
| Admin returns / reviewer requests changes | Course owner | `reviewActivity` |
| Course published | Course owner | `reviewActivity` |
| Organization requested or resubmitted | Active admins | `adminInbox` |
| Organization request approved / declined | Requester | `organization` |
| Invitation created | Invited account, if it exists | `organization` |
| Membership becomes active | Active organization owners | `organization` |

- The bell shows an orange unread dot and an accessible unread count. Opening it fetches the
  newest list and refreshes `/me` count, without marking anything read. Counts also refresh on
  session restore, fresh sign-in and through the live stream; there is no poller. Replies from an old session
  cannot update a new account, and logout clears the list/count.
- **Background loading** (US-P024): successful sign-in/signup and validated session restoration
  start a non-blocking list preload. Opening the bell immediately displays its session-memory
  cache, including an empty list, while refreshing in the background. A pending preload is shared
  instead of restarted. A failed preload never fails login; opening/retry can recover.
- Successful read actions retain the cached rows with updated read state. Older list/count replies,
  including delayed sign-in counts, cannot undo the action. If Mark all read finishes before the
  first list exists, a replacement list loads rather than presenting a false empty inbox.
- Rows show a Lucide event icon, saved title and relative time. Clicking marks the row read and
  navigates to its link; Mark all read clears the account's unread state. Failures offer Retry;
  an empty inbox says "You're all caught up." Reopening refetches the list.
- Outside click and Escape close the panel; Escape returns focus to the bell. On a phone the
  panel fits below the header without sideways page scroll. Preferences are in
  [Settings → Notifications](../accounts/profiles.md).

## Rules

- `notificationPrefs` are saved on the private account profile, default all on, including legacy
  profiles. Muted groups skip creation. Students do not receive review or admin-inbox events;
  only admins receive admin-inbox events. Missing/disabled recipients receive nothing.
- Each trigger awaits delivery before responding (serverless-safe), with a failure boundary that
  preserves the original action. Provider errors, invitation tokens and secrets are never logged.
- Organization membership events also cover delayed email confirmation; pending membership
  itself sends no joined notice. Invitation notices link to `/organization` and ask the recipient
  to use the emailed link, so raw invitation tokens are never stored in notifications.
- Isolated mode uses independent in-memory stores. Shared/hosted mode uses
  `<MONGODB_COURSE_CONTENT_COLLECTION>_notifications`, majority-acknowledged writes and indexes
  on `(userId, createdAt, id)` and `(userId, readAt)`. Missing Mongo settings do not select memory.

## Code

`api/src/notification.ts`, `notificationRepository.ts`, `notificationService.ts`,
`notificationRoutes.ts`; trigger wiring in `server.ts`, `courseReviewersRoutes.ts` and
`organizationService.ts`; preferences in `accountProfile.ts` and `accountProfileRoutes.ts`.
App: `services/notification.service.ts`, `ui/notification-bell/`, header and account settings;
session counts are connected through `AppStateService`.

## Limits

- No retention deletion or poller. The live stream on hosted Vercel is unverified: if Vercel
  buffers the response, counts arrive when each 50-second stream ends instead of at once.
  Each open, visible tab holds one function invocation, which counts against Vercel usage. Notifications are best effort and have
  no delivery retry queue. Mongo behavior is verified at the isolated driver boundary; live
  index metadata, remaining event recipients and cross-device browser behavior remain release
  checks. The bell was exercised with isolated HTTP stores and authenticated hosted empty inboxes;
  student/admin/teacher preference visibility was checked live. Hosted checks on 2026-10-30/31
  verified teacher delivery for reviewer Request changes, admin Return and publication, persisted
  read state, saved Review activity off/on and suppression of a muted Return notice. Admin
  submission delivery was user-reported from a separate session.
  [Hosted evidence](../../history/verification/2026-10-30-release/walkthrough.md).
  Background loading is verified locally with delayed responses; its hosted check remains pending.
- The design mentions feedback notifications but specifies no feedback event type or recipients;
  those remain undefined and are not implemented.
