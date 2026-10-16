# US-P013 browser walk, 2026-10-16

Branch `feat/US-P013-shared-ui-foundation` at `5f23fd8` (app 0.1.194). Spec:
[US-P013](../../../specs/US-P013-shared-ui-foundation.md).

Method: `npm run app:dev` (in-memory API on 3001, Angular on 4200), Chromium via Playwright,
demo users from the README. The demo data has no course with lessons, so one was seeded over
the HTTP API the way `api/src/journey.test.ts` does it: as teacher a course with a video lesson
(no Mux asset), a text lesson, a two-question quiz and a resources lesson with a PDF handout;
as admin submit and publish; as student enroll. A second teacher draft course, and a published
career path "Walkthrough path" (one required step with the course, one optional preview step) that the
student selected, were added the same way. The walk and seed scripts live outside the repo.

Before each screenshot the walk presses Tab until a shared button (or tab) outside the page header has
focus, so its ring is in the evidence. Where a page has no such control, or the focus target is not a shared
button (profile, password reset, quiz, dashboard), the screenshot is taken unfocused at the top of the page.
Builder and dark-band shots focus the control with the keyboard modality (a key press, then `focus()`).
The dev server and walk were stopped afterwards; ports 3001 and 4200 answer nothing.

## Visual findings

Findings 1 and 2 were fixed afterwards in fix round 1 (see below the table). Findings 3 to 5 stay recorded.

| # | Severity | Finding | Screenshot | Likely cause |
| --- | --- | --- | --- | --- |
| 1 | Medium, fixed in fix round 1 | The Feedback button in the page header is stretched across the whole middle grid column (about 590px wide at 1440px) on every page that has the header. At 400px the header stacks and the button is content-wide. Before the migration the button stayed content-wide. | `dashboard-student-1440`, `catalog-student-1440`, `learning-student-1440` (and every other 1440 shot) | `.topbar` is `grid-template-columns: auto minmax(96px, 1fr) auto auto`. The old `app-button` host was `inline-flex`, so the inner button did not stretch. The new `<button appButton>` is a grid item and stretches. `justify-self: start` on it in `page-header.scss` fixes it. |
| 2 | Medium, fixed in fix round 1 | The editor's "Next: <step>" button renders at 16px regular weight, while Cancel, Back and Save changes are 14px semibold. It also loses `white-space: nowrap`. Computed: Next 16px/400, Back 14px/600. | `editor-teacher-1440`, `editor-builder-teacher-1440` | `course-editor-page.html:381` binds `[appButton]="..."`. A property binding does not write the `appbutton` attribute (checked in the DOM: the Cancel, Back and Save buttons have it, Next does not). So `app.scss:46` `button:not([appButton]):not([appIconButton]) { font: inherit }` matches it and overrides the component font, and `.editor-action-bar [appButton]` does not apply. It is the only `[appButton]=` binding in the app. |
| 3 | Low | "Refresh progress" in the library sits flush against the bottom edge of the course card, with no gap. Not compared with the base build. | `library-student-1440` | Probably a missing margin where the `app-button` host used to add space; not investigated. |
| 4 | Low, probably existing | Admin section switch at 400px: the fourth segment ("User management") is clipped by the right edge and the labels wrap onto two lines; the strip scrolls inside itself. The page itself does not scroll horizontally. The switch is a segmented control that this story leaves alone. | `admin-feedback-admin-400` | Out of scope, listed for completeness. |
| 5 | Low, probably existing | In the builder's edit modal at 400px the close button drops onto its own row under the title. | `builder-richtext-toolbar-focus-teacher-400` | Modal header wraps; modals are out of scope. |

Not verified, because the demo data cannot show them:

- Catalog carousel arrows (52px orange to 40px shared, "PO to confirm" in the ledger): the catalog has two
  courses, so the carousel shows no paging controls. Needs a hosted look or more demo courses.
- Mux player and the learning video stage ring: the seeded video has no ready asset ("Course material is
  being prepared"). The learning video stage carries no `data-surface="dark"` marker in the source (only the
  course view hero, the editor hero and the dashboard hero stat do), so if its background is dark the ring there
  is the standard orange. The `data-surface="dark"` ring was checked on the course view hero and the editor
  hero instead (see below).
- Admin feedback rows (status and priority choices): the in-memory store has no feedback, so the tabs show
  their empty state with count 0.

Fix round 1: finding 2 is fixed at the component: `Button` and `IconButton` now always carry `appbutton` /
`appiconbutton` as a static host attribute, so a bound `[appButton]` still matches the attribute selectors
(spec cases in `button.spec.ts` and `icon-button.spec.ts`, red before, green after). In the browser the editor
"Next" button is 14px, weight 600, `nowrap`, the same as Back. Finding 1 is fixed with `justify-self: start` on
`.topbar > button` in `page-header.scss`; the Feedback button is now 100px wide at 1440px.

## What is confirmed

- No horizontal page scroll in any of the 63 screenshots: `document.documentElement.scrollWidth <=
  window.innerWidth` held in every run (1425 of 1440 and 385 of 400, the difference is the 15px scrollbar;
  885 of 900 for the 900px shots).
- Primary buttons are deep green with white text on every page: login (disabled until filled, sunken), course
  details "Start learning", learning "Mark complete", library "Browse courses", career path "Start Career Path",
  "Start course", editor "Save changes", admin "Refresh", "Search", "Save and publish".
- The ring is `#b45309` outside, 2px with a 2px offset, and is visible and not clipped on: login Show button,
  library, course details, learning, catalog "Show filters" and "Hide filters", catalog tabs, admin tabs, user
  search, career path buttons, builder rich-text toolbar button, builder file picker label, editor step and
  action buttons. Tab rings are inset and sit inside the tab row (`catalog-teacher-1440`,
  `admin-feedback-admin-1440`).
- Dark bands use the light amber ring `#ffd08e`: `dark-band-course-details-breadcrumb-focus-student-1440`
  and `dark-band-editor-breadcrumb-focus-teacher-1440` show it clearly on the hero gradient.
- The builder file picker (`label[appButton]` with the input nested inside) shows the ring when the hidden
  input has keyboard focus: `builder-file-picker-focus-teacher-1440` and `-400`.
- Catalog at 900px: "Show filters" and "Hide filters" are full-width toggles and open the filter panel
  (`catalog-student-900`, `catalog-filters-open-student-900`).
- Learning at 400px: "Mark complete" is full width (`learning-student-400`, `learning-text-student-400`).
- Quiz progress bar is green on a sunken track (`learning-quiz-student-1440`).
- Career path pages (wizard, selected path, admin editor) use the green primary and the shared secondary;
  the editor's Up/Down/Remove step buttons stay text buttons (ghost and danger, small) as ruled.

## Keyboard walk (step 3)

Run with Playwright keyboard events on the seeded data. `selected` is the tab with `aria-selected="true"`,
`tabindex 0` is the one in the Tab order.

Admin feedback tabs (Current work items, Archived): focus on the first tab, selected and tabindex 0 on it.

| Key | Focus and selection after |
| --- | --- |
| ArrowRight | Archived, selected, only tab with tabindex 0, panel labelled `feedback-tab-archived` |
| ArrowRight | wraps to Current work items |
| ArrowLeft | wraps to Archived |
| End | stays on Archived (already last) |
| Home | Current work items |
| ArrowLeft, ArrowRight | Archived, then Current work items |
| Tab | moves out of the tab list into the tab panel (the panel has `tabindex="0"`) |

Catalog tabs (Published, My drafts, teacher with a draft): the same keys give the same results with
`catalog-tab-published` and `catalog-tab-drafts` as the panel's `aria-labelledby`; Tab leaves the tab list
for "+ New course". Result: pass for both tab sets. With two tabs End and ArrowRight cannot be told apart from
wrapping; the unit test in `app/src/app/ui/tabs/tabs.spec.ts` ("jumps to the first and last tab with Home and End") covers them.

Modal (the builder's component picker, opened with Enter on "Add New Component"):

| Check | Result |
| --- | --- |
| Focus on open | "Close component picker" inside the dialog (`role="dialog"`) |
| Tab cycle | Close, Add Text lesson, Add Quiz lesson, Add Resources lesson, Add Video lesson, Cancel, then back to Close: focus never leaves the dialog in 14 presses |
| Shift+Tab | moves back one control inside the dialog |
| Escape | closes the dialog and returns focus to "Add New Component" |

Result: pass. The two dark bands the ledger asked to recheck (course view hero, editor hero) show the inverse ring.

## Screenshots kept (41 PNGs, 7.6 MB after lossless optimisation)

To keep the repo light, one role per page is kept at 1440 and 400, plus the special cases. All were
viewport-only and passed the no-horizontal-scroll check. After fix round 1, `dashboard-student-1440` and
`editor-teacher-1440` were re-shot with the fixes for findings 1 and 2.

- Login and password reset: `login-anon-{1440,400}`, `password-reset-anon-{1440,400}`.
- Dashboard: `dashboard-student-{1440,400}`.
- Catalog: `catalog-teacher-{1440,400}` (Published tab), `catalog-drafts-teacher-{1440,400}` (My drafts tab),
  `catalog-student-900`, `catalog-filters-open-student-900` (filters toggle).
- Course details: `course-details-student-{1440,400}`.
- Learning: `learning-student-{1440,400}` (video lesson, full-width button at 400), `learning-quiz-student-{1440,400}`,
  `learning-resources-student-1440`.
- Library: `library-student-{1440,400}`.
- Career path: `career-path-selected-student-{1440,400}`.
- Course editor: `editor-teacher-{1440,400}`, `builder-text-open-teacher-{1440,400}`,
  `builder-richtext-toolbar-focus-teacher-{1440,400}`, `builder-file-picker-focus-teacher-{1440,400}`.
- Admin: `admin-feedback-admin-{1440,400}` (tab focus), `admin-users-admin-{1440,400}`,
  `admin-career-path-editor-admin-{1440,400}`.
- Profile: `profile-teacher-{1440,400}`.
- Dark bands: `dark-band-course-details-breadcrumb-focus-student-1440`, `dark-band-editor-breadcrumb-focus-teacher-1440`.

## Checked but not kept as files

Screenshots of these variants were taken and looked at, then deleted for size. Each passed the scroll test
(`scrollWidth <= innerWidth`; 1425 of 1440 and 385 of 400, the gap is the 15px scrollbar):
`catalog-student-{1440,400}`, `dashboard-{teacher,admin}-{1440,400}`, `profile-{student,admin}-{1440,400}`,
`library-teacher-{1440,400}`, `career-path-student-{1440,400}` (empty state, green "Browse courses" and "Start Career Path"),
`career-path-wizard-student-{1440,400}`, `learning-text-student-{1440,400}`, `learning-resources-student-400`,
`admin-career-paths-admin-{1440,400}`, `editor-builder-teacher-1440` (full page). Findings 1 to 3 above were
read from some of these (finding 1 in every 1440 page; finding 3 in `library-student-1440`, which is kept).
