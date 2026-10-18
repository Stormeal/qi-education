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
- **States** (achieved, ready, locked) are computed by the API and shown as given. A milestone is
  ready when all its prerequisites are achieved; a locked milestone can be inspected but its actions
  cannot be declared (the API refuses and names the missing prerequisites).
- Sibling branches stay open: achieving one never closes another. Routes can continue past a role
  milestone; achieving it is not "career finished" and awards no job title.

## Rules

- New accounts start with no achievements; nothing is inferred from role, job title, answers or CV.
- A declaration never changes lesson completion, quiz results or enrollment, and grants no access.
- A published action ID keeps its meaning; a changed exam or course needs a new action ID.

## Code

- API: `accountCareers.ts` (evidence and state evaluation), `accountCareersRepository.ts`
  (per-account atomic writes), `careerPath.ts` (schema version 2, graph validation).
- App: milestone detail and declaration dialog in `pages/career-path-page/` and `ui/career-tree/`.

## Limits

- No correction or removal of a declaration, and no admin verification of evidence.
- Updating learners when a milestone's criteria change (requirement versions, notice) is open (US-A004-AC06).
- Recognising achievements from a CV is future work (US-L023).
