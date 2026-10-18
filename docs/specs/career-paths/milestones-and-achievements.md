# Milestones and achievements

## Purpose

Milestones turn a career into concrete, checkable steps; achievements record what the learner has
actually done, once, and count wherever they apply.

## Behavior

- A **milestone** has a stable global ID, a title, a stage, prerequisite milestones (possibly from
  other careers), optional preparation courses and a completion requirement. Careers reference
  milestones; a shared milestone such as ISTQB Foundation is the same milestone in every career.
- A **completion requirement** is one or more **routes** (action bundles): every action in one
  route is required; satisfying any one route is enough. Actions are an exam, a course or another
  activity.
- **Preparation courses never satisfy a requirement.** Preparing for an exam does not pass it.
- A **course action** is satisfied by a declaration or by real 100% completion of that course on the
  account. An **exam or activity** only by a declaration.
- **Declarations** (`POST /users/me/achievements`): the learner confirms they completed or passed an
  action. The server stores it on the authenticated account with `self-reported` provenance and the
  time. Repeating it creates no duplicate. Declarations are add-only in this release.
- **CV recognition**: the learner scans a PDF or Word (.docx) CV of up to 10 MB in the browser.
  The text is matched against each published milestone action's **CV keywords** (case-insensitive,
  whole words, dashes and spacing normalised). Every finding is listed ticked, with its milestone
  and the matched CV text; actions already satisfied are listed as "Already recorded". Save
  (`POST /users/me/achievements/cv { actionIds }`, 1 to 50) stores the ticked ones with `cv`
  provenance ("From your CV"), needs no followed career and ignores locks; existing achievements
  keep their provenance. An unknown ID refuses the whole request (404). Unreadable, scanned,
  wrong-type, too-large and no-match files each get their own message.
- **States** (achieved, ready, locked) are computed by the API and shown as given. A milestone is
  **achieved** when one requirement route is satisfied, even if its prerequisites are not (evidence
  can arrive out of order); otherwise **ready** when all its prerequisites are achieved, else
  **locked**. A missing or cyclic prerequisite graph stays locked. Actions of a locked milestone
  cannot be declared manually (the API refuses and names the missing prerequisites).
- Sibling branches stay open: achieving one never closes another. Routes can continue past a role
  milestone; achieving it is not "career finished" and awards no job title.

## Rules

- New accounts start with no achievements; nothing is inferred from role, job title or answers.
- The CV never leaves the browser: no request carries the file, its name, its text or a snippet.
  The text is dropped once matches are shown; only confirmed action IDs are sent.
- A declaration never changes lesson completion, quiz results or enrollment, and grants no access.
- A published action ID keeps its meaning; a changed exam or course needs a new action ID.

## Code

- API: `accountCareers.ts` (evidence and state evaluation), `accountCareersRepository.ts`
  (per-account atomic writes), `careerPath.ts` (schema version 2, graph validation).
- App: milestone detail and declaration dialog in `pages/career-path-page/` and `ui/career-tree/`;
  CV scan in `ui/cv-scan/`, `services/cv-text.service.ts` (lazy `pdfjs-dist` and `mammoth`; the
  pdf.js worker is copied to the app root by `angular.json`) and `utils/cv-match.ts`.

## Limits

- No correction or removal of a declaration, and no admin verification of evidence.
- Updating learners when a milestone's criteria change (requirement versions, notice) is open (US-A004-AC06).
- CV recognition has no OCR (scanned PDFs), no pasted text, no years-of-experience estimate and no
  admin verification. A CV achievement saved by mistake cannot be removed yet.
