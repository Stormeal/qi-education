import type { CourseListItem, LoginState } from '../app.models';
import { canEditCourse, courseTeacherIds } from './course-permissions';

const course = (fields: Partial<CourseListItem>) => ({ ownerUserId: '', status: 'draft', ...fields }) as CourseListItem;
const user = (id: string, role: 'student' | 'teacher' | 'admin' = 'teacher', status = 'active') =>
  ({ id, role, status }) as NonNullable<LoginState['user']>;

describe('US-A005 course teachers in the app', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('reads the teacher list, falling back to the old owner', () => {
    expect(courseTeacherIds({ ownerUserId: 'B', teacherIds: ['B', 'A'] })).toEqual(['B', 'A']);
    expect(courseTeacherIds({ ownerUserId: 'T' })).toEqual(['T']);
    expect(courseTeacherIds({ ownerUserId: '' })).toEqual([]);
    expect(courseTeacherIds({ ownerUserId: '', teacherIds: [] })).toEqual([]);
  });

  it('US-A005-AC02 lets every listed active teacher edit, and nobody else but admins', () => {
    const shared = course({ ownerUserId: 'B', teacherIds: ['B', 'A'] });
    expect(canEditCourse(shared, user('A'))).toBe(true);
    expect(canEditCourse(shared, user('C'))).toBe(false);
    expect(canEditCourse(shared, user('A', 'student'))).toBe(false);
    expect(canEditCourse(shared, user('A', 'teacher', 'disabled'))).toBe(false);
    expect(canEditCourse(course({ ownerUserId: '', teacherIds: [] }), user('X', 'admin'))).toBe(true);
    expect(canEditCourse(course({ ownerUserId: 'T' }), user('T'))).toBe(true);
  });
});
