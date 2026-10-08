# DEF-010 — Restore direct learning URLs

Selected 2026-10-08. Owner: Codex. Branch: `main`. Base: `159f45b`.
Related story: US-L001. Scope: direct `/library/:id`, refresh, missing data,
errors and restored entitlement. No progress or career feature is selected.

The access batch (`a6767f6`) already starts catalog loading on nested library
routes and restarts private loaders after session restoration. Verify the original
reproduction against that code before adding any further fix. A direct URL must
load catalog metadata and entitled learner content, show loading until lookup
finishes, and distinguish errors from genuinely missing courses. Session expiry
must show login; an unenrolled session must not display private lessons.
No schema, API, storage or migration change is anticipated.

```gherkin
Scenario: DL-01 Restore an entitled direct URL
  Given my remembered session is enrolled in a published course
  When I open or refresh its /library/:id URL
  Then session, metadata and learner content load without a false missing state
  And the course lesson becomes available without visiting the catalog first

Scenario: DL-02 Report a missing course after lookup
  Given my session is valid
  When catalog lookup finishes without the requested course
  Then I see Course not found
  And no previous course content is displayed

Scenario: DL-03 Show a failed request distinctly
  Given I open a direct learning URL
  When catalog or learner content retrieval fails
  Then I see a loading failure instead of a false missing course or empty lesson

Scenario: DL-04 Apply restored entitlement
  Given my remembered session has expired or is no longer enrolled
  When I open the direct learning URL
  Then an expired session returns to login
  And an unenrolled session cannot display private learning content
```

Implementation checklist:

- [x] Route-level regression tests with deferred session/catalog/content responses.
- [x] Original refresh reproduction and error/access checks in an isolated browser.
- [x] Fix any remaining route boundary failure within the selected scope.
- [x] Record actual fixing commit(s), review and release coverage limitations.

Tests use real route/page rendering with isolated responses at the API boundary.
Browser evidence uses only the disposable local API. Live Sheets/MongoDB, hosted
session restoration, and deployed URLs require separate release verification.

Original direct URL/refresh reproduction now passes; runtime fix: `a6767f6`.
Dedicated verification delivery commit pending. Evidence:
[batch verification](../verification/2026-10-08/DEF-005-006-010.md).
