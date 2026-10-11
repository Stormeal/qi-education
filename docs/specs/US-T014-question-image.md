# US-T014: Optional quiz question image

## Record

- Story: [US-T014](../user_stories.md), AC01 and AC02.
- State: API increment delivered locally, selected 2026-10-11;
  combined frontend/browser acceptance remains open with Claude.
- Owner: Codex API; Claude Code frontend and combined browser acceptance.
- Branch/base: main / 0648742 (required ancestor confirmed).
- Related defects: none reproduced; adding a new field/upload capability is feature work.
- Assignment and approved contract: [handoff](../handoffs/US-T014-question-image-codex.md).

## Problem and outcome

As a teacher, I want an optional image on a quiz question, so I can assess
understanding of visual material. Save/reopen and entitled learning retain the
image and alternative text, while removal keeps the question and answers intact.
Text-only questions and the deployed frontend's existing requests keep working.

## Scope and decisions

Lead decisions (confirm or change), taken from existing precedents:
- One optional image per question, stored as an ordinary attachment of its quiz lesson.
- JPEG, PNG and WebP only for quiz uploads; existing 4 MB attachment limit.
- Optional alternative text, trimmed, 0..300 characters; no new readiness rule.
- Removing an image uses attachment deletion and clears every reference in that lesson.
- Existing attachment storage, download permissions and review snapshots are reused.

No frontend edits (except the required version line), new storage, new download
route, migration, format sniffing, readiness/alt requirement, shared-provider
mutation or deployment is included. Existing video/text/resources upload behavior
and all download permission rules remain unchanged.

## Behavior contract

```gherkin
Feature: Question images
  Scenario: US-T014-AC01 Author an optional image
    Given an editable question and the agreed image limits
    When I attach an allowed image with alternative text
    Then saving and reopening retains it with that question
    And text-only questions keep working

  Scenario: US-T014-AC02 Present and remove safely
    Given an entitled learner and a published question image
    When they read the quiz and download its attachment
    Then image metadata and bytes are available without correct answers
    When the author removes it from an editable revision
    Then references clear together with the lesson attachment in one content write
    And question text and answers remain
    And the published copy keeps its image until the replacement is published

  Scenario: US-T014-AC03 Restrict quiz uploads
    Given an owned editable quiz lesson
    When I upload JPEG, PNG or WebP up to 4 MB using existing attachment headers
    Then I receive the existing 201 attachment/content response
    And other MIME types get 415 with only a message
    And oversized requests get the existing 413

  Scenario: US-T014-AC04 Validate reference and alternative text
    Given a content save containing a question image
    When its asset is missing, non-image, outside the lesson or outside the course
    Then I receive 400 with only a Question N message and no content write
    And forged attachment metadata cannot grant permission to a foreign asset
    When alternative text exceeds 300 characters or is not a string
    Then saving fails without replacing previous content

  Scenario: US-T014-AC05 Retain legacy clients and private answers
    Given stored or submitted questions without the image field
    When they are read or saved
    Then absent images read and save as null without migration
    And the learner question contains only whitelisted image fields
    And public outlines contain no image or quiz answer keys
    And both existing quiz attempt routes still grade image questions

  Scenario: US-T014-AC06 Preserve review and entitlement
    Given draft, submitted, published and replacement revisions
    When an author uploads, saves, submits, publishes or deletes images
    Then frozen submissions remain immutable and live image bytes survive draft deletion
    And only existing author/admin or enrolled learner permissions permit downloads
    And unauthorized or unowned asset requests disclose no bytes

  Scenario: US-T014-AC07 Preserve work on provider failure
    Given an isolated asset/content failure
    When a question image upload, save or delete is attempted
    Then the existing safe error path reports failure
    And a failed content delete does not clear the attachment asset
```

## UI and accessibility

Claude implements editor upload/preview/alt/removal and learner rendering, including
loading/errors and keyboard/accessibility. API tests do not establish those flows.
Alternative text is plain text; the frontend renders it as an image alt attribute.

## API, storage and compatibility

Stored question gains `image: { assetId: string, alt: string } | null`, default
null. Asset ID follows attachment ID bounds; alt is trimmed, at most 300 JavaScript
string characters, and defaults to empty text if omitted. Saves omitting image
clear any prior image as required by the deployed-client contract.

Existing `PUT /courses/:id/content/components/:componentId/attachments` accepts
quiz images via its raw body, X-Section-Id and X-File-Name headers, retaining
201 `{ attachment, content }`, size limit, course locks and revision guards.
Only quiz MIME policy is added: JPEG/PNG/WebP; text/resources GIF/document rules
and unsupported video behavior remain unchanged. Both prefixes are covered.

`PATCH /courses/:id/content` validates image membership in that quiz's submitted
attachments plus actual stored asset course/component/MIME. Missing or forged
references return message-only 400 in the existing Question N style, before the
generic foreign-attachment 403. A new asset metadata lookup projects course ID,
component ID and content type so validation does not load image binary; the old
owner-only lookup and its responses stay unchanged. Non-image question
validation and generic attachment behavior keep their existing responses.

Learner projection explicitly returns image `{ assetId, alt }` or null; author
read normalizes absent legacy images to null. Correct answers/explanations remain
private before grading; outlines remain title/type/duration only. Both grading
routes normalize old/new questions without adding image-based readiness rules.

Existing download route and permissions remain unchanged, including existing
admin/archived-entitlement behavior. Delete removes the lesson attachment and
nulls every matching question image in one content snapshot write before asset
cleanup. Existing cleanup retains bytes referenced by the published snapshot.
Questions sharing an attachment are all cleared; unrelated references/lessons
and answers are preserved. Review snapshots carry images with attachments.

## Implementation checklist

Use the supplied design and implement inline in the requested shared checkout;
the plan lives here rather than outside the owned files.

- [x] Write spec first; mark own queue row with main/base and next step.
- [x] Write `api/src/questionImage.test.ts`: model, learner privacy, isolated HTTP
  upload/save/download/delete/review/grading/legacy/failure cases; watch feature RED.
- [x] Extend `courseContent.ts` question schema; normalize legacy author/learner
  output in `courseReview.ts` and `courseAccess.ts`.
- [x] Add attachment metadata lookup in both repository implementations, tested
  against memory and a fake Mongo collection without a connection.
- [x] Add `questionImage.ts` for format/reference validation; wire quiz upload MIME
  handling, image reference validation and delete reference
  clearing in `server.ts`, preserving existing lifecycle/download/readiness paths.
- [x] Focused GREEN, independent read-only review, all five required checks;
  update architecture/backlog/spec/own queue row while retaining frontend acceptance.
- [x] Fresh aligned version bump; path/hunk-only staging; local commit; record hash
  with verification limits in own queue row; stop without pushing.

## Verification and delivery

Implementation: `5b67f16` (0.1.121), locally on main after Claude frontend
`a7f66f7`. This delivery-record commit carries its own aligned hook-required
patch bump; no push or deployment. Only the appVersion hunk was staged from
the shared AppStateService; all other frontend edits belong to Claude.

| Scenario | Evidence | Result |
| --- | --- | --- |
| AC01/03/04 | Model null/trim/300; JPEG/PNG/WebP, disallowed MIME/4 MB; missing/foreign/other-lesson/non-image/unattached/forged-MIME rejection without write; projected Mongo metadata double | API passed; frontend pending |
| AC02/06 | Owner/admin/published enrolled downloads; anonymous/outsider/draft learner denial; all references clear in one write, answers and other lessons retained; frozen submission and replacement live image retention | API passed; browser pending |
| AC05 | Legacy author read without storage rewrite, learner image whitelist/no keys, clean outline and both grading routes | Passed in isolation |
| AC07 | Failed upload snapshot save removes new asset; failed metadata read leaves content; failed delete snapshot save retains image asset/reference | Passed in isolation |

RED before product changes: `npm --prefix api test -- src/questionImage.test.ts`
reported 44 expected failures and three unchanged behavior passes (47 cases),
including quiz uploads returning 404 and absent image fields/defaults. This was
new-feature absence, not an existing defect; no DEF entry was added. The metadata
lookup was split into a new method to retain the old owner-only projection.
Final focused result: 55 cases pass (seven model/projection, 48 HTTP).

All five required checks pass on the combined checkout with Claude frontend
`a7f66f7` preserved: 649 API tests, six journey checks, API build, 241 frontend
tests and Pages build. The first full API run had one outdated exact shape
assertion (expected no image field); `server.test.ts` now expects the required
default `image: null`, and the complete suite passes. Pages has stylesheet budget
warnings for career-path, course-view-learning and course-builder; frontend tests
emit jsdom scrollTo notices. No failure or hook was bypassed.

Independent read-only review found no remaining backend findings. No outside-scope
file change needed. Frontend/browser AC01/AC02 stays open for Claude's combined
acceptance; this API increment alone does not remove the entire story.

Required checks: `npm run api:test`, `npm run verify:journeys`, `npm run api:build`,
`npm run app:test`, `npm run app:build:pages`. Only isolated memory repositories,
collection doubles and ephemeral loopback ports; never 3001/4200. Real Mongo,
Sheets, Mux, hosted download/deployment and browser/accessibility remain unverified.
API deployment must precede dependent frontend deployment; no push is authorized.

## Frontend acceptance by the lead (2026-10-11)

Frontend delivered in `a7f66f7` (0.1.120) and a focus fix in the lead-check commit. Story Done
locally; removed from the open backlog.

| Scenario | Check |
| --- | --- |
| US-T014-AC01 | `course-quiz-image.spec.ts` (upload goes to the quiz lesson, the question points at the file and is saved at once; a non-image is refused before anything is sent; the description is edited; a question without an image ignores a description), `course-builder-authoring.spec.ts` (Add image passes the chosen file on; image, description field and Remove are shown). Browser, in-memory API, demo teacher: a PDF was refused with "A question image must be a JPEG, PNG or WebP file."; a PNG was uploaded and shown in the editor at its real size; the stored question had the image and the lesson one PNG attachment; after writing a description, Save and reopening, the image and description were still there |
| US-T014-AC02 | Same specs (removal saves the question without the image first, then deletes the file; question text and answers stay), `course-view-page.spec.ts` (image with its description; no image element without one). Browser: Remove image left the question text and four answers, the stored image was null, the lesson had no attachment and the file answered 404. After publishing, the demo learner saw the image (320 by 180, alternative text "A green test pyramid") under the question with four answers; the learner read carried only id, question, points, image, multiple and answers; the image answered 401 without a session and 200 for the enrolled learner |

Decisions taken by the lead (confirm or change): the image sits between the question text and
the answers in the editor and under the question for learners; uploading saves the question at
once so no unused file is left; a failed image download just hides the image.

Found in the combined check and fixed: after Remove image, keyboard focus was lost, because
the buttons are disabled while the removal runs. Focus now returns to the image block when the
editor is idle again (regression case "puts keyboard focus back in the image block once a
removal has finished"); in the browser it landed on "+ Add image" after a removal and on the
description field after an upload.

Combined tree: 649 API and 242 frontend tests, six journeys, API and Pages builds pass.
Not verified: how the image looks (the browser pane did not draw, so sizes and text were read
from the page, not seen); a file near the 4 MB limit; real MongoDB; hosted behavior; a screen
reader; phone width. The editor styles for the image live in `app/src/styles.scss` because
`course-builder.scss` is at 15.95 of its 16 kB build limit.
