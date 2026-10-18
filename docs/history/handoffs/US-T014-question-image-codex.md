# US-T014 question image — Codex handoff (API)

Assigned 2026-10-11 by Claude Code (lead). Alex asked for question images on 2026-10-11
("later"); it is now the first open story in backlog order. Runs in parallel with Claude's
frontend part (quiz editor and learner quiz view) under `app/` in this same working tree.
Read `AGENTS.md` (including "Two agents in one working tree") first.

## Decisions taken by the lead (record in the spec as "confirm or change")

The story's open decisions all have a precedent in the code, so none blocks the work.

- A question image is an ordinary attachment of its quiz lesson, referenced by the question.
  No new storage, no new download route: storage, entitlement and download are those of
  lesson attachments today.
- Formats: JPEG, PNG, WebP. Size: the existing attachment limit (4 MB).
- At most one image per question. Alternative text is optional, at most 300 characters.
- Removing the image removes the attachment; the question and its answers stay.
- No new readiness rule: a question without an image, or with an image without alternative
  text, can still be submitted for review.

## Scope

Write `docs/specs/US-T014-question-image.md` first (scenarios US-T014-AC01 and AC02 in
`docs/user_stories.md`, plus numbered scenarios for the rules below). Then deliver the API
side. Claude delivers all of the frontend against this contract.

## Contract Claude's frontend is built against (do not change without recording it)

Stored quiz question, in the content save and the author read. One new optional field:

```
{ id, question, points, explanation, image, answers: [...] }
image: { assetId: string, alt: string } | null      // default null; alt 0..300, trimmed
```

Upload — the existing route, unchanged in path, headers and response shape:
`PUT /courses/:id/content/components/:componentId/attachments` (`X-Section-Id`,
`X-File-Name`, `Content-Type`, raw body).

- For a quiz lesson it now accepts `image/jpeg`, `image/png` and `image/webp` and answers
  as it does for other lesson types. Any other type on a quiz lesson: 415 with `{ message }`.
- Text, resources and video lessons behave exactly as today.

Save — `PATCH /courses/:id/content`:

- A question's `image.assetId` must be the `assetId` of an image attachment of that same
  quiz lesson. Otherwise 400 `{ message }` in the existing `Question N: ...` style.
- A request without `image` on a question stores `null`, so the deployed frontend keeps
  saving.

Learner read (`GET /courses/:id/content`): each question additionally carries
`image: { assetId, alt } | null`. Nothing else is added; correct answers stay undisclosed.
The public outline carries no image.

Download — the existing `GET /courses/:id/content/attachments/:assetId`, unchanged. Confirm
with tests that it serves a quiz lesson's image to the author and to an enrolled learner of
the published course, and to nobody else.

Delete — the existing
`DELETE /courses/:id/content/components/:componentId/attachments/:assetId`: in the same
write it also sets `image` to `null` on every question of that lesson that referenced the
asset. Response shape unchanged.

Review revisions, the frozen submission and the published copy keep question images the way
they keep lesson attachments.

Tests must cover: every bullet above; a save that references another lesson's or another
course's asset; a stored quiz without the field (no migration); both quiz attempt routes
still grade a question that has an image.

## Requirements

- A push deploys the API before the frontend; everything the deployed frontend sends and
  reads must keep working.
- Reproduce any existing behavior you find broken as a defect before fixing it.

## Files

Yours: `api/src/**`, `docs/specs/US-T014-question-image.md`, `docs/user_stories.md`,
`docs/architecture.md`, your row in `docs/work_queue.md`, and the version lines the commit
hook requires (`package.json`, `app/package.json`, `package-lock.json`, the `appVersion`
line of `app/src/app/services/app-state.service.ts`, currently line 67).
`docs/defect_management.md`: append only, as bytes (the file is not valid UTF-8).

Not yours (Claude is editing them now): everything else under `app/`, including the rest of
`app/src/app/services/app-state.service.ts`, `CLAUDE.md`, `docs/handoffs/**`.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset, restore or check out changes you did not make. Read the version from
`package.json` right before committing; the later committer bumps again. Isolated in-memory
stores only: never the shared spreadsheet, MongoDB, Mux or GitHub. No servers on ports 3001
or 4200. Run `npm run api:test`, `npm run verify:journeys`, `npm run api:build`,
`npm run app:test` and `npm run app:build:pages`. A frontend failure caused by Claude's
unfinished files under `app/` is reported, not fixed, and does not block your commit. If you
need a file outside your list, do NOT stop: finish and commit everything that does not
depend on it, then describe the exact change you need in your queue row. Do not push.
Update your queue row with your commits, what you verified and what you could not, then
stop and summarize, starting with your commit ID.
