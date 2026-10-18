# Careers

## Purpose

A learner picks one or more job goals and sees a focused route of milestones toward them, without
the whole catalog in the way.

## Behavior

- `/career-path` starts with a setup flow: intro, a **CV preview** (marked as preview: nothing is
  uploaded, read or inferred), a few questions, then a comparison of published careers.
- **Following**: an account follows a set of careers (`PUT/DELETE /users/me/careers/:pathId`) and
  has one **focus** (`PUT /users/me/career-focus`), the career the page and Home show. Following
  again is harmless. Stopping following keeps every achievement and enrollment; if it was the
  focus, the page offers the remaining careers or the career choice.
- **Exploring** another published career shows its tree without changing goals or focus; recording
  an achievement there requires following it first.
- **The tree**: stage columns read left to right with connector lines (green to achieved, blue to
  ready, dashed to locked) and a legend; state is also written in words. Selecting a milestone
  shows its requirements and "Ways to get there" without changing anything. Phones get an ordered
  list with the same dependency information. Prerequisites from another career are named, with an
  "Explore prerequisite" action.
- **Home guidance** uses the same rule as the tree: "N of M milestones achieved" and the first
  ready milestone in path order, linking to `/career-path?milestone=<id>`.
- **Old-format careers** (published before milestones) are drawn in the same layout with stage
  names from prerequisite depth. A step is complete when any of its courses is 100% complete;
  later steps read "Recommended later", never "Locked"; Home shows a percentage of required steps.
- Loading, failed load, no followed career and a withdrawn career are distinct states. A failed
  load is never shown as zero progress or as "no careers".

## Rules

- Following a career never enrolls the learner or grants course access.
- Public career data contains only published definitions and public course labels, never private
  draft titles or another account's data. Account career routes are private and `no-store`.
- A reply that arrives after logout or an account switch is dropped.

## Code

- App: `pages/career-path-page/`, `routes/career-path-route.ts`, `ui/career-tree/`,
  `services/career-path.service.ts` (`milestoneProgress`), `utils/career-path-progress.ts`.
- API: `careerPath.ts`, `careerPathRepository.ts`, `accountCareers.ts`,
  `accountCareersRepository.ts`, `accountCareersRoutes.ts`; public `GET /career-paths[/:id]`,
  private `GET /users/me/careers`; the older single selection `GET/PUT /users/me/career-path`
  is kept for old clients.

## Limits

- Career progress for old-format paths is computed from lesson completion only.
- See [milestones and achievements](milestones-and-achievements.md) for how states are decided.
