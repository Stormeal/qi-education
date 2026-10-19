# Reliability

## Purpose

Overlapping requests, retries and slow providers must not lose work, duplicate data or show
false success.

## Behavior

- **Course lock**: every course write runs under a per-course lock (MongoDB owner record; memory
  locally). Reads do not take it. A held lock answers 409 after a bounded wait. A lock left by an
  interrupted write expires after 31 minutes. Locked handlers answer with `send`/`json` and the
  answer is held until the lock is released (DEF-042). Recovery runbook:
  [course_operation_recovery.md](../../course_operation_recovery.md).
- **Lock inspection** (US-P005): admins can read `GET /admin/course-locks` (also under `/api`)
  with `Cache-Control: no-store`; anonymous callers get 401, other roles 403, and unavailable
  storage 503 `{ message }`. The list shows course ID/title, owner, acquisition/expiry times
  and `held`, `expired` or `needs-recovery`, malformed timestamps first then oldest acquisition.
  It never acquires, changes or deletes locks and offers no release action; uncertain owners
  require the recovery runbook above.
  Admin page → **Course locks** shows the same list with a Refresh button (app:
  `pages/admin-page/`, `AdminUsersService.courseLocks`). Decided 2026-10-19 (Alex: confirm or
  change): admins only and no release button, because a valid lock frees itself after 31 minutes
  and earlier release is not supported.
- **Revision checks**: course saves and review actions carry the loaded revision; career path
  writes may carry `X-Expected-Updated-At`. Stale writes are refused, never merged silently.
- **Keyed queues** (per API instance): signup by normalized email, enrollment by user, feedback
  triage by feedback ID, admin role/status by target. MongoDB adds cross-instance guarantees for
  accounts: a unique email index, `$addToSet` enrollment and single-field updates.
- **Atomic per-account writes** for progress, careers, achievements, notes and profiles (compare
  and replace with retry, majority acknowledgement).
- **Caching**: course responses are `private, no-store` with `Vary: Authorization`. A thumbnail
  requested with `?v=<assetId>` that matches the served asset is cached privately for a year
  (`immutable`). Nothing is publicly cacheable.
- **Local runs stay local**: on a localhost frontend, writes go only to the local API; if it is
  down, the client answers a local 503 ("Local API is unavailable…") and never sends the request to
  the hosted API.
- **Errors**: bodies are `{ message }` (plus `issues` for validation). Invalid JSON, oversized
  bodies and unsupported encodings answer 400/413/415. A storage outage (account or course store
  unavailable, or a MongoDB connection, server-selection, network-timeout or not-connected error,
  also when wrapped as `cause`) answers 503 `{ message, code: 'STORE_UNAVAILABLE', retryable: true }`
  with a fixed message for driver errors; a read-only freeze answers 503 `{ message, code:
  'READ_ONLY', retryable: false }`. Other failures a generic 500. Request bodies and internal errors
  are never echoed. Driver outages are logged once ("Storage unavailable").
- **Outage guidance in the app**: `ApiClientService.fetch` gives every 503 `STORE_UNAVAILABLE` the
  message "The service is briefly unavailable, so nothing was changed. Your work on this page is
  kept. Try again in a minute." (`code` and `retryable` kept), so every page that shows API errors
  shows it. Pages keep their inputs on a failed save; the course editor also keeps warning before
  leaving. Read-only messages are shown as the API wrote them.

## Code

- API: `courseMutationLock.ts`, `keyedSerialQueue.ts`, `inFlightRead.ts`, `courseRequestReads.ts`,
  `courseReview.ts`, error middleware in `server.ts`.
- App: `services/api-client.service.ts` (base URL choice, response cache, 401 handling).

## Limits

- Retries across instances or after a restart are not guaranteed for feedback issues (US-P003-AC04).
- No operator tool to release a course lock early (US-P005).
