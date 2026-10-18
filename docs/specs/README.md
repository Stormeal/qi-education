# Application specs

What QI Academy does today, by application area. Each file is a short, high-level
description of current behavior plus the code that implements it. Planned changes are
not here: they live in [user_stories.md](../user_stories.md) and, when a story needs a
detailed contract, in [stories/](../stories/).

Cross-cutting rules (roles, statuses, limits) are in [business_rules.md](../business_rules.md).
How the code is put together is in [architecture.md](../architecture.md).

| Area | Files | Covers |
| --- | --- | --- |
| [accounts/](accounts/) | [sign-in-and-sessions](accounts/sign-in-and-sessions.md), [passwords-and-email](accounts/passwords-and-email.md), [profiles](accounts/profiles.md) | Signup, login, remembered session, sign-in limits, disabled accounts, password reset and change, account mail, private profile, instructor description |
| [catalog/](catalog/) | [browse](catalog/browse.md), [course-details-and-enrollment](catalog/course-details-and-enrollment.md) | Catalog carousel, search, filters, sort, categories, course details page, enrollment |
| [authoring/](authoring/) | [course-editor](authoring/course-editor.md), [lessons-and-builder](authoring/lessons-and-builder.md), [quizzes](authoring/quizzes.md), [video](authoring/video.md), [review-and-publication](authoring/review-and-publication.md) | Course form, ownership, drafts and recovery, saves and conflicts, lesson types, attachments, thumbnails, quizzes, Mux video, review, publish, archive, price and catalog settings |
| [learning/](learning/) | [home-and-library](learning/home-and-library.md), [learning-page](learning/learning-page.md), [progress](learning/progress.md) | Home dashboard, My Learning, the learning page, notes, lesson feedback, completion and quiz attempts |
| [career-paths/](career-paths/) | [careers](career-paths/careers.md), [milestones-and-achievements](career-paths/milestones-and-achievements.md), [curation](career-paths/curation.md) | Following careers, focus, the milestone tree, declarations, unlocks, Home guidance, the admin career editor |
| [admin/](admin/) | [users](admin/users.md), [feedback](admin/feedback.md) | User search, roles, status, admin reset, change log, site and lesson feedback, GitHub triage |
| [platform/](platform/) | [storage-and-run-modes](platform/storage-and-run-modes.md), [reliability](platform/reliability.md), [deployment-and-checks](platform/deployment-and-checks.md), [ui-foundation](platform/ui-foundation.md) | Stores, isolated/shared/hosted modes, health, doctor, migration scripts, locks, retries, caching, CI, Pages, Vercel, version hook, shared UI components and design values |

## Writing a spec file

- Describe what the app does now, in plain words. Keep it short; link instead of repeating.
- Sections: **Purpose**, **Behavior**, **Rules** (only area-specific ones), **Code**, **Limits**
  (known gaps, not-verified items).
- When a story is delivered, fold its behavior into the right file here and delete the story's
  contract from `stories/`. Git history keeps the old contract and its delivery evidence.
