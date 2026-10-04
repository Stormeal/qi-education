# US-T001: Course ownership

State: Done; implementation and local acceptance checks complete.
Delivery commit: `a9940ccd9fc13a149b5eb96017c5484796b0012d`.
Implementation base: `main` at `ae9794a` after audit `6e19213`.
Decision and local verification date: 2026-10-04.
Story: [US-T001](../user_stories.md). Defect: [DEF-001](../defect_management.md).

## Problem and outcome

At the audit baseline, `requireCourseCreator` checked teacher/admin role without
a relationship to a course. Any teacher could edit another teacher's course. The
record had a free-text `teacher` display name but no authenticated owner ID.

The user selected this policy: **teachers edit their own courses; admins edit
all courses**. Enforce it at the API before storage or media side effects, and
show the same capabilities in the UI.

## Scope and exclusions

Include ownership on creation, authoring authorization, persistence, frontend
editor entry, and safe migration of existing records. Cover metadata, content,
thumbnails, attachments, and Mux upload/removal operations.

This story does not implement collaboration, teacher account administration,
ownership transfer UI, review transitions, or learner entitlement rules. Review
permissions are US-T002; full learning access is US-L001. Reuse the ownership
predicate later; do not treat this story alone as fixing all course access defects.

## Contract

### Identity and persistence

- Add `ownerUserId` to course metadata and the matching Angular DTO. It references
  the authenticated user ID, not email or the editable teacher label.
- Append it as column U to the existing 20-column Courses schema (`A:T`). Preserve
  existing column positions. Repository ranges must be derived from the header
  count, not a hardcoded outdated range.
- API creation establishes the owner from the authenticated user for teachers
  and admins. Ignore or reject client ownership assignment consistently; it must
  never assign an arbitrary owner. General update requests cannot change ownership.
- Legacy rows without this column parse with an empty owner. They remain readable
  under existing read rules and editable only by admins until deliberately mapped.
- Renaming `teacher` or changing display names cannot change authoring rights.
- Do not guess ownership from a name match. An explicit migration mapping from
  course ID to verified user ID can be prepared separately if legacy ownership is needed.

### Authoring authorization

An authenticated active admin may author any existing course. An authenticated
active teacher may author only a course whose nonempty `ownerUserId` equals their
user ID. Students cannot author courses. Unauthenticated writes return 401;
authenticated but forbidden authoring returns 403; nonexistent courses return 404.

Run this check before saving anything or calling Mux. Preserve successful response
shapes except the added owner field. Cover both normal and `/api` prefixed routes,
including raw upload routes registered before prefix normalization:

| Operation | Route |
| --- | --- |
| Metadata save | `PATCH /courses/:id` |
| Outline save | `PATCH /courses/:id/content` |
| Thumbnail upload | `PUT /courses/:id/thumbnail` |
| Attachment upload | `PUT /courses/:id/content/components/:componentId/attachments` |
| Attachment removal | `DELETE /courses/:id/content/components/:componentId/attachments/:assetId` |
| Mux upload | `POST /courses/:id/content/components/:componentId/mux-upload` |
| Mux detachment | `DELETE /courses/:id/content/components/:componentId/mux-video` |

Asset IDs are references, not permission grants. New courses must upload their
thumbnail after creation; nonempty client thumbnail assignments return 403 before
course/content creation. Content saves and attachment removal reject existing
assets belonging to another course with 403 before writes. Asset deletion always
includes course ID in the storage operation. Replacing an old foreign thumbnail
reference may repair the editable course, but never deletes the foreign image.
Missing legacy attachment assets may still be detached; scoped deletion is a
safe no-op when no matching stored asset exists.

The separate admin-only price/catalog metadata routes keep their existing role
restriction. Signed webhook verification remains the webhook trust boundary;
webhooks have no interactive teacher session.

### Frontend behavior

Derive editing capability using the authenticated user ID and course owner. Hide
Edit actions for unrelated teachers; make My drafts show only the teacher's own
unpublished courses. Admins retain access to all courses. Opening an unauthorized
editor URL must show a useful denied state without editable controls. This check
supports the UI; server checks remain mandatory.

If a save is denied after the editor was opened, show the API's error and retain
local edits. Do not change successful save behavior or general learning access in
this story. Do not remove a learner's enrollments during migration.

## Acceptance and verification

The full BDD contract is US-T001-AC01 through AC05 in the backlog. Additional
boundary cases below refine those scenarios, rather than add a competing story.

| Scenario | Verification required | Evidence |
| --- | --- | --- |
| AC01 authenticated ownership | API creation test with forged owner field; Sheets roundtrip | Passed: `courseOwnership.test.ts`; current/legacy mapper tests |
| AC02 unrelated teacher denial | Two-teacher tests for every authoring route and `/api` aliases; assert no side effects | Passed: all 14 routes, unchanged data and no storage/Mux writes |
| AC03 owner/admin authoring | Successful metadata/content/upload cases; immutable owner | Passed: all seven operations for each actor/prefix; owner browser create/save |
| AC04 legacy and editor entry | Old 20-column row; teacher denied/admin allowed; direct URL browser check | Passed: API legacy restriction; unrelated teacher denied URL; admin legacy browser save |
| AC05 foreign media references | Forged bindings/deletion/cleanup through an owned course | Passed: eight API regressions and memory/Mongo deletion boundary tests |
| Identity boundary | Editing teacher label/display name does not grant or remove ownership | Passed: same-name teacher denial; renamed instructor still owned in API, UI, and browser |
| Authentication boundary | Anonymous 401, student 403, disabled user denied, missing course 404 | Passed: all seven operations in API tests |

Test double methods should record storage/media calls so a 403 cannot conceal a
performed side effect. Exercise at least one full owner save from the browser and
one unrelated teacher's direct editor URL.

## Affected implementation areas

- `api/src/course.ts`, `courseRepository.ts`: DTO/schema/Sheets/in-memory roundtrip.
- `api/src/server.ts`: shared course authorization and all authoring paths.
- `app/src/app/app.models.ts`: owner ID in the course DTO.
- `app/src/app/services/app-state.service.ts`, `course.service.ts`: authoring capability
  and request compatibility.
- Catalog, course details, and editor route/page components: capability-driven actions.
- Existing API course/server tests and relevant Angular tests: contract verification.

## Completed implementation checklist

1. Reproduced DEF-001 with two teachers and an admin, including foreign media references.
2. Added owner metadata and legacy/current persistence roundtrip tests.
3. Applied shared authorization to all authoring routes and scoped asset deletion.
4. Updated frontend capabilities and direct-route denied behavior.
5. Passed API/frontend tests, builds, and owner/admin/unrelated teacher browser flows.
6. Recorded story/defect/queue scenario evidence and delivery commit.

## Migration and release

Appending a column is backward compatible for existing rows. Verify reads and
writes on a test spreadsheet before applying to shared data. Mapping legacy
owners is a separate explicit data operation, never a blind display-name migration.
Existing clients need an updated course DTO and editing capability before release.

No implementation or migration was performed during the documentation audit.
Implementation is now locally verified; no shared spreadsheet was changed.
See [verification record](../verification/2026-10-04/DEF-001.md) for checks and
the release gate. Owner transfer and legacy mapping remain outside this delivery.
