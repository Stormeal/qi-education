# Feedback and triage

## Purpose

Signed-in learners and staff share feedback, report defects and request changes.
Admins review submissions and choose what becomes GitHub work.

## Behavior

- The header Feedback button opens one shared dialog on every signed-in page.
  Give feedback, Report a defect and Request a change have a required short
  summary (1-120 characters) and description (1-2000). Feedback has an optional,
  initially unselected Great/Okay/Needs work rating. Defects offer optional
  Reproduction steps and Expected behavior (each up to 2000 characters).
- Context includes the displayed page, internal path without query/fragment,
  browser user agent and server-derived account identity. After sending, the
  user gets a confirmation that the team will review the submission.
- Drafts survive validation/network errors and close/reopen in the same session.
  Sending is guarded across close/reopen; changing accounts discards the draft
  and stale replies. Background content is inert while the dialog is open,
  focus stays inside it, and Escape/Done return focus to the opener. The dialog
  scrolls at phone width and preserves the app's global light theme.
- `POST /feedback` accepts the three typed submissions. Legacy clients that omit
  type can still send a required rating and optional message, including an empty
  message. The response remains `{ id, createdAt }` with status 201.
- Lesson feedback keeps its existing route, helpful/not-helpful/problem choices,
  category and course/lesson identity. Lesson problems display as defects; other
  lesson votes and legacy site records display as feedback.
- Admin-only `GET /feedback` / `PATCH /feedback/:id/triage` preserve Current and
  Archived tabs, Work/Completed/Won't do states and low/medium/high priority.
  Type filters, summaries and defect details help triage; ratings are shown only
  when supplied. Feedback responses are `private, no-store`, varying on Authorization.
  Delayed inbox/triage replies cannot replace a different session's state; a
  same-account session refresh can still complete its pending operation.

## Storage and GitHub work

- Shared/hosted feedback uses MongoDB
  `<MONGODB_COURSE_CONTENT_COLLECTION>_feedback`, with stable IDs, a newest-first
  index, projected fields, atomic triage updates and majority acknowledged writes.
  Missing/unavailable storage fails closed (503). Isolated/test runs use memory.
- `FEEDBACK_STORE_READ_ONLY=1` freezes site feedback, lesson feedback and triage
  before GitHub side effects while leaving reads available. Health/doctor report
  the actual feedback store and freeze. Runtime never chooses Google Sheets.
- Marking Work explicitly creates a GitHub issue and optionally adds it to the
  configured Project. Existing saved links are reused. MongoDB's
  `<collection>_feedback_issue_operations` journal atomically claims creation and
  saves successful results independently of the final feedback-link update.
  A restart or non-work retry can reattach a known result without another POST.
- A trusted integration marker can recover a created issue, including closed
  issues. An uncertain external outcome remains unresolved instead of permitting
  blind creation after a timer or absent lookup. Operators reconcile it using
  the [cutover/recovery runbook](../../release/feedback-mongodb.md). There is no
  transaction spanning MongoDB and GitHub. Token rotation, edited/legacy markers,
  unverifiable authors or multiple matches can require operator review.

## Migration and verification

`npm --prefix api run feedback:migrate` is a read-only dry run; `--apply` requires
explicit shared-local mode and a frozen operator setting. The copy preserves all
17 legacy fields/IDs, refuses malformed/duplicate/conflicting data, skips identical
records on rerun, and verifies digests. Freeze all deployed writers and drain
older deployments before the final copy. The source remains read-only. See the
runbook before release: implementation does not itself migrate production data.

US-A006 delivered locally in `b274cce` (2026-10-25). Evidence and provider limits:
[verification](../../history/verification/2026-10-25/US-A006/verification.md).
No live Atlas/Sheets/GitHub mutation was used for testing.

## Code

- API: `feedback.ts`, `feedbackRepository.ts`, `feedbackTriage.ts`,
  `feedbackIssueOperationRepository.ts`, `githubFeedback.ts`, migration modules.
- App: root modal host, `ui/feedback-dialog/`, `services/feedback-composer.service.ts`,
  `services/feedback.service.ts`, Feedback section of `pages/admin-page/`.
