# Teacher feedback: quiz authoring and moving lessons — Codex handoff

Assigned 2026-10-10 by Claude Code (lead). Source: feedback from the first teacher who built
a course on the live site, relayed by Alex. Runs in parallel with Claude's rework of the
course form in this same working tree. Read `AGENTS.md` (including "Two agents in one working
tree") first.

## Scope

Add two stories to `docs/user_stories.md`, write `docs/specs/US-T011-T012-course-builder.md`
before implementing, then deliver both.

### US-T011 — Author quiz questions without losing my place

Teacher's words: "when adding a new question, it should scroll to the top of the new question
instead of the bottom. Make it more obvious that each question has been collapsed. Also look
at the UI design for quizzes and give the user a better experience."

- AC01: Adding a question opens it, collapses the others, brings the top of the new question
  (its header) to the top of the visible editor area, and puts the cursor in its question
  text field.
- AC02: A collapsed question reads as collapsed at a glance: an expand control with
  `aria-expanded`, and one summary line with the question text, points, number of answers and
  whether a correct answer is marked. The open question looks clearly different.
- AC03: Clicking the header of the open question collapses it. Today it can only be opened.
- AC04: A collapsed question that would block submitting for review (use the existing
  readiness rules; do not invent new ones) is marked as needing attention, with the reason
  available without opening it.
- AC05: Everything works with the keyboard alone and at a 375px wide screen.

For the design: stay inside the builder's existing visual language (its colours, corner
radius, type). No new dependency. No emoji, no em dashes in visible text. Reduce the number
of boxes inside boxes rather than adding decoration.

### US-T012 — Move a lesson to another chapter

Teacher's words: "Move components to different chapters."

- AC01: Dragging a lesson onto a position in another chapter, or onto the end of another
  chapter including an empty one, moves it there.
- AC02: Each lesson also has a control that lists the other chapters and moves the lesson to
  the end of the chosen one, for keyboard and touch use.
- AC03: The moved lesson keeps its ID, text, video, attachments and quiz. It counts as an
  unsaved change like any other edit, and saving, draft recovery and conflict handling work
  as for a reorder within a chapter.
- AC04: Nothing can be moved while the builder is read-only, or while that lesson has an
  upload in progress.
- AC05: After saving, a moved lesson's video still plays and its attachments still download
  and can be added and removed. The upload, webhook and attachment routes identify a lesson
  by chapter and lesson ID; prove this with API tests, and fix what fails.

## Contract with Claude's side

- Keep every existing output of `CourseBuilder` and its payload shape. Extend the
  `courseComponentMoved` payload with an optional `toSectionIndex` (absent means the same
  chapter, today's behaviour). `course-editor-page` only passes that event through, so it
  needs no change.
- Do not rename or remove inputs of `CourseBuilder`.

## Files

Yours: `app/src/app/ui/course-builder/**`; the moved-event type in `app/src/app/app.models.ts`;
in `app/src/app/services/app-state.service.ts` only the handler for moving a lesson and the
version line; the spec files that cover them; `api/src/**` for AC05;
`docs/specs/US-T011-T012-course-builder.md`, `docs/user_stories.md`,
`docs/defect_management.md`, `docs/architecture.md`, and your row in `docs/work_queue.md`.

Not yours (Claude is editing them now): `app/src/app/pages/**`,
`app/src/app/ui/course-review-panel/**`, `app/src/app/routes/**`, `CLAUDE.md`,
`docs/specs/US-T010-guided-course-form.md`.

## Verification

Run `npm run api:test`, `npm run app:test`, `npm run verify:journeys`, `npm run api:build` and
`npm run app:build:pages`. A frontend failure caused by Claude's unfinished files under
`app/src/app/pages/` is reported, not fixed, and does not block your commit. Do not start
servers on ports 3001 or 4200; Claude does the browser check of your part at review time, so
say in your queue row exactly what to look at.

## Delivery

Work and commit here on `main`. Stage your own files by path; never `git add -A`; never
stash, reset or restore changes you did not make. Read the version from `package.json` right
before committing and apply the aligned bump the hook requires. Isolated in-memory stores
only. If you need a file outside your list, do not wait for an answer: write the need in your
queue row, commit what is yours, and stop. Do not push. Update your queue row with the commit,
what you verified and what you could not, then stop and summarize.
