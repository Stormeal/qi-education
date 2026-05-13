# Course UI Design DNA

Use this as the design reference for future QI-Education course view, course editor, and curriculum-builder work. It captures the current product language so new UI changes feel related to the existing app instead of becoming one-off styling.

## Product Feel

QI-Education should feel like a calm professional learning workspace: structured, trustworthy, and warm. It is not a marketing splash page and it is not a dense admin console. The learner view should feel guided and clear; the teacher editor should feel efficient, reviewable, and low-drama.

Design keywords:

- Warm discipline
- Quiet expertise
- Practical learning
- Clear hierarchy
- Editorial course detail
- Teacher workflow utility

## Core Layout Pattern

The course view uses a public-facing detail layout:

- A full-width dark green/brown hero establishes the course title, level, description, metadata, and career tags.
- The content below overlaps the hero slightly to create depth.
- Main content uses a two-column desktop layout: primary course content on the left, sticky enrollment and admin actions on the right.
- Mobile collapses to one column, with the enrollment card moved before the main content.

The course editor uses a workbench layout:

- A restrained page hero explains the current task.
- The main form is a contained, full-width panel.
- Each editor section is numbered and grouped by workflow stage: essentials, learner fit, publishing, course content.
- The action bar stays visually separate from the form content.

## Visual System

### Palette

Primary ink:

- Deep navy: `#171b4a` for major headings and strong labels.
- Body charcoal: `#39393a` for readable paragraph text.

Warm neutrals:

- Cream surface: `#fcfaf5`
- Soft field background: `#fbfaf7`
- Muted line/border color: `rgba(108, 101, 88, 0.12-0.22)`
- Muted text: `#6c6558`, `#7b6650`, `#75624d`

Brand warmth:

- Amber highlight: `#ffd08e`, `#fff0d3`, `#fff1db`
- Brown accent: `#78350f`

Learning trust:

- Deep green: `#2f4f43`
- Hero gradient: `#16241f -> #29463c -> #80592f`

Action accent:

- Blue-violet links/buttons: `#5b3df5` and muted blue `#5d7ea6`
- Use sparingly. It should identify actions, not dominate the page.

Error:

- Deep red: `#991b1b`
- Soft red surfaces only for destructive or failed states.

### Surfaces

- Default page background should be warm off-white, not pure gray.
- Cards use white backgrounds, thin warm borders, and soft tinted shadows.
- Radius is generally `8px` for ordinary cards and controls.
- Larger modals can use `24px` radius when they are intentionally elevated and isolated.
- Avoid stacking cards inside cards. Use borders, section gaps, and headers for grouping.

### Typography

- Headings are heavy and compact, usually `font-weight: 800-900`.
- Course view hero H1 is large but controlled: about `42px` desktop, `28px` mobile.
- Section headings are usually `18-22px`, not hero-sized.
- Metadata, labels, and eyebrow text use uppercase, small sizes, and strong weight.
- Body copy is concise, with comfortable line height around `1.55-1.68`.

## Interaction Language

Use real controls:

- Buttons for actions.
- Links only for navigation or external resources.
- Inputs and textareas with visible labels above the control.
- Accordions for curriculum sections.
- Modals for focused component editing and admin price changes.

Expected states:

- Loading skeletons should match the shape of course cards or curriculum rows.
- Empty curriculum should fall back to useful course metadata or a clear empty message.
- Errors should be inline and specific. Learner-facing pages should degrade gracefully where possible.
- Save confirmations use short toasts in the bottom-right corner.

Micro-interactions:

- Hover states are subtle warm/blue background shifts, not glow effects.
- Focus states use amber outlines and white field backgrounds.
- Sticky elements are allowed when they support workflow: enrollment card, editor panel header.

## Course View DNA

The course view is the learner's decision and orientation page.

Keep:

- Breadcrumbs at the top of the hero.
- Level/course status/teacher/date as metadata chips.
- Career goals as small rounded tags.
- Proof strip for level, format, and component count.
- "What you'll learn" as a compact two-column checklist on desktop.
- Curriculum as the central object, with accordion behavior when real content exists.
- Requirements, description, and audience as simple text sections with top dividers.
- Sticky enrollment card on desktop with price, start action, includes list, instructor, and teacher/admin actions.

Avoid:

- Marketing-style feature rows.
- Oversized decorative illustrations.
- Hiding important content behind color alone.
- Showing raw infrastructure errors to learners.

## Course Editor DNA

The editor is a teacher work surface. It should make course structure easy to scan and save.

Keep:

- Numbered section steps.
- Compact two-column grids on desktop and one column on mobile.
- Sticky panel header with status chip.
- A clearly separated action bar.
- Labels above all inputs.
- Teacher-facing errors near the affected section.
- Course content builder embedded only in edit mode.

Avoid:

- Global state or cross-page coupling for local editor UI.
- Unlabeled icon-only controls.
- Big wizard flows unless the course model becomes too large for one page.
- Hiding save failures behind generic success messages.

## Curriculum Builder DNA

The builder should feel like assembling a clean outline, not editing raw JSON.

Keep:

- A toolbar with total content summary and one icon add button.
- Sections as outline groups with index, title, duration, rename, collapse, and remove controls.
- Components as rows with drag handle, type icon, title, type label, duration, edit, and remove.
- Dashed full-width add component button under each section.
- Component picker modal for choosing video, quiz, or text.
- Component editor modal for focused details.

Use type colors:

- Video: cool gray-blue surface.
- Quiz: soft green surface.
- Text: warm tan surface.

## Accessibility Rules

- Preserve semantic `section`, `article`, `aside`, `nav`, `header`, `footer` roles.
- Every icon-only button needs an `aria-label`.
- Accordions need `aria-expanded`.
- Error text should use `role="alert"` when it appears due to user or network action.
- Do not create clickable `div` elements.
- Keep keyboard focus visible on inputs and actionable controls.

## Responsive Rules

- Desktop course view: `1fr + 340px` grid.
- Mobile course view: single column, enrollment card before main content.
- Desktop editor forms: two-column grids.
- Mobile editor forms: one column with flexible action rows.
- Any row with long course titles or component names must allow wrapping without changing control hit areas.

## Implementation Notes

- Keep Angular standalone components and OnPush change detection.
- Prefer signals for local UI state and services for API access.
- Use Tailwind for simple layout utility work, SCSS for component-specific selectors and states.
- Do not introduce a new styling framework.
- Prefer existing UI components such as `app-button`, `page-header`, `loading-skeleton`, and `course-builder`.
- When frontend API behavior changes, check the matching Express route and response shape.
