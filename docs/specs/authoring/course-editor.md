# Course editor

## Purpose

Teachers create and edit their own courses step by step without losing work; admins can edit
any course.

## Behavior

- **Who can author**: every signed-in role can create a draft (`POST /courses`). A teacher creator
  becomes the course's first teacher; an admin creator starts it with none. Afterwards an admin or
  any assigned, active teacher can change the course; a course with no teachers is admin-only.
- **Course teachers** (US-A005): on the Publishing step an admin sees a Teachers panel: assigned
  teachers with name, email, an Inactive tag (disabled, no longer a teacher, or a deleted account)
  and Remove; a search over active teacher accounts not yet assigned, with Add. Each change saves
  at once (`PUT /courses/:id/teachers`, 0–20 teacher accounts), announces "Teachers saved", and on
  failure keeps the previous list with the error. It never touches the course draft. Teachers do
  not see the panel. `ownerUserId` is kept as a copy of the first teacher for older clients.
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
- API: `POST /courses`, `PATCH /courses/:id`, `PATCH /courses/:id/content`; authoring rights in
  `courseAccess.ts` (`canAuthorCourse`, `courseTeacherIds`); teacher list routes in
  `courseTeachersRoutes.ts`; revision checks in `courseReview.ts`.
- App: Teachers panel in `ui/course-teachers/`; `courseTeacherIds` and `canEditCourse` in
  `utils/course-permissions.ts`.

## Limits

- Recovery after a newer save on another device needs manual comparison; there is no merge.
