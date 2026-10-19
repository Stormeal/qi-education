# US-P008 per-client limits for reset requests and signups — Codex handoff

Assigned 2026-10-19 by Claude Code (lead). Story, decisions and scenarios US-P008-AC05/AC06:
[user_stories.md, US-P008](../user_stories.md). Closes INV-014. Read `AGENTS.md` (shared-tree rules)
first. Claude works in this same working tree at the same time.

## Codex scope: the API

1. **Client key.** Hosted mode (`getServicesMode() === 'hosted'`): the first entry of
   `x-forwarded-for` (Vercel sets it and overwrites client values). Isolated and shared mode: the
   connection address (`request.socket.remoteAddress`); never trust `x-forwarded-for` there. No
   address: one shared `unknown` key. Store only `sha256(purpose + ':' + address)`, never the raw
   address.
2. **Limit.** Per key, fixed one-hour windows: purpose `reset` 10 requests, purpose `signup` 20.
   Atomic count-and-check, so parallel requests cannot all slip under the limit. Counted only after
   the body validates (400 answers do not count) and before any account lookup, mail or write.
3. **Over the limit:** 429 with `Retry-After` (seconds until the window ends) and
   `{ message: 'Too many requests from your network. Try again in N minutes.', code: 'too-many-requests' }`,
   N rounded up, "1 minute" singular. For reset the answer must be identical for an existing,
   unknown or disabled address, and no mail is sent.
4. **Routes:** `POST /signup` and `POST /auth/password-reset/request`, on every path the server
   already mounts them (including any `/api/` alias). The admin reset link, sign-in, check and
   confirm routes are unchanged.
5. **Storage.** Isolated/test: in memory. Shared/hosted: MongoDB collection
   `<MONGODB_COURSE_CONTENT_COLLECTION>_client_limits`, upsert with `$inc`, a TTL index on the
   window's expiry so documents delete themselves. If the store fails or times out, let the
   request through and `console.warn` once per failure (fail-open, same as `signInLimit.ts`).
6. **Tests can raise the limits.** Existing tests and `npm run verify:journeys` sign up many users
   from one address: give `createServer` an injectable limit (or limits) so they keep passing,
   with the production defaults above when nothing is injected.

Tests to add (in-process, isolated): the 11th reset request from one client is 429 for an existing
and an unknown address with identical bodies and no mail recorded, while another client gets 202;
the 21st signup is 429 and creates no account; a 400 does not count; `Retry-After` and the minutes
in the message agree; `x-forwarded-for` is used only in hosted mode; fail-open on a throwing store;
parallel requests cannot exceed the limit (memory and a Mongo double); the TTL index is created.

Done when `npm run api:test`, `npm run api:build` and `npm run verify:journeys` pass.

## Contract Claude's side relies on

- 429 JSON body `{ message, code: 'too-many-requests' }`; `message` is final user-facing text.
- Existing success and error answers of both routes are unchanged.

## Files Claude owns (do not edit)

`app/**` (except the version line), `docs/**` except your row in `docs/work_queue.md`,
`scripts/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`. If you need one of these, finish everything
else first, then name the exact file and line in your summary instead of stopping.
