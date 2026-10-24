# Careers

## Purpose

A learner picks one or more job goals and sees a focused route of milestones toward them, without
the whole catalog in the way.

## Behavior

- `/career-path` starts with a setup flow: intro, an optional **Upload your CV** step (the CV scan
  from [milestones and achievements](milestones-and-achievements.md)), a few questions, then a
  comparison of published careers.
- **Comparison cards** (2026-10-20): title and summary, "You'll be able to" (outcomes), numbered
  "Milestones" (optional ones marked), and a footer with the milestone count and "N of M courses
  ready" or "Courses coming soon", then **Follow this career** / **Preview** (or **View path**).
  Up to four cards share a row (two columns below 1100 px, one below 640 px). More than four
  careers show four at a time with Previous/Next buttons that step one career and wrap around;
  "Careers X to Y of N" is announced politely.
- A milestone-format career shows **Scan my CV** beside the tree; saving reports
  "Saved N achievements from your CV." and the tree redraws.
- **Following**: an account follows a set of careers (`PUT/DELETE /users/me/careers/:pathId`) and
  has one **focus** (`PUT /users/me/career-focus`), the career the page and Home show. Following
  again is harmless. Stopping following keeps every achievement and enrollment; if it was the
  focus, the page offers the remaining careers or the career choice.
- **Start over** (2026-10-20, shown while the learner follows a career): after a confirmation it
  stops following every career (focus clears) and reopens setup at Stage 01 with the questions
  cleared. Achievements, completed courses and enrollments are kept. A failure partway shows "Not
  saved."; pressing Start over again finishes the rest.
- **Exploring** another published career shows its tree without changing goals or focus; recording
  an achievement there requires following it first.
- **The tree**: stage columns read left to right with connector lines (green to achieved, blue to
  ready, dashed to locked) and a legend; state is also written in words. Selecting a milestone
  shows its requirements and "Ways to get there" without changing anything. Phones get an ordered
  list with the same dependency information. Prerequisites from another career are named, with an
  "Explore prerequisite" action.
- **All careers map** (US-L026, 2026-10-24): **Expand** on any career's tree opens a full-screen "All careers"
  window. Every published milestone-format career is drawn as one graph: each milestone once (shared
  milestones show how many careers use them), in columns by prerequisite depth, with the learner's
  states and the same line colours as the tree. Old-format careers are named under "Not on the map";
  an unpublished prerequisite is a "Not published" card; loop members sit in the last column. Career
  chips highlight one career (starting with the one opened from) and fade the rest. Selecting a
  milestone shows its state, missing prerequisites, requirement routes and "Part of" with **Open
  career**, which closes the map and shows that career as a preview: followed careers and focus never
  change, and nothing is recorded in the map. Escape or **Close** returns focus to Expand. Phones get
  a list grouped "Start here" / "Then", and the details scroll into view. Code: `utils/career-map.ts`,
  `ui/career-map/`.
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
