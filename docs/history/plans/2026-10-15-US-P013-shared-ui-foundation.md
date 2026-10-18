# US-P013 Shared UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One set of design values and five shared components (button, icon button, tabs,
progress bar, chip), with every action button, tab set and progress bar in the app moved
onto them, fixing DEF-035 and DEF-036.

**Architecture:** Design values live once in `app/src/tailwind.css` as a Tailwind 4
`@theme static` block, so they exist as `:root` CSS variables for every component
stylesheet and as utilities for templates. Buttons are attribute components on the native
element (`button[appButton]`), so forms, `disabled` and `routerLink` keep working. Node
checks in `scripts/ui-foundation/` enforce contrast, the colour baseline and the removed
patterns, and run before the Angular tests in `npm run app:test`.

**Tech Stack:** Angular 21 (standalone, OnPush, signal inputs), Tailwind 4, SCSS, Vitest
via `@angular/build:unit-test` with jsdom, Node 22 `node:test` for the checks.

**Spec:** `docs/specs/US-P013-shared-ui-foundation.md` (story US-P013, defects DEF-035,
DEF-036). Branch `feat/US-P013-shared-ui-foundation`, base `ee1b660`.

## Global Constraints

- Every commit bumps the patch version: run `/tmp/claude-0/-home-claude/4accdff0-91bf-5877-abf4-0939ac2a04f5/scratchpad/bin/bump.sh` right before `git commit` (it updates and stages root/app `package.json`, the lockfile and `AppStateService.appVersion`). Hooks are on (`core.hooksPath .githooks`); never `--no-verify`.
- Commit messages: `feat(US-P013): …`, `fix(DEF-035): …`, `test(US-P013): …`, ending with the two attribution lines `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01SLkrWAFHu6ZEVzzhxVrXbQ`. Stage files by path, never `git add -A`.
- Frontend tests: `(cd app && npx ng test --watch=false --include <spec>)`; whole suite `npm run app:test`. Every new spec clears `localStorage` and `sessionStorage` in `beforeEach`. Do not `vi.mock` libraries.
- Specs cannot import `node:fs` (no Node types in the app); file-reading checks are Node scripts under `scripts/ui-foundation/`, tested with `node --test`.
- Standalone components, `ChangeDetectionStrategy.OnPush`, `input()` / `output()`, no new dependencies, no new styling framework.
- Contrast: text 4.5:1, focus ring and non-text indicators 3:1. Focus colour `#b45309`, primary `#2f4f43`, primary hover `#243d34`.
- Copy: sentence case, plain verbs; never change an existing button's visible label or accessible name while migrating it.
- `npm run app:build:pages` cannot inline Google Fonts in this sandbox (403). To verify the build here, temporarily set `optimization.fonts: false` in the production configuration of `app/angular.json`, build, and restore the file before committing. Never commit that change.

## Review Focus

- A native `<button>` without a `type` inside a `<form>` submits today; the shared button defaults to `type="button"`. When migrating such a button, keep its behaviour by writing `type="submit"` (Tasks 8–10 each have a step that greps for this).
- Dynamic accessible names (`[attr.aria-label]="'Remove step ' + (i + 1)"`, `aria-label="Download {{ … }}"`) must move to the icon button's `label` input unchanged, bound the same way (`[label]="…"` or `label="Download {{ … }}"`).
- File-picker labels (`label[appButton]`) are only reachable by keyboard through their input: the `<input type="file">` must stay focusable (visually hidden, not `display: none`), and the label shows the ring with `:focus-within`. Test in Task 3.
- The catalog's "My drafts" tab only exists for teachers with drafts; when `selected` is not in `tabs`, the first tab must still be focusable. Test in Task 5.
- Progress values can be `NaN` or above 100 during uploads; the bar must show 0–100. Test in Task 6.

---

### Task 1: Design values, fonts and one focus ring (DEF-036)

**Files:**
- Create: `scripts/ui-foundation/contrast.mjs`, `scripts/ui-foundation/theme.mjs`, `scripts/ui-foundation/design-values.test.mjs`
- Modify: `app/src/tailwind.css`, `app/src/styles.scss`, `app/src/app/app.scss:1-45` (`:host` font), every stylesheet with a local focus ring (list below), `docs/specs/US-P013-shared-ui-foundation.md`, `docs/defect_management.md` (DEF-036 evidence), `package.json` (`app:test` script)

**Interfaces:**
- Produces: `contrastRatio(foreground: string, background: string): number` (hex `#rgb`/`#rrggbb`) in `contrast.mjs`; `readTheme(cssText: string): Record<string, string>` returning every `--name: value` inside the `@theme` block, in `theme.mjs`. CSS variables named exactly as in the spec's "Design values" section.

- [ ] **Step 1: Write the failing node test** `scripts/ui-foundation/design-values.test.mjs` (`node:test`, `node:assert/strict`). It reads `app/src/tailwind.css`, calls `readTheme`, and asserts:
  - `contrastRatio('#ffffff', '#000000')` is 21 and `contrastRatio('#ffffff', '#f59e0b')` rounds to 2.15 (DEF-035 reproduction).
  - Every colour named in the spec table exists with the spec's exact value.
  - `≥ 4.5`: `#ffffff` on `--color-primary` and on `--color-primary-hover`; `--color-ink`, `--color-text`, `--color-text-muted`, `--color-link` on `--color-surface-card` and on `--color-surface-page`; `--color-highlight-ink` on `--color-highlight` and `--color-highlight-soft`; `--color-danger` on `--color-danger-soft`.
  - `≥ 3`: `--color-focus` on `--color-surface-card`, `--color-surface-page` and `--color-surface-sunken`.
  - `--font-display` starts with `'Bricolage Grotesque'`, `--font-body` with `'Instrument Sans'`.
- [ ] **Step 2: Run it and see it fail:** `node --test "scripts/ui-foundation/*.test.mjs"` → fails (module or variables missing).
- [ ] **Step 3: Implement** `contrast.mjs` (WCAG relative luminance) and `theme.mjs`; write the `@theme static { … }` block in `app/src/tailwind.css` after `@import 'tailwindcss';` with every value from the spec: colours, `--gradient-hero`, fonts, `--text-*`, `--radius-*`, `--shadow-card` (`0 1px 2px rgba(106, 79, 48, 0.06), 0 8px 24px rgba(106, 79, 48, 0.08)`), `--shadow-raised` (`0 14px 36px rgba(106, 79, 48, 0.12)`), `--shadow-modal` (`0 24px 64px rgba(23, 27, 74, 0.18)`), `--z-*`, `--duration-fast`, `--ease-standard`. `static` is required: component stylesheets are compiled separately and Tailwind would otherwise drop unused variables.
- [ ] **Step 4: Run** `node --test "scripts/ui-foundation/*.test.mjs"` → PASS.
- [ ] **Step 5: Global type and focus.** In `styles.scss`: `body { font-family: var(--font-body); color: var(--color-text); }`, `h1, h2, h3, h4 { font-family: var(--font-display); text-wrap: balance; }`, `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }`, and a `prefers-reduced-motion: reduce` block setting `transition-duration` and `animation-duration` to `0.01ms` on `*`. In `app.scss` replace the `:host` `font-family: Inter, …` stack with `var(--font-body)` (Inter is never loaded today).
- [ ] **Step 6: Remove local focus rings.** In every rule below delete only the `outline`, `outline-offset` and focus `box-shadow` declarations (keep background/colour changes; delete a rule left empty), and delete the three `outline: none` lines (`styles.scss:171`, `course-builder.scss:91`, `profile-page.scss:136`): `course-builder.scss:974,995,1013`, `profile-menu.scss:26,124`, `course-review-panel.scss:5`, `course-draft-status.scss:7`, `career-path-editor.scss:60`, `library-page.scss:116`, `courses-page.scss:71,148,700`, `profile-page.scss:134,184`, `course-view-page.scss:646,674`, `admin-page.scss:38`, `career-path-page.scss:272-274`, `course-editor-page.scss:176,215`. Line numbers are from `ee1b660`; re-find by selector.
- [ ] **Step 7: Wire the checks:** root `package.json` `"app:test": "node --test \"scripts/ui-foundation/*.test.mjs\" && npm --prefix app test"` (CI appends `-- --run` to the last command, which keeps working).
- [ ] **Step 8: Spec and defect record.** In the spec: Verification table files become `scripts/ui-foundation/design-values.test.mjs` (AC01, AC02), `app/src/app/ui/button/button.spec.ts` (AC03), `ui/icon-button/icon-button.spec.ts` (AC04), `ui/tabs/tabs.spec.ts` (AC05, AC06), `ui/progress-bar/progress-bar.spec.ts` (AC07), `scripts/ui-foundation/removed-patterns.test.mjs` plus `check-ui-foundation.mjs` (AC08), `scripts/ui-foundation/colors.test.mjs` (AC09); "Guard checks" describes the Node checks; add to "Observed" that `app.scss` sets Inter, which is not loaded, so body text falls back to the system font; the progress bar gains an optional `valueText`; the icon button line about projected SVGs becomes "the `aria-label` names the button, so icon content is never read"; add to the structural list: admin status and priority choices, the editor's step navigation, breadcrumb links, the login "remember me" toggle. In DEF-036 replace "four components" with "about 20 local focus rules in 13 stylesheets, at least five colours".
- [ ] **Step 9: Verify** `npm run app:test` → node tests pass, then 283 Angular tests pass.
- [ ] **Step 10: Commit** `fix(DEF-036): add shared design values and one focus ring`.

### Task 2: Colour baseline and removed-pattern guard (AC08, AC09)

**Files:**
- Create: `scripts/ui-foundation/colors.mjs`, `scripts/ui-foundation/colors.test.mjs`, `scripts/ui-foundation/removed-patterns.mjs`, `scripts/ui-foundation/removed-patterns.test.mjs`, `scripts/check-ui-foundation.mjs`, `scripts/hardcoded-colors-baseline.json`
- Modify: `package.json` (`app:test`)

**Interfaces:**
- Produces: `colorLiterals(text: string): string[]` (lower-cased hex `#rgb…#rrggbbaa`, `rgb()/rgba()/hsl()/hsla()` with whitespace removed); `compareToBaseline(current: Record<string, Record<string, number>>, baseline: same): Array<{ file: string; color: string; count: number; allowed: number }>`; `REMOVED: Array<{ id: string; kind: 'element' | 'class'; name: string }>` (starts empty); `findRemoved(files: Array<{ path: string; text: string }>, removed): Array<{ path: string; line: number; id: string }>`. CLI `node scripts/check-ui-foundation.mjs [--update-baseline]` scans `app/src/**/*.{scss,css}` except `app/src/tailwind.css` for colours and `app/src/**/*.{html,ts,scss}` for removed patterns; exit 1 with one line per finding, e.g. `app/src/app/x.scss: #abcdef appears 2 times, baseline allows 1`. `--update-baseline` rewrites the JSON but refuses (exit 1) if any count would rise.
- Consumed by Tasks 7–11: each adds its entries to `REMOVED`.

- [ ] **Step 1: Failing tests.** `colors.test.mjs`: `colorLiterals('a{color:#FFF;background:rgba(0, 0, 0, .1)} b{color:var(--color-ink)}')` deep-equals `['#fff', 'rgba(0,0,0,.1)']`; `compareToBaseline({ 'x.scss': { '#fff': 2 } }, { 'x.scss': { '#fff': 1 } })` returns one finding with `allowed: 1`; a file missing from the baseline allows 0; a lower count returns `[]`. `removed-patterns.test.mjs`: with `REMOVED`-shaped input `[{ id: 'app-button', kind: 'element', name: 'app-button' }, { id: 'cp-btn', kind: 'class', name: 'cp-btn' }]`, `findRemoved` finds `<app-button variant="primary">` in HTML, `class="cp-btn cp-btn-primary"` (the token `cp-btn` only, not `cp-btn-primary` alone), `[class.cp-btn]=` in HTML, and `.cp-btn {` / `.cp-btn:hover` in SCSS, each with its line number; it does not match `cp-btns` or `app-buttons`.
- [ ] **Step 2: Run** `node --test "scripts/ui-foundation/*.test.mjs"` → FAIL.
- [ ] **Step 3: Implement** the modules and the CLI; generate the baseline with `node scripts/check-ui-foundation.mjs --update-baseline` (first run creates it), check the JSON in.
- [ ] **Step 4: Run** the node tests → PASS; `node scripts/check-ui-foundation.mjs` → exit 0. Prove AC09: add `color: #123456;` to `app/src/app/pages/terms-page/terms-page.scss`, run the CLI → exit 1 naming that file and `#123456`; remove the line.
- [ ] **Step 5: Wire** `"app:test": "node --test \"scripts/ui-foundation/*.test.mjs\" && node scripts/check-ui-foundation.mjs && npm --prefix app test"`; run `npm run app:test` → PASS.
- [ ] **Step 6: Commit** `test(US-P013): refuse new hard-coded colours and removed UI patterns`.

### Task 3: Shared button (AC01, AC03, DEF-035)

**Files:**
- Create: `app/src/app/ui/button/button.ts`, `button.html`, `button.scss`, `button.spec.ts`

**Interfaces:**
- Produces: `export class Button`, selector `button[appButton], a[appButton], label[appButton]`. Inputs: `appButton: input<ButtonVariant, ButtonVariant | ''>('secondary', { transform })` where `type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dashed'` and `''` maps to `'secondary'`; `size: input<'sm' | 'md' | 'lg'>('md')`; `fullWidth`, `loading`: `input(false, { transform: booleanAttribute })`; `type: input<'button' | 'submit' | 'reset'>('button')`. Host: `data-variant`, `data-size`, `data-full-width` (present only when true), `type` (only on `<button>`), `aria-busy` and `aria-disabled` (`"true"` while loading, absent otherwise). Template: spinner `<span class="btn-spinner" aria-hidden="true">` before `<ng-content />` while loading.
- Look (from design values): min heights 30/36/44px, padding 0 12px / 0 16px / 0 20px, `--radius-card`, `--text-meta` (sm) or `--text-body` font size, weight 600; `primary` white on `--color-primary`, hover `--color-primary-hover`; `secondary` `--color-ink` on `--color-surface-card` with `--color-border-strong`, hover border `--color-primary` and background `--color-primary-soft`; `ghost` transparent, `--color-text-muted`, hover `--color-ink` on `--color-surface-sunken`; `danger` `--color-danger` on `--color-danger-soft` with a danger border; `dashed` full width, 1px dashed `--color-border-strong`, `--color-text-muted`, hover `--color-primary`. Pressed: `transform: scale(0.98)`. Disabled (`:disabled`, `[aria-disabled=true]`): `--color-surface-sunken` background, `--color-text-muted` text, `cursor: not-allowed`, no hover change. Transitions use `--duration-fast`. `label` hosts show the ring with `:focus-within`.

- [ ] **Step 1: Failing spec** `button.spec.ts` with a host component, asserting:
  - `<button appButton>Save</button>` has `data-variant="secondary"`, `data-size="md"`, `type="button"`.
  - `<button appButton="primary" size="lg" fullWidth type="submit">` has `data-variant="primary"`, `data-size="lg"`, `data-full-width`, `type="submit"`; clicking it inside a `<form (submit)="submitted = true">` sets `submitted`.
  - `<a appButton="ghost" href="/x">` has no `type` attribute.
  - With `[loading]="true"`: `aria-busy="true"`, `aria-disabled="true"`, a `.btn-spinner` element, and a `(click)` handler on the host element is not called after `button.click()`.
  - With `[disabled]="true"`: the handler is not called.
  - `<label appButton for="f">` with a following `<input type="file" id="f" class="visually-hidden">`: the label has no `type` attribute and the input's computed `display` is not `none`.
- [ ] **Step 2: Run** `(cd app && npx ng test --watch=false --include src/app/ui/button/button.spec.ts)` → FAIL (no component).
- [ ] **Step 3: Implement** `Button`. Stop clicks while loading with a capture-phase `click` listener registered on the host element in the constructor (`preventDefault` + `stopImmediatePropagation`), so it runs before the page's own `(click)` handler.
- [ ] **Step 4: Run** the spec → PASS; `npm run app:test` → PASS.
- [ ] **Step 5: Commit** `feat(US-P013): add the shared button`.

### Task 4: Shared icon button (AC04)

**Files:**
- Create: `app/src/app/ui/icon-button/icon-button.ts`, `icon-button.html`, `icon-button.scss`, `icon-button.spec.ts`

**Interfaces:**
- Produces: `export class IconButton`, selector `button[appIconButton], a[appIconButton]`. Inputs: `appIconButton: input<'default' | 'ghost' | 'danger', …>('default')` with `''` → `'default'`; `label: input.required<string>()`; `size: input<'sm' | 'md' | 'lg'>('md')`; `type` as in `Button`. Host: `aria-label` and `title` from `label`, `data-variant`, `data-size`, `type` only on `<button>`. Squares of 28/32/40px, `--radius-card`, icons 16px (`sm` 14px), same state rules as `Button`'s secondary (`default`), ghost and danger.

- [ ] **Step 1: Failing spec:** `<button appIconButton label="Remove section">` has `aria-label` and `title` `"Remove section"`, `type="button"`, `data-variant="default"`, `data-size="md"`; `[label]="'Move step ' + n + ' up'"` with `n = 2` gives `"Move step 2 up"`; `appIconButton="danger" size="sm"` sets those attributes.
- [ ] **Step 2: Run** `(cd app && npx ng test --watch=false --include src/app/ui/icon-button/icon-button.spec.ts)` → FAIL.
- [ ] **Step 3: Implement** `IconButton`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(US-P013): add the shared icon button`.

### Task 5: Shared tabs and chip (AC05, AC06)

**Files:**
- Create: `app/src/app/ui/chip/chip.ts`, `chip.scss`, `chip.spec.ts`, `app/src/app/ui/tabs/tabs.ts`, `tabs.html`, `tabs.scss`, `tabs.spec.ts`

**Interfaces:**
- Produces: `export class Chip`, selector `span[appChip]`, input `appChip: 'neutral' | 'primary' | 'highlight' | 'danger'` (`''` → `'neutral'`), host `data-variant`; pill (`--radius-pill`), `--text-caption`, weight 600, padding 2px 8px; neutral `--color-text-muted` on `--color-surface-sunken`, primary `--color-primary` on `--color-primary-soft`, highlight `--color-highlight-ink` on `--color-highlight-soft`, danger `--color-danger` on `--color-danger-soft`.
- Produces: `export class Tabs`, selector `app-tabs`; `export type TabItem = { id: string; label: string; count?: number }`; `export function tabId(groupId: string, id: string): string` → `` `${groupId}-tab-${id}` ``; `export function tabPanelId(groupId: string, id: string): string` → `` `${groupId}-panel-${id}` ``. Inputs: `groupId`, `label`, `tabs: TabItem[]`, `selected: string` (all required). Output: `selectedChange: output<string>()`. Renders `<div role="tablist" [attr.aria-label]="label()">` with one `<button type="button" role="tab">` per item (`id`, `aria-controls`, `aria-selected`, `tabindex` 0 for the selected tab or the first tab when `selected` is not in `tabs`, otherwise -1), the label, and `<span appChip>` with the count when `count` is defined. Look: underline row, `--color-border` bottom border, tab text `--color-text-muted` weight 600, selected `--color-ink` with a 2px `--color-primary` underline.

- [ ] **Step 1: Failing specs.** `chip.spec.ts`: default and `appChip="primary"` set `data-variant`. `tabs.spec.ts` with `groupId="feedback"`, tabs `current` (count 4) and `archived`, selected `current`:
  - tablist has `aria-label`; tab ids are `feedback-tab-current` / `feedback-tab-archived`, `aria-controls` `feedback-panel-…`, `aria-selected` `true`/`false`, `tabindex` `0`/`-1`; the first tab's text contains `4` inside `span[appChip]`.
  - clicking `archived` emits `'archived'`.
  - `ArrowRight` on `current` emits `'archived'` and focuses `#feedback-tab-archived`; `ArrowRight` on the last tab emits the first; `ArrowLeft` on the first emits the last; `Home` / `End` emit first / last.
  - with `selected="drafts"` (not in the list) the first tab has `tabindex="0"`.
  - `tabId('a', 'b')` is `'a-tab-b'`, `tabPanelId('a', 'b')` is `'a-panel-b'`.
- [ ] **Step 2: Run** both specs → FAIL.
- [ ] **Step 3: Implement** `Chip` and `Tabs` (focus the target tab button via `viewChildren` after emitting).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(US-P013): add shared tabs and chip`.

### Task 6: Shared progress bar (AC07)

**Files:**
- Create: `app/src/app/ui/progress-bar/progress-bar.ts`, `progress-bar.html`, `progress-bar.scss`, `progress-bar.spec.ts`

**Interfaces:**
- Produces: `export class ProgressBar`, selector `app-progress-bar`. Inputs: `value: input.required<number>()`, `label: input.required<string>()`, `valueText: input<string>()` (optional), `size: input<'sm' | 'md'>('md')`. Host: `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` (clamped, rounded), `aria-valuetext` (`valueText()` or `` `${n}%` ``), `aria-label`. Track `--color-surface-sunken`, fill `--color-primary`, heights 4px (`sm`) / 8px, `--radius-pill`, fill width transition `--duration-fast`.

- [ ] **Step 1: Failing spec:** value 42.4 → `aria-valuenow="42"`, `aria-valuetext="42%"`, fill width `42%`; 140 → 100; -5 → 0; `NaN` → 0; `valueText="Question 2 of 5"` is used as `aria-valuetext`; `label` is the `aria-label`.
- [ ] **Step 2: Run** `(cd app && npx ng test --watch=false --include src/app/ui/progress-bar/progress-bar.spec.ts)` → FAIL.
- [ ] **Step 3: Implement** `ProgressBar`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(US-P013): add the shared progress bar`.

### Task 7: Replace the `app-button` element everywhere (DEF-035)

**Files:**
- Modify: the templates and component `imports` of every `<app-button>` user (50 uses): `pages/admin-page`, `course-editor-page`, `course-view-page`, `courses-page`, `dashboard-page`, `library-page`, `login-page`, `password-reset-page`, `profile-page`; `ui/confirm-dialog`, `course-builder`, `course-review-panel`, `feedback-dialog`, `page-header`; `pages/admin-page/admin-page.spec.ts:114,121,138,174`; `scripts/ui-foundation/removed-patterns.mjs`
- Delete: `app/src/app/ui/app-button/` (all files)

**Interfaces:**
- Consumes: `Button` (Task 3), `IconButton` (Task 4).

- [ ] **Step 1: RED.** Add `{ id: 'app-button', kind: 'element', name: 'app-button' }` and `{ id: 'app-button-class', kind: 'class', name: 'app-button' }` to `REMOVED`; `node scripts/check-ui-foundation.mjs` → exit 1 listing the 50 uses.
- [ ] **Step 2: Migrate** with the spec's mapping: `<app-button variant="primary" …>` → `<button appButton="primary" …>`; `variant="outline"` or none → `appButton`; `[variant]="x ? 'primary' : 'outline'"` → `[appButton]="x ? 'primary' : 'secondary'"`; `variant="login-submit"` + `class="fill"` → `appButton="primary" size="lg" fullWidth`; `class="fill"` → `fullWidth`; `(buttonClicked)` → `(click)`; `ariaLabel="…"` / `[ariaLabel]` → `aria-label` / `[attr.aria-label]`. The ghost close button in `feedback-dialog.html:14` (`ariaLabel="Close feedback"`) becomes `<button appIconButton="ghost" label="Close feedback">`. Keep every `type="submit"` and `[disabled]`. Replace `AppButton` with `Button` (and `IconButton` where used) in each component's `imports`.
- [ ] **Step 3: Update** `admin-page.spec.ts` selectors `'app-button button'` → `'button[appButton]'`.
- [ ] **Step 4: Delete** `app/src/app/ui/app-button/` and the login-only CSS variables that only it used (`--button-disabled` in `app.scss` if unused elsewhere: `grep -rn "button-disabled" app/src`).
- [ ] **Step 5: GREEN.** `node scripts/check-ui-foundation.mjs` → exit 0; `npm run app:test` → PASS; `(cd app && npx ng build --configuration development)` → succeeds.
- [ ] **Step 6: Commit** `fix(DEF-035): move every page to the shared button`.

### Task 8: Career path and career path editor buttons

**Files:**
- Modify: `app/src/app/pages/career-path-page/career-path-page.html` (lines 35, 42, 90, 94, 129, 169, 229, 232, 238, 277 `<a>`, 364), `career-path-page.scss` (`.cp-btn*` rules at 247–306, 762–763, focus 272), `career-path-page.ts` (imports), `app/src/app/ui/career-path-editor/career-path-editor.html` (lines 19, 54–56, 100, 103, 111, 118, 121, 123, 124), `career-path-editor.scss`, `career-path-editor.ts`, `scripts/ui-foundation/removed-patterns.mjs`

- [ ] **Step 1: RED.** Add classes `cp-btn`, `cp-btn-primary`, `cp-btn-secondary`, `cp-btn-ghost`, `cp-btn-map`, `cp-btn-arrow`, `cpe-btn` to `REMOVED`; CLI → exit 1.
- [ ] **Step 2: Migrate.** `cp-btn cp-btn-primary` → `appButton="primary"`; `cp-btn-secondary` and `cp-btn-map` → `appButton`; `cp-btn-ghost` → `appButton="ghost"`; keep any arrow glyph span but drop its class and the hover-slide rule. `cpe-btn` → `appButton size="sm"`; `is-small` stays `size="sm"`; `is-danger` → `appButton="danger"`; `is-primary` → `appButton="primary"`; `cpe-add-step` → `appButton="dashed"`; the three icon-only step buttons (54–56, with `[attr.aria-label]`) → `appIconButton` (`ghost`, danger for remove) with `[label]` carrying the same expression. Delete the old rules.
- [ ] **Step 3: Form check.** For each changed button inside a `<form>` that had no `type`, add `type="submit"`: `grep -n "<form" career-path-page.html career-path-editor.html` and compare.
- [ ] **Step 4: GREEN.** CLI exit 0; `npm run app:test` → PASS.
- [ ] **Step 5: Commit** `feat(US-P013): career path pages use the shared buttons`.

### Task 9: Course view, learning view, catalog, editor and draft buttons

**Files:**
- Modify: `pages/course-view-page/course-view-page.html` (136, 140, 145, 149, 187, 195 learning buttons; 234 expand toggle; 366 curriculum expand; 452 attachment download; 549, 561, 572 admin actions; 624, 668, 716 modal close), `course-view-page.scss`, `course-view-page-learning.scss`, `course-view-page.ts`; `pages/courses-page/courses-page.html` (128, 138 carousel; 206 filters toggle; 222 filters clear), `courses-page.scss`, `courses-page.ts`; `pages/course-editor-page/course-editor-page.html:461` (preview action), `.scss`, `.ts`; `routes/course-editor-route.html:5`, `routes/course-editor-route.ts`; `ui/course-draft-status/course-draft-status.html:12,13,22,33`, `.scss`, `.ts`; `pages/login-page/login-page.html:237,323` (password visibility); `scripts/ui-foundation/removed-patterns.mjs`

- [ ] **Step 1: RED.** Add classes `learning-primary-button`, `learning-secondary-button`, `learning-attachment-item`, `curriculum-expand-button`, `course-admin-action`, `price-modal-close`, `carousel-control`, `filters-toggle`, `filters-clear`, `course-preview-action` to `REMOVED`; CLI → exit 1.
- [ ] **Step 2: Migrate.** Learning primary → `appButton="primary"`, secondary → `appButton`; attachment downloads (187, 452) → `appButton size="sm"`; expand/collapse (234, 366) → `appButton="ghost" size="sm"`; `course-admin-action` (icon-only, named) → `appIconButton` with the same `label`; `price-modal-close` → `appIconButton="ghost"` with the same label; carousel controls → `appIconButton` with the same labels; filters toggle → `appButton size="sm"`, filters clear → `appButton="ghost" size="sm"`; preview action → `appButton`; editor route back (`rounded-lg …`) → `appButton`; draft-status actions → `appButton size="sm"`; login password visibility (237, 323) → `appButton="ghost" size="sm"`. Delete the old rules (including `.course-admin-action::after` focus decoration). Breadcrumbs, the editor step list, admin status/priority choices and "remember me" stay native (structural).
- [ ] **Step 3: Form check** as in Task 8 for `login-page.html`, `course-view-page.html` modals and `course-editor-page.html`.
- [ ] **Step 4: GREEN.** CLI exit 0; `npm run app:test` → PASS.
- [ ] **Step 5: Commit** `feat(US-P013): course, catalog and learning views use the shared buttons`.

### Task 10: Course builder buttons

**Files:**
- Modify: `app/src/app/ui/course-builder/course-builder.html` (51, 67, 97, 156, 165, 177, 218, 313, 362, 378, 415, 428, 452, 467, 500, 521 label, 694 label, 727, 736, 778, 805, toolbar buttons from ~591), `course-builder.scss`, `course-builder.ts`, `course-builder-authoring.spec.ts:39,257`, the `downloadAttachment` button at line 34, `scripts/ui-foundation/removed-patterns.mjs`

- [ ] **Step 1: RED.** Add classes `icon-action-button`, `icon-action-button-danger`, `chevron-button`, `component-row-action`, `component-row-action-danger`, `mux-upload-button`, `add-component-button`, `quiz-add-question-button`, `quiz-inline-action`, `quiz-question-remove`, `quiz-answer-remove`, `attachment-icon-button`, `attachment-icon-button-danger`, `component-picker-add` to `REMOVED`; CLI → exit 1.
- [ ] **Step 2: Migrate.** `icon-action-button` → `appIconButton` (danger variant for remove) keeping labels; `chevron-button` → `appIconButton="ghost"` with `[label]="sectionToggleLabel(sectionIndex)"` and its `aria-expanded`; `component-row-action` → `appButton size="sm"`, `-danger` → `appButton="danger" size="sm"`; the two file labels → `<label appButton size="sm" [attr.aria-disabled]="<same condition as is-disabled> || null" [attr.for]="…">` (keep each input visually hidden and focusable); `add-component-button` and `quiz-add-question-button` → `appButton="dashed"`; `quiz-inline-action` → `appButton="ghost" size="sm"`; `quiz-question-remove` / `quiz-answer-remove` → `appIconButton="danger" size="sm"` with the same labels; `attachment-icon-button` → `appIconButton size="sm"` (danger variant for remove), `label="Download {{ attachment.fileName }}"`; `component-picker-add` → `appButton="primary" size="sm"` keeping `[attr.aria-label]`; line-34 download → `appButton size="sm"`; rich-text toolbar buttons → `appIconButton="ghost" size="sm"` with `label` equal to today's `aria-label`, keeping `(mousedown)`, and give the toolbar container `role="toolbar"`.
- [ ] **Step 3: Update** `course-builder-authoring.spec.ts` to find the edit button by its text (`[...host.querySelectorAll('button')].find(b => b.textContent?.trim() === '<label at line 156>')`) instead of `.component-row-action`.
- [ ] **Step 4: Form check** as in Task 8.
- [ ] **Step 5: GREEN.** CLI exit 0; `npm run app:test` → PASS.
- [ ] **Step 6: Commit** `feat(US-P013): course builder uses the shared buttons`.

### Task 11: Tabs and progress bars

**Files:**
- Modify: `pages/admin-page/admin-page.html:86-110` + `.scss` (`.admin-feedback-tabs*`) + `.ts`; `pages/courses-page/courses-page.html:24-33` + `.scss` (`.catalog-view-tabs*`) + `.ts`; progress: `course-view-page.html:64-74` (quiz, keep `valueText`), `dashboard-page.html:112-114`, `course-editor-page.html:421-428`, `course-builder.html:536-538` and `:713-715`, with their `.scss` rules; `scripts/ui-foundation/removed-patterns.mjs`

- [ ] **Step 1: RED.** Add classes `admin-feedback-tabs`, `catalog-view-tabs`, `learning-quiz-progress`, `db-action-progress`, `preview-progress-track`, `mux-upload-progress`, `attachment-upload-progress` to `REMOVED`; CLI → exit 1.
- [ ] **Step 2: Tabs.** Admin: `<app-tabs groupId="feedback" label="Feedback views" [tabs]="feedbackTabs()" [selected]="activeTab()" (selectedChange)="selectTab($any($event))" />` with `feedbackTabs = computed(() => [{ id: 'current', label: 'Current work items', count: activeTabCount('current') }, { id: 'archived', label: 'Archived', count: activeTabCount('archived') }])`, and wrap the panel body in `role="tabpanel"` with `tabPanelId`/`tabId`. Catalog: `groupId="catalog"`, `label="Catalog views"`, tabs `published` "Published" plus `drafts` "My drafts" only when `hasCreatorCourses()`, `(selectedChange)="setView($any($event))"`, panel wrapper likewise. Keep the existing `FeedbackTab` / `CourseCatalogView` types; narrow with a type guard instead of `$any` if the compiler allows.
- [ ] **Step 3: Progress bars** → `<app-progress-bar [value]="…" label="…">` with today's labels: quiz `label="Question position"` and `[valueText]="'Question ' + n + ' of ' + total"`; dashboard `[label]="course.title + ' progress'"`; editor `label="Course detail completion"` (keep the visible "x% filled" text); uploads `label="Video upload progress"` / `label="Attachment upload progress"` with `size="sm"`. Delete the old rules.
- [ ] **Step 4: GREEN.** CLI exit 0; `npm run app:test` → PASS (update any spec that read the old classes).
- [ ] **Step 5: Commit** `feat(US-P013): shared tabs and progress bars on every page`.

### Task 12: Exact-match colours and the design DNA

**Files:**
- Modify: all stylesheets under `app/src` except `tailwind.css`; `scripts/hardcoded-colors-baseline.json`; `design/course-ui-design-dna.md`

- [ ] **Step 1: Replace** exact literals (case-insensitive, whitespace-insensitive for `rgba`) with variables, nothing else: `#171b4a` → `var(--color-ink)`, `#39393a` → `var(--color-text)`, `#6c6558` → `var(--color-text-muted)`, `#fcfaf5` → `var(--color-surface-page)`, `#f5f2ea` → `var(--color-surface-sunken)`, `rgba(108, 101, 88, 0.16)` → `var(--color-border)`, `rgba(108, 101, 88, 0.28)` → `var(--color-border-strong)`, `#2f4f43` → `var(--color-primary)`, `#ffd08e` → `var(--color-highlight)`, `#fff4e1` → `var(--color-highlight-soft)`, `#78350f` → `var(--color-highlight-ink)`, `#5b3df5` → `var(--color-link)`, `#991b1b` → `var(--color-danger)`, `#fff5f5` → `var(--color-danger-soft)`. Leave `#fff`/`#ffffff` and all other values. Do it with a small one-off Node script you do not commit; review the diff.
- [ ] **Step 2: Lower the baseline:** `node scripts/check-ui-foundation.mjs --update-baseline` → exit 0; commit the smaller JSON.
- [ ] **Step 3: Design DNA.** In `design/course-ui-design-dna.md`: palette section points to the `@theme` values in `app/src/tailwind.css`; "Action accent" says primary actions are deep green and violet is for text links only; focus states use `--color-focus` (`#b45309`), not `#ffd08e`; "Implementation Notes" lists `appButton`, `appIconButton`, `app-tabs`, `app-progress-bar`, `appChip` instead of `app-button`; add the rule "new styles use the design values; the colour check refuses new hard-coded colours".
- [ ] **Step 4: Verify** `npm run app:test` → PASS; `(cd app && npx ng build --configuration development)` succeeds.
- [ ] **Step 5: Commit** `refactor(US-P013): use design values for exact palette colours`.

### Task 13: Full verification, browser walk and delivery record

**Files:**
- Create: `docs/verification/2026-10-15/US-P013/` (screenshots, `walkthrough.md`), a throwaway Playwright script outside the repo
- Modify: `docs/specs/US-P013-shared-ui-foundation.md` (Verification table, Record state), `docs/user_stories.md`, `docs/defect_management.md` (DEF-035, DEF-036 resolution sections), `docs/work_queue.md`

- [ ] **Step 1: Checks.** `npm run app:test`, `npm run api:build && npm run api:test`, `npm run verify:journeys`, and the Pages build with the temporary font setting (see Global Constraints). All must pass; record counts.
- [ ] **Step 2: Browser walk.** Run `npm run app:dev` (in-memory API, demo users from the README). With Playwright (Chromium at `/opt/pw-browsers`), sign in as the demo student, teacher and admin and screenshot, at 1440px and 400px wide: login, dashboard, catalog (both tabs as teacher), course details, learning view (video or text lesson and a quiz), library, career path, course editor with the builder open, admin (feedback tabs, users), profile, password reset. Before each screenshot press Tab until a shared button has focus, so the ring is visible in the evidence. Check no horizontal scroll at 400px. Save to `docs/verification/2026-10-15/US-P013/`.
- [ ] **Step 3: Keyboard walk** of the two tab sets (arrows, Home/End) and one modal; note results in `walkthrough.md`.
- [ ] **Step 4: Record.** Spec Verification table filled with commands, counts, commit and evidence paths; spec state "Done locally on the branch"; DEF-035 and DEF-036 get resolution sections (fix, date, commit, regression checks, remaining release checks) and state Fixed; the US-P013 story stays in `user_stories.md` until merged to `main`, with state "In review"; queue row updated.
- [ ] **Step 5: Commit** `docs(US-P013): record verification and delivery`.
- [ ] **Step 6: Push the branch** (`git fetch origin main` first) and open a pull request to `main` titled `US-P013: one shared look for actions, views and progress`, body listing the scenarios, the evidence folder and the visible changes (green primary buttons, login button, career path buttons, focus ring, body font).
