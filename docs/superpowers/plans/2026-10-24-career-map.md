# All careers in one map (US-L026) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Expand button on the career tree opens a full-screen map of every published
milestone-format career, each milestone once, with the learner's states, career highlighting and
Open career.

**Architecture:** A pure layout function turns the published careers into columns, edges and
career lists. A self-contained `CareerMap` component draws it (inputs only, no app state) and emits
`openCareer` and `closed`. The career tree gets an `expand` output; the career page opens the map
and reuses its existing `view(id)`.

**Tech Stack:** Angular signals and standalone components, SCSS with the `tailwind.css` tokens,
Vitest through `ng test`.

**Spec:** `docs/stories/US-L026-career-map.md` (delivered 2026-10-24; now in `docs/specs/career-paths/careers.md`, contract in Git history at `ee9811e`)

## Global Constraints

- Frontend only (`app/**`); no API, storage or route change.
- Colours only from `--color-*`, `--shadow-*`, `--radius-*` tokens (`scripts/check-ui-foundation.mjs`
  fails otherwise); no component draws its own `:focus` outline.
- Every new spec clears `localStorage` and `sessionStorage` in `beforeEach`.
- State words: Achieved / Ready to start / Locked (same as `career-tree`'s `STATE_LABEL`).
- Copy: window title "All careers"; "Not on the map: …"; "Not published"; "No careers use milestones
  yet."; "Part of"; "Open career"; "Record achievements on the career's tree."
- Phone layout below 768px (same breakpoint as `career-tree.scss`).
- The dialog follows `ui/confirm-dialog`: overlay, `role="dialog"`, `aria-modal`, Escape closes, Tab
  is trapped, focus returns to the opener.

## Review Focus

- Many careers and milestones: the map scrolls both ways inside the window and the page behind does
  not scroll (`body` overflow locked while open).
- A prerequisite that is an old-format step or unknown ID: drawn as a "Not published" placeholder,
  never a line to nothing (layout test).
- A milestone that depends on a loop member: also placed in the last column, not hung (layout test).
- A highlighted career whose milestones are all shared: its milestones and only the edges between
  two of its milestones are emphasized (component test).
- Escape inside the details panel or on a chip still closes the map and returns focus (component
  test fires Escape on a chip).

---

### Task 1: Layout function

**Files:**
- Create: `app/src/app/utils/career-map.ts`
- Test: `app/src/app/utils/career-map.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CareerMapNode = { id: string; title: string; step: CareerPathStep | null; column: number; careerIds: string[] };
  export type CareerMap = {
    columns: CareerMapNode[][];              // column 0 = no prerequisites
    edges: { from: string; to: string }[];   // prerequisite -> milestone, one per pair
    careers: { id: string; title: string }[]; // milestone-format careers, in input order
    notOnMap: { id: string; title: string }[]; // other published careers
  };
  export function buildCareerMap(paths: CareerPath[]): CareerMap;
  ```
  `step` is `null` for a "Not published" placeholder (title "Not published", no careers).

- [ ] **Step 1: Write the failing tests** (fixtures: three v2 careers sharing `foundation`, one
  v1 career):
  - `draws a shared milestone once with every career that uses it`: `foundation` appears once, in
    `columns[0]`, `careerIds` equals the three career ids in input order.
  - `places a milestone after its longest prerequisite chain`: a milestone needing `foundation` and
    a column-1 milestone lands in `columns[2]`.
  - `lists old-format careers as not on the map`: `notOnMap` equals `[{ id, title }]` of the v1
    career and none of its steps are nodes.
  - `adds a Not published placeholder for an unknown prerequisite`: node `{ id: 'gone', title:
    'Not published', step: null }` in column 0 and an edge `gone -> x`.
  - `puts loop members and milestones behind them in the last column`: `a <-> b` and `c` needing `b`
    sit in the last column, after every finite column, and the call returns.
  - `orders a column by first career, then by position in it`.
  - `returns no columns when no career uses milestones`.

- [ ] **Step 2: Run to see them fail**

  Run: `cd app && npx ng test --watch=false --include src/app/utils/career-map.spec.ts`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `buildCareerMap`**: collect v2 steps by ID (first definition wins),
  memoised depth with an in-progress set (a revisit returns `Infinity`), infinite depths go to
  `max finite column + 1`.

- [ ] **Step 4: Run the tests**: same command, 7 passed.

### Task 2: CareerMap component

**Files:**
- Create: `app/src/app/ui/career-map/career-map.ts`, `.html`, `.scss`
- Test: `app/src/app/ui/career-map/career-map.spec.ts`

**Interfaces:**
- Consumes: `buildCareerMap(paths)` from Task 1.
- Produces: `<app-career-map>` with inputs `paths: CareerPath[]` (required),
  `states: Record<string, MilestoneState>` (required), `followedIds: string[]` (default `[]`),
  `initialCareerId: string` (default `''`); outputs `openCareer: string`, `closed: void`.

- [ ] **Step 1: Write the failing tests:**
  - `US-L026-AC01 opens with the starting career highlighted`: chip of `initialCareerId` has
    `aria-pressed="true"`; title "All careers"; one `[data-node]` per milestone.
  - `US-L026-AC03 shows each milestone's state in words`: node text contains "Achieved", "Ready to
    start", "Locked" per `states`; node `aria-label` like "ISTQB Foundation, achieved, part of 3 careers".
  - `US-L026-AC04 highlights one career and toggles back`: clicking another chip fades nodes not in
    it (`data-faded`), clicking it again clears every `data-faded`.
  - `US-L026-AC05 shows details and opens a career`: clicking a node shows "Part of" with each career
    and missing prerequisites by name; clicking its Open career emits that career id.
  - `US-L026-AC06 Escape closes from anywhere`: Escape keydown on a chip emits `closed` once.
  - `US-L026-AC07 names careers not on the map` and `shows the empty message`.
  - `US-L026-AC08 renders a list on phones`: the phone list (`.cm-list`) lists every node, grouped by
    column; it is in the DOM always and shown by CSS below 768px.

- [ ] **Step 2: Run to see them fail**

  Run: `cd app && npx ng test --watch=false --include src/app/ui/career-map/career-map.spec.ts`

- [ ] **Step 3: Implement**: template has a header (title, chips, Close), the map (`.cm-map` with
  one column per layout column and an absolutely placed `<svg>` redrawn in `afterRenderEffect`
  and on resize, like `career-tree.draw()`; edge `data-state` = target's state, faded unless both
  ends are in the highlighted career), the phone list, and the details panel. On create it stores
  the opener (`document.activeElement`), locks `document.body.style.overflow`, focuses the Close
  button; on destroy it restores both. Tab trapping and Escape as in `confirm-dialog.keydown`.

- [ ] **Step 4: Run the tests**: same command, all pass.

### Task 3: Expand button and page wiring

**Files:**
- Modify: `app/src/app/ui/career-tree/career-tree.ts`, `.html`, `.scss` (Expand button, `expand`
  output)
- Modify: `app/src/app/pages/career-path-page/career-path-page.ts`, `.html` (map open state)
- Test: `app/src/app/pages/career-path-page/career-path-page.spec.ts`

**Interfaces:**
- Consumes: `<app-career-map>` from Task 2; existing `view(id)` on the page.
- Produces: `CareerTree.expand = output<void>()`.

- [ ] **Step 1: Write the failing page test** `US-L026 Expand opens the map and Open career shows
  that career`: click "Expand", the map is shown with the current career highlighted; click a
  node's Open career for another career; the map is gone and that career's title is shown; followed
  careers unchanged (no PUT request made).
- [ ] **Step 2: Run it to fail.** `cd app && npx ng test --watch=false --include src/app/pages/career-path-page/career-path-page.spec.ts`
- [ ] **Step 3: Implement**: Expand is `appButton="secondary" size="sm"` above the map, shown for
  every career; the page keeps `mapOpen = signal(false)` and renders the map with
  `careerPath.paths()`, `careers()?.milestoneStates ?? {}`, `careers()?.followedPathIds ?? []`
  and the shown path's id.
- [ ] **Step 4: Run the page and tree tests**, then `npm run app:test`: all pass, UI foundation
  check passes.

### Task 4: Browser check, docs, commit

- [ ] Isolated servers (3001/4200): publish three milestone careers sharing Foundation, record one
  achievement as student, open the map from an explored career; check AC01–AC08 at 1280px and 375px,
  screenshot desktop.
- [ ] Fold the behavior into `docs/specs/career-paths/careers.md`, delete the contract, update the
  backlog row and `docs/work_queue.md` (only if Codex has committed its X8 row by then).
- [ ] `npm run app:build:pages`, bump the version in the four files, commit by path.
