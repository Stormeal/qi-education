# Course editor

## Purpose

Teachers create and edit their own courses step by step without losing work; admins can edit
any course.

## Behavior

- **Who can author**: every signed-in role can create a draft (`POST /courses`); the creator
  becomes the owner. Afterwards only the owner teacher or an admin can change the course. Legacy
  courses without an owner are admin-only. Ownership cannot be transferred by editing.
- **Guided form** (`/courses/new`, `/courses/:id/edit`): steps Essentials → Learner fit →
  Thumbnail → Course content → Publishing, one open at a time, with a checkmark once its required
  fields are filled. Required fields (title, teacher, level, description) carry an asterisk.
  Thumbnail, Course content and Publishing open once the course has been created.
  Requirements and "What you'll learn" show a bullet on each new line; empty bullets are not saved.
- **Live courses**: a published, archived or in-review course opens read-only with a notice that
  explains why, and a **Start revision** button when that is the way forward
  (see [review and publication](review-and-publication.md)).
- **Unsaved changes**: leaving with unsaved metadata, outline or lesson text asks first (links,
  Cancel, Back, switching course, logout; the browser asks on refresh or closing). Stay keeps the
  edits and the history position. A forced session expiry clears private state without asking.
- **Draft recovery**: unsaved work is also kept in the browser per account and course for seven
  days (max 2 MB). Returning offers **Restore** or **Discard**, with a chooser when several drafts
  exist. A successful save or an explicit discard removes the record. Storage failures are shown.
- **Saving**: full saves send the loaded revision (`X-Course-Revision`). A missing revision answers
  428; a stale one answers 409 `AUTHORING_CONFLICT` and nothing is overwritten: the local edits stay
  and the teacher compares, reconciles or discards. Metadata and lessons save one after the other;
  when only the metadata succeeds the page says which part is saved and a retry sends only the rest.

## Code

- App: `pages/course-editor-page/`, `routes/course-editor-route.ts`, `ui/course-draft-status/`,
  `services/course-draft-recovery.service.ts`, `utils/course-form-steps.ts`,
  `utils/course-permissions.ts`, `utils/bullet-list.ts`; save, snapshot and conflict logic in
  `AppStateService`; unsaved-change guards in `app.routes.ts`.
- API: `POST /courses`, `PATCH /courses/:id`, `PATCH /courses/:id/content`; ownership in
  `courseAccess.ts` (`canAuthorCourse`); revision checks in `courseReview.ts`.

## Limits

- Recovery after a newer save on another device needs manual comparison; there is no merge.
