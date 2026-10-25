# US-A006 feedback delivery verification

Date: 2026-10-25. Owner: Codex. Started on `main` at `5118eb5`; preserved
Claude's concurrent `3558cc9` exercise-video fix. Implementation commit: `b274cce` (v0.1.470); delivery records follow in the next local commit.
Local implementation only: no push, deployment or production data migration.

## Behavior and evidence

| Scenario | Evidence | Outcome |
| --- | --- | --- |
| AC01-03 three types | `typedFeedback.test.ts`, `typedFeedbackRoutes.test.ts`, composer tests; browser submits all three types to isolated API :3002 | POST 201, correct type/details and server identity; matching confirmation; no rating forced on defects/change requests |
| AC04 validation/access | Schema/HTTP tests and browser invalid empty form | Invalid/oversized fields refused; guest 401/non-admin inbox 403; identity cannot be forged |
| AC05 draft/session/retry | Composer + feedback-session tests, browser 503/reopen/retry | Draft retained; pending-send guard retained on close; stale account replies ignored; same-account refresh completes and clears loading |
| AC06 legacy/lesson compatibility | Existing lessonFeedback, safeRetries and new storage/migration tests | Legacy rating-only/empty messages and lesson/course context retained |
| AC07 Mongo selection/atomicity | feedbackStorage + isolatedServices + Mongo journal doubles | Shared/hosted select Mongo, missing settings fail closed; isolated selects memory; atomic updates and majority options checked |
| AC08 migration | feedbackMigration tests (including interrupted/rerun/conflict/digest cases) | Read-only source; dry-run writes/indexes nothing; stable-ID import skips identical records, refuses conflicts and verifies fields |
| AC09 freeze | feedbackStorage, feedbackTriage and typed HTTP tests | Repository writers frozen; HTTP triage stops before GitHub claim/POST; reads remain available; lesson uses same wrapped repository |
| AC10 duplicate-issue recovery | multiInstanceFeedback, feedbackTriage, githubFeedback, safeRetries | Both URL-prefix restart regressions now ordinary passing tests; independent journal claims, uncertain outcomes, closed/marker/author recovery and operator conditional recovery covered |
| AC11 accessibility/layout | Dialog tests; browser 1366x900 and 390x844 | Visible labels/errors, no default rating; background inert and scroll locked; Escape/Done restore opener; Shift+Tab/Tab wrap; phone scrolls without horizontal overflow; dark preference retains global light theme |
| AC12 inbox | Inbox tests + admin browser | Four synthetic items visible; two defects filtered; one archived via 200 with `private, no-store`; legacy lesson type derives correctly |

Screenshots: [desktop](feedback-desktop.png), [phone](feedback-mobile.png),
[admin inbox](feedback-inbox.png). All records shown are synthetic isolated data.
The local 503 was injected in the browser and the retry reached the isolated API.

## Checks

- API full suite: 108 files / 2,658 tests passed before final session-only change;
  fresh full rerun on combined `3558cc9` working tree also passes all 108 files / 2,658 tests.
- Frontend: initial full suite 550 passed; final new session-refresh regression
  raises total to 551. A parallel full rerun hit two 5-second media test timeouts;
  both passed unchanged in a 9-test focused rerun. Reduced-worker full rerun: all 67 files / 551 tests pass (temporary runner config maxWorkers=4; no repository config changes).
- UI foundation: all 23 tests and guard pass (no hardcoded-color baseline additions).
- API build and Pages build pass; combined-tree builds also pass.
- Journey suite: 18 passed (isolated memory and Mongo doubles).
- `git diff --check` passes. No new dependencies or provider keys introduced.

## Review and decisions

Separate backend, UI and combined reviewers found: missing private cache headers,
non-allowlisted stored-field projection, opener capture after background inert,
and object-identity guards stranding same-account refreshes. All were addressed
with failing-then-passing regressions or actual browser focus evidence. Corrected
rating selectors so the unselected-rating assertion inspects actual controls.

Implementation decisions: one global modal replaces twelve copies; focused
composer service owns the session draft; existing page inputs/events remain for
compatibility. Recovery uses the operator runbook rather than adding a new admin
recovery journey. Legacy Sheets adapter exports remain only for migration/tests;
runtime factory always chooses memory, Mongo or unavailable.

## Release limits

No real Atlas persistence/failover/index confirmation, live GitHub permissions or
marker recovery, Google source data, screen-reader or Lighthouse run was exercised.
The cutover runbook is [feedback-mongodb.md](../../../../release/feedback-mongodb.md).
Execute its freeze/backup/read-only dry-run/copy/verification/unfreeze steps only
as an authorized release. Existing Sheets data has not been copied by this task.
Keep the source read-only and account for new Mongo writes before any rollback.

Pages build warnings: initial JS bundle and existing learning stylesheet budgets;
existing Mammoth CommonJS dependencies. Tests retain the existing setup-file and
jsdom scrollTo/Mux custom-element console warnings; these do not prevent successful builds/tests.
