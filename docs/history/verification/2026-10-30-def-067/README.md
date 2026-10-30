# DEF-067 — Recovery after a removed lazy-route asset

Codex, 2026-10-30, `main`, implementation base `4a2db58`. Local verification only;
no push, hosted deployment, shared-store mutation or real-account changes.
Fixing commit: `5e4683a` (0.1.540); subsequent closure changes only records/version metadata.

## Reproduction and cause

Served a saved Pages build displaying 0.1.537 through a local static server at
`127.0.0.1:4212/qi-education/`, backed exclusively by an isolated API on port 3012.
Kept the demo learner's Home open, then switched the served directory to a fresh 0.1.539 build.
Catalog left the old tab on Home without guidance. Browser diagnostics reported
`Failed to fetch dynamically imported module` for the removed `chunk-SU7PWR3B.js`.
The fixture returned 404 HTML for missing assets, matching Pages' replacement behavior.
The running module graph retained the previous build's import URLs.

## Change and regression evidence

The router's navigation-error handler recognizes Chrome, Firefox and Safari dynamic-import
failure messages. A root service exposes recovery state; a successful NavigationEnd clears it.
The current outlet stays rendered. Router navigation promises resolve false rather than leaving
unhandled rejections; other errors still reach Angular's ErrorHandler.

The root uses a shared Reload page button calling native `location.reload()`, with no automatic
reload or redirect. It disables the button and checks unsaved state again at activation while
course edits remain unsaved. Existing guards and beforeunload/draft recovery are unchanged.

| Behavior | Regression in `navigation-recovery.spec.ts` |
| --- | --- |
| Failed lazy import exposes explicit reload while preserving the current page | Three browser-message cases; real Router/loadComponent rejection and root UI, native reload boundary observed only after click |
| Initial lazy route fails before any successful navigation | Root recovery remains available with a synthetic token fragment; activation calls native reload |
| Failed navigation leaves no rejected promise | Router resolves false |
| Unsaved course work stays protected | Real AppState dirty computation keeps edits; action disabled; beforeunload still prevented |
| A successful route makes recovery unnecessary | Message survives guard denial, then clears on successful navigation |
| Other exceptions remain diagnosable | No missing-asset message; ErrorHandler receives the unrelated error |

Seven initial regressions failed before implementation. The first focused implementation passed
38 tests across recovery, existing course-navigation guards and the root app. Review identified
that a same-URL anchor would only navigate the fragment on token links; the action became an
explicit native reload button. Four additional/strengthened activation and initial-entry cases
failed against the anchor, then all **620 frontend tests** (79 files) passed with the button,
including **eight DEF-067 cases**. The full root `app:test` also passed the UI-foundation tests
and style guard. Existing jsdom scrollTo/setup and CommonJS build warnings remain non-blocking.

Pages builds passed for both fixed variants, displaying 0.1.539 and 0.1.540. API code is unchanged;
the API suite was not repeated for this frontend-only fix. Its latest prior result is recorded
with [DEF-066](../2026-10-30-def-066/README.md).

## Real browser verification with isolated builds

Loaded fixed build B (0.1.539) in two tabs, then served only build C (0.1.540):

1. Home at `/#recovery-check` stayed on 0.1.539 after clicking Catalog, and displayed
   **This page could not be loaded. Save any changes, then reload and try again.**
2. Nothing reloaded until **Reload page** was activated. It loaded 0.1.540 at the same fragment
   address with the local teacher still signed in. Catalog then opened normally and the message
   was absent. This proves a document reload, rather than same-document fragment navigation.
3. Another 0.1.539 tab held a synthetic new-course title. About prompted **Discard unsaved
   course changes?**. Cancel preserved the title and page. After explicit consent to leave,
   the removed About chunk failed; the current editor and title remained, and recovery showed
   **Save your course changes before reloading. Your edits are still here.** with Reload disabled.
4. Reverting the synthetic title to its original empty value re-enabled Reload. No course was
   created or saved. Screenshot of the disabled recovery action and retained draft was inspected
   in the browser session.

The only test data lived in isolated API memory and browser storage at the local origin.
Production account, payment and enrollment data were untouched. No Firefox/Safari browser
session was run; their message variants are covered in Router/UI tests.

## Remaining release check

After authorized deployment, open a tab containing this fix, keep it across the next Pages
release, and repeat recovery on an uncached route. Verify the normal Pages cache/CDN path.
Tabs already open on older code require a manual reload once to acquire the fix; replacing
server files cannot retrofit their running code. No asset retention or service worker was added.
