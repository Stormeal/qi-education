# US-L006, US-L009, US-L012, US-T008: curated career paths, selection, and milestones

## Record

- Stories: [US-L009, US-L012, US-T008](../user_stories.md), plus the US-L006 read
  foundation they depend on.
- State: In progress — first increment delivered on `main` 2026-10-09 (version 0.1.59).
  Remaining work is listed at the end.
- Owner: Claude Code. Selected by the user 2026-10-09.
- Branch/base: `main`, on top of the US-T003/US-T005 delivery `150e701`.
- Product decisions (user, 2026-10-09):
  1. Paths are curated by **admins only**, in an editor on the Admin page, stored in MongoDB.
  2. The concept wizard's **CV step stays, marked as a preview**. Nothing is
     uploaded, read, or inferred from it.
- Decisions taken by the implementer from the stories' recommendations (confirm or change):
  - One primary path per account; choosing another replaces it.
  - A step is complete when any one of its courses is 100% complete under the
    existing lesson/quiz completion rules. Progress = completed required steps /
    required steps. Optional steps are shown but never counted.
  - A new published revision does not move or reset learners: completion lives in
    course records. The learner sees the latest revision with an "updated" notice;
    the curator sees how many learners follow the path.
  - The five US-L006 tracks ship as unsaved starter drafts with preview courses
    only. Nothing is public until an admin publishes.

## Scope

Included: path model and validation, public read API, admin draft/publish API,
account selection API, admin editor, learner compare/choose/roadmap flow on the
existing concept page, real path progress on Home.

Excluded: teacher proposals, unpublishing a path, step drag-reorder, CV analysis,
cross-device lesson completion (US-L002-AC02), next-step guidance beyond the
roadmap (US-L010), path switching history (US-L011), profile storage (US-L003).

## API, storage, and compatibility

| Route | Access | Behavior |
| --- | --- | --- |
| `GET /career-paths`, `GET /career-paths/:id` | Public | Published revisions only; 404 `{ message }` when missing or unpublished. Each course reference carries `placeholder` and `available`, and live course titles |
| `GET /users/me/career-path`, `PUT /users/me/career-path` | Signed in | One selection per account with the path revision. Never enrolls or grants access |
| `GET /admin/career-paths` | Admin | Stored paths plus unsaved starter drafts, with follower counts |
| `PUT /admin/career-paths/:id` | Admin | Saves a draft; shape validation only |
| `POST /admin/career-paths/:id/publish` | Admin | Rejects with `issues[{ stepId, message }]` for a missing course, a course required by two steps, an empty step, an unknown prerequisite, or a prerequisite loop; otherwise the draft becomes the next revision |

Storage: MongoDB collections `<MONGODB_COURSE_CONTENT_COLLECTION>_career_paths` and
`_career_selections`, created on first write; in-memory without Mongo config. No
Google Sheets change. No migration. All responses are `private, no-store`.

Known limit: two admins saving the same path at once — last save wins.

## Scenario-to-check map

| Scenario | Check |
| --- | --- |
| US-L006-AC01–03 | `api/src/careerPath.test.ts` (publish/read, seeds private, 404) |
| US-T008-AC01, AC02, AC04 | `api/src/careerPath.test.ts`; browser: editor refuses a prerequisite loop and marks the step |
| US-T008-AC03 | `api/src/careerPath.test.ts` (selection survives revision 2, follower count). Replacement guidance for a withdrawn course is limited to "Not currently available" |
| US-L009-AC01 | Browser: compare view shows outcomes, steps, effort, available vs not-yet-available counts; no invented completion |
| US-L009-AC02, AC03 | `api/src/careerPath.test.ts` (per-account, revision, no enrollment); browser: reload opens the saved path, Home shows it |
| US-L009-AC04 | Browser: forced network failure shows a retryable error, keeps the chosen card marked, stays on the compare step |
| US-L012-AC01–03 | `app/src/app/utils/career-path-progress.spec.ts` |
| US-L012-AC04 | Inherited: a failed quiz is not saved as a completed lesson (DEF-014 rules), so the course never reaches 100% |

## Verification so far (2026-10-09, local)

- 14 career path API tests and 5 progress-rule tests pass; frontend build passes;
  112 frontend tests pass.
- Isolated browser walk (in-memory API, demo accounts): admin editor list, invalid
  publish refusal, learner intro → CV preview → questions → compare → failed save →
  retry → roadmap → reload → Home tile.
- Not verified: a step actually completing in the browser (the demo course has no
  lessons), real MongoDB, mobile layout, the hosted environment.
- On the combined tree: 296 API tests (including the US-P001 journey) and 126
  frontend tests pass; API, frontend and Pages builds pass.

## Remaining before Done

1. Done 2026-10-10, see increment 2.
2. Hosted release check with real MongoDB; then an admin maps real courses and publishes.

## Increment 2 (selected 2026-10-10, not yet implemented)

Stories: US-L010, US-L011, US-L002-AC02, US-P004. Owners and files are in the
[work queue](../work_queue.md); Codex's part is in
[its handoff](../handoffs/career-paths-increment-2-codex.md).

Decisions taken by the lead from the stories' recommendations (confirm or change):

- Next step = the first required step, in path order, that is incomplete and whose
  prerequisites are complete. Within it, a course already in progress wins; otherwise the
  first available course. Prerequisites are advisory: they order the guidance and never
  block opening a course.
- The next action names its course and says why ("Next required step", "You are 40% through").
  It opens the course page; enrollment and access stay with the existing course rules.
- A step with no available course is explained as not available yet and guidance moves to
  the next step that can be started. No enabled link points at a preview course.
- Still one active path. Switching shows what carries over (completed steps the new path
  also counts) and what is new, and saves only on confirm. Switching back is the undo;
  no switch history is stored.
- Lesson completion moves to the account, stored in MongoDB. The completion rules
  (DEF-007/009/014) do not change. Completion already saved in a browser is merged up on
  sign-in and never dropped.

Checklist:

- [x] Claude: completed step seen in a browser (remaining item 1)
- [x] Claude: US-L010-AC01–04 on the roadmap and the Home tile
- [ ] Claude: US-L011-AC01–03
- [ ] Claude: US-P004-AC01–02 (a late response cannot land in another account's session)
- [ ] Codex: US-L002-AC02
- [ ] Codex: US-P004-AC03–04

### US-L010 delivered 2026-10-10 (version 0.1.76)

| Scenario | Check |
| --- | --- |
| US-L010-AC01 | Browser: an enrolled course shows "Start course", then "Continue course" at 50%, and opens the workspace on the next incomplete lesson; `career-path-progress.spec.ts` (a course in progress wins) |
| US-L010-AC02 | Browser: a course not joined shows "View course" and opens its course page |
| US-L010-AC03 | `career-path-progress.spec.ts` (guidance skips a step with no available course); browser: a step with only a preview course shows the not-available notice and no link |
| US-L010-AC04 | Browser: the action is a link above the roadmap, progress is stated in words, no horizontal scroll at 375px |

Isolated browser walk (in-memory API, demo learner, two seeded courses with two lessons
each): completing both lessons moved the path from 0 of 2 to 1 of 2 required steps, marked
the step Complete, and moved the next action to the second step. Home shows the same next
action. 143 frontend tests and the frontend build pass. Not verified: keyboard-only walk,
hosted environment.
