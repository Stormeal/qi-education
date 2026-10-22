# US-A005: Admins assign a course's teachers

## Record

- Story: US-A005, [backlog](../user_stories.md#us-a005--admins-assign-a-courses-teachers)
- State: Ready (design agreed with Alex on 2026-10-22)
- Owner: not selected
- Related defects: none. Related story: US-T015 (the Rise import runs as an admin; teachers are
  assigned afterwards)
- Branch/base: `main`
- Product decisions (Alex, 2026-10-22): D1–D6 below

## Problem and outcome

As an admin, I want to assign one or more teachers to a course, so that several teachers can
author it and a course created by an admin or the importer gets its real teachers.

Today a course has one owner (`ownerUserId`), set at creation and never changed. Only that teacher
or an admin can author it (`canAuthorCourse` in the API, `canEditCourse` in the app). The owner also
links a published course to that teacher's public instructor description. The free-text "Teacher"
name shown to learners is separate and not linked to an account.

Success: an admin opens a course, adds two teachers on the Publishing step, and both can edit and
submit it; removing one takes their access away at once.

## Decisions

| # | Decision | Choice |
| --- | --- | --- |
| D1 | What assignment gives | Co-author: every assigned teacher can do what the owner does today (details, lessons, media, submit for review). |
| D2 | Model | One list, `teacherIds`. A teacher who creates a course becomes its first entry; an admin who creates one starts with an empty list. Admins can add or remove anyone, the creator included. Replaces "ownership never transfers". |
| D3 | Where admins assign | A Teachers panel on the course editor's Publishing step, admins only. Teachers see nothing new. |
| D4 | When it applies | Immediately, like the price: an admin-only route writes the course record; no review step. |
| D5 | Limits | 0–20 teachers, no duplicates. Each newly added id must be an account with role `teacher`; entries already on the list may stay when they were deleted or demoted (they cannot author and show as Inactive), so an admin can always remove one at a time. An empty list means only admins can author. (Clarified 2026-10-22 in the Codex check.) |
| D6 | Learner-facing name | The free-text "Teacher" field is unchanged. A published course links to the instructor descriptions of all its assigned teachers. |

## Scope

Included: storing `teacherIds`, reading old `ownerUserId` records as a one-entry list, the
authorization change, the admin route, the Teachers panel, "my courses" for assigned teachers,
instructor descriptions for all assigned teachers, business rules.

Excluded: teachers inviting other teachers, per-teacher roles (lead/assistant), assignment history,
notifying a teacher by email, a bulk screen on the Admin page, changing the learner-facing name.

## Behavior contract

```gherkin
Feature: Course teachers
  Scenario: US-A005-AC01 Admin assigns teachers
    Given an admin on the Publishing step of a course with no teachers
    When the admin adds two active teacher accounts
    Then both are listed with name and email
    And the course record's teacher list holds both, saved without a review step

  Scenario: US-A005-AC02 Assigned teachers author the course
    Given a course whose teachers are A and B
    When teacher B saves lessons, uploads a file or submits the course for review
    Then the action succeeds as it does for the course's creator today
    And the course appears in B's own courses in the catalog

  Scenario: US-A005-AC03 Removing a teacher takes access away
    Given a course whose teachers are A and B, and A created it
    When the admin removes A
    Then A can no longer open the course for editing or change it
    And B still can

  Scenario: US-A005-AC04 Only admins change the list
    Given a teacher assigned to the course, or a student
    When they send a new teacher list
    Then the API answers 403 and the list is unchanged

  Scenario: US-A005-AC05 Invalid lists are refused
    Given an admin
    When the list contains an unknown id, a student's id, a duplicate or more than 20 entries
    Then the API answers 400 with a message naming the problem and the list is unchanged

  Scenario: US-A005-AC06 Existing courses keep their owner
    Given a course stored before this change with ownerUserId T
    When anyone reads or authors it
    Then T is its only teacher and keeps authoring it
    And the first admin save of its teachers stores teacherIds, keeping ownerUserId as a copy of the first teacher

  Scenario: US-A005-AC07 Inactive teachers lose access but stay visible
    Given an assigned teacher who is disabled or no longer has the teacher role
    When they try to author the course
    Then they are refused
    And the admin sees them in the panel marked inactive, with Remove

  Scenario: US-A005-AC08 A failed save keeps the panel honest
    Given the admin adds or removes a teacher
    When the save fails
    Then the panel shows the list as it was and an inline error, and the course draft is untouched

  Scenario: US-A005-AC09 Instructor descriptions follow the teachers
    Given a published course with teachers A and B who both have instructor descriptions
    When anyone reads the instructors list
    Then the course is listed under both A and B
```

## UI and accessibility

Publishing step, admins only: a "Teachers" group with the assigned teachers (name, email, an
"Inactive" tag when disabled or not a teacher, a Remove button per row) and a search field over
active teacher accounts not yet assigned (`GET /admin/users?search=`), with an Add button per result.
Each add or remove saves at once and announces "Teachers saved" in a polite live region; buttons are
disabled while saving. On failure the list reverts and an inline error appears under the group.
Empty state: "No teachers yet. Only admins can edit this course." Buttons use the shared
`appButton`; focus moves to the next row (or the search field) after Remove.

## API, storage, and compatibility

- `Course` gains `teacherIds: string[]`. Responses keep `ownerUserId` = `teacherIds[0] ?? ''` so the
  frontend that is live while the API deploys keeps working (it only shows edit links from it).
- Reading: `teacherIds ?? (ownerUserId ? [ownerUserId] : [])` through one helper, `courseTeacherIds`.
  No manual migration. Courses an admin created before this change read as that admin; the panel
  shows them as Inactive, removable.
- `POST /courses`: a teacher creator is stored as `teacherIds: [creator]`; an admin creator as `[]`.
- New `PUT /courses/:id/teachers` (also under `/api`), `requireAdmin`, `withCourseLock`, body
  `{ teacherIds: string[] }`; 404 for an unknown course; 400 per D5; returns the updated course.
  Every write stores `teacherIds` and sets `ownerUserId` to its first entry (or `''`).
- New `GET /courses/:id/teachers`, admin-only: `{ teachers: [{ id, displayName, email, active }] }` in
  stored order, so the panel can name assigned teachers (the user search returns at most 50).
  `PUT` answers with the same shape.
- `canAuthorCourse(course, user)`: admin, or role `teacher`, status active, and `user.id` in the
  normalized list. `canEditCourse` in the app does the same with the list it receives.
- `/instructors`: a published course counts for every id in its list.
- Business rules: replace "A course without an owner (legacy) is editable by admins only. Ownership
  never transfers." with "Admins assign a course's teachers (US-A005); a course with no teachers is
  editable by admins only. Teachers cannot change the list."

## Implementation checklist

See [the plan](../superpowers/plans/2026-10-22-US-A005-course-teachers.md).

## Verification and delivery

| Scenario | Test or manual check | Result/evidence |
| --- | --- | --- |
| US-A005-AC01 | `api/src/courseTeachers.test.ts`; `ui/course-teachers/course-teachers.spec.ts`; browser check | Pass 2026-10-22: API, panel, and in the browser (admin assigned Teacher Demo on a published course, saved without review; desktop and 375 px width) |
| US-A005-AC02 | `courseTeachers.test.ts` (second teacher saves, uploads, submits); `course-permissions.spec.ts`, `courses-page.spec.ts`; browser: assigned teacher's author view 200 | Pass 2026-10-22 |
| US-A005-AC03 | `courseTeachers.test.ts` (incl. a save queued behind the removal); browser: author view 403 after removal | Pass 2026-10-22 |
| US-A005-AC04 | `courseTeachers.test.ts`, `routePermissions.test.ts`; browser: teacher PUT 403 | Pass 2026-10-22 |
| US-A005-AC05 | `courseTeachers.test.ts` | Pass 2026-10-22, incl. the D5 clarification (stored entries may stay; Codex round 2) |
| US-A005-AC06 | `courseTeachers.test.ts`, `mongoCourseRepository.test.ts` | Pass 2026-10-22 |
| US-A005-AC07 | `courseTeachers.test.ts`; panel spec | Pass 2026-10-22 |
| US-A005-AC08 | `ui/course-teachers/course-teachers.spec.ts` | Pass 2026-10-22 |
| US-A005-AC09 | `instructorProfile.test.ts` | Pass 2026-10-22 |
