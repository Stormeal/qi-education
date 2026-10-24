# Career curation (admin)

## Purpose

Admins write and publish the careers learners follow.

## Behavior

- The career editor lives on the Admin page. Admins see stored careers plus unsaved starter
  drafts, with follower counts (`GET /admin/career-paths`).
- **Save** (`PUT /admin/career-paths/:id`) stores a draft. **Publish** (`POST …/publish`) makes the
  draft the next revision; **Withdraw** (`POST …/unpublish`) hides it from learners while keeping
  the draft, revisions and every follower. Republishing restores it.
- New careers use the milestone format: stage, role milestone, actions (exam, course, other
  activity), requirement routes ("every ticked action", or "any one route"), prerequisites from
  other careers and **Reuse a milestone from another career** (copies the shared milestone with
  its ID). Milestone IDs of a new career start with its career ID.
- **Comes after** is a search field over the other steps of this career ("This career") and, for
  milestone careers, the published milestones of other careers ("From <career>"). Ticking adds a
  removable chip above the field; Escape or leaving the field closes the list.
- Each action has optional **CV keywords**, one per line (up to 10, each 1 to 80 characters,
  duplicates removed): the exact phrases a CV scan matches. They are public with the career.
  Changing them keeps the action's identity, also on shared milestones. The built-in milestone
  drafts carry starter keywords for their ISTQB exams; job titles are never used as keywords.
- **Convert to milestone format** turns an old-format draft into milestones: a step ID another
  milestone career already uses becomes that shared milestone; linked courses become course actions
  (any one completes it); a step without a course gets one activity. Learners see nothing until publish.
- **Publication is refused** with the affected milestone named when the whole published graph has a
  missing prerequisite, a cycle (also across careers), conflicting definitions of a shared
  milestone, or a milestone without any action. Old-format careers are refused for a missing course,
  a course required by two steps, an empty step, an unknown prerequisite or a loop.
- Writes may send `X-Expected-Updated-At`; a stale value answers 409 `CAREER_PATH_CONFLICT` without
  writing. Without it, the last save wins.

## Code

- App: `ui/career-path-editor/`, `pages/admin-page/`.
- API: `careerPath.ts`, `careerPathRepository.ts` (MongoDB `<collection>_career_paths`, in-memory
  without config); routes in `server.ts`.

## Limits

- The real TestHuset curriculum mapping is not yet reviewed (US-A004-AC04,
  [curriculum review](../../stories/US-A004-curriculum-review.md)).
- The editor is not checked at phone width.
