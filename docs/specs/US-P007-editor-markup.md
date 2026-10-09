# US-P007 (editor half): stored lesson markup stays inert

## Record

- Story: [US-P007](../user_stories.md), AC01 and AC02. The spreadsheet half (AC03,
  AC04, INV-009) is owned by Codex: [spreadsheet text](US-P007-spreadsheet-text.md).
- State: Fixed in code, local commit on `main`, 2026-10-09. Owner: Claude Code.
- Base: `f8d4c2f`.
- Defect: **DEF-P007-EDITOR** (promoted from INV-008), P1. Non-numeric ID to avoid
  colliding with the concurrent API work; add it to `defect_management.md` once
  that work has committed.
- Decision taken (confirm or change): make the editor safe; do not also filter
  lesson HTML on save. The API still stores what an author sends.

## DEF-P007-EDITOR — a teacher's lesson markup can run script for whoever opens the editor

- Expected: stored lesson text is data. Opening a course to edit or review it never
  runs code from its content.
- Cause: `course-builder.ts` parsed stored `component.content` by assigning it to
  `innerHTML` of a `div` created from the page's own document, in four helpers
  (`textOutline`, `renderEditorContent`, `normalizeRichTextHtml`, `htmlToMarkdown`).
  A detached element of the live document still loads images and fires `onerror`.
  The visible editor itself was already safe: it receives a string through an
  Angular `[innerHTML]` binding, which sanitizes.
- Reproduction (2026-10-09, Chromium preview pane, built frontend, in-memory API,
  demo accounts): in the page,
  `d = document.createElement('div'); d.innerHTML = '<img src="x" onerror="window.__mechanism=1">'`
  sets `window.__mechanism` to 1. A teacher can store that markup with
  `PATCH /courses/:id/content`; an admin reviewing the course opens the editor.
- Impact: script in the admin's or owner's session, including access to the stored
  login token.

## Fix

`app/src/app/utils/inert-html.ts` parses markup in a separate, window-less document
(`document.implementation.createHTMLDocument`). The four helpers use it instead of a
live-document `div`. Their output still reaches the page only through Angular
`[innerHTML]` bindings. No dependency added; attachment-card lookup is unchanged.

## Verification

| Scenario | Check |
| --- | --- |
| US-P007-AC01 | `app/src/app/utils/inert-html.spec.ts` (container is outside the page, has no window, keeps identifiers). Browser: teacher saved `<img onerror>` and a card with `onclick` through the API; admin opened the course editor and the lesson editor. `window.__xss` stayed undefined; the rendered editor had the heading, text, image and card with no handler attributes |
| US-P007-AC02 | Browser: the same course opened in the course view; no handler ran and no element carried `onerror`/`onclick` (Angular sanitization, unchanged) |

128 frontend tests and the frontend build pass. Not checked: other browsers, a
lesson with real attachment cards, the hosted site.
