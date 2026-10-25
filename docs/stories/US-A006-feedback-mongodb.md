# US-A006: Typed feedback and MongoDB storage

## Record

- State: In progress. Alex confirmed the proposed submission outcome on 2026-10-25.
- Requested by Alex on 2026-10-25: replace feedback Sheets storage with MongoDB,
  support feedback, defect reports and change requests, and improve the view with
  `design-taste-frontend` while keeping the global style/theme.
- Owner: Codex (design and, once approved, full-stack implementation).
- Branch/base: `main`, `5118eb5640df33a429c531641b99e6d2b19f6813`.
- Related: US-P003-AC04, INV-004; existing lesson feedback must remain compatible.
- This contract also serves as the design document. Keep the implementation
  checklist here rather than creating a second plan/backlog.

## Problem and outcome

As a signed-in learner, teacher or admin, I want to say what works, report a
defect or request a change, so the team receives enough context to act on it.

Today the header opens a rating/message dialog, defaults to Great, has no visible
message label, and writes into the final Google Sheets store. Lesson feedback
shares its repository. Admins see a mixed inbox and mark items Work, Completed or
Won't do. Work creates a GitHub issue. A documented failed-link-save/restart path
can create a duplicate issue (INV-004).

The outcome is a single, accessible feedback dialog, a typed admin inbox, and
MongoDB persistence for both site and lesson feedback, with a safe migration of
existing records. No changes are made to current-behavior specs until delivery.

## Approaches and proposed choice

1. **Focused dialog/inbox evolution with MongoDB and durable triage (recommended).**
   Keep the header button, routes and admin review model. Add three submission
   types and useful prompts. Copy old records once. Use MongoDB to coordinate
   issue creation, with marker-based recovery after uncertain GitHub outcomes.
   This covers the requested journey and its reproduced reliability problem.
2. **Migration and form only.** Smaller implementation, but leaves INV-004 open:
   changing the feedback database alone does not make GitHub creation safe.
3. **A user-facing request tracker.** Add personal history, status tracking and
   possibly notifications. Useful if follow-up visibility is the goal, but adds
   a new journey and permissions beyond the requested button/inbox work.

Implementation proceeds with choice 1 under Alex's original request and his
confirmation of a confirmation followed by admin review on 2026-10-25.

## Scope and design

### Submitter

- Preserve the existing Feedback entry point and URL structure. All active,
  signed-in roles can submit; guests and disabled accounts cannot.
- One dialog titled "Help improve QI Academy", left aligned, around 600px wide
  on a laptop. A vertical group of three radio choices has a short description:
  "Give feedback", "Report a defect", "Request a change". Default Give feedback.
  Selecting a type changes prompts in place, without a wizard or second page.
- All new submissions have a labeled short summary (1-120 trimmed characters)
  and description (1-2000). Feedback optionally has an unselected experience
  rating (Great, Okay, Needs work). A defect asks what went wrong and offers
  optional Reproduction steps and Expected behavior fields (each <=2000).
  A change request asks what should change and why in its description.
- Show the current page as quiet context. Capture the internal pathname and
  browser user agent, without query strings, fragments or a full external URL.
  Identity always comes from the server's authenticated account.
- Footer: "Your submission goes to the QI Academy team for review", followed
  by Send feedback, Report defect or Request change as the one primary action.
  Success confirms the submitted type and review, without promising a reply or
  delivery date. Do not expose GitHub/admin details to submitters.
- Retain a draft through validation and network failures and a close/reopen in
  the same session. Session changes discard it. Switching type retains common
  fields; type-specific fields are sent only for their matching type.
- Busy state prevents another send or editing while pending. Closing during a
  send must not clear the in-flight guard. Ignore stale results after session
  changes or opening a different dialog; restore focus to the opener on close.

### Visual direction

Reading this as: a focused redesign for signed-in learners and staff, with QI
Academy's calm green language, using the existing Angular UI foundation.

Redesign mode: Preserve. DESIGN_VARIANCE 4, MOTION_INTENSITY 2, VISUAL_DENSITY 4.
Reuse Bricolage Grotesque, Instrument Sans, green primary, warm page/sunken
surfaces and the global focus ring. Use the shared buttons, icon buttons and
chips; icons use the installed ng-icons/Lucide family. Follow existing control,
panel and modal radius tokens. No new framework, palette, font or theme.

The requested skill mainly targets marketing surfaces. Its audit, hierarchy,
spacing, copy and accessibility guidance applies here. Marketing heroes,
photography and decorative animation do not serve this form. The app explicitly
has no dark theme; preserve that product decision rather than adding one to a
single dialog. Test that system dark preference does not invert this surface.

At phone width, the dialog has 16px outer clearance and a constrained viewport
height with vertical scrolling. Keep fields and type choices in one column,
labels above inputs, field errors below, and no horizontal scrolling. Ratings
are compact controls, not another set of large cards. Use the app's modal layer,
background scroll lock, focus containment, Escape and focus restoration.

### Admin inbox

- Preserve Current/Archived tabs, existing triage status/priority values and
  explicit admin choice before creating a GitHub issue.
- Show type, summary and page in each item. Expand/read the description and
  defect details without losing triage controls. Lesson context remains visible.
- Add an All types/Feedback/Defects/Change requests filter within each tab,
  with a clear empty state. Summaries describe actual submission types rather
  than treating a defect as an experience rating of Bad.
- Keep loading, load error with retry, save error, and linked-issue states.
  Preserve private, no-store responses. Only admins may read or triage the inbox.

## API, storage and compatibility

- Extend `POST /feedback` with `type` (`feedback`, `defect`, `change-request`),
  `summary`, optional `path`, `reproductionSteps`, `expectedBehavior`, and optional
  `rating`. Explicit new types require summary/description; defect-only fields
  and ratings on other types are rejected. Limits: path 500, userAgent 500;
  all text is trimmed and rendered as text, never trusted markup.
- Keep the existing legacy body (`page`, required rating, optional message)
  valid when type is omitted. Its stored type is feedback and its optional
  summary is derived for display. Keep the 201 `{ id, createdAt }` response.
  Keep existing list/triage routes and update all Angular DTOs together.
- Preserve the lesson-feedback route and validation. Existing lesson problem
  reports display as defects; other lesson votes display as feedback, with the
  original lesson kind/category and course/component identifiers retained.
- MongoDB collection: `<MONGODB_COURSE_CONTENT_COLLECTION>_feedback`. Stable
  UUID identity, an index for newest-first reads, majority acknowledged writes
  and atomic field updates. Public responses project only the intended fields.
- Isolated/test mode uses memory and provider doubles. Shared/hosted mode uses
  MongoDB; missing settings or unavailable storage return 503, never successful
  disposable storage. Health/doctor/setup docs describe the actual feedback store.
- Remove Google Sheets from runtime feedback reads/writes and store selection.
  Legacy Sheets code/config belongs only to a deliberate one-time migration,
  without making the app depend on Google credentials at startup.

### Triage reliability (proposed inclusion of INV-004)

Use a MongoDB issue-operation record keyed by configured repository and feedback
ID, with an atomic creation claim and durable state/result independent of the
final feedback triage update. Only the claimant can send a creation request.
Remember successful GitHub issue number/URL before completing triage; later
requests reuse that result. Existing saved issue links remain authoritative.

Include a stable marker in newly created issue bodies. On uncertain outcomes,
look for an exact integration marker, including closed issues, and verify the
trusted integration author. One match is reused; multiple matches, incomplete
lookup, outage, or a claimed operation with no conclusive result refuse another
creation and present an actionable admin error. A timer or absent search result
never alone authorizes a second POST. Legacy orphan issues require documented
operator reconciliation. Preserve optional Project attachment as best effort.
Do not claim an unconditional exactly-once transaction across MongoDB/GitHub.

Codex's scope choice: recovery for both new uncertain operations and legacy
orphans uses a documented operator procedure, not a new in-app recovery tool.
The admin error explains that issue creation could not be confirmed and asks
for operator review; it never offers a blind create-again action. The runbook
must explain how to verify the repository/feedback marker and trusted creator,
record a verified existing result through a conditional operation update, and
retry the final triage save. If the outcome cannot be proved, keep it unresolved.
Rehearse this with isolated operation/GitHub doubles as part of AC10.

### Existing-data migration and cutover

- Build and test a separate dry-run/apply command and a cutover runbook. Source
  Sheets remains unchanged. Preserve IDs, timestamps, account context, messages,
  ratings, lesson details, statuses, priorities and GitHub links.
- Refuse malformed/duplicate/conflicting source records with counts and safe
  row references, never printing personal text or credentials. Identical records
  already imported are skipped; existing different target records are not
  overwritten. Interrupted copies are resumable by stable ID.
- Provide a maintenance freeze covering site submission, lesson feedback and
  triage. Reads remain available. Run final source read/copy while writers are
  frozen, compare IDs/counts/content digests, then switch to Mongo and unfreeze.
  No dual writes and no silent cutover to an empty inbox.
- Prepare and test the procedure locally. Production copy, configuration changes,
  pushes and deployments are separate release actions; no shared-data mutation
  probes are used as tests. Keep Sheets as the read-only rollback source.

## Behavior contract and verification map

| ID | Given / When / Then | Planned evidence |
| --- | --- | --- |
| AC01 | Given any active signed-in role, when they send Give feedback with summary/description and optional rating, then a feedback record with server-derived identity is stored and confirmation appears. | HTTP/repository + Angular dialog/service tests; isolated browser |
| AC02 | Given Report a defect, when sent with reproduction/expected details, then type and details persist and appear to admins without a forced rating. | HTTP + UI tests; isolated browser |
| AC03 | Given Request a change, when sent with what/why, then it persists as a change request and is distinguishable/filterable in the inbox. | HTTP + admin tests; isolated browser |
| AC04 | Given invalid/oversized input or no active session, when submission is attempted, then validation/401 applies; non-admin inbox/triage requests return 403; no record/issue is created. | Schema and HTTP tests |
| AC05 | Given a send in flight or a failed API call, when send/close/reopen or session change occurs, then duplicates/stale updates are prevented and retryable drafts survive appropriately. | Controlled async Angular tests; keyboard/browser |
| AC06 | Given legacy clients and existing lesson feedback, when they submit/read/triage, then API compatibility and lesson identifiers/kinds remain intact in Mongo/memory. | Legacy/lesson HTTP regressions; migration fixtures |
| AC07 | Given Mongo mode, when records are created/read/triaged across independent repositories, then durable records and atomic updates are used; missing/outage stores return 503 and never memory success. | Isolated Mongo repository/wiring tests; provider limits recorded |
| AC08 | Given source records and an interrupted/repeated migration, when dry-run/apply run, then dry-run writes nothing, apply preserves every field/ID, identical records skip, and invalid/conflicting records stop safely. | Isolated Sheets/Mongo doubles and CLI tests |
| AC09 | Given a frozen feedback store, when any of the three write journeys is attempted, then it returns a maintenance 503 while reads work; verified cutover preserves the inbox. | HTTP tests and documented isolated cutover rehearsal |
| AC10 | Given concurrent instances, a failed final link save, restart or lost GitHub response, when Work is retried, then it reuses the known issue or refuses uncertain creation instead of creating a duplicate. | Extend INV-004 reproduction, concurrent/journal/lookup failure tests with GitHub doubles |
| AC11 | Given desktop/phone width and keyboard-only navigation, when each type/error/success is used, then labels, contrast, scroll, focus containment/restoration, Escape and busy announcements work. | Angular a11y assertions; isolated browser screenshots/checks |
| AC12 | Given Current/Archived items of all types, when admins filter/triage, then counts/empty/error/detail states remain accurate and issue content preserves the submission's type and context. | Admin/service/issue-format tests; isolated browser |

All evidence is pending. Builder may choose component boundaries and internal
repository helpers, preserving the contracts above. Test suites must use isolated
stores/doubles; passing doubles do not prove Atlas durability or GitHub permissions.

Design review 2026-10-25: a separate builder reviewer identified the missing
uncertain-operation recovery path. The operator-runbook scope choice above
resolves it without adding another user journey. Product approval is still pending.

## Implementation checklist (activate after design review)

1. Confirm post-submission behavior and inclusion of durable triage; mark Ready
   and record implementation ownership in the queue.
2. Add regression/contract tests and Mongo/memory feedback storage, unavailable
   protection, migration command/freeze, and durable triage coordination.
3. Extend typed API and compatible lesson/legacy behavior; update provider formatting.
4. Build the dialog and inbox changes with focused service state and session guards.
5. Verify all scenarios in isolated tests/browser; run both packages' tests, API
   build, Pages build, UI foundation guard and relevant journey checks.
6. Fold delivered behavior into area/setup/architecture specs; update investigation,
   story and queue together. Follow aligned semver/local delivery-commit workflow.
   Keep real-provider/cutover acceptance as explicit release checks until observed.

## Execution plan and ledger

Use the subagent-driven-development workflow for the independent storage and
triage modules, with Codex integrating domain/API/UI changes and reviewing the
combined result. Repository instructions keep this work on shared `main`.

Global constraints: Angular 21 + existing tokens/components; no new dependencies;
memory/doubles only for mutations in tests; no push/deploy/live migration.
Review focus: legacy empty messages, lesson reports without summaries, stale
session responses, uncertain external POST outcomes, rerun migration conflicts.

- [x] Task 1 (Codex): add `typedFeedback.test.ts` with explicit-type validation,
  legacy compatibility and field limits; observe failure, then extend `feedback.ts`.
  Interface: `FeedbackType`, optional type/summary/rating/path and defect details
  on CreateFeedbackInput/FeedbackEntry; `feedbackType(entry)` derives legacy/lesson.
- [x] Task 2 (storage implementer): Mongo feedback repository, safe unavailable
  selection, write freeze, migration function/CLI/runbook and isolated tests.
  Interface: existing FeedbackRepository plus optional storageType/readOnly;
  `feedbackWriteFreeze(repository, enabled)` and storage/read-only errors.
- [x] Task 3 (triage implementer): operation repository + orchestrator, provider
  recovery and isolated tests. Interface: `FeedbackTriageService(repository,
  github, operations).triage(id, input): Promise<FeedbackEntry | null>`;
  `createFeedbackIssueOperationRepository()` and injectable server dependency.
- [x] Task 4 (Codex): wire freeze/health/errors/triage in server, typed frontend
  model/service/state, dialog and admin filters/details. Add behavior tests before
  implementation and run focused app/API commands after each integration.
- [x] Task 5 (Codex + independent reviewer): review storage/triage changes, run
  full package tests/builds and isolated browser flow, correct regressions, write
  evidence/current specs and locally commit with aligned semver. No deployment.

Each task records its observed tests/results here or in its verification record.

## Verification record (2026-10-25, implementation working tree)

- API domain red/green: typedFeedback.test.ts (15); HTTP typed routes, freeze
  and private headers (4); restart reproduction changed from expected failures
  to ordinary passing tests. Storage/migration and durable triage/provider
  regressions ran red/green in isolated doubles.
- Frontend red/green: composer/dialog/admin inbox and stale-admin-response
  regressions. Full app suite: 67 files, 550 passed; UI foundation 23 passed.
- API build and Pages build pass. Pages retains initial-bundle/learning stylesheet
  budget and existing Mammoth CommonJS warnings. Journey suite 18 passed.
- Full API first integration run: 107 files passed, one doctor fixture suite
  failed (new feedback health missing in old doubles); corrected and all 35
  doctor tests pass. Full API rerun passed: 108 files, 2,658 tests. The final same-session guard fix was subsequently verified red/green; latest full checks are recorded at delivery.
- Browser against isolated API :3002 and local Angular :4200: all three types
  POST 201 with correct fields and confirmation; no forced defect/change rating;
  validation visible; Escape restores focus to Feedback; phone 390x844 has no
  horizontal overflow, locked background and a scrollable dialog; draft survives
  503/close/reopen and succeeds on retry; dark preference retains app theme;
  Shift+Tab/Tab cycles within the dialog. Admin sees four synthetic records,
  filters two defects, archives one (200, private/no-store), and sees it Archived.
- Independent scoped backend/UI reviews completed; private cache header and
  stored-field projection findings fixed with regressions. Final combined review found one same-account refresh/loading-flag regression; fixed using stable account/token guards rather than object identity, with a failing-then-passing regression. No real MongoDB, Sheets or GitHub calls/mutations, deployment or
  production migration. No new dependencies.
- Ruling: use one app-level modal rather than twelve page copies, so drafts and
  keyboard behavior stay consistent across navigation. Existing page event/input
  compatibility remains to avoid unrelated route-state refactoring.
- Ruling: keep legacy Sheets adapter exports only for compatibility tests and
  migration; runtime selection never chooses it. Production migration is a
  separate authorized operator cutover using the runbook.

- Concurrent checkout update preserved: Claude committed exercise-video duration fix `3558cc9` / version 0.1.469 while this task was in progress. Feedback delivery starts from that resulting HEAD and preserves its server/state edits.

Final gate: full API 2,658/2,658; frontend 551/551 with maxWorkers=4; 23 UI foundation tests + guard; 18 journeys; API and Pages builds; diff check. All pass on combined checkout. No unresolved Important/Critical review findings. Delivery commit follows.
