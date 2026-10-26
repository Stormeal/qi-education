# US-P018-AC04 follow-up — close the two accepted server findings (Codex)

Started 2026-10-25. Decided by Alex the same day (recorded in `docs/user_stories.md`, US-P018):

- **body-parser compressed-body crash** (GHSA-27r3-jxmh-p828): refuse compressed request bodies.
  No parser major.
- **Zod memory exhaustion** (GHSA-mrhx-c7xc-m3w5): approve Zod 4.6 and its changed validation
  messages.

Background and the earlier failed attempt: [audits/2026-10-dependencies.md](../audits/2026-10-dependencies.md#us-p018-ac04).

## Part A — refuse compressed bodies

- Every body parser in `api/src/server.ts` (`express.json` and `express.raw`, including the Mux
  and Stripe webhook parsers, thumbnails, attachments and course content) gets `inflate: false`.
- A request with `Content-Encoding` other than `identity` answers **415** with the existing
  request-error shape `{ message }` (through `withRequestBodyErrors`, like the other 415s). Pick a
  plain message, e.g. "Compressed request bodies are not accepted."
- Uncompressed requests behave exactly as before.
- Assumption kept from the audit: browsers, Stripe and Mux do not send compressed bodies. Not
  verified against live providers; say so in your summary.

## Part B — Zod 4.6

- `api/package.json` and `package-lock.json`: Zod to the latest 4.6.x.
- `api/src/courseContent.ts`: a quiz question without `points` still normalizes to 1 (the earlier
  attempt failed 163 tests on this: "expected nonoptional").
- `api/src/server.ts` image-priority branch (around the quiz image error, near the
  `/courses/:id/content` PATCH): when the only problem is a question image, the answer stays
  `400 { "message": "Question N: …" }` as today. When a list is over its limit (for example 51
  questions), 400 `{ "message": "Invalid request body", "issues": [...] }` from the generic handler
  is accepted; that is the approved message change. Do not restore per-element issues past a
  too-big list.
- Update tests whose expected text changed only because of Zod's wording; note each in the summary.

## Files Codex owns

`api/src/server.ts`, `api/src/courseContent.ts`, `api/package.json`, `package-lock.json` (Zod
entries and the three version lines), any `api/src/*.test.ts` that needs new or updated cases
(new: `api/src/compressedBodies.test.ts`), `docs/audits/2026-10-dependencies.md` (a short
"Follow-up 2026-10-25" section), `docs/specs/platform/reliability.md` (one line on 415 for
compressed bodies), its row in `docs/work_queue.md`. Version lines in `package.json`,
`app/package.json`, `app/src/app/services/app-state.service.ts`.

## Not Codex's files

Everything else under `app/`. Claude is changing `app/src/app/ui/course-builder/**`,
`app/src/app/services/app-state.service.ts` (other than the version line) and `app/src/app/app.models.ts`
at the same time: the builder stops at 50 questions per quiz and 50 attachments per lesson, so a
teacher never reaches the generic "Invalid request body" for those lists.

## Contract Claude relies on

- Limits stay: 50 questions per quiz, 2–6 answers, 50 attachments per lesson, 200 lessons per
  chapter, 200 chapters.
- Every other response shape and message stays, apart from Zod's own wording inside `issues`.

## Done when

`npm run api:test`, `npm run api:build`, `npm run verify:journeys` pass, `npm audit --omit=dev
--workspace api` no longer lists the Zod and body-parser entries (or the summary says why one
remains), and the work is committed locally.
