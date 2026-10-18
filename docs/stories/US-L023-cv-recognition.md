# US-L023: Recognise achievements from a CV

## Record

- Story: US-L023 in the [backlog](../user_stories.md). Design agreed with Alex on 2026-10-18
  (brainstorm). Builds on [milestones and achievements](../specs/career-paths/milestones-and-achievements.md)
  and [careers](../specs/career-paths/careers.md).
- Owner: Claude (`app/`) and Codex (`api/src/**`), split below. Not started.

## Decisions (agreed 2026-10-18)

| Question | Decision |
| --- | --- |
| Where is the CV read? | In the learner's browser. The file, its text, its name and match snippets never leave the device; the API receives only confirmed action IDs. |
| Retention | Nothing to retain: the file and text are dropped once results show, on Cancel, on leaving the page and on reload. |
| Formats | PDF (`pdfjs-dist`) and Word .docx (`mammoth`), up to 10 MB. No OCR, no pasted text. |
| What is matched | Only actions (exam, course or activity) in published milestone-format careers, by admin-curated **CV keywords** per action. |
| Matching rule | Case-insensitive whole word/phrase after normalising whitespace and dash characters. No fuzzy matching, no AI. |
| Learner review | Every match is listed pre-ticked with the matched snippet; only ticked rows are saved on Save. |
| Provenance | New value `cv` ("From your CV"); existing achievements keep theirs. |
| Follow requirement | None for CV saves: achievements are account-wide, and the setup CV step comes before choosing a career. |
| Out-of-order evidence | Saved even when the milestone is locked; prerequisites are not completed by it. |
| Milestone state | A milestone whose requirement is satisfied is **achieved** regardless of prerequisites (also applies to 100% completed course actions). |
| Years of experience (tester, technical tester, test manager) | Not in this version. Revisit once there is a use for it (career suggestion or role milestones). |

## Frontend behavior (`app/`)

Two entry points:

1. **Career setup.** The "CV preview" step becomes "Upload your CV" (optional, skippable). Its
   preview notice is removed.
2. **Career page.** A "Scan my CV" action beside the tree. The declaration dialog's "CV recognition
   is coming later" line becomes a link to the scan.

Flow:

- **Choose a file** (.pdf/.docx, drag and drop or browse). Under the drop zone: "Your CV is read on
  this device only. It is never uploaded or saved."
- **Reading**: busy state while text is extracted. The parsers load with `import()` only now, so the
  initial bundle budget is unchanged. The pdf.js worker is copied in via `angular.json` assets so it
  is served on GitHub Pages.
- **Results**: "We found these in your CV". One row per action (a shared milestone such as ISTQB
  Foundation appears once): action title, the milestone it completes, and about 60 characters of
  CV text around the match, so "preparing for ISTQB Foundation" can be unticked. Rows are ticked by
  default. Actions already satisfied on the account are listed under "Already recorded" without a
  checkbox.
- **Save** sends the ticked IDs; the tree redraws from the response. **Cancel** saves nothing.
- Milestone detail labels each achievement "From your CV" or "Self-reported".

Errors (each its own message, each pointing to manual recording):

| Case | Message |
| --- | --- |
| Not .pdf/.docx, or over 10 MB | Choose a PDF or Word (.docx) file up to 10 MB. |
| Password-protected or corrupt | We couldn't open this file. |
| Under ~50 characters of text | We couldn't read text from this file (it may be a scanned image). |
| No matches | We didn't find any certifications we recognise. |
| Save fails | Results stay with a retry; never shown as saved. |

Units:

- `matchCvText(text, steps, satisfiedActionIds)`: pure function in `app/src/app/utils/` returning
  found and already-recorded rows with snippets.
- Text extraction lives in a service behind a replaceable member (CI rule: never `vi.mock` a
  library), so specs feed text directly.
- Career editor (`ui/career-path-editor/`): a "CV keywords" list per action.

## API and storage impact (`api/src/**`)

- **Schema** (`careerPath.ts`): each action gains `cvKeywords: string[]`, default `[]`, at most 10,
  each trimmed, 1–80 characters, duplicates removed. Published with the career and returned by the
  public `GET /career-paths[/:id]`. Changing keywords is not a change of action meaning: the
  action-ID reuse check still compares only kind, course and title.
- **Starter keywords** in the built-in career definitions for the ISTQB exams they contain (e.g.
  Foundation: `ISTQB Foundation`, `Certified Tester Foundation Level`, `CTFL`).
- **Route** `POST /users/me/achievements/cv`, bearer token required, body
  `{ actionIds: string[] }` (1–50, each `careerPathIdSchema`, Zod). Every ID must belong to an action
  in a published milestone-format career, otherwise 404 and nothing is saved. No follow check, no
  lock check. One atomic `accounts.mutate`: actions already present are skipped (their provenance
  is kept); new ones are stored `{ actionId, provenance: 'cv', declaredAt }`. Answers the
  `AccountCareers` view, `no-store` like the other account career routes.
- **Provenance type** (`accountCareersRepository.ts`): `'self-reported' | 'cv'`.
- **State rule** (`milestoneStates` in `accountCareers.ts`): achieved if any route is fully
  satisfied; else ready if every prerequisite is achieved; else locked.
- Manual `POST /users/me/achievements` is unchanged: still self-reported, still refuses locked
  milestones and unfollowed careers.

## Migration and compatibility

- No data migration: stored careers without `cvKeywords` parse with the default; stored achievements
  keep `self-reported`.
- The new route and field are additive. An old frontend ignores `cvKeywords` and the `cv` value. The
  state-rule change is visible to old frontends as well (they show states as given), which is the
  intended behavior.

## Split

| Owner | Scope |
| --- | --- |
| Codex | `api/src/**`: schema field, starter keywords, CV route, `cv` provenance, state rule, API tests, the `verify:journeys` step (`api/src/journey.test.ts`). |
| Claude | `app/`: editor field, setup step and "Scan my CV", extraction, matcher, provenance label, page specs, browser check. |

Contract Claude relies on: action `cvKeywords: string[]` in public career data;
`POST /users/me/achievements/cv { actionIds }` answering `AccountCareers` with achievements carrying
`provenance: 'cv'`; states computed with the new rule.

## Verification map

| Scenario | Check |
| --- | --- |
| AC01 recognise from PDF/.docx | App: `matchCvText` unit tests; page spec with fed text; browser check with one real PDF and one real .docx |
| AC02 confirm before saving | Page spec (untick, save sends only ticked IDs); API route test |
| AC03 CV stays on the device | Page spec asserts the save request body holds only `actionIds`; browser check of network requests |
| AC04 already recorded, no duplicates | Matcher test; API test keeps existing provenance and skips repeats |
| AC05 out-of-order evidence | API: route saves on a locked milestone; state rule test; manual declare still refuses |
| AC06 unreadable or empty file | Page specs per error message |
| AC07 curate CV keywords | API schema limits and publish round-trip; editor spec; non-admin refused (existing curation tests) |
| AC08 save failure | Page spec: failed save keeps results and offers retry |
| Release journey | `npm run verify:journeys`: learner saves a CV finding and Foundation reads achieved |

## Later (not this version)

Years-of-experience estimates; OCR for scanned PDFs; pasted text; admin verification; removing an
achievement saved by mistake (same open limit as manual declarations).

## Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task by task. Steps use checkboxes (`- [ ]`).

**Goal:** Learners scan a PDF or .docx CV in the browser, confirm the certifications found, and
save them as `cv` achievements that count even out of order.

**Architecture:** The API gains a `cvKeywords` field on career actions, a batch
`POST /users/me/achievements/cv` route and the relaxed state rule (Codex, tasks C1–C4). The app
extracts text with lazily loaded `pdfjs-dist`/`mammoth`, matches it with a pure function, and shows
a confirm-before-save panel in setup and on the career page (Claude, tasks A1–A6). The two sides
meet only at the contract in [Split](#split).

**Tech stack:** Express + Zod + Vitest (API); Angular signals + Vitest (app); `pdfjs-dist`, `mammoth`.

**Spec:** this file, sections above.

### Global constraints

- Accepted files: `.pdf` and `.docx` (extension, case-insensitive), at most 10 MB (`10 * 1024 * 1024` bytes).
- `cvKeywords`: at most 10 per action, each trimmed, 1–80 characters; default `[]`.
- CV route body: `{ actionIds }`, 1–50 IDs, each `careerPathIdSchema`.
- No request may carry CV text, the file, its name or a snippet. Only `actionIds` leave the browser.
- Parsers load with `import()` on file choice; `npm run app:build:pages` must stay within the 500 kB
  initial warning budget.
- Never `vi.mock` a library (CLAUDE.md, CI): override a replaceable member instead.
- Copy is fixed by the spec's error table and flow; reuse it verbatim.
- Each commit bumps the version in `package.json`, `app/package.json`, `package-lock.json` (3 lines)
  and `AppStateService.appVersion`; stage by path; isolated in-memory stores only; commit locally,
  never push.
- Frontend tasks (A4, A5) load the `design-taste-frontend` skill first (CLAUDE.md).

### Review focus

1. **A job title is not a certificate.** "Test Automation Engineer at Acme" must not match the
   Automation Engineer exam: starter keywords never contain a bare job title (test in C1).
2. **Keywords with regex characters** such as `ISTQB (CTFL)` or `C++` match literally and never
   throw (test in A2).
3. **Scanning again after saving** lists the saved action under "Already recorded"; choosing the
   same file twice still fires (input value reset) (test in A4).
4. **A dropped `.doc` or other file** bypasses the `accept` attribute and must get the type message
   (tests in A3 and A4).
5. **A password-protected PDF** makes pdf.js throw; the learner sees "We couldn't open this file."
   Only the browser check (A6) proves the real library path.

---

### Task C1 (Codex): `cvKeywords` on actions, starter keywords

**Files:** Modify `api/src/careerPath.ts` (action schema, launch seeds). Test `api/src/careerPath.test.ts`.

**Produces:** every action in public `GET /career-paths[/:id]` carries `cvKeywords: string[]`.

- [ ] **Step 1: Failing tests**
  - `US-L023-AC07 parses cvKeywords with defaults and limits`: an action without the field parses to
    `cvKeywords: []`; `['  CTFL ', 'CTFL']` parses to `['CTFL']`; 11 keywords, `''` and an
    81-character keyword are refused.
  - `US-L023-AC07 a keyword change keeps the published action ID valid`: `careerPathIssues` reports
    no issue when only `cvKeywords` differs from the previous published revision.
  - `US-L023-AC07 public career data includes cvKeywords` (published career → `GET /career-paths/:id`).
  - `US-L023 starter keywords name certifications, not job titles`: in `careerPathSeeds` the
    `foundation-exam` action has `['ISTQB Foundation', 'Certified Tester Foundation Level', 'CTFL']`;
    no seed keyword equals (case-insensitive) a job title: `Test Automation Engineer`,
    `Technical Test Analyst`, `Test Manager`, `Test Analyst`, `Advanced Test Analyst`.
- [ ] **Step 2:** Run `npm --prefix api test -- src/careerPath.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** Action schema gains
  `cvKeywords: z.array(z.string().trim().min(1).max(80)).max(10).default([]).transform(list => [...new Set(list)])`.
  The action-ID reuse check stays on kind, courseId and title. In the launch seeds, set keywords on
  exam actions by milestone ID:

  | Milestone | `cvKeywords` |
  | --- | --- |
  | `foundation` | `ISTQB Foundation`, `Certified Tester Foundation Level`, `CTFL` |
  | `automation-engineer` | `ISTQB Advanced Test Automation Engineer`, `Advanced Level Test Automation Engineer`, `CTAL-TAE` |
  | `technical-test-analyst` | `ISTQB Advanced Technical Test Analyst`, `Advanced Level Technical Test Analyst`, `CTAL-TTA` |
  | `advanced-test-manager` | `ISTQB Advanced Test Management`, `ISTQB Advanced Test Manager`, `Advanced Level Test Manager`, `CTAL-TM` |
  | `agile-leadership-exam` | `ISTQB Advanced Agile Test Leadership at Scale`, `CTAL-ATLaS` |
  | `advanced-test-analyst` | `ISTQB Advanced Test Analyst`, `Advanced Level Test Analyst`, `CTAL-TA` |
  | `acceptance-testing` | `ISTQB Acceptance Testing`, `CT-AcT` |
- [ ] **Step 4:** Rerun; expect PASS. `npm run api:test`; expect PASS.
- [ ] **Step 5:** Commit `feat(US-L023): cvKeywords on career actions`.

### Task C2 (Codex): satisfied milestones are achieved regardless of prerequisites

**Files:** Modify `api/src/accountCareers.ts` (`milestoneStates`). Test `api/src/accountCareers.test.ts`.

**Produces:** `milestoneStates` = achieved if any non-empty route is fully satisfied; else ready if
every prerequisite is achieved; else locked. Unknown or cyclic steps stay locked.

- [ ] **Step 1: Failing test** `US-L023-AC05 a satisfied milestone is achieved even when its prerequisite is not`:
  steps `a`, `b` (prerequisite `a`), `c` (prerequisite `b`);
  `milestoneStates(steps, new Set(['b-exam']))` equals `{ a: 'ready', b: 'achieved', c: 'ready' }`.
- [ ] **Step 2:** Run the file; expect FAIL (`b` is `locked`).
- [ ] **Step 3:** In `evaluate`, check `achieved` before `unlocked`.
- [ ] **Step 4:** `npm run api:test`; expect PASS (existing lock tests hold: nothing satisfies those milestones).
- [ ] **Step 5:** Commit `feat(US-L023): out-of-order evidence counts as achieved`.

### Task C3 (Codex): `POST /users/me/achievements/cv`

**Files:** Modify `api/src/accountCareersRepository.ts` (provenance type), `api/src/accountCareers.ts`
(`recognise`), `api/src/accountCareersRoutes.ts` (route). Test `api/src/accountCareers.test.ts`.

**Consumes:** C2. **Produces:** `CareerAchievement.provenance: 'self-reported' | 'cv'`;
`AccountCareersService.recognise(userId: string, actionIds: string[]): Promise<AccountCareers>`;
the route answers the `AccountCareers` view.

- [ ] **Step 1: Failing tests** in the existing `describe.each(['', '/api'])`, with helper
  `recognise = (actionIds, extra = {}) => request('/users/me/achievements/cv', 'POST', { actionIds, ...extra })`:
  - `US-L023-AC02 saves cv achievements without following`:
    `recognise(['foundation-exam'], { provenance: 'self-reported', userId: other.id })` → 200;
    `achievements` equals `[{ actionId: 'foundation-exam', provenance: 'cv', declaredAt: expect.any(String) }]`;
    `milestoneStates.foundation === 'achieved'`; `other` has no achievements.
  - `US-L023-AC05 saves on a locked milestone and the manual rule is unchanged`: `recognise(['further-exam'])`
    → `further: 'achieved'`, `automation: 'locked'`; after `follow('technical-tester')`,
    `declare('automation-exam')` → 409 `milestone-locked`.
  - `US-L023-AC04 keeps existing provenance and never duplicates`: follow, `declare('foundation-exam')`,
    `recognise(['foundation-exam', 'analysis-exam', 'analysis-exam'])` → two achievements, foundation
    `self-reported`, analysis `cv`; repeating the call returns an equal body.
  - `US-L023 refuses unknown IDs atomically and invalid or anonymous requests`:
    `['foundation-exam', 'unknown-action']` → 404 and `achievements` stays `[]`; bodies `{}`,
    `{ actionIds: [] }` and 51 IDs → 400; anonymous → 401 with `cache-control: private, no-store`.
- [ ] **Step 2:** Run the file; expect FAIL (route missing).
- [ ] **Step 3: Implement.** Body schema `z.object({ actionIds: z.array(careerPathIdSchema).min(1).max(50) })`.
  `recognise` checks every ID against `context.steps` first (404 `Achievement action not found`),
  then one `accounts.mutate` appends `{ actionId, provenance: 'cv', declaredAt }` for IDs not already
  present. No follow or lock check. The existing no-store `app.use` prefix already covers the path.
- [ ] **Step 4:** `npm run api:test`; expect PASS.
- [ ] **Step 5:** Commit `feat(US-L023): save confirmed CV achievements`.

### Task C4 (Codex): release journey

**Files:** Modify `api/src/journey.test.ts`.

- [ ] **Step 1:** New test after the US-A004 journey step,
  `US-L023-AC02 US-L023-AC05 a learner saves a CV finding out of order`: the learner posts
  `{ actionIds: ['advanced-test-manager-exam'] }` before achieving `test-manager-role`; expect
  `milestoneStates['advanced-test-manager'] === 'achieved'`, that achievement's provenance `cv`, and
  `milestoneStates['test-manager-role']` unchanged from before the call.
- [ ] **Step 2:** `npm run verify:journeys`; expect PASS.
- [ ] **Step 3:** Commit `test(US-L023): CV finding in the release journey`; update the Codex row in
  `docs/work_queue.md`.

### Task A1 (Claude): models, service call, provenance label

**Files:** Modify `app/src/app/app.models.ts`, `app/src/app/services/career-path.service.ts`,
`app/src/app/ui/career-tree/career-tree.ts`. Test `app/src/app/pages/career-path-page/career-path-page.spec.ts`.

**Produces:** `CareerPathAction.cvKeywords?: string[]`; achievement provenance `'self-reported' | 'cv'`;
`CareerPathService.recogniseFromCv(actionIds: string[]): Promise<CareerPathResult>` (via `careersWrite`).

- [ ] **Step 1: Failing test** `US-L023-AC02 an achievement saved from a CV reads "From your CV"`: the
  careers signal holds `{ actionId: 'foundation-exam', provenance: 'cv' }`; selecting Foundation shows
  `From your CV`, not `Self-reported`.
- [ ] **Step 2:** `(cd app && npx ng test --watch=false --include src/app/pages/career-path-page/career-path-page.spec.ts)`; expect FAIL.
- [ ] **Step 3:** `evidence()` reads the matching achievement's provenance: `cv` → `From your CV`.
- [ ] **Step 4:** Rerun; expect PASS. Commit `feat(US-L023): cv provenance in the app`.

### Task A2 (Claude): `matchCvText`

**Files:** Create `app/src/app/utils/cv-match.ts` and `cv-match.spec.ts`.

**Produces:**
`type CvMatch = { actionId: string; actionTitle: string; milestoneTitle: string; snippet: string }`;
`matchCvText(text: string, paths: CareerPath[], satisfiedActionIds: string[]): { found: CvMatch[]; alreadyRecorded: CvMatch[] }`.

- [ ] **Step 1: Failing tests**
  - finds `Certified Tester Foundation Level` in `'ISTQB® Certified Tester\n  Foundation Level (2019)'`;
    the snippet contains `certified tester foundation level`.
  - case-insensitive; `CTFL` matches `CTFL,` but not `CTFLX`.
  - `CTAL‑TM` written with U+2011 matches keyword `CTAL-TM`.
  - keyword `ISTQB (CTFL)` matches literally; keyword `C++` does not throw.
  - a shared action in two careers is listed once, in career then step order.
  - a satisfied action goes to `alreadyRecorded`, not `found`.
  - `schemaVersion` 1 careers and actions without keywords never match.
- [ ] **Step 2:** Run the spec; expect FAIL (module missing).
- [ ] **Step 3: Implement.** Normalise text and keywords alike: `normalize('NFKC')`, lowercase,
  `[‐-―−]` → `-`, `\s+` → one space. Whole-word test: escaped keyword between
  `(?<![\p{L}\p{N}])` and `(?![\p{L}\p{N}])` with the `u` flag. Snippet: up to 30 characters either
  side of the first hit in the normalised text, with `…` where cut.
- [ ] **Step 4:** Rerun; expect PASS. Commit `feat(US-L023): match CV text to career actions`.

### Task A3 (Claude): `CvTextService` and parsers

**Files:** Create `app/src/app/services/cv-text.service.ts` and `cv-text.service.spec.ts`. Modify
`app/package.json` (+ lockfile) and `app/angular.json` (pdf.js worker asset).

**Produces:**
`type CvReadResult = { ok: true; text: string } | { ok: false; reason: 'type' | 'size' | 'unreadable' | 'no-text' }`;
`CvTextService.read(file: File): Promise<CvReadResult>`; replaceable member
`extractors: Record<'pdf' | 'docx', (data: ArrayBuffer) => Promise<string>>`.

- [ ] **Step 1:** `npm install --workspace app pdfjs-dist mammoth`.
- [ ] **Step 2: Failing tests** (override `service.extractors`): `cv.doc` → `type`; `CV.PDF` accepted;
  a `10 * 1024 * 1024 + 1` byte `.pdf` → `size` without calling an extractor; an extractor that throws
  → `unreadable`; 49 non-space characters → `no-text`; a `.docx` returning a long text → `{ ok: true, text }`.
- [ ] **Step 3:** Run the spec; expect FAIL.
- [ ] **Step 4: Implement.** Default extractors: `import('pdfjs-dist')`, every page's `getTextContent()`
  items joined with spaces, `GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href`;
  `import('mammoth')` `extractRawText({ arrayBuffer })`. An `assets` entry copies
  `pdfjs-dist/build/pdf.worker.min.mjs` to the output root; its `input` points where npm placed
  `pdfjs-dist` (root `node_modules` when hoisted).
- [ ] **Step 5:** Rerun; expect PASS. `npm run app:build:pages`: no new initial-budget warning and
  `pdf.worker.min.mjs` in the output. Commit `feat(US-L023): read PDF and Word CVs in the browser`.

### Task A4 (Claude): CV scan panel in setup and on the career page

**Files:** Create `app/src/app/ui/cv-scan/cv-scan.{ts,html,scss,spec.ts}`. Modify
`app/src/app/pages/career-path-page/career-path-page.{ts,html,scss}` and its spec.

**Consumes:** A1 `recogniseFromCv`, A2 `matchCvText`, A3 `CvTextService.read`.
**Produces:** `CvScan` (`app-cv-scan`), output `done: void`, emitted after a successful save or Cancel.

- [ ] **Step 1: Failing tests** (`cv-scan.spec.ts` with faked `CareerPathService` and `CvTextService`;
  clear both storages in `beforeEach`):
  - `US-L023-AC01` two found rows show title, milestone and snippet, both ticked; "Already recorded"
    rows have no checkbox.
  - `US-L023-AC02 AC03` untick one, Save → `recogniseFromCv` called once with only the ticked ID, and
    the payload has no key but `actionIds`; Cancel instead → no call, `done` emitted.
  - `US-L023-AC06` one test per message in the error table, including a dropped `cv.doc` and no matches.
  - `US-L023-AC08` a failed save keeps the rows, shows the error with a retry and no success.
  - review focus 3: after a save, choosing the same file again lists the action under "Already recorded".
  - career page: the setup step reads "Upload your CV" with no "Preview only" text and a step label
    other than "CV preview"; a milestone-format career shows "Scan my CV", which opens the panel.
- [ ] **Step 2:** Run both specs; expect FAIL.
- [ ] **Step 3: Implement.** Load `design-taste-frontend` first. Move the dropzone markup and styles
  from the page into `CvScan`; `accept=".pdf,.docx"`; the on-device notice under it. States: choose →
  reading → results | error. Keep only the match rows in a signal; drop the `File` and text after
  matching, reset the input value, and clear rows on Cancel, `done` and destroy. Page: remove
  `cvFileName` and its notice; the setup step renders `<app-cv-scan (done)="continueToQuestions()" />`
  plus "Skip this step"; the roadmap gets "Scan my CV" (milestone-format careers only); the line
  "CV recognition is coming later…" becomes "Record achievements yourself, or scan your CV to find
  certifications."
- [ ] **Step 4:** Rerun; `npm run app:test`; expect PASS. Commit `feat(US-L023): scan a CV and confirm findings`.

### Task A5 (Claude): CV keywords in the career editor

**Files:** Modify `app/src/app/ui/career-path-editor/career-path-editor.{ts,html}` and its spec.

- [ ] **Step 1: Failing test** `US-L023-AC07 CV keywords are edited one per line`: typing
  `ISTQB Foundation\n\n CTFL ` into an action's "CV keywords" textarea saves the draft with
  `cvKeywords: ['ISTQB Foundation', 'CTFL']`; a new action starts with `[]`.
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3:** Load `design-taste-frontend` first. Textarea under the action title, hint "Exact
  phrases from a CV, such as CTFL. Up to 10."; split on newlines, trim, drop empties. Over-limit input
  is refused by the API through the existing save error.
- [ ] **Step 4:** Rerun; expect PASS. Commit `feat(US-L023): edit CV keywords`.

### Task A6 (Claude): checks, browser proof, record

- [ ] **Step 1:** After Codex has committed C1–C4: `npm run api:test`, `npm run app:test`,
  `npm run verify:journeys`, `npm run app:build:pages`; all PASS.
- [ ] **Step 2:** Browser check on 4200/3001 (in-memory): as admin, publish a milestone career with
  starter keywords; as student, scan a real PDF, a real .docx (both made in the scratchpad) and a
  password-protected PDF; untick one result and save; the network panel shows only
  `{"actionIds":[…]}`; the tree shows the milestone achieved and "From your CV". Screenshots to
  `docs/history/verification/<date>/`.
- [ ] **Step 3:** Fold behavior into `docs/specs/career-paths/milestones-and-achievements.md` (rules,
  provenance, state rule), `careers.md` (setup step, Scan my CV) and `curation.md` (CV keywords);
  remove US-L023 from `docs/user_stories.md`; delete this contract; add "hosted careers need CV
  keywords: publish with starter keywords or add them in the editor" to Open release checks in
  `docs/work_queue.md`. Commit locally.
