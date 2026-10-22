# Quizzes

## Purpose

Teachers check understanding with simple multiple-choice questions; learners get trusted,
immediate feedback.

## Behavior

- A quiz has questions with **2–6 answer options** (answer text ≤600 characters, stored answer
  feedback ≤1,500), one or more marked correct, an optional explanation (≤1,500 characters, raised
  for imported Rise quizzes in US-T015) and an optional image with alternative text (≤300 characters).
  Every question is worth one point; the teacher sets the pass mark.
- In the builder, a new question opens and gets focus; other questions collapse to a summary
  (text, answer count, whether a correct answer is set) with `aria-expanded` headers. Readiness
  problems stay visible on collapsed questions.
- **Drafts may be incomplete**. Submitting for review or publishing requires every question and
  option to have text, at least one correct answer per question and a pass mark between 1 and
  the number of questions.
- **Grading happens on the server.** Learners never receive correct answers or explanations
  before submitting. A question scores only when the selected set equals the correct set (order
  and duplicates ignored). Feedback shows the learner's own choices, whether each question was
  right, and the explanation; it never reveals unselected correct answers.
- **Completion**: a passing attempt saves passing proof to the account; the quiz is complete only
  when the learner presses **Finish quiz**. The proof is tied to the exact stored quiz, so a
  changed quiz needs a new pass.
- Question images are ordinary quiz-lesson attachments. Deleting the image clears every question
  reference to it in the same save.

## Code

- API: `quizAssessment.ts`, `questionImage.ts`, quiz schema in `courseContent.ts`; routes
  `POST …/components/:componentId/quiz-attempts` and
  `POST /users/me/learning-progress/:courseId/components/:componentId/quiz-attempts`.
- App: quiz editor in `ui/course-builder/`, quiz view in `pages/learning-page/`.

## Limits

- Attempts are not stored; only passing proof and completion are.
- Old stored point weights and answer descriptions are read without migration.
