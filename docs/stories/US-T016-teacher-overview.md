# US-T016: Teacher overview on Home

## Record

- Story: US-T016 in [user_stories.md](../user_stories.md#us-t016--teacher-overview-on-home)
- State: Proposed; in progress 2026-10-27
- Owner: Codex (API, [handoff](../handoffs/US-T016-codex.md)), Claude (Home card in `app/`)
- Related defects: none
- Branch/base: `main`
- Product decisions: defaults below, set by Claude 2026-10-27, **confirm or change** (Alex)

## Problem and outcome

As a teacher, I want to see my courses, how my learners are doing and what they say about my
lessons, so that I can improve a course without asking an admin.

Observed 2026-10-27 on isolated servers: a teacher's Home is a learner's Home (career tile, "Your
learning"); only courses they review appear ("To review"). Lesson feedback (helpful, not helpful,
Report a problem) goes only to the admin feedback inbox. Outcome: a teacher opens Home and sees each
course they teach with learner numbers and the latest lesson feedback.

## Defaults (confirm or change)

1. **Counts, not names.** Learners appear only as numbers; feedback shows no learner name or email
   (colleagues' data, US-P018-AC03). A learner list per course is a later story if wanted.
2. **Teachers only.** The overview covers courses where the viewer is an assigned teacher and the
   account is an active teacher. Admins keep their own Home ("Needs your attention"); students get
   nothing.
3. **Every status.** Drafts and courses in review are listed too (with 0 learners), so the card is
   also the teacher's list of their own courses, each linking to its editor.
4. **Newest five feedback items per course**, all three kinds; triage stays with admins.
5. **Placement**: "Your teaching" on Home under "To review" and above the learning summary, only
   for teachers with at least one course.

## Behavior contract

```gherkin
Feature: Teacher overview
  Scenario: US-T016-AC01 See my courses with learner numbers
    Given I am an assigned, active teacher of two courses
    When I open Home
    Then "Your teaching" lists both courses with status, enrolled, started and completed learners
    And the average progress of the enrolled learners

  Scenario: US-T016-AC02 See lesson feedback on my courses
    Given learners sent lesson feedback on one of my courses
    When I open Home
    Then I see helpful, not helpful and problem counts for that course
    And the newest feedback with lesson title, kind, category and message, without the learner's name

  Scenario: US-T016-AC03 Only my courses
    Given another teacher's course has learners and feedback
    When I or a student ask for the teaching overview
    Then that course is not included, and a student gets no overview

  Scenario: US-T016-AC04 A failing overview does not break Home
    Given the overview cannot be loaded
    When I open Home
    Then "Your teaching" says so with Try again, and the rest of Home works
```

## API contract (Codex builds, the app relies on it)

`GET /teaching/courses` and `GET /api/teaching/courses`, bearer token required.

- 401 without a valid session; 403 `{ message }` for any role but an active teacher.
- 200, `Cache-Control: private, no-store`, `Vary: Authorization`:

```ts
{ courses: {
    courseId: string;
    title: string;
    status: 'draft' | 'ready-for-review' | 'published' | 'archived';
    enrolledLearners: number;     // accounts with the course in enrolledCourseIds
    startedLearners: number;      // enrolled with at least one current lesson complete
    completedLearners: number;    // enrolled with every current lesson complete (and ≥1 lesson)
    averageProgress: number | null; // mean of enrolled learners' percent, rounded; null when 0 enrolled
    feedback: { helpful: number; notHelpful: number; problems: number };
    recentFeedback: {             // newest first, at most 5
      id: string;
      componentId: string;
      lessonTitle: string | null; // null when the lesson no longer exists
      kind: 'helpful' | 'not-helpful' | 'problem';
      category: 'video' | 'content-error' | 'unclear' | 'files' | 'other' | null;
      message: string;            // '' when none
      createdAt: string;          // ISO
    }[];
  }[] }                           // sorted by title, case-insensitive
```

- Percent per learner follows [progress](../specs/learning/progress.md): unique completed IDs that
  are current lesson IDs, divided by current lesson count; a course with no lessons is 0%.
- Feedback counted is lesson feedback (`page: 'lesson'`) whose `courseId` is the course.
- No learner name, email or ID anywhere in the answer.
- Existing routes unchanged.
