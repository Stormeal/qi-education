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
