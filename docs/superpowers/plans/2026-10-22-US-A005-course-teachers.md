# Course Teachers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins assign 0–20 teachers to a course; every assigned active teacher can author it.

**Architecture:**
- **Storage:** a course record gains an optional `teacherIds` list. A shared helper reads it, and falls back to the old `ownerUserId` when the list is missing, so nothing is migrated.
- **The mirror:** `ownerUserId` stays as a copy of the first teacher, so the frontend that is live during a deploy keeps working.
- **Routes:** two admin-only routes in a new route module read and replace the list.
- **Authorization:** the existing checks (`canAuthorCourse` in the API, `canEditCourse` in the app) switch to the list.
- **Editor:** a small standalone Teachers panel on the editor's Publishing step owns its own state.

**Tech Stack:** Express 5 + Zod + Vitest (API); Angular signals + Vitest (app); MongoDB driver.

**Spec:** [docs/stories/US-A005-course-teachers.md](../../stories/US-A005-course-teachers.md) (decisions D1–D6, scenarios AC01–AC09).

## Global Constraints

- Limits (D5): 0–20 ids, no duplicates, each an existing account with role `teacher`; empty is allowed.
- Authoring (D1): `admin`, or `role === 'teacher'` and `status === 'active'` and id in the list.
- A teacher creator is stored as `teacherIds: [creator]`; an admin creator as `teacherIds: []` (D2).
- `ownerUserId` is always written as `teacherIds[0] ?? ''` next to `teacherIds`; reads use `teacherIds` when present, else `[ownerUserId]` when non-empty, else `[]`.
- The routes are admin-only, under `/courses/:id/teachers` and `/api/courses/:id/teachers`; the write is wrapped in `withCourseLock` and answers with `send`/`json` (DEF-042).
- Fixed copy:
  - "Teachers saved" announced after a save.
  - "No teachers yet. Only admins can edit this course." for an empty list.
  - "Inactive" tag on an assigned account that can't author.
  - Error messages:
    - `Teachers must be a list of at most 20 account ids.`
    - `Each teacher can be listed once.`
    - `<id> is not a teacher account.`
- No new dependency. New app specs clear `localStorage` and `sessionStorage` in `beforeEach`.
- Bump the version in `package.json`, `app/package.json`, `package-lock.json` (3 lines) and `AppStateService.appVersion` on every commit.

## Review Focus

- **Courses created before this change** whose `ownerUserId` is an admin (admins used to become owners): they read as `[adminId]`, the panel shows that admin as Inactive with Remove, and nothing breaks. Test in Task 3.
- **A teacher removed while they have the editor open:** their next save answers 403 through the existing `requireCourseAuthor`, and the draft-recovery path keeps their work. Test in Task 2 that the save is refused.
- **The deploy window:** the old frontend reads only `ownerUserId`. After an admin assigns `[B, A]`, `ownerUserId` is B, so B sees edit links and A doesn't until Pages deploys. Accepted and noted in the contract; test in Task 1 that the mirror is written.
- **Two admins saving the list at the same time:** the course lock serializes the writes and the last one wins. No merge is needed for a replace-the-list route.
- **Deleted accounts in a stored list:** the read route returns them as `{ id, displayName: '', email: '', active: false }`, so the panel can remove them. Test in Task 3.

---

### Task 1: Store the teacher list

**Files:**
- Modify: `api/src/course.ts` (type `Course` at ~95–99, `courseFields` at ~39)
- Modify: `api/src/courseRepository.ts` (interface ~15–25, `CourseSeed`, `InMemoryCourseRepository.createCourse`)
- Modify: `api/src/mongoCourseRepository.ts` (`createCourse`, `update`, `fields` type)
- Modify: `api/src/courseStore.ts` (`ReadOnlyCourseRepository`, `UnavailableCourseRepository`), `api/src/courseRequestReads.ts`, `api/src/courseReview.ts` (`reviewedRepositories`, like `updateCoursePrice` at ~178)
- Test: `api/src/mongoCourseRepository.test.ts`, `api/src/courseTeachers.test.ts` (new)

**Interfaces:**
- Produces:

```ts
// course.ts
export type Course = CreateCourseInput & { id: string; createdAt: string; ownerUserId: string; teacherIds?: string[] };
export function courseTeacherIds(course: Pick<Course, 'ownerUserId' | 'teacherIds'>): string[];
// courseRepository.ts
export type CourseSeed = { id: string; createdAt: string; ownerUserId?: string; teacherIds?: string[] };
interface CourseRepository { updateCourseTeachers(id: string, teacherIds: string[]): Promise<Course | null>; /* + existing */ }
```

- `createCourse` with `seed.teacherIds` stores `teacherIds` and `ownerUserId = teacherIds[0] ?? ''`. A seed with only `ownerUserId` (existing tests) stores just that.
- `updateCourseTeachers` sets both fields. MongoDB uses one `$set`.
- The read-only and unavailable repositories throw their usual errors.
- The cached wrapper delegates and drops its cache, like its other writes.
- The reviewed wrapper delegates to the stored record and returns the reviewed view, as `updateCoursePrice` does.

- [ ] **Step 1: Write the failing tests**

```ts
// courseTeachers.test.ts
it('US-A005-AC06 reads an old course as its owner alone', () => {
  expect(courseTeacherIds({ ownerUserId: 'T' })).toEqual(['T']);
  expect(courseTeacherIds({ ownerUserId: '' })).toEqual([]);
  expect(courseTeacherIds({ ownerUserId: 'T', teacherIds: [] })).toEqual([]);
  expect(courseTeacherIds({ ownerUserId: 'B', teacherIds: ['B', 'A'] })).toEqual(['B', 'A']);
});
it('stores a seeded list with the first teacher mirrored as owner, and replaces it', async () => {
  const repository = new InMemoryCourseRepository();
  const course = await repository.createCourse(createCourseSchema.parse(metadata), { id: 'c', createdAt: 'x', teacherIds: ['A'] });
  expect(course).toMatchObject({ teacherIds: ['A'], ownerUserId: 'A' });
  expect(await repository.updateCourseTeachers('c', ['B', 'A'])).toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
  expect(await repository.updateCourseTeachers('missing', [])).toBeNull();
});
// mongoCourseRepository.test.ts, using the existing fake collection
it('US-A005-AC06 writes teacherIds and the owner mirror in one update, and reads old documents unchanged', ...);
```

- [ ] **Step 2: Run them and see them fail.** Run: `npm --prefix api test -- src/courseTeachers.test.ts src/mongoCourseRepository.test.ts`. Expected: FAIL (`courseTeacherIds` / `updateCourseTeachers` missing).
- [ ] **Step 3: Implement.** Add `'teacherIds'` to `courseFields`. Make the Mongo `update` accept `ownerUserId` and `teacherIds`. Let `npx tsc --noEmit -p api/tsconfig.json` list every `CourseRepository` implementation, including test fakes that implement the interface, and add the method to each.
- [ ] **Step 4: Run them again.** Expected: PASS. Then `npm --prefix api test`: all pass.
- [ ] **Step 5: Commit** with `feat(US-A005): store a course's teacher list`.

---

### Task 2: Teachers author, creators join the list, instructors follow (AC02, AC03, AC07, AC09)

**Files:**
- Modify: `api/src/courseAccess.ts:5-8` (`canAuthorCourse`)
- Modify: `api/src/server.ts:809-813` (`POST /courses` seed)
- Modify: `api/src/instructorProfileRoutes.ts:44-49` (`publishedByOwner`)
- Test: `api/src/courseTeachers.test.ts`, `api/src/instructorProfile.test.ts`

**Interfaces:**
- Consumes: `courseTeacherIds` (Task 1).
- Produces: `canAuthorCourse(course, user)`, with the same signature and the rule from the Global Constraints.

- [ ] **Step 1: Write the failing tests** in `courseTeachers.test.ts`, against the in-process API (set up like `courseOwnership.test.ts:40-80`). Two teacher accounts, A and B, plus an admin.

```ts
it('US-A005-AC02 a second assigned teacher saves lessons and submits for review', ...);
// courses.createCourse(..., { teacherIds: [A.id, B.id] }); B's PATCH /courses/:id/content → 200; POST /courses/:id/review { action: 'submit' } → 200
it('US-A005-AC03 a removed teacher is refused while the remaining one keeps access', ...);
// updateCourseTeachers(id, [B.id]); A's PATCH content → 403; B's → 200
it('US-A005-AC07 a disabled or demoted assigned teacher is refused', ...);
// auth.updateStatus(A.id, 'disabled') → A refused; restore, auth.updateRole(A.id, 'student') → refused
it('a teacher who creates a course is its first teacher; an admin who creates one starts with none', ...);
// POST /courses as teacher → stored teacherIds [teacher.id]; as admin → teacherIds [] and ownerUserId ''
```

In `instructorProfile.test.ts`:

```ts
it('US-A005-AC09 lists a published course under every assigned teacher', ...);
// published course with teacherIds [A, B], both with descriptions → /instructors has the course id under both
```

- [ ] **Step 2: Run them and see them fail.** Run: `npm --prefix api test -- src/courseTeachers.test.ts src/instructorProfile.test.ts`. Expected: FAIL. B is refused (403), and the admin's course has `ownerUserId` = admin.
- [ ] **Step 3: Implement.**
  - `canAuthorCourse` uses `courseTeacherIds(course).includes(user.id)` together with the role and status check.
  - The creation seed becomes `teacherIds: user.role === 'teacher' ? [user.id] : []`.
  - `/instructors` loops over `courseTeacherIds(course)`.
- [ ] **Step 4: Run them again.** Expected: PASS. Then `npm --prefix api test`: all pass. Existing ownership tests that rely on "admin creator becomes owner" are a ruling: update them to the new rule and name each one in the ledger.
- [ ] **Step 5: Commit** with `feat(US-A005): assigned teachers author a course`.

---

### Task 3: Admin routes to read and replace the list (AC01, AC04, AC05, AC06)

**Files:**
- Create: `api/src/courseTeachersRoutes.ts`
- Modify: `api/src/server.ts` (register it next to `registerCourseLocksRoutes` at ~586)
- Test: `api/src/courseTeachers.test.ts`

**Interfaces:**
- Consumes: `CourseRepository.updateCourseTeachers`, `courseTeacherIds` (Task 1); `AuthRepository.findById`.
- Produces:

```ts
export type CourseTeacher = { id: string; displayName: string; email: string; active: boolean };
export function registerCourseTeachersRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; requireAdmin: RequestHandler; withCourseLock: (handler: RequestHandler) => RequestHandler;
  courses: CourseRepository; auth: Pick<AuthRepository, 'findById'>;
}): void;
// GET  /courses/:id/teachers → 200 { teachers: CourseTeacher[] } (stored order) | 404 { message: 'Course not found' }
// PUT  /courses/:id/teachers  { teacherIds: string[] } → 200 { teachers: CourseTeacher[] } | 400 | 404
```

`active` is `role === 'teacher' && status === 'active'`. A deleted account comes back as `{ id, displayName: '', email: '', active: false }`.

For PUT, validate in this order, and stop at the first failure:
1. The body shape. Zod: `z.array(z.string().trim().min(1).max(120)).max(20)`; failing it gives `Teachers must be a list of at most 20 account ids.`
2. Duplicates, giving `Each teacher can be listed once.`
3. Each id resolves to an account with role `teacher` (any status), else `<id> is not a teacher account.`

Disabled teachers may stay on the list (AC07). Pass `reviewedCourses` from `server.ts` as `courses`.

- [ ] **Step 1: Write the failing tests**

```ts
it('US-A005-AC01 an admin replaces the list and reads it back with names', ...);
// PUT [A, B] → 200 teachers [{id:A, displayName, email, active:true}, {id:B,...}]; GET → same; stored ownerUserId === A
it('US-A005-AC04 refuses the list change from an assigned teacher and from a student', ...);   // 403 both; list unchanged
it.each([
  [['ghost'], 'ghost is not a teacher account.'],
  [[studentId], `${studentId} is not a teacher account.`],
  [[A, A], 'Each teacher can be listed once.'],
  [Array.from({ length: 21 }, (_, i) => `t${i}`), 'Teachers must be a list of at most 20 account ids.'],
])('US-A005-AC05 refuses %j', ...);                                                              // 400 + message; list unchanged
it('US-A005-AC06 an old admin-owned course reads with that admin listed as inactive', ...);
// course seeded { ownerUserId: admin.id } → GET teachers [{ id: admin.id, active: false, ... }]
it('returns a deleted account as an inactive blank entry, and 404 for an unknown course', ...);
it('accepts an empty list, after which only admins author', ...);                               // PUT [] → 200; A's content PATCH → 403
```

- [ ] **Step 2: Run them and see them fail.** Run: `npm --prefix api test -- src/courseTeachers.test.ts`. Expected: FAIL with 404 on the new routes.
- [ ] **Step 3: Implement** the module, and register it in `server.ts` with `requireAdmin` and the existing `withCourseLock`.
- [ ] **Step 4: Run them again.** Expected: PASS. Then run `npm --prefix api test` and `npm run verify:journeys`: both pass.
- [ ] **Step 5: Commit** with `feat(US-A005): admin routes to read and assign course teachers`.

---

### Task 4: The app reads the list (AC02 in the app)

**Files:**
- Modify: `app/src/app/app.models.ts:84-86` (`CourseListItem` gains `teacherIds?: string[]`)
- Modify: `app/src/app/utils/course-permissions.ts` (`canEditCourse`)
- Modify: `app/src/app/pages/courses-page/courses-page.ts:202` (my courses)
- Modify: `app/src/app/services/course.service.ts` (two methods after `saveCoursePrice` at ~440)
- Test: `app/src/app/utils/course-permissions.spec.ts` (create if missing), `app/src/app/pages/courses-page/courses-page.spec.ts`, `app/src/app/services/course.service.spec.ts`

**Interfaces:**
- Consumes: the Task 3 routes.
- Produces:

```ts
// course-permissions.ts
export function courseTeacherIds(course: Pick<CourseListItem, 'ownerUserId' | 'teacherIds'>): string[];  // same rule as the API
// course.service.ts
export type CourseTeacher = { id: string; displayName: string; email: string; active: boolean };
export type CourseTeachersResult = { ok: true; teachers: CourseTeacher[] } | { ok: false; message: string };
loadCourseTeachers(courseId: string, token: string): Promise<CourseTeachersResult>;
saveCourseTeachers(courseId: string, teacherIds: string[], token: string): Promise<CourseTeachersResult>;
```

Fallback messages:
- `Unable to load course teachers.`
- `Unable to save course teachers.`

- [ ] **Step 1: Write the failing tests:**
  - `canEditCourse` is true for the second id in `teacherIds`, and false for a teacher not in it.
  - It falls back to `ownerUserId` when `teacherIds` is absent.
  - The courses page lists a course under "my courses" for its second teacher.
  - Both service methods call the right URL and method, and map an error body to `{ ok: false, message }`.
- [ ] **Step 2: Run them and see them fail.** Run: `(cd app && npx ng test --watch=false --include src/app/utils/course-permissions.spec.ts --include src/app/pages/courses-page/courses-page.spec.ts --include src/app/services/course.service.spec.ts)`. Expected: FAIL.
- [ ] **Step 3: Implement.** The courses page uses `canEditCourse(course, user)` (or `courseTeacherIds(course).includes(userId)`) instead of comparing `ownerUserId`.
- [ ] **Step 4: Run them again.** Expected: PASS. Then `npm run app:test`: all pass.
- [ ] **Step 5: Commit** with `feat(US-A005): the app treats every assigned teacher as an author`.

---

### Task 5: Teachers panel on the Publishing step (AC01, AC07, AC08)

Load `design-taste-frontend` first (CLAUDE.md). This is product UI, so only its accessibility and contrast checks apply. Reuse `appButton` and the editor's existing field and notice classes.

**Files:**
- Create: `app/src/app/ui/course-teachers/course-teachers.ts`, `.html`, `.scss`, `.spec.ts`
- Modify: `app/src/app/pages/course-editor-page/course-editor-page.html` (inside the Publishing section's `editor-grid`, after `<app-course-review-panel>`, wrapped in `@if (canAccessAdmin() && courseEditingId())`), and `course-editor-page.ts` (`imports`, and the editing id if it isn't already exposed)

**Interfaces:**
- Consumes: `CourseService.loadCourseTeachers` / `saveCourseTeachers` (Task 4), `AdminUsersService.search(token, text)`, the token from `AppStateService.loginState()`.
- Produces: `<app-course-teachers [courseId]="..." />`, a standalone component that keeps its own signals:
  - `teachers` (the list)
  - `results` (search results: role `teacher`, status `active`, not already assigned)
  - `saving`
  - `error`
  - `status` (the live-region text)

**Behavior:**
- **Loading:** it loads the list on init and whenever `courseId` changes.
- **Searching:** search runs on submit of a small form (no keystroke debouncing).
- **Add and Remove** each call `saveCourseTeachers` with the full new list.
  - On success, it replaces `teachers` with the response and sets `status` to `Teachers saved`.
  - On failure, it keeps the previous list and sets `error`.
- **After Remove,** focus moves to the next row's Remove button, else the previous row's, else the search field.
- **While saving,** buttons are disabled.

- [ ] **Step 1: Write the failing spec** (clear both storages in `beforeEach`; fake both services with `vi.fn`):

```ts
it('US-A005-AC01 lists assigned teachers and adds a searched teacher', ...);   // save called with [A, B]; row B shown; 'Teachers saved'
it('US-A005-AC07 marks an inactive teacher and still lets the admin remove them', ...);  // 'Inactive' tag; Remove → save([B])
it('US-A005-AC08 keeps the previous list and shows the error when saving fails', ...);   // save → { ok:false, message:'Boom' }
it('shows the empty-state text and hides assigned or inactive accounts from search results', ...);
it('moves focus to the next Remove button after removing a teacher', ...);
```

- [ ] **Step 2: Run it and see it fail.** Run: `(cd app && npx ng test --watch=false --include src/app/ui/course-teachers/course-teachers.spec.ts)`. Expected: FAIL (component missing).
- [ ] **Step 3: Implement the component** and place it in the Publishing step.
- [ ] **Step 4: Run it again.** Expected: PASS. Then `npm run app:test` and `npm run app:build:pages`: both pass.
- [ ] **Step 5: Browser check** on the isolated servers: rebuild `api/dist` (`npm run api:build`), then `preview_start` `isolated-api` and `isolated-frontend`.
  - As `admin@qi-education.local`, assign `teacher@qi-education.local` and a second teacher you create in the Admin page.
  - As the second teacher, open the course for editing.
  - Remove them, then check that editing is refused after a reload.
  - Screenshot the panel at desktop and phone width.
- [ ] **Step 6: Commit** with `feat(US-A005): admins assign teachers on the Publishing step`.

---

### Task 6: Rules, specs and delivery record

**Files:** `docs/business_rules.md` (lines 11–15), `docs/specs/authoring/course-editor.md` (a short "Course teachers" section), `docs/stories/US-A005-course-teachers.md` (verification table), `docs/work_queue.md`.

- [ ] **Step 1:** Replace "A course without an owner (legacy) is editable by admins only. Ownership never transfers." and the "**own** courses" wording with the contract's rule text. Fill in the verification table with the test names and the browser check.
- [ ] **Step 2:** Run `npm run api:test`, `npm run app:test`, `npm run verify:journeys` and `npm run app:build:pages`: all pass.
- [ ] **Step 3: Commit** with `docs(US-A005): course teachers in rules and specs`. Don't push until Alex says so. After the push and Alex's hosted check, remove the story from the backlog and delete the contract.

## Ownership if split with Codex

- **Codex (default):** Tasks 1–3, all in `api/src/**`.
- **Claude:** Tasks 4–6, the app and docs.
- **The contract between them:** the Task 3 routes and the `CourseTeacher` shape.
- **Order:** Task 4's service tests can be written against that shape before Task 3 lands.
