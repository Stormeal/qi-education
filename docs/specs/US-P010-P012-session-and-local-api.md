# US-P010 and US-P012: opening the app from the stored session; a local frontend stays local

State: delivered locally by Claude Code, 2026-10-11. Branch `main`, base `dba0646`.
Selected by Alex on 2026-10-11 from the session question and the audit of outside calls.
Frontend only; no API route, request or response changed.

## US-P010 — what changed

Before: every page load showed "Restoring your session" until `GET /me` had answered, although
the pages were already loading their data from the stored session behind it. When the answer
came, everything was thrown away and loaded a second time. Any failure of that request,
including a network error, signed the user out.

Now:

- The pages render from the stored session at once. The restore screen and its component are
  deleted (`app/src/app/ui/session-restore-state/`, the branch in all eight route templates,
  the `isSessionRestoring` signal).
- `GET /me` still runs at start-up, in the background (`restoreStoredSession` in
  `app-state.service.ts`):
  - same user and permissions as stored: nothing happens, and the session object is kept, so
    loads that are running stay valid and the catalog is loaded once instead of twice;
  - anything changed: the previous reset and reload runs, and the stored session is updated
    so the next visit starts from the current role;
  - 401: signed out with "Please log in again.";
  - any other failure: nothing. `AuthService.restoreSession` now returns `null` only for a
    401 and throws otherwise.
- A stored token whose own expiry has passed is not a session: `SessionService` reads the
  expiry from the token, clears the storage and the login page says "Your session has
  expired. Please log in again." No request is made. A token it cannot read is left for the
  API to judge.

Decisions taken by the lead (confirm or change): the comparison is of the stored and the
current user and permissions as a whole; a user whose role was lowered sees their old menus
until the check lands, and the API refuses the actions regardless.

## US-P012 — what changed

`resolveApiBaseUrls` in `api-client.service.ts` no longer adds the hosted API after the local
one for a local or unknown host, and a request that cannot reach the local API answers with
the existing "Local API is unavailable. Start the local API and retry. This request was not
sent to the hosted API." for reads as it already did for writes. GitHub Pages and Vercel
hosts are unchanged. A configured `qiEducationConfig.apiBaseUrl` is still used as given.

The login page's hint for a local demo login now says the local API runs with demo users and
names `USE_SHARED_SERVICES=1` (US-P011).

## Scenario evidence

| Scenario | Check |
| --- | --- |
| US-P010-AC01 | `session-restore.spec.ts` (signed in from the first moment, check in the background, same session object when nothing changed); `course-session.spec.ts` (an unchanged admin keeps one catalog load). Browser, in-memory API, demo teacher with "Remember me": reloading `/courses` showed the catalog at once, no restore screen existed, `/me` was requested, and the catalog was requested once |
| US-P010-AC02 | `session-restore.spec.ts` (a changed role is shown and stored); `course-session.spec.ts` (a changed account discards the running load and loads again); `course-navigation.spec.ts` DL-01 to DL-04 unchanged in meaning |
| US-P010-AC03 | `session-restore.spec.ts` (401 signs out with the message; an expired stored token goes to the login page without a request). Browser: with a stored token whose expiry was a minute ago, `/profile` showed the login page, the storage was cleared and `/me` was not requested |
| US-P010-AC04 | `session-restore.spec.ts` (a failed check keeps the session; only 401 means "not valid"). Browser: with the local API stopped, reloading `/courses` kept the teacher signed in and showed "Local API is unavailable..." |
| US-P012-AC01 | `api-client.service.spec.ts` (one base URL for a local host; a failed local GET, HEAD or default request is answered locally and never sent on). Browser: with the local API stopped, no request went to the hosted API |
| US-P012-AC02 | `api-client.service.spec.ts` (GitHub Pages and Vercel hosts unchanged) |

265 frontend tests and the Pages build pass.

Not verified: the hosted site (where the check takes seconds, which is the case this was
built for); a role change seen through a reload on the hosted site; a screen reader.

## Hosted check by Alex (2026-10-11, live site on 0.1.155)

A page reloads without the "Restoring your session" screen. The profile menu closes on a
click outside it. Changing the password from the profile page works: the notice mail
arrived and the new password logs in (US-L013).
