# Rise Course Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A command-line importer that turns an Articulate Rise SCORM export into a draft QI Academy course through the existing API.

**Architecture:** Three files in `api/src/`. `riseImport.ts` reads the extracted export and returns a checked plan: the content sections plus the files to upload. It has no network code. `riseImportRun.ts` sends that plan to the API over HTTP as a signed-in teacher and can resume. `riseImportCli.ts` is the thin entry point, like `backupDatabaseCli.ts`. No route or storage changes, apart from raising two quiz text limits.

**Tech Stack:** TypeScript (Node 20+ `fetch`, `node:fs/promises`), Zod schemas from `courseContent.ts`, Vitest, `tsx` for the CLI. No new dependency: Claude unzips the export with `unzip`, so the importer never opens the zip itself.

**Spec:** [docs/stories/US-T015-rise-course-import.md](../../stories/US-T015-rise-course-import.md). Decisions D1–D12 and scenarios AC01–AC06 live there.

## Global Constraints

- No new npm dependency. No new API route. Existing routes and responses stay unchanged.
- Raised limits (D7): quiz answer `text` max **600** (was 300), answer `description` max **1500** (was 500).
- Attachment limit stays **4 MB** (`4 * 1024 * 1024` bytes); thumbnail limit **2 MB**, JPEG/PNG/WebP.
- Fixed copy: refusal `Only Articulate Rise exports can be imported.`; quiz title prefix `Videnstjek: `; second and later videos in one topic get the suffix ` (del 2)`, ` (del 3)`, …; level `Foundation`.
- Section ids = Rise lesson `id`; lesson ids = Rise block `id`. Ids are never generated, so a resumed run matches its own lessons.
- Tests use the in-process API with in-memory stores only, and a fake Mux. No test touches real Mux, MongoDB or the hosted API.
- The password comes from the `QI_IMPORT_PASSWORD` environment variable or a hidden prompt. It never goes on the command line, in a log line or in a file.
- Bump the version in `package.json`, `app/package.json`, `package-lock.json` (3 lines) and `AppStateService.appVersion` on every commit. Read the current version from `package.json` first.

## Review Focus

- **Non-ASCII file names** ("Grænseværdian.mp4", "Testværktøjer"): files must still be found on disk and the `X-File-Name` header must not make `fetch` throw. Task 3 sends `name.replace(/[^a-zA-Z0-9._ -]/g, '-')` and tests it with `ø`.
- **Interrupted run, then resume:** a lesson whose Mux upload was created but whose file PUT failed has `mux.status: 'waiting'` and no `assetId`. The resume must delete and redo it; a plain retry answers 409. Test in Task 3.
- **A topic with two videos and no quiz in between:** both become video lessons with distinct titles, and no empty quiz is created. Test in Task 2.
- **Rise HTML noise** (inline `style`, `span`, `data-editor-id`, `&nbsp;`, `<p></p>`): text lessons keep only safe tags and quiz fields become plain text without double spaces. Test in Task 2.
- **The dry run must never write:** the run function is not called at all with `--dry-run`. Test in Task 4 by asserting the injected `fetch` was never called.

---

### Task 1: Raise the quiz answer limits (D7, AC06)

**Files:**
- Modify: `api/src/courseContent.ts:5-6`
- Modify: `app/src/app/ui/course-builder/course-builder.html:353` (`maxlength="300"` → `"600"`)
- Test: `api/src/courseContent.test.ts` (new)
- Test: `app/src/app/ui/course-builder/course-builder-authoring.spec.ts`

**Interfaces:**
- Produces: `updateCourseContentSchema` accepts answers with `text` ≤ 600 and `description` ≤ 1500.

- [ ] **Step 1: Write the failing tests**

```ts
it('US-T015-AC06 keeps long imported answers and feedback whole', () => {
  const answer = (id: string, isCorrect: boolean) => ({ id, text: 'a'.repeat(600), description: 'f'.repeat(1500), isCorrect });
  const parsed = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'S', components: [{ id: 'q', title: 'Q', type: 'quiz',
    quiz: { passPoints: 1, questions: [{ id: 'q1', question: 'Q?', answers: [answer('a', true), answer('b', false)] }] } }] }] });
  expect(parsed.sections[0].components[0]).toMatchObject({ quiz: { questions: [{ answers: [{ text: 'a'.repeat(600), description: 'f'.repeat(1500) }] }] } });
  expect(() => updateCourseContentSchema.parse(/* same with text 'a'.repeat(601) */)).toThrow();
});
```

In the course-builder spec, assert that the answer text input has `maxLength === 600`.

- [ ] **Step 2: Run them and see them fail**

Run: `npm --prefix api test -- src/courseContent.test.ts`, then `(cd app && npx ng test --watch=false --include src/app/ui/course-builder/course-builder-authoring.spec.ts)`
Expected: FAIL. The schema rejects 600/1500 characters, and the input's `maxLength` is 300.

- [ ] **Step 3: Change `.max(300)` → `.max(600)` on answer `text` and `.max(500)` → `.max(1500)` on answer `description`, then change the editor's `maxlength` to 600.**

Leave the image `alt` limit at 300.

- [ ] **Step 4: Run both test files again.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/courseContent.ts app/src/app/ui/course-builder/course-builder.html api/src/courseContent.test.ts app/src/app/ui/course-builder/course-builder-authoring.spec.ts package.json app/package.json package-lock.json app/src/app/services/app-state.service.ts
git commit -m "feat(US-T015): allow longer quiz answers and answer feedback"
```

---

### Task 2: Read a Rise export into an import plan (D2–D9, AC01, AC03)

**Files:**
- Create: `api/src/riseImport.ts`
- Test: `api/src/riseImport.test.ts`

**Interfaces:**
- Consumes: `updateCourseContentSchema`, `CourseContentSection` (`courseContent.ts`), `assessmentIssues` (`quizAssessment.ts`).
- Produces:

```ts
export type ImportFile = { sectionId: string; componentId: string; path: string; fileName: string; contentType: string; sizeBytes: number };
export type ImportPlan = {
  course: { title: string; description: string; teacher: string; level: string };
  sections: CourseContentSection[];
  videos: ImportFile[];             // one per video lesson, Rise order
  attachments: ImportFile[];        // PDFs up to 4 MB, each pointing at its resources lesson
  thumbnail: Omit<ImportFile, 'sectionId' | 'componentId'> | null;
  skipped: string[];                // e.g. "Kapitel 5.pdf: 6.6 MB is over the 4 MB attachment limit"
  problems: string[];               // block a real run: missing media, schema or quiz-check failures
};
export class NotRiseExportError extends Error {}   // message: 'Only Articulate Rise exports can be imported.'
export async function planRiseImport(folder: string): Promise<ImportPlan>;
export function summarizePlan(plan: ImportPlan): string[]; // report lines for the dry run
```

**Reading:** `<folder>/scormcontent/runtime-data.js` contains `__jsonp("runtime-data.js","<base64>")`. Decode the base64 as UTF-8 JSON and use `.course`. A missing file or no match throws `NotRiseExportError`. Media paths are `<folder>/scormcontent/assets/` + `decodeURIComponent(media.<kind>.key)`.

**Mapping:** walk each Rise lesson's `items` in order, holding `topic` (the current heading) and `openQuiz` (the quiz lesson being filled). Every block that is not a knowledge check sets `openQuiz = null` before it is handled.

| Rise block (`variant` / `type`) | Result |
| --- | --- |
| `numbered divider` | `topic = null`, `openQuiz = null`, and mark "next heading is a topic title" |
| `heading` right after a numbered divider | `topic = riseText(heading)`; no lesson |
| any other `heading`, `paragraph`, `text` | text lesson; `content = riseHtml(...)`; title = `topic ?? lesson.title` |
| `video` | video lesson, `durationMinutes = Math.ceil(duration / 60)`, title per D4; add to `videos` |
| `type === 'knowledgeCheck'` | append its questions to `openQuiz`, creating it if null: id = block id, title `Videnstjek: ${topic ?? lesson.title}` |
| `attachment` | resources lesson titled by the original name without `.pdf`; add to `attachments` when ≤ 4 MB, otherwise to `skipped` |
| `continue`, `hero`, anything else | dropped and counted in `skipped` |

Questions: `question = riseText(title)`. Each answer: `{ id, text: riseText(title), description: riseText(feedback), isCorrect: correct }`. `explanation` = the first correct answer's description. `passPoints` = number of questions in the quiz (D5).

Course: `title = riseText(course.title)`, `description = riseText(course.description)`, `teacher = course.authors[0].authorName`, `level = 'Foundation'`. The thumbnail is `coverImage.media.image.crushedKey` when ≤ 2 MB, otherwise it goes to `skipped`.

`riseText(html)` (module-private): strip tags, decode entities (`&nbsp;`, `&amp;`, `&#…;`), join paragraphs with a space, collapse whitespace, trim. `riseHtml(html)` (module-private): keep only `p, br, strong, em, ul, ol, li` and `a` with an `http(s)` `href` (no attributes except that `href`), unwrap every other tag, drop empty `<p></p>`.

`problems`: a referenced media file that doesn't exist on disk; `updateCourseContentSchema.safeParse({ sections })` errors; `assessmentIssues(sections, true)` messages.

- [ ] **Step 1: Write the failing tests.** Each test builds a temp folder (`fs.mkdtemp` under `os.tmpdir()`) with a `runtime-data.js` made from a small JSON object and tiny fake media files. Never use the real export.

```ts
it('US-T015-AC01 maps lessons, topics, videos, quizzes and PDFs in Rise order', async () => {
  // fixture: lesson L1 = [divider, heading "01.01 Hvad er test?", video v1 (83 s), attachment "Hvad er test.pdf",
  //   divider, heading "01.02 Testformål", video v2, knowledgeCheck k1 (MULTIPLE_CHOICE), knowledgeCheck k2 (MULTIPLE_RESPONSE),
  //   divider, heading "01.03", video v3, video v4, paragraph "Tilgå quizzen her: <a href=\"https://glossary.istqb.org\">…</a>"]
  const plan = await planRiseImport(folder);
  expect(plan.sections.map(s => s.id)).toEqual(['L1']);
  expect(plan.sections[0].components.map(c => [c.type, c.title])).toEqual([
    ['video', '01.01 Hvad er test?'], ['resources', 'Hvad er test'], ['video', '01.02 Testformål'],
    ['quiz', 'Videnstjek: 01.02 Testformål'], ['video', '01.03'], ['video', '01.03 (del 2)'], ['text', '01.03']]);
  expect(plan.sections[0].components[0].durationMinutes).toBe(2);
  expect(plan.sections[0].components[3]).toMatchObject({ quiz: { passPoints: 2 } });
  expect(plan.videos.map(v => v.componentId)).toEqual(['v1', 'v2', 'v3', 'v4']);
  expect(plan.problems).toEqual([]);
});
it('cleans Rise HTML: plain quiz text, safe tags only in text lessons', ...);
// question title '<div data-editor-id="x"><p><span style="font-size: 2.4rem"><strong>Hvilket?</strong></span></p><p></p><p>Vælg ÉN&nbsp;mulighed</p></div>'
//   → 'Hvilket? Vælg ÉN mulighed'; the paragraph's content keeps <a href="https://glossary.istqb.org"> and has no style/span/data- attributes
it('keeps every correct answer of a multiple-response question and uses the first correct feedback as explanation', ...);
it('skips a PDF over 4 MB, still creates its resources lesson, and lists it in skipped', ...);
it('reports a missing video file as a problem', ...);
it('US-T015-AC03 refuses a folder without runtime-data.js', async () => {
  await expect(planRiseImport(emptyFolder)).rejects.toThrow('Only Articulate Rise exports can be imported.');
});
```

- [ ] **Step 2: Run them and see them fail.** Run: `npm --prefix api test -- src/riseImport.test.ts`. Expected: FAIL, the module doesn't exist yet.

- [ ] **Step 3: Implement `planRiseImport` and `summarizePlan` in `api/src/riseImport.ts`.** `summarizePlan` gives one line per section (lesson counts per type), plus total video minutes, total upload MB, and then each `skipped` and `problems` line.

- [ ] **Step 4: Run them again.** Expected: PASS.

- [ ] **Step 5: Commit** `api/src/riseImport.ts`, `api/src/riseImport.test.ts` and the version files with `feat(US-T015): plan a course from a Rise export`.

---

### Task 3: Send the plan to the API, with resume (AC02, AC04, AC05)

**Files:**
- Create: `api/src/riseImportRun.ts`
- Test: `api/src/riseImportRun.test.ts` (in-process `createServer` set up as in `courseOwnership.test.ts:40-75`: in-memory auth, course, content and asset repositories, fake `muxVideoService`, `listen(0)`)

**Interfaces:**
- Consumes: `ImportPlan`, `ImportFile` from Task 2.
- Produces:

```ts
export type ImportOptions = {
  apiUrl: string; email: string; password: string; courseId?: string;
  fetch?: typeof fetch; readFile?: (path: string) => Promise<Buffer>; log?: (line: string) => void;
};
export async function runRiseImport(plan: ImportPlan, options: ImportOptions):
  Promise<{ courseId: string; videosUploaded: number; attachmentsUploaded: number }>;
```

**Order of requests.** Every API call sends `Authorization: Bearer <token>`. Any non-2xx answer throws `Error(\`${step}: ${status} ${body.message}\`)`.

1. `POST /auth/login` `{ email, password }` → `token`.
2. With no `courseId`: `POST /courses` `{ ...plan.course, status: 'draft' }`, then log `Course created: <id>` straight away so a resume is always possible. Then `PATCH /courses/:id/content` `{ sections }` with header `X-Course-Revision: JSON.stringify({ version: review.version, revisionId: review.revisionId })`, taken from the create response. Then `PUT /courses/:id/thumbnail` when `plan.thumbnail` is set.
   With a `courseId`: `GET /courses/:id/content` and use its sections as the current state. Don't PATCH and don't touch the thumbnail.
3. For each attachment whose lesson has no attachment with the same sanitized name: `PUT /courses/:id/content/components/:componentId/attachments` with body = file bytes, `Content-Type`, `X-Section-Id`, `X-File-Name: fileName.replace(/[^a-zA-Z0-9._ -]/g, '-')`.
4. For each video in order, look at the lesson's current `mux`:
   - no `mux`: upload it;
   - `mux.assetId` empty and `status` is `waiting` or `errored`: first `DELETE /courses/:id/content/components/:componentId/mux-video` `{ sectionId }`, then upload it;
   - otherwise skip it.

   To upload: `POST …/mux-upload` `{ sectionId }` → `uploadUrl`, then `fetch(uploadUrl, { method: 'PUT', body: bytes })` with **no** Authorization header. Log `Video n/total: <title> (<MB> MB)`.
5. Return the counts. Mux's webhook links each video later; the importer doesn't wait for it.

- [ ] **Step 1: Write the failing tests** against the in-process API. The fake Mux `createDirectUpload` returns an `uploadUrl` on a second local `http.createServer` that records the PUT bodies it receives.

```ts
it('US-T015-AC02 creates a draft owned by the teacher with lessons, attachments, thumbnail and Mux uploads', async () => {
  const result = await runRiseImport(plan, { apiUrl, email: 'teacher@qi-education.local', password: 'Password123!' });
  const course = (await courses.listCourses()).find(c => c.id === result.courseId)!;
  expect(course).toMatchObject({ status: 'draft', ownerUserId: teacher.id, title: plan.course.title, thumbnailAssetId: expect.any(String) });
  const saved = await content.getCourseContent(result.courseId);
  // same section/lesson ids and order as plan.sections; every video lesson has mux.uploadId;
  // the resources lesson has 1 attachment; uploadServer received one PUT per video with the file's bytes
  expect(result).toEqual({ courseId: course.id, videosUploaded: 2, attachmentsUploaded: 1 });
});
it('US-T015-AC04 resumes: no new course, uploads only the missing and the stalled video', async () => {
  // run once with a fetch wrapper that throws on the 2nd PUT to the upload server, catch it;
  // run again with courseId: courses.listCourses() length unchanged, no PATCH /content sent,
  // stalled video deleted and re-uploaded, the finished one untouched, attachment not duplicated
});
it('sends an ASCII X-File-Name for "Testværktøjer.pdf"', ...);   // stored fileName 'Testv-rkt-jer.pdf'
it('US-T015-AC05 stops on a student account or a wrong password and creates nothing', async () => {
  await expect(runRiseImport(plan, { apiUrl, email: 'student@qi-education.local', password: 'Password123!' })).rejects.toThrow(/^Create course: 403/);
  await expect(runRiseImport(plan, { apiUrl, email: 'teacher@qi-education.local', password: 'wrong' })).rejects.toThrow(/^Sign in: 401/);
  expect(await courses.listCourses()).toHaveLength(courseCountBefore);
});
```

- [ ] **Step 2: Run them and see them fail.** Run: `npm --prefix api test -- src/riseImportRun.test.ts`. Expected: FAIL, the module doesn't exist yet.

- [ ] **Step 3: Implement `runRiseImport` in `api/src/riseImportRun.ts`.**

- [ ] **Step 4: Run them again.** Expected: PASS. Then run `npm run api:test`: everything passes.

- [ ] **Step 5: Commit** both files and the version files with `feat(US-T015): import a planned Rise course through the API`.

---

### Task 4: Command line, dry run and docs (AC01)

**Files:**
- Create: `api/src/riseImportCli.ts`
- Modify: `api/package.json` (script `"import:rise": "tsx src/riseImportCli.ts"`)
- Modify: `docs/local_development.md` (a short "Import a Rise course" section with the commands below)
- Test: `api/src/riseImportCli.test.ts`

**Interfaces:**
- Consumes: `planRiseImport`, `summarizePlan`, `NotRiseExportError` (Task 2); `runRiseImport` (Task 3).
- Produces:

```ts
export async function runRiseImportCommand(argv: string[], io: {
  env: NodeJS.ProcessEnv; out: (line: string) => void; askPassword: () => Promise<string>; run?: typeof runRiseImport;
}): Promise<number>; // exit code
```

Usage: `npm --prefix api run import:rise -- <export-folder> [--dry-run] [--api <url>] [--email <email>] [--course <id>]`. The default `--api` is `https://qi-education.vercel.app/api`. `--email` is required unless `--dry-run` is given.

Behavior:
- Always print `summarizePlan`.
- With `--dry-run`, or when `problems` is non-empty, stop there. The exit code is 0 for a clean dry run and 1 when there are problems.
- Otherwise take the password from `QI_IMPORT_PASSWORD`, or else `askPassword()` (a hidden prompt via `node:readline`), call `run`, and print the course id and counts.
- On an error, print the message and, when a course was already created, `Resume with: --course <id>`. Exit code 1.

`riseImportCli.ts` is only `process.exitCode = await runRiseImportCommand(process.argv.slice(2), { env: process.env, out: console.log, askPassword })`.

- [ ] **Step 1: Write the failing tests:** a dry run prints the summary, returns 0 and never calls `run`; a plan with problems returns 1 without asking for a password; a run error prints the resume line.

- [ ] **Step 2: Run them and see them fail.** Run: `npm --prefix api test -- src/riseImportCli.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement, add the script and write the docs section.**

- [ ] **Step 4: Run them again.** Expected: PASS. Then run `npm run api:test`, `npm run app:test`, `npm run verify:journeys` and `npm run app:build:pages`: all pass.

- [ ] **Step 5: Commit** with `feat(US-T015): rise import command with dry run`.

---

### Task 5: Real export, hosted run and delivery record

Claude does this task; Alex only types the teacher password.

- [ ] **Step 1: Extract the export outside the repo**

Run: `unzip -q "C:/Users/Alex/scorm-import/istqb-foundation-repetition-scorm2004_4-HHIGx9Qp.zip" -d "C:/Users/Alex/scorm-import/istqb-foundation"`
Expected: `C:\Users\Alex\scorm-import\istqb-foundation\scormcontent\runtime-data.js` exists.

- [ ] **Step 2: Dry run on the real export.** Run: `npm --prefix api run import:rise -- "C:/Users/Alex/scorm-import/istqb-foundation" --dry-run`. Expected:
  - 7 sections and 138 lessons: 88 video, 35 quiz, 8 resources, 7 text;
  - 430 video minutes;
  - `skipped` names Kapitel 4.pdf and Kapitel 5.pdf;
  - `problems` is empty;
  - exit code 0.

  Record the output in the contract.

- [ ] **Step 3: Local full run** against `npm run api:dev` (in-memory stores, Mux not configured). Expect a `503 Mux video uploads are not configured` at the first video. This proves the course, lessons, attachments and thumbnail. Check the draft in the browser on port 4200 as `teacher@qi-education.local`.

- [ ] **Step 4: Hosted run, only once Alex says go.** Start it in a Terminal tab with `run_in_terminal`, so that Alex can type the teacher password at the hidden prompt. The run takes as long as uploading 2.1 GB takes. On an error, re-run with the printed `--course <id>`.

- [ ] **Step 5: Hosted check.** Sign in as that teacher on the hosted site, open the draft, play a video from three different sections, and answer one quiz with a long answer. Upload compressed Kapitel 4 and Kapitel 5 in the editor (D8). Note it in the contract's verification table.

- [ ] **Step 6: Delivery.** Fold the behavior into `docs/specs/authoring/course-editor.md` (a short "Importing a Rise course" section) and the 600/1500 limits into `docs/specs/authoring/quizzes.md`. Remove US-T015 from `docs/user_stories.md` and delete the contract. Add the hosted check to "Open release checks" if it isn't done. Commit locally, and push only when Alex says so.

## Ownership if split with Codex

Tasks 2–4 are all `api/src/**` (Codex by default). Task 1 touches one editor line (Claude) and one API schema line. Task 5 is Claude's. The story is small enough to give Codex Tasks 1–4 as one handoff, with Claude reviewing and doing Task 5.
