# Teacher journey walkthrough — 2026-10-09

Owner: Claude Code. Tree: `main` at `f602307` plus the fixes below (version 0.1.65).
Environment: built frontend served locally, in-memory API (`NODE_ENV=test`), demo
accounts, Chromium preview pane. No shared Sheet, MongoDB, Mux or GitHub data touched.
This stands in for the live rehearsal in
[teacher-rehearsal-checklist.md](../../release/teacher-rehearsal-checklist.md); it does
not replace it. Video and anything depending on the real stores were not exercised.

## What was walked

| Stage | Result |
| --- | --- |
| Teacher creates a course from the form | Works. Empty form gave "Invalid request body" (fixed, DEF-WALK-03) |
| Thumbnail upload | Works; shown after upload and after reload |
| Add section, rename it | Add works. Rename needed a second click before typing (fixed, DEF-WALK-02) |
| Text lesson: heading, paragraphs | Works |
| Text lesson: attach a file under 4 MB | Works; card shows name and size; saved |
| Text lesson: file over 4 MB, wrong file type | Refused, but a stuck "Uploading 0%" card stayed in the lesson and no message showed (fixed, DEF-WALK-01) |
| Quiz lesson, unfinished | Saves as draft; submit refused with the exact questions to fix |
| Quiz lesson, completed | Works |
| Resources lesson | ZIP upload works. PDF is refused by design (open item O1). A stale error from the previous lesson was shown (fixed, DEF-WALK-04) |
| Save, reload | Everything persisted |
| Unsaved-draft recovery after reload | Offer shown; restore and discard both work |
| Submit for review | Works; course frozen, history shown |
| Admin: read-only lesson preview | Works, including lesson text and attachment download |
| Admin: return without a reason | Refused with a clear message |
| Admin: return with a reason, resubmit, publish | Works; course appears in the public catalog |
| Admin: catalog settings (category, language) | Works |
| Student: enroll (with confirmation) | Works |
| Student: read lesson, download attachment | Works |
| Student: quiz wrong answer, retry, right answer | Wrong: score 0/1, "Try again", no progress. Right: lesson completes |
| Student: progress | 33% after one lesson, 67% after the quiz |

## Defects found and fixed in this delivery

- **DEF-WALK-01 (P2)** A refused attachment left a permanent "Uploading 0%" card in the
  lesson text and showed no error in the text editor. Cause: the editor inserted the card
  before the file was checked, and the error was only rendered in the resources panel.
  Fix: the type/size rules moved to `app/src/app/utils/attachment-rules.ts`, shared by the
  editor and the state service; a refused file gets no card; any upload that does not
  complete removes its card; the text editor shows the error. Verified in the browser and
  in `course-save.spec.ts`.
- **DEF-WALK-02 (P3)** Clicking "Rename" on a section made the title editable but did not
  focus it, so typing did nothing. Fix: focus and select the title. Verified in the browser.
- **DEF-WALK-03 (P3)** Saving a course without a title, level or description answered
  "Invalid request body". Fix: the editor names what is missing before sending. Verified
  by `course-save.spec.ts`; not re-walked in the browser.
- **DEF-WALK-04 (P3)** An attachment error from one lesson stayed visible in the next
  lesson's editor. Fix: opening a lesson editor dismisses it. Not re-walked in the browser.

## Open items (not fixed)

- **O1 — decision needed.** Resources lessons accept ZIP, PowerPoint and images only; a
  PDF or Word file is refused (text lessons accept them). A teacher is likely to try a PDF
  handout as a resource. Recommendation: allow PDF and Word in resources (editor and API).
- **O2** A "fix these quiz questions" message from a refused submission stays visible
  after the questions are fixed and saved, until the next submit.
- **O3 — accessibility.** Course form fields are announced by their placeholder text; the
  four "Add" buttons in the lesson-type picker share one name; lesson attachment cards
  expose an invisible "Remove <file>" button to learners' screen readers.
- **O4 — wording.** "1 SECTIONS", "1 questions", the quiz question shown twice, and
  "100% through questions" before answering. Opening `/courses/new` sends one request
  that always returns 404.
- **O5** Each interrupted session leaves its own local draft; two were listed after two reloads.

## Not covered here

Video upload and playback (needs real Mux; US-T006 in progress), editing a published
course through "Start revision", price setting, mobile layout, and everything specific to
the real Google Sheet and MongoDB. These remain in the live rehearsal checklist.
