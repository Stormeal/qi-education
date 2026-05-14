# AGENTS.md

## Project Overview

This repository is `qi-education`, an npm workspace containing:

- `app/` - Angular frontend
- `api/` - Node/Express API
- root config, GitHub workflows, Vercel config, and git hooks

Agents should treat this as a full-stack workspace and avoid making frontend, backend, or deployment changes without understanding how the pieces connect.

## Repository Structure

```text
qi-education/
  app/        Angular frontend
  api/        Node/Express API
  .github/   CI and deployment workflows
  .githooks/ Git hooks
  design/    Design assets and concepts
```

## Package Management

- Use npm workspaces.
- Before running commands, inspect the relevant `package.json`.
- Prefer workspace-aware commands from the root when possible.
- Do not introduce yarn or pnpm.

## Design Skills

For frontend UI implementation or redesign work, prefer the installed Taste Skill skills:
- `design-taste-frontend` for general polished frontend design
- `redesign-existing-projects` when improving existing Angular screens
- `image-to-code` when implementing from visual references
- `brandkit` for visual identity exploration


Common root scripts:

- `npm run app:dev` - run API and Angular dev server together
- `npm run app:build` - build the Angular app
- `npm run app:build:pages` - build the Angular app for GitHub Pages
- `npm run app:test` - run frontend tests
- `npm run api:dev` - run the API dev server
- `npm run api:build` - build the API
- `npm run api:test` - run API tests
- `npm run env:pull` - pull Vercel development env vars into `api/.env`

There is no root `lint` script at the time this file was created. Check package scripts before assuming a command exists.

## Angular Frontend Rules

The Angular app lives in `app/`.

Use Angular best practices. Prefer:

- standalone components
- strict TypeScript
- signals for local UI state
- services for shared logic and API access
- reactive forms for non-trivial forms
- SCSS for component styling
- Tailwind utility classes for layout and visual composition

Avoid:

- adding NgRx, Akita, ComponentStore, or signalStore unless explicitly requested
- large components with mixed responsibilities
- business logic inside templates
- unnecessary global state
- casual use of `any`

## Preferred Angular Architecture

Use this structure:

```text
src/app/
  pages/
    feature-page/
  ui/
    reusable-component/
  services/
  models/
  utils/
```

Current page-level components include:

- `login-page`
- `dashboard-page`
- `courses-page`
- `course-view-page`
- `course-editor-page`
- `admin-page`

Current reusable UI components include:

- `app-button`
- `brand-link`
- `profile-menu`

Pages should own route-level behavior. UI components should be reusable, presentational, and not know about API details. Services should own API access, session handling, and reusable business logic.

## Component Standards

Use standalone Angular components. Prefer this style:

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-example',
  standalone: true,
  templateUrl: './example.html',
  styleUrl: './example.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleComponent {
  readonly title = input.required<string>();
  readonly selected = output<string>();
}
```

Rules:

- Use `ChangeDetectionStrategy.OnPush`.
- Prefer signal inputs and outputs when supported by the Angular version.
- Keep components small and focused.
- Move reusable logic into services or utilities.
- Avoid direct DOM access unless necessary.
- Avoid expensive function calls in templates.

## Template Rules

Prefer modern Angular control flow when available:

```html
@if (courses().length > 0) {
  @for (course of courses(); track course.id) {
    <article>
      <h2>{{ course.title }}</h2>
    </article>
  }
} @else {
  <p>No courses found.</p>
}
```

Rules:

- Always use `track` with loops.
- Prefer semantic HTML.
- Use accessible buttons, links, labels, and form controls.
- Do not hide important UI state only with color.
- Keep template expressions simple.

## State Management

This project does not currently use a dedicated state management library. Do not add one unless explicitly requested.

Preferred state approach:

- local component state with signals
- derived state with `computed`
- shared app/session state through focused Angular services
- API data loaded through services
- browser storage only through dedicated helpers

Session persistence currently uses helpers such as:

- `storeSession`
- `clearStoredSession`
- `restoreLoginState`

Rules:

- Keep session persistence centralized.
- Do not read or write browser storage from random components.
- Do not duplicate authentication or session logic across pages.
- Do not store sensitive data unnecessarily.

## Services

Use services for:

- API calls
- authentication and session logic
- course operations
- feedback submission
- reusable business logic

Prefer:

```ts
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly http = inject(HttpClient);
}
```

Rules:

- Keep API DTOs typed.
- Map backend responses when needed.
- Handle loading and error states in the UI.
- Avoid nested subscriptions.
- Prefer `async`/`await`, signals, or RxJS consistently based on existing file style.

## Styling Rules

This project uses SCSS and Tailwind.

Use Tailwind for:

- spacing
- layout
- typography utilities
- responsive behavior
- simple visual styling

Use SCSS for:

- component-specific styles
- complex selectors
- reusable local style rules
- states that are awkward with utilities

Do not add another styling framework. Do not replace existing SCSS/Tailwind patterns without reason.

## Backend API Rules

The API lives in `api/` and uses Node/Express.

Important backend areas include:

- `auth.ts`
- `authRepository.ts`
- `course.ts`
- `courseRepository.ts`
- `feedback.ts`
- `feedbackRepository.ts`
- `googleSheets.ts`
- `server.ts`
- `config.ts`

Routes include:

- `/health`
- `/auth/login`
- `/auth/me`
- `/courses`
- `/feedback`

Rules:

- Keep route handlers thin.
- Put data access in repository files.
- Keep auth logic centralized.
- Preserve Google Sheets and in-memory demo behavior unless explicitly changing it.
- Do not change API response shapes without updating Angular consumers.
- Do not expose secrets or environment values to the frontend.

## Full-Stack Rules

When changing frontend API calls:

- Check the matching backend route.
- Check the request and response types.
- Update frontend models if needed.
- Update tests if behavior changes.

When changing backend routes:

- Check Angular services that consume the route.
- Preserve existing response compatibility where possible.
- Update frontend error handling if needed.

## Testing and Validation

Before finalizing changes, prefer running relevant commands. Use the scripts defined in `package.json`.

Likely checks include:

- `npm run app:build`
- `npm run app:test`
- `npm run api:build`
- `npm run api:test`

For workspace-specific commands, inspect the root and package-level scripts first.

Rules:

- Add or update tests when behavior changes.
- Prefer testing user-visible behavior.
- Do not remove tests without replacing or justifying them.
- Mention any checks that could not be run.

## Git Hooks and CI

This repository has:

- `.githooks/`
- `.github/workflows/`

Do not bypass hooks or CI expectations. Do not make workflow changes unless explicitly requested.

## Vercel Deployment

This project includes Vercel configuration. Be careful when changing:

- `vercel.json`
- `api/[...path].ts`
- `api/src/server.ts`

These may affect deployment routing.

## Accessibility

All UI changes should support:

- keyboard navigation
- visible focus states
- semantic HTML
- form labels
- accessible validation messages
- meaningful button and link text
- adequate color contrast

Do not create clickable `div` elements when a `button` or `a` is appropriate.

## Security

Rules:

- Do not commit secrets.
- Do not expose API secrets to Angular.
- Do not store sensitive authentication data unnecessarily.
- Do not weaken authentication checks.
- Sanitize and validate user input where appropriate.
- Treat browser storage as non-secure.

## Agent Workflow

Before editing:

- Inspect the relevant files.
- Identify whether the change affects `app/`, `api/`, or both.
- Check existing naming and formatting patterns.
- Prefer small, targeted changes.

While editing:

- Keep changes scoped to the request.
- Avoid unrelated refactors.
- Preserve public APIs unless asked to change them.
- Update connected frontend/backend code together when required.

After editing:

- Run relevant checks if possible.
- Summarize changed files.
- Explain important decisions.
- Mention assumptions.

## Do Not

- Do not add NgRx or another state library by default.
- Do not introduce a new styling framework.
- Do not rewrite large parts of the app unnecessarily.
- Do not scatter session logic across components.
- Do not use `any` unless unavoidable.
- Do not change backend contracts without updating the frontend.
- Do not modify CI, deployment, or hooks unless requested.
- Do not make broad architecture changes for small tasks.

## Preferred Agent Response Format

After completing work, respond with:

```text
Summary:
- What changed

Files changed:
- path/to/file

Checks:
- Command run, or note if not run

Notes:
- Assumptions or important details
```
