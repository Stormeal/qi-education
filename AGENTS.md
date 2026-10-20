# Working on QI Academy

Read [docs/README.md](docs/README.md), [the work queue](docs/work_queue.md), and
[the delivery workflow](docs/development_workflow.md) before selecting work.
Engineering conventions are in [.agents/AGENTS.md](.agents/AGENTS.md).

## Source of truth

- What the app does: `docs/specs/<area>/` (current behavior), [business rules](docs/business_rules.md),
  [architecture](docs/architecture.md), [tech stack](docs/tech_stack.md).
- What is planned: [user stories](docs/user_stories.md) and, for detailed contracts, `docs/stories/`
  (use [the template](docs/templates/feature_spec.md)).
- Bugs and investigations: [docs/defects.md](docs/defects.md) (open);
  [docs/defects_resolved.md](docs/defects_resolved.md) (look up an old ID).
- Setup and checks: [docs/local_development.md](docs/local_development.md).

## Find the right document

Load only what the task needs. Match the task's words to a row and read that file; read
`business_rules.md` when roles, permissions or limits matter, and `architecture.md` before adding
files. Do not read `docs/history/` or `docs/defects_resolved.md` unless the task is about the past
or names an old ID. Keep this table identical to the one in `CLAUDE.md`.

| Keywords in the task | Read (under `docs/`) |
| --- | --- |
| login, signup, session, token, remember me, `/auth/me`, sign-in limit, 429, disabled account | `specs/accounts/sign-in-and-sessions.md` |
| password reset, reset link, change password, account mail, email confirmation, `/confirm-email`, Brevo | `specs/accounts/passwords-and-email.md` |
| profile, avatar, bio, job title, instructor description | `specs/accounts/profiles.md` |
| catalog, `/courses`, carousel, search, filter, sort, category, course card | `specs/catalog/browse.md` |
| course details, `/courses/:id`, enroll, enrollment, outline, price shown | `specs/catalog/course-details-and-enrollment.md` |
| payment, buy, Stripe, checkout, receipts, billing portal, 402 | `specs/payments/payments.md` |
| course editor, course form, steps, ownership, unsaved changes, draft recovery, save conflict, 409, 428 | `specs/authoring/course-editor.md` |
| course builder, lesson, chapter, section, move lesson, exercise, attachment, file, thumbnail | `specs/authoring/lessons-and-builder.md` |
| quiz, question, answer, pass mark, grading, quiz attempt, question image | `specs/authoring/quizzes.md` |
| video, Mux, UpChunk, webhook, playback | `specs/authoring/video.md` |
| review, submit, return, publish, archive, revision, review history, price, catalog settings | `specs/authoring/review-and-publication.md` |
| Home, dashboard, My Learning, library list | `specs/learning/home-and-library.md` |
| learning page, `/library/:id`, notes, lesson feedback, up next, Previous/Next, course facts | `specs/learning/learning-page.md` |
| progress, completion, percentage, resume, `learning-progress` | `specs/learning/progress.md` |
| career path, follow career, focus, career tree, CV preview, Home career tile | `specs/career-paths/careers.md` |
| milestone, achievement, declaration, prerequisite, unlock, requirement route, bundle | `specs/career-paths/milestones-and-achievements.md` |
| career editor, publish/withdraw career, convert to milestone format, curriculum | `specs/career-paths/curation.md`, `stories/US-A004-curriculum-review.md` |
| admin users, role change, disable account, admin reset link, change log | `specs/admin/users.md` |
| feedback, triage, GitHub issue, feedback inbox | `specs/admin/feedback.md` |
| MongoDB, Google Sheets, store, in-memory, isolated, `USE_SHARED_SERVICES`, health, doctor, migrate, read-only freeze, backup, restore | `specs/platform/storage-and-run-modes.md` |
| lock, `withCourseLock`, concurrency, race, retry, queue, cache, `Cache-Control`, error response | `specs/platform/reliability.md` |
| CI, GitHub Pages, Vercel, deploy, push, version bump, git hook | `specs/platform/deployment-and-checks.md` |
| button, tabs, chip, progress bar, focus ring, colour, design value, `tailwind.css`, accessibility | `specs/platform/ui-foundation.md` |
| new file, new route, new repository, where code goes, conventions | `architecture.md` |
| a library or version | `tech_stack.md` |
| `DEF-…` / `INV-…` | `defects.md`, then `defects_resolved.md` |
| `US-…` | `user_stories.md`, then `stories/` |

## Start of a task

1. Check the branch, working tree, and remote state. Preserve local changes.
2. Follow the user's requested item. Otherwise consult `work_queue.md`: resume
   an active item first, then select the first Ready item whose dependencies are met.
   A Ready entry describes implementable work; it does not authorize starting work
   outside the user's request. Never silently implement a Proposed story.
3. Read the entire story, its contract in `docs/stories/` if any, its linked defects, the
   area spec it changes (see the table above), and the affected code.
   Resolve missing product decisions before dependent implementation.
4. Record the item ID, owner, branch, base commit, and next step in the queue when
   implementation starts. Keep unfinished work resumable.

## Two agents in one working tree

Claude Code and Codex may work in this folder at the same time, each on files assigned in
the work queue and the handoff. Stage your own files by path; never `git add -A`, and never
stash, reset, restore or check out changes you did not make. Read the version from
`package.json` right before committing. Report a failure caused by the other agent's files
instead of fixing it.

## Delivery

- Work and commit on `main` in this project unless the user requests a branch.
  Do not create a worktree or branch merely because a generic workflow suggests it.
- Treat Given/When/Then scenarios as the behavior contract. Map scenario IDs to
  meaningful tests and browser evidence. Inspect connected frontend/API contracts.
- Record newly discovered defects with reproduction evidence; record new feature
  ideas as Proposed stories with BDD criteria. Do not silently expand the task.
- Never run mutation probes against shared Sheets, MongoDB, Mux, or GitHub data.
  Use isolated test stores; report any integration coverage limitations.
- Update story, defect, spec, and queue status together. When a story is delivered, fold its
  behavior into the area spec, then remove it from `docs/user_stories.md` and delete its
  `docs/stories/` contract. A resolved defect moves to `docs/defects_resolved.md` and is never
  deleted. Done requires verification evidence and a delivery commit; Deferred or Blocked must
  explain the next action.
- Prioritize confirmed defects before enhancements within the requested journey.
  Preserve resolved defect records with the fix, date, commit, regression evidence,
  and any remaining release checks.
- Do not bypass git hooks. The current hook requires a semver change even for docs.
  Follow the version instructions in `docs/development_workflow.md` when committing.
- A request to implement or commit does not automatically authorize a deployment
  or push. Pushing `main` triggers GitHub Pages deployment.
