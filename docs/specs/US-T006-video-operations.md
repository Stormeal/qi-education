# US-T006 — Video operations

Owner: Codex. Selected 2026-10-09. Base: `f602307`; isolated clone, main.
Scope includes INV-002 and INV-016 / US-P008-AC04. No live provider calls.

## Decisions and scenarios

- VO-01: Removing a video detaches it first. Delete its asset only when no
  published or working component still references it. Provider failure logs a
  cleanup record and the teacher can upload again. Repeated removal is safe.
- VO-02: Direct uploads use public playback. Signed configuration is rejected
  before creating a client. Signed-only ready events cannot create playable state.
- VO-03: Waiting, uploading, processing, ready and error states explain next
  actions. Pending videos resume polling on editor entry. After ten minutes the
  panel explains the delay and offers removal/re-upload; polling continues.
- VO-04: Removed/replaced videos are not restored by delayed callbacks. Preserve
  published media while editing a working revision.
- CI-01: CI runs on pull requests and pushes to main. Pages workflow unchanged.

## Implementation and verification sequence

1. Reproduce missing deletion and signed configuration with stubbed Mux.
2. Add reference-aware best-effort removal and public-only guards.
3. Reproduce polling timeout and missing recovery text; fix only video behavior.
4. Add main CI trigger. Run journeys and API/frontend tests/builds before commit.

## Live rehearsal gaps

Stub evidence cannot verify Mux credentials/permissions, direct-upload CORS and
expiry, real browser upload progress/retries, provider cancellation and deletion
including upload/asset races, webhook signature verification/delivery/retries,
real transcoding latency/errors, public playback and thumbnails on the hosted
teacher/student pages. Rehearse sections 2 and 6 with a disposable video; test
removal/re-upload, delayed processing, and retained published playback. Cleanup
logs must be reviewed if provider deletion fails. No live verification authorized.


## Verification, 2026-10-10

- Confirmed RED at the baseline: deletion made no provider call; signed client
  configuration accepted; reopening a pending video made one read only; errored
  and ten-minute panels lacked recovery text. Provider create outage returned 500.
- Review found terminal media was not displayed with unsaved text. A RED test
  reproduced it; the fix merges only matching upload media state, preserving
  lesson text, original revision and conflict safeguards.
- Uploads with no progress for ten minutes abort and release busy state; errors
  offer removal/re-upload. Continuing progress resets the inactivity timer.
- `api/src/muxService.test.ts`: VO-01 ownership/cancel-race/404; VO-02 signed refusal.
- `api/src/muxRoutes.test.ts`: VO-01/04 retained live/working references, failed
  cleanup, repeated removal, replacement upload and delayed callbacks; VO-02
  signed-only callback; VO-03 unavailable provider and safe retry.
- `app/src/app/services/course-media.spec.ts`: resumed polling beyond one minute,
  terminal refresh with unsaved text, transient failure retry, pending navigation
  response discard, stalled upload/removal/re-upload.
- `course-builder-video.spec.ts`: error and ten-minute delay recovery copy.
  Existing video navigation test fixture now supplies a pending video.
- CI event stanza inspected locally: PR and main push; Pages workflow has no diff.
  Actual GitHub CI execution and deployment gating remain unverified without push.
- Required checks pass: API build, 328 API tests, 135 frontend tests, Pages build,
  and all six cross-role journeys. Existing three SCSS size warnings remain.
- Independent review: no remaining important finding. No live provider or hosted
  browser test. New specs clear localStorage and sessionStorage before each test.

The ten-minute processing warning uses first observed pending age, seeded from
content update time on reopen. Without a persisted media start timestamp,
subsequent saves before reopen can delay that warning. Cleanup calls have a
five-second timeout per request and no SDK retries; failures retain identifying
logs for operator follow-up. Retained published assets are not cleaned up on a
later publication by this scoped removal change.
