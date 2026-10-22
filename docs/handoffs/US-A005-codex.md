# US-A005 handoff to Codex: course teachers, API part

- Story: US-A005, scenarios AC01–AC07 and AC09 (AC08 is Claude's, UI only).
- Contract: [docs/stories/US-A005-course-teachers.md](../stories/US-A005-course-teachers.md)
- Plan: [docs/superpowers/plans/2026-10-22-US-A005-course-teachers.md](../superpowers/plans/2026-10-22-US-A005-course-teachers.md),
  **Tasks 1–3** are Codex's. Tasks 4–6 (app and docs) are Claude's and run at the same time.
- Folder and branch: `C:\Users\Alex\source\qi-education`, `main` (shared working tree with Claude).
- Base: history must contain the commit `docs(US-A005): handoff to Codex` (Claude keeps committing on top).

## Files Codex owns

Everything under `api/` except `api/dist/`, in particular:

- `api/src/course.ts`, `courseRepository.ts`, `mongoCourseRepository.ts`, `courseStore.ts`,
  `courseRequestReads.ts`, `courseReview.ts`, `courseAccess.ts`, `instructorProfileRoutes.ts`
- `api/src/server.ts`: the `POST /courses` seed (~lines 809–813) and the route registration next to
  `registerCourseLocksRoutes` (~line 586)
- New: `api/src/courseTeachersRoutes.ts`, `api/src/courseTeachers.test.ts`
- Tests to extend: `api/src/mongoCourseRepository.test.ts`, `api/src/instructorProfile.test.ts`
- Existing tests that break because an admin creator no longer becomes owner (likely
  `courseOwnership.test.ts`; also any `CourseRepository` fake in `api/src/server.test.ts`): update
  them to the new rule and name each in your summary.
- Your row in `docs/work_queue.md` (Active work) and this handoff file's "Codex result" section.
- When committing: the four version places (`package.json`, `app/package.json`, `package-lock.json`
  three lines, `app/src/app/services/app-state.service.ts` `appVersion`). Read the version from
  `package.json` right before committing; if Claude committed in between, bump again.

## Files Codex must not edit

`app/**` (except the one `appVersion` line above), `docs/**` other than your queue row and this
file, `.claude/**`, `api/dist/**`. If you need a change outside your list, finish everything else
first, then report the exact file and change in your summary instead of stopping early.

## Contract Claude's side relies on

```ts
// Every course object in API responses (GET /courses, POST /courses, review responses, ...):
//   ownerUserId: string            // always = teacherIds[0] ?? '' once teacherIds is stored
//   teacherIds?: string[]          // present once stored; absent on old records
type CourseTeacher = { id: string; displayName: string; email: string; active: boolean };
// active = account exists && role === 'teacher' && status === 'active'
// deleted account → { id, displayName: '', email: '', active: false }

GET /courses/:id/teachers   (and /api/...)  admin only
  200 { teachers: CourseTeacher[] }  in stored order (old record: [ownerUserId] or [])
  401 no/invalid token · 403 not admin · 404 { message: 'Course not found' }
PUT /courses/:id/teachers   (and /api/...)  admin only, withCourseLock, answers with json
  body { teacherIds: string[] }
  200 { teachers: CourseTeacher[] }   (writes teacherIds and ownerUserId = teacherIds[0] ?? '')
  400 { message }, first failure wins, exact text:
      'Teachers must be a list of at most 20 account ids.'   (not an array of 1–120-char strings, or > 20)
      'Each teacher can be listed once.'
      '<id> is not a teacher account.'                         (unknown id, or role ≠ teacher; disabled teachers are allowed)
  403 not admin · 404 { message: 'Course not found' }
POST /courses: teacher creator → teacherIds [creator], ownerUserId creator; admin creator → teacherIds [], ownerUserId ''
canAuthorCourse: admin, or role 'teacher' && status 'active' && id in courseTeacherIds(course)
GET /instructors: a published course counts for every id in courseTeacherIds(course)
```

## Rules for the shared tree

- Isolated in-memory stores only: in-process tests (`npm --prefix api test`); never shared
  services, never `USE_SHARED_SERVICES=1`. Do not use ports 3001 or 4200 (Claude's browser checks).
- Stage your own files by path. Never `git add -A`; never stash, reset, restore or check out
  Claude's changes. A failure caused by Claude's files is reported, not fixed.
- Do not rebuild `api/dist`.
- TDD per plan step: write the test, watch it fail, implement, watch it pass.
- Before your last commit: `npm --prefix api test` and `npm run verify:journeys` pass.
- Commit locally, do not push.
- Update your row in `docs/work_queue.md`, fill in "Codex result" below, then stop and summarize.

## Codex result

(Codex fills this in: commits, tests run and results, files changed, any rulings or test updates,
anything needed outside its file list.)
