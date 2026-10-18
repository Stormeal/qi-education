# Lessons and the course builder

## Purpose

Teachers organise a course into chapters of lessons and fill each lesson with text, files,
exercises, quizzes or video.

## Behavior

- A course has **sections** (chapters) of **components** (lessons). Lesson types:
  - `text`: rich text, with optional files.
  - `resources`: files and links.
  - `exercise`: instructions (a line starting with `-` becomes a list item), an optional link and
    files. No solution or grading; it completes like a text lesson.
  - `quiz`: see [quizzes](quizzes.md).
  - `video`: see [video](video.md).
- The builder (`ui/course-builder/`) adds, edits, reorders and removes lessons in a modal editor.
  Lessons move between chapters by dragging (onto a lesson or a chapter's end, including empty or
  collapsed chapters) or with a labelled chapter select. A move keeps the lesson's ID, content and
  media, and is saved like any other outline change.
- Moves and media actions are refused while the outline is busy (saving, uploading, recovering,
  submitted for review).
- **Attachments**: at most 4 MB each. Text and resources lessons accept their listed document and
  image types; exercises accept ZIP, PDF, Word, PowerPoint and images; quizzes accept JPEG, PNG and
  WebP only. Files are stored with the course and lesson they belong to.
- **Thumbnail**: JPEG, PNG or WebP, at most 2 MB.
- Stored lesson HTML is rendered inert in the editor, so authored markup cannot run script.

## Rules

- Section, component, question and answer IDs must be unique within a course; saves with duplicates
  are refused.
- Removing a file from a working revision keeps the bytes while the published version still uses them.
- Learners can download only files of the live (published) version; owners and admins also the working one.

## Code

- App: `ui/course-builder/`, `utils/attachment-rules.ts`, `utils/inert-html.ts`,
  `utils/lesson-content.ts`; move and upload handling in `AppStateService`.
- API: `courseContent.ts` (schemas), `courseContentRepository.ts`, `courseAssetRepository.ts`;
  routes `PUT /courses/:id/thumbnail`, `PUT/DELETE …/components/:componentId/attachments`,
  `GET /courses/:id/content/attachments/:assetId`.
