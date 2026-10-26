import { CourseCreateDraft, CourseReviewState } from '../app.models';

export type CourseFormStepId = 'essentials' | 'fit' | 'thumbnail' | 'content' | 'publishing';
export type CourseFormStep = { id: CourseFormStepId; label: string; done: boolean; locked: boolean };

/** The steps of the course form. Everything after "Learner fit" needs a saved course. */
export function courseFormSteps(
  draft: CourseCreateDraft, saved: boolean, hasThumbnail: boolean, lessonCount: number, review: CourseReviewState | null,
): CourseFormStep[] {
  return [
    { id: 'essentials', label: 'Essentials', locked: false,
      done: draft.title.trim().length >= 3 && draft.teacher.trim().length >= 2 && draft.level.trim().length >= 2 },
    { id: 'fit', label: 'Learner fit', locked: false, done: draft.description.trim().length >= 10 },
    { id: 'thumbnail', label: 'Thumbnail', locked: !saved, done: saved && hasThumbnail },
    { id: 'content', label: 'Course content', locked: !saved, done: saved && lessonCount > 0 },
    { id: 'publishing', label: 'Publishing', locked: !saved, done: saved && (draft.status !== 'draft' || !!review?.liveStatus) },
  ];
}

/** Why a saved course cannot be edited right now, and whether starting a revision is the way out. */
export function courseFormLockedReason(review: CourseReviewState | null, reviewerOnly = false) {
  // US-A007: a reviewer only reads the course; it is never theirs to edit.
  if (reviewerOnly) {
    return review?.course.status === 'ready-for-review'
      ? { title: 'You are reviewing this course', canStartRevision: false,
        text: 'Read the lessons and quizzes, then send your verdict in the Publishing step.' }
      : { title: 'Not waiting for your review', canStartRevision: false,
        text: 'This course is back with its teachers for changes. You can review it again once it is submitted.' };
  }
  if (review?.course.status === 'ready-for-review') {
    return { title: 'Waiting for admin review', canStartRevision: false,
      text: 'This version is with an admin. You can edit again once it is published or returned to you.' };
  }
  if (review?.liveStatus && !review.revisionId) {
    return { title: review.liveStatus === 'published' ? 'This course is published' : 'This course is archived', canStartRevision: true,
      text: 'To change it, start a revision. Learners keep the current version until an admin approves your changes.' };
  }
  return { title: 'This course cannot be edited right now', canStartRevision: false, text: 'Open the Publishing step to see its review state.' };
}
