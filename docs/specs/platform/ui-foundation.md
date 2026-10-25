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
  - `<app-progress-bar>`: required `label`, value clamped 0–100, announced as a percentage; `indeterminate` (unknown amount) shows a sliding segment, a still bar with reduced motion, and announces no number.
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
- **About** opens `/about` (`pages/about-page/`): what QI Academy offers and a short description of
  TestHuset taken from testhuset.dk (read 2026-10-24), with its website and info@testhuset.dk. Signed
  out it shows the brand link instead of the header.
- The profile button shows the account's **organization** name before the avatar (cut at 180px,
  hidden below 640px; the menu summary always names it) and the avatar in the **saved** avatar
  colour. `services/header-identity.service.ts` carries both from `AppStateService` to the header,
  which must not inject `AppStateService`.
- Teachers and admins also get a Roadmap link after My Learning. It opens `/roadmap`, a fixed copy
  of the agreed roadmap in `pages/roadmap-page/roadmap-page.ts` (releases and release 1 items, no
  management decisions). Students do not see the link, and `/roadmap` sends them to Home.
  The page has two tabs, Roadmap and Release notes. Release notes come from
  `pages/roadmap-page/release-notes.ts`, newest first; Claude adds the note for each push there,
  in the commit that is pushed. There is no in-app editor.
- No dark theme.
- Every modal dialog follows the confirm dialog's keyboard contract: focus moves into it when it
  opens, Tab and Shift+Tab stay inside, Escape closes it, and focus returns to the control that
  opened it. The course details page's price, enrollment and catalog dialogs follow it since X10.
- A page has one `h1`. Lesson text is rendered one level down (`#` becomes `h2`), under the lesson
  title, in the learning page and in the course details curriculum preview.
- Repeated buttons whose visible label does not name their item (Edit, Remove, Follow this career,
  Preview) keep that label and point `aria-describedby` at the item's title, so a screen reader
  says which lesson, chapter or career they act on.

## Code

- `app/src/tailwind.css`, `app/src/styles.scss`, `app/src/app/ui/*`, `scripts/check-ui-foundation.mjs`,
  `scripts/ui-foundation/`.
