# The learning page

## Purpose

One page where an enrolled learner works through a course: sees where they are, moves between
lessons, keeps notes, gets the files and tells the teacher how a lesson went.

## Behavior

- URL `/library/:id`. Opening it directly or refreshing restores the session first and then loads
  the course; access needs ownership, admin role, or enrollment in a published or archived course.
- **Sidebar**: overall progress ("7 of 24 lessons complete", percentage, time left), then each
  section with its completed count. It can be hidden for a wider player (not remembered).
- **Previous / Next** move through lessons in course order, disabled at the ends.
- **Completion**: text, resources and exercise lessons have a complete action (exercises a check);
  a video completes once at 90% watched (seeking counts); a quiz on **Finish quiz** after a pass.
- **Up next**: when a video ends or a lesson is completed while a next lesson exists, the next
  lesson starts after 5 seconds unless the learner presses **Stay here** or Escape.
- **Notes**: private notes per lesson, optionally at the current video time (text 1–2000
  characters, at most 500 per course). Only the author can read, edit or delete them.
- **Lesson feedback**: helpful / not helpful, or **Report a problem** with a category (Video does
  not play, Mistake in the content, Hard to understand, Files or links, Other). Reports go to the
  admin feedback list tagged with course and lesson.
- **Course facts**: length, lessons, level, enrolled learners, last updated and caption languages
  when a video has ready captions.
- Keyboard: every control is reachable; after saving a note, sending feedback or finishing a quiz,
  focus moves to the next sensible control instead of the page top.

## Code

- App: `pages/learning-page/`, `services/lesson-extras.service.ts` (notes, feedback, learner count;
  no cache), `services/learning-progress.service.ts`.
- API: `lessonExtrasRoutes.ts`, `lessonNotes.ts`, `lessonNotesRepository.ts`;
  routes `/courses/:courseId/notes`, `/courses/:courseId/lesson-feedback`,
  `/courses/:courseId/learners/count`, `GET /courses/:id/content`.

## Limits

- No anti-skip check on video completion.
- INV-019: a hosted video once kept spinning; not reproduced locally.
