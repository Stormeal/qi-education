import { CourseListItem, LoginState } from '../app.models';

/** US-A005: the course's teachers; old courses list only their owner. Same rule as the API. */
export function courseTeacherIds(course: Pick<CourseListItem, 'ownerUserId' | 'teacherIds'>): string[] {
  return course.teacherIds ?? (course.ownerUserId ? [course.ownerUserId] : []);
}

export function canEditCourse(
  course: CourseListItem | null | undefined,
  user: LoginState['user'] | null | undefined,
): boolean {
  if (!course || !user || user.status !== 'active') return false;
  return user.role === 'admin' ||
    (user.role === 'teacher' && courseTeacherIds(course).includes(user.id));
}

/**
 * US-A007: an assigned reviewer reads the course read-only and sends a verdict. Same rule as the API.
 * Only admins receive `reviewerIds`; everyone else is known as a reviewer from their own review list.
 */
export function canReviewCourse(
  course: CourseListItem | null | undefined,
  user: LoginState['user'] | null | undefined,
  reviewedCourseIds: readonly string[] = [],
): boolean {
  return !!course && !!user && user.status === 'active' && (user.role === 'teacher' || user.role === 'admin') &&
    ((course.reviewerIds ?? []).includes(user.id) || reviewedCourseIds.includes(course.id));
}
