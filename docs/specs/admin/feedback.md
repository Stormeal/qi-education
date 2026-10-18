# Feedback and triage

## Purpose

Signed-in users tell the team what works and what does not; admins sort it and turn real work
into GitHub issues.

## Behavior

- **Site feedback** (`POST /feedback`, any active session) from the feedback dialog, with a rating
  (great, okay, needs work) and a message.
- **Lesson feedback** from the learning page: helpful, not helpful, or a problem with a category
  (video, content error, unclear, files, other). It is stored in the same list with course, lesson,
  kind and category.
- **Triage** (admin, `GET /feedback`, `PATCH /feedback/:id/triage`): work status (work, completed,
  won't do) and priority (low, medium, high). Marking it `work` creates a GitHub issue (and
  optionally adds it to a GitHub Project) and stores the link; an existing link is reused.
- A retry after a failed link save on the same API instance reuses the issue already created.

## Code

- API: `feedback.ts`, `feedbackRepository.ts` (Google Sheets, 17 columns; in-memory locally),
  `githubFeedback.ts` (`GitHubFeedbackService`).
- App: `ui/feedback-dialog/`, `services/feedback.service.ts`, Feedback section of `pages/admin-page/`.

## Limits

- A retry on another instance or after a restart can create a second issue (US-P003-AC04).
- Feedback is the last data still stored in Google Sheets.
- Local and test runs never create real issues (the GitHub service is unconfigured there).
