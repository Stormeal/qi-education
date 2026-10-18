# Video lessons

## Purpose

Teachers upload a video straight from the browser; learners watch it in the learning page.

## Behavior

1. The editor asks the API for an upload URL
   (`POST /courses/:id/content/components/:componentId/mux-upload`); the API asks Mux.
2. The browser uploads the file directly to Mux with UpChunk. An upload with no progress for ten
   minutes is aborted and can be retried.
3. Mux calls `POST /webhooks/mux` (also `/api/webhooks/mux`), signed. The passthrough payload
   `{ c, s, m }` names the course, section and component; the handler finds the component by its
   stable ID in the live and working versions (even after a move) and stores the asset and
   playback IDs.
4. The panel shows waiting, uploading, processing, ready and error states with what to do next.
   Pending videos resume polling when the editor opens; after ten minutes it explains the delay
   and offers remove and re-upload.

## Rules

- Playback is public; signed playback configuration is refused.
- Removing a video detaches it first; the Mux asset is deleted only when no live or working
  version still uses it. A failed provider cleanup is logged and does not block the removal.
- Late or duplicate callbacks never bring back a removed or replaced video.
- A video lesson is complete once 90% has been watched (see [learning page](../learning/learning-page.md)).

## Code

- API: `muxService.ts`, Mux routes and webhook in `server.ts`.
- App: video panel in `ui/course-builder/`, upload and polling in `AppStateService`
  (`createChunkedUpload` is replaceable in tests), player in `pages/learning-page/`.

## Limits

- "Video uploads are temporarily unavailable" means Mux refused step 1; the reason is only in the
  hosted API log (`Mux upload creation failed`).
- Real provider upload, webhook delivery and playback are not covered by automated tests.
