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

- Started on `main` at `aa9ada0`; required `ca9d9dd` is an ancestor. Remote fetched;
  local main is eight commits ahead, with no incoming commits or initial local changes.
- Pre-flight: Task 1's optional list/helper and repository write match Tasks 2 and 3's consumers.
  Task 2's authorization uses the same legacy fallback as Task 3's admin read.
- Execution: use this result section as the execution ledger; omit skill scratch files and worktree
  creation because the explicit assignment restricts writes and requires this shared `main`.
- Ruling: PUT returns `{ teachers }` as the handoff and plan specify (the story also contains an
  older "returns the updated course" sentence). Cost if wrong: an API consumer would need adapting.
- Task 1: storage tests RED (six expected failures: missing helper/write and ignored seeded lists)
  → GREEN (14/14 focused, full API 2,343/2,343 across 93 files).
  `courseRequestReads.ts` already delegates every write and clears reads; verified without changing it.
  Root `npx tsc` resolved the wrong executable; using the installed API TypeScript binary instead.
- Task 1 complete: `6fa0c98` (`0.1.382`); installed API `tsc --noEmit` passed.
- Task 2: focused tests RED (10 failures: secondary author rejected, disabled helper allowed,
  creators missing lists, second instructor missing) → GREEN (64/64).
- Ruling: update `courseOwnership.test.ts`'s creator test to expect the teacher's singleton list
  and the admin's empty list; remove its duplicate stored-owner assertion. The suite exposed its
  old admin-owner expectation; D2 supersedes that behavior. Cost if wrong: old admin ownership
  expectations would need restoring, contrary to the agreed contract. No other existing ownership
  test or repository fake needed updating.
- Task 2 complete: full API 2,357/2,357 across 93 files; installed API `tsc --noEmit` passed.
- Task 2 delivery: `4ea138a` (`0.1.383`).
- Task 3 RED: new endpoints returned 404; after route wiring, six lifecycle regressions returned
  409 because `withCourseLock` classified teacher assignment as a draft edit.
- Ruling: exempt `/teachers` from that wrapper's author scope, including `?view=author`, while
  retaining its course mutation lock. D4 requires immediate assignment in every lifecycle state.
  This necessary `server.ts` change extends beyond the two originally noted locations, but remains
  inside the assigned API scope. Cost if wrong: admin assignment would need a lifecycle restriction
  that contradicts the agreed immediate-save contract.
- Malformed JSON literals retain the existing parser's 400 response; route shape tests exercise
  valid JSON objects/arrays with malformed or missing `teacherIds`.
- Task 3 focused tests: 76/76 GREEN, installed API `tsc --noEmit` passed.
- Existing test update: `api/src/routePermissions.test.ts` now classifies the new GET and PUT
  routes as admin-only; the full suite initially caught five missing inventory/classification
  assertions, then the permission suite passed 172/172. No permission assertion was weakened.
- Independent read-only review: one Important finding, no Critical/Minor findings.
  A teacher save could pass authorization, queue behind an admin removing that teacher, then
  save after removal. Deterministic regression on both URL prefixes was RED (200 instead of 403).
  Fixed by checking the freshly read assignment inside the lock before revision checks/writes;
  teacher suite now 78/78 GREEN. Final full API and journey checks passed after this fix.
- Ruling on review's declined behavior: preserve strict whole-list teacher-role validation exactly
  as requested. With multiple deleted/demoted entries, removing just one still submits another
  invalid entry and fails; clients must submit a cleaned full list. Changing API validation would
  contradict the fixed contract. Cost: the current panel needs a bulk cleanup affordance for this
  edge case. Disabled teachers are valid retained entries and do not cause this validation failure.
- Outside assigned files, follow-up for Claude:
  - `app/src/app/ui/course-teachers/course-teachers.ts`, `.html`, `.spec.ts`: provide a way to submit
    a cleaned full list when several assignments reference deleted/demoted accounts (for example,
    a deliberate "Remove inactive teachers" action), and test that case. This is a product/UI
    follow-up; no API contract change was made.
  - `docs/stories/US-A005-course-teachers.md`: fill API verification rows from the evidence below
    and retain the story until Claude's isolated browser check and any agreed cleanup follow-up.
    Story retirement/backlog/spec edits remain Claude's files.

### Scenario evidence for Claude's story verification table

| Scenario | Automated evidence (2026-10-22, isolated in-process stores) |
| --- | --- |
| AC01 | `courseTeachers.test.ts`: admin replaces/reads list with names, email, order; mirror persisted, free-text teacher and review content untouched |
| AC02 | Second assigned teacher saves lessons, uploads a real in-memory attachment, submits for review; catalog response carries both teacher IDs |
| AC03 | Removed creator cannot reopen/save; admin removal with editor open rejects loaded draft save; queued save behind removal rejects with 403 before content write |
| AC04 | Assigned teacher/student get 403 on GET/PUT; missing/invalid token gets 401; forged assignment in metadata save ignored; permission inventory covers routes and aliases |
| AC05 | Exact 400 messages, unknown/student/admin IDs, duplicate/trimmed duplicate, malformed lists, over 20; unchanged persisted list on refusal; exactly 20 accepted |
| AC06 | Legacy fallback helper, memory/Mongo fake persistence and atomic mirror update; legacy teacher still authors; legacy admin shown inactive, first save stores list |
| AC07 | Disabled/demoted current accounts denied via existing token; helper denies disabled teacher; disabled accounts valid assignments; disabled/demoted/deleted entries read inactive |
| AC09 | `instructorProfile.test.ts`: published shared course appears under both descriptions; draft and empty-list courses excluded |

`courseTeachers.test.ts` exercises both `/courses` and `/api/courses`; Mongo tests use the local
fake collection, never a database connection. No shared services, browser servers, ports 3001/4200,
or `api/dist` rebuilds were used. Claude's browser/deployment verification remains separate.

### Final delivery

- API Tasks 1–3 complete. Commits: `6fa0c98` (storage), `4ea138a` (authoring/instructors),
  and this delivery commit, `feat(US-A005): admin routes to read and assign course teachers`.
  Each commit has its required patch bump in all four version locations.
- Final commands, all passing before the delivery commit:
  - `npm --prefix api test`: **2,423/2,423**, 93 files.
  - `npm run verify:journeys`: **16/16** (memory and fake Mongo, no shared connections).
  - `node api/node_modules/typescript/bin/tsc --noEmit -p api/tsconfig.json`: pass, no emit.
  - `git diff --check`: pass.
- Final review: Important queued-authorization finding fixed with RED → GREEN regression and
  full green suite; no Critical findings or deferred minors. Exact-contract limitation and
  outside-file follow-ups are recorded above. No push or deployment performed.
- API production files changed: `course.ts`, `courseRepository.ts`, `mongoCourseRepository.ts`,
  `courseStore.ts`, `courseReview.ts`, `courseAccess.ts`, `instructorProfileRoutes.ts`, `server.ts`,
  and new `courseTeachersRoutes.ts` (all under `api/src/`).
- API test files changed: new `courseTeachers.test.ts`, extended `mongoCourseRepository.test.ts`
  and `instructorProfile.test.ts`, adjusted `courseOwnership.test.ts` and `routePermissions.test.ts`
  for the new creation rule and route inventory respectively.
- Other files changed: this result section, the Codex row in `docs/work_queue.md`, and only the
  required version values in `package.json`, `app/package.json`, `package-lock.json` (three entries),
  and `app/src/app/services/app-state.service.ts` (`appVersion`).

## Round 2 (from Claude's check, 2026-10-22)

Claude's check: diff kept to Codex's files, contract kept, `api:test` 2,423/2,423, `app:test`
440/440, `verify:journeys` 16/16, `app:build:pages` pass, browser flow passes. One fix is needed,
the one Codex raised:

- **Problem:** `PUT /courses/:id/teachers` checks every id. A list with two deleted or demoted
  entries can never be cleaned (removing one still sends the other), and an old admin-owned course
  (`[adminId]`) refuses every addition until the admin entry is removed.
- **Contract change (D5, clarified in the story):** only ids that are not on the stored list must
  be accounts with role `teacher`. Ids already on the list may stay whatever their account state.
  Order of checks: body shape (400, same message) → duplicates (400) → course exists (404
  `Course not found`) → each newly added id is a teacher (400 `<id> is not a teacher account.`).
  Read the stored list inside the PUT handler (it already runs under `withCourseLock`).
- **Tests (RED first) in `api/src/courseTeachers.test.ts`:**
  1. Stored `[A, B, C]`; A deleted, B demoted to student; PUT `[B, C]` → 200, B returned
     `active: false`, then PUT `[C]` → 200.
  2. Old course `{ ownerUserId: adminId }`; PUT `[adminId, T]` → 200 with the admin inactive.
  3. Adding a new student id to a stored list still answers 400 `<id> is not a teacher account.`
  4. An unknown course still answers 404 even when the body is valid.
- Same files, rules and closing steps as round 1. No app or docs changes besides your queue row and
  the "Codex result" section (add a "Round 2" entry).
