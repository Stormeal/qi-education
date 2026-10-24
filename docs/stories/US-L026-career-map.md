# US-L026: All careers in one map

## Record

- Story: US-L026 in the [backlog](../user_stories.md)
- State: Ready for review (design agreed with Alex in chat, 2026-10-24)
- Owner: Claude Code (frontend only; no API or storage change, so no Codex part)
- Related defects: none
- Branch/base: `main`, base `6de6283`
- Product decisions (Alex, 2026-10-24): for learners; one merged map rather than career lanes or
  stacked trees; inside the map a learner looks and jumps to a career, but records nothing.

## Problem and outcome

As a learner, I want to see every career in one map, so that I can see how careers connect, which
milestones I already have and where a shared milestone can take me next.

Today the career page draws one career's tree at a time inside the page column, and a wide tree
scrolls sideways. Careers share milestones (global IDs, "Reuse a milestone from another career")
and can require milestones from each other, but nothing shows that overlap in one picture.

Success: from any career's tree a learner opens a full-screen map with every published
milestone-format career, each milestone once with their own state, highlights one career, and opens
any career from it.

## Scope

Included: an **Expand** button on the career tree; a full-screen "All careers" window with the
merged map, career chips, a milestone details panel, **Open career**, the phone list, and the
empty/edge states below.

Excluded: recording achievements, following or focusing careers inside the map; old-format careers
on the map (they are listed by name); an admin version without personal states; zoom controls,
printing or exporting the map; saving which chip was selected.

## Behavior contract

```gherkin
Feature: All careers in one map

  Scenario: US-L026-AC01 Open the map from a career
    Given a signed-in learner on the career page showing any published career, followed or explored
    When they choose Expand on the career tree
    Then a full-screen window titled "All careers" opens over the page
    And it draws every milestone of every published milestone-format career exactly once
    And the career they came from is highlighted

  Scenario: US-L026-AC02 A shared milestone is one card
    Given ISTQB Foundation is a milestone of three published careers
    When the map is open
    Then ISTQB Foundation appears once, in the column for milestones without prerequisites
    And each career's next milestones are drawn with lines from it

  Scenario: US-L026-AC03 The learner's own states
    Given the learner has achieved ISTQB Foundation and nothing else
    When the map is open
    Then ISTQB Foundation shows "Achieved" and milestones that need only it show "Ready"
    And milestones with missing prerequisites show "Locked"
    And lines are green into achieved, blue into ready and dashed into locked milestones

  Scenario: US-L026-AC04 Highlight one career
    Given the map is open
    When the learner selects the Test Manager chip
    Then Test Manager's milestones and lines are emphasized and the others are faded
    And selecting the same chip again shows every career equally

  Scenario: US-L026-AC05 Milestone details and jump to a career
    Given the map is open
    When the learner selects a milestone
    Then a panel shows its title, state, "Part of" with each career using it, missing prerequisites
      by name and its requirement routes
    And choosing Open career next to a career closes the map and shows that career's tree
    And the learner's followed careers and focus are unchanged

  Scenario: US-L026-AC06 Close and return
    Given the map is open
    When the learner chooses Close or presses Escape
    Then the window closes, the page is as it was and focus returns to the Expand button

  Scenario: US-L026-AC07 Careers that cannot be drawn
    Given one published career is in the old format and one milestone requires a milestone that is
      not published
    When the map is open
    Then the old-format career is named under the chips as "Not on the map"
    And the missing prerequisite is a greyed "Not published" card so no line ends in nothing
    And milestones in a prerequisite loop are drawn in the last column as Locked

  Scenario: US-L026-AC08 Phone width
    Given a screen narrower than 768px
    When the map is open
    Then milestones are an ordered list grouped by column with the same states and details
    And the chips filter the list to one career
```

## UI and accessibility

- Expand: a secondary small button with an icon and the word "Expand" in the tree's top corner.
- The window is a native modal dialog (the confirm-dialog pattern): focus moves into it, stays in it
  and returns to Expand on close. The map scrolls both ways inside the window; the page does not
  scroll behind it.
- Milestones are buttons in reading order (column by column), named like "ISTQB Foundation,
  achieved, part of 3 careers". Chips are toggle buttons with `aria-pressed`. State is always also
  written in words; colours come from the existing career-tree tokens.
- Empty: "No careers use milestones yet." Loading and errors: the map opens from data the page
  already has, so it adds no loading or error state of its own.

## API, storage, and compatibility

None. The map uses what the career page already loads: `GET /career-paths` (published careers)
and `GET /users/me/careers` (`milestoneStates` for every milestone of every published
milestone-format career). Proposed.

## Implementation checklist

1. `app/src/app/utils/career-map.ts`: pure layout from careers and states: dedupe milestones by ID,
   column = longest prerequisite chain (loops to the last column), careers per milestone, order
   within a column by first career, "Not published" placeholders, old-format careers listed.
   Unit tests first.
2. `app/src/app/ui/career-map/`: dialog, chips, cards, SVG lines (as `career-tree` draws them),
   details panel, phone list; inputs careers, states and highlighted career; outputs `openCareer`
   and `closed`. Component tests.
3. `ui/career-tree`: Expand button and `expand` output. `pages/career-path-page`: open the map,
   **Open career** reuses `view(id)`. Page test.
4. Browser check on isolated servers with three published milestone careers sharing Foundation,
   desktop and phone width. Fold into `specs/career-paths/careers.md`, delete this contract.

## Verification and delivery

| Scenario | Test or manual check | Result/evidence |
| --- | --- | --- |
| US-L026-AC01 | page spec + browser | Pending |
| US-L026-AC02 | `career-map.spec.ts` (layout) + browser | Pending |
| US-L026-AC03 | `career-map.spec.ts` + component spec | Pending |
| US-L026-AC04 | component spec + browser | Pending |
| US-L026-AC05 | component spec + page spec + browser | Pending |
| US-L026-AC06 | component spec + browser | Pending |
| US-L026-AC07 | `career-map.spec.ts` | Pending |
| US-L026-AC08 | component spec + browser at 375px | Pending |
