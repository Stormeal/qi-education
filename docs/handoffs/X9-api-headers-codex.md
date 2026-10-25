# X9 — API security headers (Codex)

Started 2026-10-25. Source: X8 audit, "Security coverage" → Headers row in
[audits/2026-10-performance-security.md](../audits/2026-10-performance-security.md): local API
responses lack nosniff, Referrer-Policy and a frame policy, reveal `X-Powered-By: Express`, and
`/health*` has no explicit cache policy.

## Scope (Codex owns)

- `api/src/server.ts`: right after the Express app is created in `createServer`, before any route:
  - `app.disable('x-powered-by')`
  - one middleware setting on every response: `X-Content-Type-Options: nosniff`,
    `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
  - `/health`, `/health/config`, `/health/auth`, `/health/content` (and `/api` aliases if they
    exist) answer `Cache-Control: no-store`.
- New test `api/src/securityHeaders.test.ts`: the three headers present and `X-Powered-By` absent
  on a JSON route, an error answer (404 and 401), a course asset download, and `/health`; health
  answers `no-store`; root and `/api` paths.
- `docs/specs/platform/reliability.md`: one short paragraph under the cache/response rules.
- `docs/work_queue.md`: the X9 row only.
- Version files when committing: `package.json`, `app/package.json`,
  `app/src/app/services/app-state.service.ts` (`appVersion`), and the three version lines of
  `package-lock.json`. Read the version from `package.json` right before committing.

## Contract

- Existing headers are unchanged: `Cache-Control` values on private routes and assets, `Vary`,
  `X-QI-Education-*`, `Retry-After`, `Content-Type`/`Content-Disposition` on downloads.
- No CORS change. No new dependency (no helmet). No route added or removed.
- Content Security Policy is out of scope (the frontend is on GitHub Pages, which cannot set it).
- Not in scope, left as is: F6 one account read per listed member (organizations are small).

## Not Codex's files

Everything under `app/` except the version line in `app-state.service.ts`; every other `api/src`
file; other docs. Claude works in `app/src/app/**` at the same time (accessibility pass).
