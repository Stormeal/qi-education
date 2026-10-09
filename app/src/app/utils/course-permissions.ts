import { CourseListItem, LoginState } from '../app.models';

export function canEditCourse(
  course: CourseListItem | null | undefined,
  user: LoginState['user'] | null | undefined,
): boolean {
  if (!course || !user || user.status !== 'active') return false;
  return user.role === 'admin' ||
    (user.role === 'teacher' && !!course.ownerUserId && course.ownerUserId === user.id);
}
