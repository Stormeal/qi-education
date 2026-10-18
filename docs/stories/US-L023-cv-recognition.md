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
| Codex | `api/src/**`: schema field, starter keywords, CV route, `cv` provenance, state rule, API tests. |
| Claude | `app/`: editor field, setup step and "Scan my CV", extraction, matcher, provenance label, page specs, `verify:journeys` step, browser check. |

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
