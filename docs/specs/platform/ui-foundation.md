# UI foundation

## Purpose

Every page looks and behaves like one product: the same buttons, tabs, progress, focus and colours.

## Behavior

- **Design values** live once in `app/src/tailwind.css` (`@theme`): colours by job (`--color-ink`,
  `--color-text`, `--color-primary` deep green, `--color-highlight` amber for "you are here" only,
  `--color-focus`, `--color-danger`, lesson-type colours), fonts (Bricolage Grotesque display,
  Instrument Sans body, JetBrains Mono), type scale, radius, shadows, z-layers and motion. SCSS uses
  `var(--…)`; templates may use the generated utilities. Background: the
  [design DNA](../../../design/course-ui-design-dna.md).
- **Shared components** (`app/src/app/ui/`), standalone, OnPush, signal inputs:
  - `button[appButton]` / `a[appButton]`: `primary`, `secondary`, `ghost`, `danger`, `dashed`;
    `busy` blocks a second press and sets `aria-busy`.
  - `button[appIconButton]`: required `label` (sets `aria-label` and `title`), optional `hint`.
  - `<app-tabs>`: `role="tablist"`, arrow keys, Home/End, roving tabindex, optional count chip;
    `tabId()` / `tabPanelId()` helpers for matching panels.
  - `<app-progress-bar>`: required `label`, value clamped 0–100, announced as a percentage.
  - `span[appChip]`: `neutral`, `primary`, `highlight`, `danger`.
  - Also: `page-header`, `confirm-dialog` (with `services/confirm.service.ts`), `loading-skeleton`,
    `profile-menu`, `brand-link`.
- **One focus ring** for every focusable control, set globally in `styles.scss`
  (`:focus-visible`, inverse colour on `data-surface="dark"` bands). Components do not draw their own.
- Primary text contrast is at least 4.5:1; the focus ring at least 3:1.

## Rules

- No page-local button or tab systems. `npm run app:test` runs `scripts/check-ui-foundation.mjs`:
  it fails on removed patterns and on any new hard-coded colour beyond
  `scripts/hardcoded-colors-baseline.json`.
- Structural controls (accordion headers, list rows, menu items, answer options) may stay native
  `<button>`s, but use the design values and the global ring.
- Primary navigation links (including Catalog and My Learning) have no dropdown chevrons.
  Use disclosure indicators only on controls that actually expand content or open a menu.
- No dark theme.

## Code

- `app/src/tailwind.css`, `app/src/styles.scss`, `app/src/app/ui/*`, `scripts/check-ui-foundation.mjs`,
  `scripts/ui-foundation/`.
