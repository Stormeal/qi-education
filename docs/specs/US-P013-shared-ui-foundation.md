# US-P013: One shared look for actions, views and progress

## Record

- Story: US-P013 ([backlog](../user_stories.md#us-p013--use-one-shared-look-for-actions-views-and-progress))
- State: Done locally on the branch, in review (spec approved by Alex 2026-10-15; execution: subagent-driven; 0.1.195 on the branch, not pushed, no pull request yet)
- Owner: Claude Code (frontend only; no API or storage change, so no Codex part)
- Related defects: DEF-035 (primary buttons fail text contrast), DEF-036 (focus rings are
  inconsistent and partly too faint)
- Branch/base: `feat/US-P013-shared-ui-foundation` / `ee1b660` (0.1.173). Alex chose a
  feature branch and a pull request for this story on 2026-10-15.
- Product decisions, confirmed by Alex on 2026-10-15:
  - Every page uses one shared button and one shared tab style after this story. Page
    layouts keep their own structure and adopt the other shared pieces over time.
  - Primary actions are deep green on every page. Amber is kept for focus and "you are
    here" highlights and is no longer a button fill.
  - The look evolves the existing palette and fonts in
    [the course UI design DNA](../../design/course-ui-design-dna.md); no new brand.
- Defaults taken by the lead (confirm or change):
  - The login page's uppercase gradient pill becomes the shared large primary button.
  - The login page's "Log in / Sign up" switch and the admin page's section switch keep
    their own segmented look in this story (see Scope); only real tab sets move to the
    shared tabs.
  - No dark theme.
- Part 1 of 3 of the learning view redesign. Parts 2 and 3 are listed at the end of this
  spec and are not in this story's scope.

## Problem and outcome

As a learner, teacher or admin, I want buttons, tabs and progress to look and behave the
same on every page, so that the app feels like one finished product and I can rely on
what a control means.

Observed on `ee1b660`:

- 715 hard-coded colour values across 23 stylesheets; no shared colour, spacing, radius or
  shadow values exist. `app/src/tailwind.css` only imports Tailwind.
- Five button systems:
  - `app-button` element component, used 50 times (25 primary, 23 outline/default,
    1 ghost, 1 login-submit)
  - career path `cp-btn` (10) and career path editor `cpe-btn` (11)
  - learning view `learning-primary-button` / `learning-secondary-button` (5)
  - course builder `icon-action-button`, `attachment-icon-button`, `component-row-action`,
    `add-component-button`, `quiz-inline-action` and others
  - 114 native `<button>` elements in total, many with page-local styles
- Two tab sets built separately: admin feedback tabs (`role="tablist"`, no arrow keys)
  and catalog view tabs (no tab roles at all).
- `app-button` primary is white on `#f59e0b`: contrast 2.15:1, below the 4.5:1 minimum
  (DEF-035). The career path primary is a white-on-amber gradient with the same problem.
- `app.scss` sets the font stack to Inter, which is never loaded, so body text falls back
  to the system font.
- Focus rings use four different greens in four components; the design DNA's amber focus
  colour `#ffd08e` is 1.43:1 against white, below the 3:1 minimum for focus indicators
  (DEF-036). Many controls rely on browser defaults.

Outcome: one set of design values, five shared components, and every action button and
tab set in the app built from them. Primary buttons pass contrast. Every focusable
control shows the same visible focus ring.

## Scope

Included:

1. Shared design values in `app/src/tailwind.css` (`@theme`), available both as CSS
   variables for SCSS and as Tailwind utilities.
2. Shared components in `app/src/app/ui/`: button, icon button, tabs, progress bar, chip.
3. Migration of every action button and icon button in every page and UI component to
   the shared button and icon button. The old `app-button` element is removed.
4. Migration of both tab sets to the shared tabs.
5. Migration of the visual progress bars (learning quiz progress, dashboard course
   progress, editor preview progress, and the video and attachment upload progress in the
   builder) to the shared progress bar.
6. One global focus ring.
7. Exact-match colour values in all stylesheets replaced by the matching design value
   (no visual change), and a check that stops new hard-coded colours.
8. The design DNA document updated to point to the shared values and components.

Not included:

- Page layouts, the learning view redesign, cards, form fields, modals and chips on
  existing pages beyond the tab count badges. Chips are built now and adopted later.
- Structural controls that are not action buttons stay native `<button>` elements with
  page styles, but must use the design values and the global focus ring. These are:
  accordion and disclosure headers (`outline-heading`, `curriculum-panel-header`,
  `learning-outline-header`, `cpe-step-toggle`, `quiz-question-trigger`), selectable
  list rows (`learning-outline-item`, `curriculum-item-row`, `cpe-path`), menu items
  (`profile-menu-item`, `profile-trigger`), answer and choice options (`rating-option`,
  `cp-yes-no-option`, `profile-swatch`, quiz answers), the `drag-handle`, admin status and
  priority choices, the editor's step navigation, breadcrumb links, the login "remember
  me" toggle, and the two segmented switches named above.
- Colour values that match no design value (for example `#5c5d56`, `#8a8578`). They stay
  and are listed in the colour baseline; each page removes them when it is next
  redesigned.
- Icons. The existing Lucide SVG strings stay; icon choice is not part of this story.
- Dark theme, native apps.

## Behavior contract

```gherkin
Feature: Shared look for actions, views and progress

  Scenario: US-P013-AC01 Primary actions look the same and are readable everywhere
    Given any page with a primary action
    When the page is shown
    Then the primary action is a deep green button with white text
    And its text contrast is at least 4.5:1 in its normal, hover and pressed states

  Scenario: US-P013-AC02 Keyboard focus is always visible
    Given a keyboard user on any page
    When focus moves to a button, link, tab, input or other focusable control
    Then the control shows the shared focus ring
    And the ring contrasts at least 3:1 with the surface behind it

  Scenario: US-P013-AC03 A busy action cannot be pressed twice
    Given a shared button whose action is running
    When the user presses it again
    Then nothing happens
    And the button shows that it is busy to sighted and screen reader users

  Scenario: US-P013-AC04 Icon-only buttons have a name
    Given any icon-only button in the app
    When a screen reader user reaches it
    Then the button announces a name that says what it does
    And a mouse user sees the same name as a tooltip

  Scenario: US-P013-AC05 Tabs work with the keyboard
    Given a tab set on the admin page or the catalog
    When the user presses the right or left arrow key on a tab
    Then focus and selection move to the next or previous tab, wrapping at the ends
    And Home and End select the first and last tab
    And only the selected tab is in the Tab key order

  Scenario: US-P013-AC06 Tabs announce their content
    Given a tab set
    When a screen reader user selects a tab
    Then the tab is announced as selected, with its count when it has one
    And the panel it controls is labelled by that tab

  Scenario: US-P013-AC07 Progress is announced as a value
    Given a progress bar for a course, a quiz or an upload
    When a screen reader user reaches it
    Then it announces its label and its percentage
    And values below 0 or above 100 are shown as 0 or 100

  Scenario: US-P013-AC08 No page keeps its own button or tab system
    Given the frontend source
    When the shared-UI guard test runs
    Then no template uses the removed classes or the old app-button element
    And no stylesheet defines them

  Scenario: US-P013-AC09 New hard-coded colours are refused
    Given a change that adds a hard-coded colour to a stylesheet
    When the frontend tests run
    Then the colour check fails and names the file and the colour
    And removing hard-coded colours never makes the check fail

  Scenario: US-P013-AC10 Existing journeys keep working
    Given the migrated pages
    When the existing frontend tests, the role journeys and the Pages build run
    Then they pass
    And every migrated button still submits, navigates or acts as before
```

## Design values

Defined once in `app/src/tailwind.css` inside `@theme`. Names are chosen so that they do
not override Tailwind's default scales (`text-sm`, `rounded-lg`, `shadow-md` keep their
meaning). Components use `var(--…)`; templates may use the generated utilities.

### Colour (by job)

| Value | Hex | Use |
| --- | --- | --- |
| `--color-ink` | `#171b4a` | Headings, strong labels |
| `--color-text` | `#39393a` | Body text |
| `--color-text-muted` | `#6c6558` | Meta text (5.5:1 on the page background) |
| `--color-surface-page` | `#fcfaf5` | Page background |
| `--color-surface-card` | `#ffffff` | Cards, panels, controls |
| `--color-surface-sunken` | `#f5f2ea` | Inset areas, disabled fills |
| `--color-border` | `rgba(108, 101, 88, 0.16)` | Dividers, card edges |
| `--color-border-strong` | `rgba(108, 101, 88, 0.28)` | Control outlines |
| `--color-primary` | `#2f4f43` | Primary actions, progress, completed (9.05:1 with white) |
| `--color-primary-hover` | `#243d34` | Primary hover and pressed |
| `--color-primary-soft` | `#eaf3ee` | Selected and success backgrounds |
| `--color-highlight` | `#ffd08e` | "You are here" fills; never text, never a button fill |
| `--color-highlight-soft` | `#fff4e1` | Current row, hover warmth |
| `--color-highlight-ink` | `#78350f` | Text on highlight fills (8.3:1 on the soft fill) |
| `--color-focus` | `#b45309` | The focus ring (5.0:1 on white) |
| `--color-focus-inverse` | `#ffd08e` | Focus ring on dark bands (`data-surface="dark"`); at least 3:1 on every hero colour |
| `--color-link` | `#5b3df5` | Text links and timestamp links only |
| `--color-danger` | `#991b1b` | Destructive actions, errors |
| `--color-danger-soft` | `#fff5f5` | Error backgrounds |
| `--color-lesson-video` / `-quiz` / `-text` / `-exercise` / `-resources` | `#e8edf3` / `#e6f2ea` / `#f3ebdd` / `#fbe7d2` / `#eeeaf6` | Lesson-type icon backgrounds |

The video hero gradient `#16241f → #29463c → #80592f` becomes `--gradient-hero`.

### Type, space, shape, depth, motion

- Fonts: `--font-display` Bricolage Grotesque, `--font-body` Instrument Sans,
  `--font-mono` JetBrains Mono, defined in `@theme`.
- Type scale: `--text-caption` 12px, `--text-meta` 13px, `--text-body` 14px,
  `--text-lead` 16px, `--text-title-sm` 18px, `--text-title` 22px, `--text-title-lg` 28px,
  `--text-display` 42px. Body line height 1.55; headings 1.15 with `text-wrap: balance`.
- Spacing uses Tailwind's existing 4px step (`--spacing`); components use multiples of it.
- Radius: `--radius-control` 6px, `--radius-card` 8px, `--radius-panel` 12px,
  `--radius-modal` 24px, `--radius-pill` 999px.
- Shadows, warm-tinted: `--shadow-card`, `--shadow-raised`, `--shadow-modal`.
- Layers: `--z-sticky` 10, `--z-dropdown` 20, `--z-overlay` 40, `--z-modal` 50, `--z-toast` 60.
- Motion: `--duration-fast` 160ms, `--ease-standard` ease. Under
  `prefers-reduced-motion: reduce`, transitions and the press scale are switched off.

### Global focus ring

In `styles.scss`: `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }`.
The component-local focus rings (about 20 rules in 13 stylesheets, including the faint
amber input outlines) are removed, so the global ring is the only one; the quiz answer row
is the one exception, because its input is hidden and the row re-draws the ring with the
same colour. Inputs keep their border change on focus and also get the ring. On dark
bands (`data-surface="dark"`: course view hero, editor hero, dashboard hero stat) the ring uses `--color-focus-inverse` (`#ffd08e`, at least 3:1 on
every hero gradient stop) through `[data-surface='dark'] :focus-visible { outline-color: var(--color-focus-inverse) }`. `scripts/ui-foundation/focus-ring.test.mjs` fails when
any other stylesheet draws a focus outline.

## Shared components

All are standalone, OnPush, with signal inputs. Buttons are attribute components on the
native element, so native `click`, `type`, `disabled`, form submission and `routerLink`
work without a wrapper element.

### Button — `button[appButton]`, `a[appButton]`, `label[appButton]`

- `appButton`: `'primary' | 'secondary' | 'ghost' | 'danger' | 'dashed'`; an empty
  attribute (`<button appButton>`) means `secondary`. Usage: `<button appButton="primary" (click)="save()">Save course</button>`.
- `size`: `'sm' | 'md' | 'lg'` (min heights 30, 36, 44px), default `md`.
- `fullWidth`, `loading`: boolean attributes.
- `type`: defaults to `button` on `<button>` so no button submits a form by accident;
  `type="submit"` must be written out. Not set on `<a>` and `<label>`.
- `loading` shows a spinner before the label, sets `aria-busy="true"` and
  `aria-disabled="true"`, and stops clicks (AC03). The label stays, so width does not jump.
- States: hover darkens (primary) or warms the border (secondary); pressed scales to
  0.98; disabled uses the sunken fill and muted text and is not clickable.
- `label[appButton]` is for the editor's file picker: the label wraps the hidden file
  input and shows the ring with `:focus-within`.
- Variants: `primary` green fill; `secondary` white with a strong border; `ghost` text
  only; `danger` for destructive confirmations; `dashed` full-width "add" rows in the
  course builder.

Old to new mapping: `variant="primary"` → `primary`; `variant="outline"` or no variant →
`secondary`; `variant="ghost"` → `ghost`; `variant="login-submit"` → `primary`, `size="lg"`,
`fullWidth`; host class `fill` → `fullWidth`; `(buttonClicked)` → `(click)`.

### Icon button — `button[appIconButton]`, `a[appIconButton]`

- `appIconButton`: `'default' | 'ghost' | 'danger'`, default `default`.
- `label`: required. Sets `aria-label` and `title` (AC04). Compilation fails without it.
- `hint`: optional. Replaces the tooltip (`title`) when it must say more than the name, for example why
  a control is disabled. The `aria-label` always stays the `label`, so AC04 holds. Built for the
  quiz answer-remove button, whose tooltip explains why the last answers cannot be removed.
- `size`: `'sm' | 'md' | 'lg'` (28, 32, 40px square), default `md`.
- The icon is projected. The `aria-label` names the button, so icon content is never read.

### Tabs — `<app-tabs>`

```html
<app-tabs groupId="feedback" label="Feedback views"
  [tabs]="[{ id: 'current', label: 'Current work items', count: 4 }, …]"
  [selected]="activeTab()" (selectedChange)="selectTab($event)" />
<div role="tabpanel" [id]="tabPanelId('feedback', activeTab())"
  [attr.aria-labelledby]="tabId('feedback', activeTab())" tabindex="0">…</div>
```

- Renders `role="tablist"` with `aria-label`, and `role="tab"` buttons with
  `aria-selected`, `aria-controls` and a roving `tabindex` (AC05, AC06).
- Arrow keys move and select (automatic activation); Home and End jump to the ends.
- `count` renders a neutral chip inside the tab, read as part of the tab's name.
- `tabId()` and `tabPanelId()` are exported helpers so pages build matching ids.
- Look: underline style, selected tab in ink with a 2px primary underline. The focus ring is drawn
  inside the tab (`[role='tab']:focus-visible { outline-offset: -4px }`) and the row line and the
  underline are inset box-shadows, so the ring is never clipped by the row.
- Alt, Ctrl and Meta with an arrow key are left to the browser (Alt+Left is Back).

### Progress bar — `<app-progress-bar>`

- `value` (clamped 0–100), `label` (required), optional `valueText` (replaces the
  default `<n>%` announcement), `size` `'sm' | 'md'`.
- `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow`,
  `aria-valuetext="<n>%"`, `aria-label` (AC07).
- Primary fill on a sunken track; the width transition is switched off with reduced motion.

### Chip — `span[appChip]`

- `appChip`: `'neutral' | 'primary' | 'highlight' | 'danger'`, default `neutral`.
- Small pill text label; used now for tab counts, later for statuses and tags.

## Migration rules

- Every action that runs a command, submits, opens a dialog or navigates like a button
  becomes `appButton` or `appIconButton`. This covers `app-button`, `cp-btn`, `cpe-btn`,
  `learning-primary-button`, `learning-secondary-button`, `icon-action-button`,
  `attachment-icon-button`, `component-row-action`, `add-component-button` (→ `dashed`),
  `quiz-inline-action`, `course-admin-action`, `price-modal-close`, `carousel-control`,
  `course-preview-action`, `filters-toggle`, `filters-clear`, `component-picker-add`,
  `quiz-question-remove`, `quiz-answer-remove`, `chevron-button`,
  `curriculum-expand-button`, the draft-status actions, the editor's back and breadcrumb
  buttons, the rich-text toolbar buttons (→ icon button, ghost, small, inside a
  `role="toolbar"`), and the login page's password-visibility and inline text actions.
- The editor step buttons stay text buttons (ghost or danger, small) with their `aria-label`s, because the
  rule that a visible label never changes outranks the icon button mapping. They are shared buttons, not
  icon buttons.
- Their old class rules are deleted from the stylesheets.
- Every changed button keeps its event, arguments, `type`, `disabled` condition and
  accessible name. Tests that select an old class are updated to select by role and name.
- Exact-match colour replacement uses a mapping table in the plan; a value that is close
  but not equal is not changed.

## Guard checks

- The guards are Node checks under `scripts/ui-foundation/`, tested with `node --test`,
  because Angular specs cannot import `node:fs`. `check-ui-foundation.mjs` reads the
  source tree and `removed-patterns.test.mjs` fails when a template contains
  `<app-button` or a removed class, or a stylesheet defines one (AC08).
- `scripts/check-hardcoded-colors.mjs` counts hex and `rgb[a]()` colour literals per
  stylesheet outside `tailwind.css`, compares the counts with
  `scripts/hardcoded-colors-baseline.json`, and fails when a file's count rises or a new
  file has any (AC09). It writes a lower baseline with `--update`. It is tested
  by `scripts/ui-foundation/colors.test.mjs`. The root `app:test` script runs
  `node --test "scripts/ui-foundation/*.test.mjs"` before the Angular tests, so CI
  enforces all guards without a workflow change.

## UI and accessibility

- Contrast targets: text 4.5:1, large text and non-text indicators 3:1; checked for every
  variant and state with a contrast unit test over the design values.
- Focus: one ring everywhere; nothing removes `outline` without replacing it.
- Hit areas: at least 24×24px for every control, 44px for the large button.
- Busy and disabled states are exposed to assistive technology, not only by colour.
- Loading, empty and error states of the pages do not change in this story.

## API, storage, and compatibility

No API, storage or route change. No user data is touched. Browser storage keys are
unchanged. Visible changes are limited to buttons, tabs, progress bars and focus rings.
The amber-to-green primary change on the career path pages and the login page is
intended.

## Implementation checklist

1. Design values in `tailwind.css`; fonts defined in `@theme`; global focus ring;
   design-value contrast test and focus-ring regression test (node checks).
2. Colour check script, baseline and its node test; removed-pattern node check
   (starts failing, which is expected until step 9).
3. Button component with tests (variants, sizes, default `type`, loading, disabled,
   anchor, label).
4. Icon button with tests (required label, `aria-label`, `title`, hidden icon).
5. Tabs with tests (roles, ids, roving tabindex, arrows, Home/End, count, output).
6. Progress bar and chip with tests (clamping, ARIA values, variants).
7. Migrate `app-button` usages page by page; remove the element component.
8. Migrate `cp-btn`, `cpe-btn`, learning, builder, editor, login and draft-status buttons.
9. Migrate both tab sets and the progress bars; removed-pattern check passes.
10. Exact-match colour replacement; baseline written.
11. Update `design/course-ui-design-dna.md` (primary green, focus colour, component list).
12. Full checks and a browser walk of every page with a keyboard.

## Verification and delivery

| Scenario | Test or manual check | Result/evidence |
| --- | --- | --- |
| US-P013-AC01 | `scripts/ui-foundation/design-values.test.mjs` contrast test; browser walk of every page | Pass. Contrast test in the 23 node guard tests (`ba43cac`, `89ff5d4`); all pages moved to the shared button in `03cd669` and later; green primary seen on every page in `docs/verification/2026-10-15/US-P013/` |
| US-P013-AC02 | `scripts/ui-foundation/design-values.test.mjs` focus contrast; keyboard walk of every page | Pass. Focus contrast test and `focus-ring.test.mjs` (`ba43cac`, `d6c605e`); ring visible on shared buttons, tabs, file picker and toolbar, inverse ring on dark bands, see `walkthrough.md` |
| US-P013-AC03 | `app/src/app/ui/button/button.spec.ts` loading cases | Pass (`89ff5d4`), in `npm run app:test`: 42 files, 311 tests |
| US-P013-AC04 | `app/src/app/ui/icon-button/icon-button.spec.ts`; guard check finds no unnamed icon button | Pass (`2fb2d83`, `4fd6f56` for `hint`) |
| US-P013-AC05 | `app/src/app/ui/tabs/tabs.spec.ts` keyboard cases; admin and catalog keyboard walk | Pass (`698ca69`, `ce01441`, `704ca8f`); arrows, wrap, Home and End and one Tab stop checked in the browser for both tab sets, `walkthrough.md` |
| US-P013-AC06 | `app/src/app/ui/tabs/tabs.spec.ts` ARIA cases | Pass (`698ca69`); `aria-selected` and the panel's `aria-labelledby` read back in the browser walk |
| US-P013-AC07 | `app/src/app/ui/progress-bar/progress-bar.spec.ts` | Pass (`a0a6ffc`, `704ca8f`) |
| US-P013-AC08 | `scripts/ui-foundation/removed-patterns.test.mjs` plus `check-ui-foundation.mjs` | Pass (`cf47851`, `e478b94`); runs inside `npm run app:test` |
| US-P013-AC09 | `scripts/ui-foundation/colors.test.mjs` | Pass (`cf47851`, `5f23fd8`) |
| US-P013-AC10 | `npm run app:test`, `npm run api:test`, `npm run verify:journeys`, `npm run app:build:pages` | Pass on `5f23fd8`: app:test 23 node tests plus 42 files and 311 tests; api:build then api:test 50 files and 1281 tests; verify:journeys 1 file and 6 tests; Pages build succeeds (see limits below) |

Run on 2026-10-16 against `5f23fd8` (0.1.194), before this record commit:

- `npm run app:test`: 23 of 23 node guard tests, then 42 of 42 Angular test files, 311 of 311 tests
  (baseline on `ee1b660` was 283 tests in 36 files).
- `npm run api:build && npm run api:test`: 50 files, 1281 tests, same as the baseline.
- `npm run verify:journeys`: 1 file, 6 tests.
- `npm run app:build:pages`: succeeds, with three component-style budget warnings (warnings, not
  errors): `course-view-page-learning.scss` 13.59 kB, `career-path-page.scss` 13.91 kB, `app.scss` 12.31 kB,
  against a 12 kB warning level. The first two files are smaller than on `ee1b660`; `app.scss` grew
  about 500 bytes of source and may be new. Not compared against a base build.
- Limit: Google Fonts cannot be reached from the build sandbox (403), so the Pages build was run with
  `optimization.fonts: false` in the production configuration of `app/angular.json`, which was restored
  afterwards (`git diff app/angular.json` empty). The font inlining step is therefore only proven by the
  hosted workflow.
- Browser walk: 63 screenshots and `walkthrough.md` in `docs/verification/2026-10-15/US-P013/`, all
  without horizontal page scroll. Five visual findings are listed there; findings 1 (Feedback button stretched
  in the page header) and 2 (editor "Next" button loses its font because `[appButton]` is property-bound) are
  open for a decision. Not verifiable with demo data: catalog carousel arrows, the Mux player ring, admin
  feedback rows.

Browser evidence: screenshots of every page at 1440px and 400px, plus the 900px catalog, in
`docs/verification/2026-10-15/US-P013/` (after only; there are no before shots).

## Later parts of the learning view redesign (not in this story)

Decided with Alex on 2026-10-15; each becomes its own story and spec.

- **Part 2, learning backend (Codex).** Private, timestamped notes per lesson; lesson
  feedback (thumbs up or down, and "report a problem" with categories) in the existing
  feedback triage, tagged with course and lesson; an enrolled-learner count per course;
  an `exercise` lesson type in the content API. Account-saved lesson progress already
  exists (US-L002), so it is not part of this work.
- **Part 3, learning view (Claude).** A dedicated learning page built only from the shared
  components: curriculum sidebar with overall and per-section progress, Previous and Next,
  an action bar (note at the current video time, lesson files, feedback), working tabs
  (Overview, Notes, Lesson files), a course facts row with only data the app can back (no
  admin-set rating), a video marked complete at 90% watched (today: when it ends), and
  "Up next" with a 5-second cancellable countdown. The exercise type gets its own lesson
  view and a choice in the course builder. Draft mockup:
  https://claude.ai/artifact/DJrxgeqLsPg9AJVEaC3wVw
