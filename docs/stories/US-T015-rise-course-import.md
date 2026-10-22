# US-T015: Import a course exported from Articulate Rise (SCORM)

## Record

- Story: US-T015, [backlog](../user_stories.md#us-t015--import-a-course-exported-from-articulate-rise)
- State: Proposed (the defaults below are built unless Alex changes them)
- Owner: not selected
- Related defects: none
- Branch/base: `main`
- Product decisions: D1–D12 below, defaults chosen by Claude on 2026-10-22, each **confirm or change**
- Plan: [superpowers/plans/2026-10-22-US-T015-rise-course-import.md](../superpowers/plans/2026-10-22-US-T015-rise-course-import.md)

## Problem and outcome

As a teacher moving from our old platform, I want a course exported as SCORM to become a normal QI
Academy course, so that learners get our video player, quizzes and progress without the course
being rebuilt by hand.

Observed on 2026-10-22 in `C:\Users\Alex\scorm-import\istqb-foundation-repetition-scorm2004_4-HHIGx9Qp.zip`
(2.18 GB, 276 files):

- An **Articulate Rise 360** export, SCORM 2004 4th edition, one course: "ISTQB Foundation
  repetition" (Danish), author "Info TestHuset".
- The whole course is JSON, base64-encoded in `scormcontent/runtime-data.js`
  (`__jsonp("runtime-data.js","<base64>")`). Media is in `scormcontent/assets/`.
- 7 Rise lessons; 81 topics, each a numbered divider followed by a heading; 88 videos (MP4, 2.1 GB,
  430 minutes, 2–88 MB each, every file present); 49 single-question knowledge checks (44 multiple
  choice, 5 multiple response, 4–5 answers, per-answer feedback); 8 PDFs (0.9–6.6 MB); 6 short
  paragraphs (a link to the ISTQB glossary quiz); one intro text; cover image `IMG_3717.jpg` (169 KB).
- Over our current limits: 3 answers above 300 characters (longest 460), 1 answer feedback above
  500 characters (1,140), 2 PDFs above the 4 MB attachment limit (Kapitel 4: 4.4 MB, Kapitel 5:
  6.6 MB).

Success: running the importer once gives a draft course of 7 sections and 138 lessons (88 video, 35
quiz, 8 resources, 7 text; checked by the dry run on 2026-10-22), with every video playing from Mux. The teacher then reviews it and submits it like any other draft.

## Decisions (confirm or change)

| # | Decision | Default |
| --- | --- | --- |
| D1 | How SCORM gets in | Converted into native lessons by a command-line importer that Claude runs on Alex's PC against the API. Not a SCORM player, and no upload page (the host refuses bodies over 4.5 MB). |
| D2 | Which exports | Articulate Rise only. Storyline, Captivate and other tools compile slides to JavaScript and are refused with a clear message. |
| D3 | Structure | Rise lesson → section. Video → video lesson. Consecutive knowledge checks → one quiz lesson. PDF → resources lesson. Other text → text lesson. Dividers, "continue" buttons and the hero image are dropped. |
| D4 | Lesson titles | A video takes its topic heading ("01.01 Hvad er test?"), or the Rise lesson title when there is none; a second video in one topic gets " (del 2)". A quiz is "Videnstjek: <topic heading>". A resources lesson takes the PDF's original name without ".pdf". A heading outside a topic title that fits a title (≤ 200 characters) names the next video or text lesson instead of becoming a lesson ("04.06 Løsning \| Grænseværdianalyse"). |
| D5 | Quiz grading | Pass mark = every question in the quiz. Multiple-response questions keep all their correct answers. Answer labels "a)", "b)" are kept as written. |
| D6 | Feedback | Each answer's Rise feedback becomes that answer's description. The correct answer's feedback also becomes the question's explanation, which learners see after answering. |
| D7 | Text over our limits | Raise the answer text limit from 300 to 600 characters, and the answer description and question explanation limits to 1,500 (from 500 and 1,000), rather than shortening imported text. Nothing is ever cut silently. The editor's explanation field allows 1,500 characters too; answers have no editor cap. |
| D8 | PDFs over 4 MB | Skipped, with each name listed in the import report. The resources lesson is still created. The teacher uploads a compressed copy in the course editor before submitting for review. |
| D9 | Course details | Title, description and teacher name come from Rise (title trimmed; description as plain text). Level "Foundation". The cover image becomes the thumbnail. Category, language and price stay admin settings. |
| D10 | Owner | The teacher account the importer signs in as. Alex types its password when asked; it is never stored or passed on the command line. |
| D11 | Where it runs | A dry run reads and checks everything without writing. The real run goes to the hosted API, because Mux only reports finished videos there. The result is a draft, invisible to learners until an admin publishes it. Order: push, confirm the hosted API answers with the new quiz limits, then import. After the first video the importer waits up to 2 minutes for Mux's webhook and stops if it never arrives. |
| D12 | Mux cost | Fits the Launch plan (checked by Alex 2026-10-22: $100 usage credit/month, 100k free delivery minutes). Uploads use `basic` quality. Full run-throughs of this course: about 230 a month inside the free minutes. |

## Scope

Included: a CLI that reads an extracted Rise export, plans the course, checks it against the
content schema, and creates it through the existing routes; resuming an interrupted run; raising
the two quiz text limits.

Excluded: SCORM runtime tracking (completion signals, suspend data), Rise styling and fonts,
Rise "AI tutor" settings, other authoring tools, an upload page, captions (Rise has none here),
importing progress or learners from the old platform.

## Behavior contract

```gherkin
Feature: Import a Rise course
  Scenario: US-T015-AC01 Dry run reports the planned course without writing
    Given an extracted Rise export folder
    When the importer runs with --dry-run
    Then it prints the sections and lesson counts per type, video minutes and upload size
    And it lists every skipped file and every text over a limit
    And no request that writes is sent

  Scenario: US-T015-AC02 Import creates a reviewable draft
    Given a teacher account and a valid Rise export
    When the importer runs against the API
    Then a draft owned by that teacher exists with the Rise title, description and thumbnail
    And its sections and lessons follow the mapping in D3 and D4, in Rise order
    And every quiz passes the "ready for review" quiz checks
    And every video lesson holds a Mux upload and every PDF up to 4 MB is attached

  Scenario: US-T015-AC03 Not a Rise export
    Given a folder without scormcontent/runtime-data.js
    When the importer runs
    Then it stops with "Only Articulate Rise exports can be imported." and writes nothing

  Scenario: US-T015-AC04 Resume after an interruption
    Given an earlier run stopped part-way and printed the course id
    When the importer runs again with --course <id>
    Then the course is not created again and its lessons are not overwritten
    And only videos without a usable Mux upload and missing attachments are uploaded

  Scenario: US-T015-AC05 Wrong account
    Given a student account or a wrong password
    When the importer runs
    Then it stops with the API's message and creates nothing

  Scenario: US-T015-AC06 Long quiz text is kept whole
    Given an answer of 460 characters and correct-answer feedback of 1,140 characters
    When the course is imported
    Then the answer, its description and the question's explanation are stored in full
```

## UI and accessibility

No new screen. The course editor's answer text field accepts 600 characters (D7). The importer's
output is plain text: one line per step, a final report, and the course id.

## API, storage, and compatibility

No new route. The importer uses `POST /auth/login`, `POST /courses`, `PATCH /courses/:id/content`
(with `X-Course-Revision`), `PUT /courses/:id/content/components/:componentId/attachments`,
`POST /courses/:id/content/components/:componentId/mux-upload`, `DELETE …/mux-video` (resume only)
and `PUT /courses/:id/thumbnail`. Section and lesson ids are the Rise ids, which makes a resumed run
find its own lessons. Raising the two limits is backward compatible: existing content stays valid,
and an older frontend only limits typing.

## Implementation checklist

See the [plan](../superpowers/plans/2026-10-22-US-T015-rise-course-import.md).

## Verification and delivery

| Scenario | Test or manual check | Result/evidence |
| --- | --- | --- |
| US-T015-AC01 | `riseImport.test.ts`, `riseImportCommand.test.ts`; dry run on the real export | Pass 2026-10-22: 7 sections, 138 lessons (88 video, 35 quiz, 8 resources, 7 text), 88 videos ≈ 472 min (rounded up per video), 2,119.9 MB; skipped Kapitel 4/5 PDFs, 7 continue and 1 hero block; no problems |
| US-T015-AC02 | `riseImportRun.test.ts` (in-process API, in-memory stores, fake Mux); local run on ports 3001/4200 | Pass 2026-10-22 locally: draft with thumbnail, 138 lessons, 6 PDFs, quiz shown correctly in the editor; stopped at the first video (local Mux not configured) as expected. **Hosted run and video playback: not done** |
| US-T015-AC03 | `riseImport.test.ts`, `riseImportCommand.test.ts` | Pass 2026-10-22 |
| US-T015-AC04 | `riseImportRun.test.ts` (simulated Mux webhook through `/webhooks/mux`) | Pass 2026-10-22 |
| US-T015-AC05 | `riseImportRun.test.ts` | Pass 2026-10-22 |
| US-T015-AC06 | `api/src/courseContent.test.ts` | Pass 2026-10-22 |
