import { CareerPath } from '../app.models';

/**
 * Path progress counts required steps only. A step is complete when any one of
 * its courses is complete, so alternatives are counted once and optional steps
 * never inflate the percentage.
 */
export function careerPathProgress(path: CareerPath, isCourseComplete: (courseId: string) => boolean) {
  const doneStepIds = new Set(
    path.steps
      .filter((step) => step.courses.some((course) => !!course.courseId && isCourseComplete(course.courseId)))
      .map((step) => step.id),
  );
  const required = path.steps.filter((step) => step.required);
  const open = required.filter((step) => !doneStepIds.has(step.id));
  const completed = required.length - open.length;
  const next = open.find((step) => step.prerequisiteStepIds.every((id) => doneStepIds.has(id))) ?? open[0] ?? null;

  return {
    doneStepIds,
    completed,
    total: required.length,
    percent: required.length ? Math.round((completed / required.length) * 100) : 0,
    finished: required.length > 0 && open.length === 0,
    nextStepId: next?.id ?? null,
  };
}
