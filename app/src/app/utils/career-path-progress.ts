import { CareerPath, CareerPathStep } from '../app.models';

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
  // Guidance prefers a step that can be started now; prerequisites order it but never block it.
  const startable = (step: CareerPathStep) => step.courses.some((course) => course.available);
  const ready = open.filter((step) => step.prerequisiteStepIds.every((id) => doneStepIds.has(id)));
  const next = ready.find(startable) ?? open.find(startable) ?? ready[0] ?? open[0] ?? null;

  return {
    doneStepIds,
    completed,
    total: required.length,
    percent: required.length ? Math.round((completed / required.length) * 100) : 0,
    finished: required.length > 0 && open.length === 0,
    nextStepId: next?.id ?? null,
  };
}

/** The course to act on in a step: one already in progress wins, otherwise the first available one. */
export function careerPathNextCourse(step: CareerPathStep, percentOf: (courseId: string) => number | null) {
  const available = step.courses.filter((course) => course.available);
  const started = available.find((course) => {
    const percent = percentOf(course.courseId);
    return percent !== null && percent > 0 && percent < 100;
  });
  return started ?? available[0] ?? null;
}
