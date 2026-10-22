import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AdminUsersService, type AdminUser } from '../../services/admin-users.service';
import { AppStateService } from '../../services/app-state.service';
import { CourseService, type CourseTeacher } from '../../services/course.service';
import { CourseTeachers } from './course-teachers';

const ane: CourseTeacher = { id: 'A', displayName: 'Ane Holm', email: 'ane@example.test', active: true };
const bo: CourseTeacher = { id: 'B', displayName: 'Bo Lund', email: 'bo@example.test', active: true };
const account = (id: string, displayName: string, role: AdminUser['role'] = 'teacher', status = 'active'): AdminUser =>
  ({ id, displayName, email: `${id.toLowerCase()}@example.test`, role, status, createdAt: '' });

describe('US-A005 Teachers panel', () => {
  let courses: { loadCourseTeachers: ReturnType<typeof vi.fn>; saveCourseTeachers: ReturnType<typeof vi.fn> };
  let users: { search: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    courses = { loadCourseTeachers: vi.fn(), saveCourseTeachers: vi.fn() };
    users = { search: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: CourseService, useValue: courses },
      { provide: AdminUsersService, useValue: users },
      { provide: AppStateService, useValue: { loginState: signal({ token: 'admin-token' }) } },
    ] });
  });
  afterEach(() => TestBed.resetTestingModule());

  async function render(teachers: CourseTeacher[]) {
    courses.loadCourseTeachers.mockResolvedValue({ ok: true, teachers });
    const fixture = TestBed.createComponent(CourseTeachers);
    fixture.componentRef.setInput('courseId', 'course-1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
      ?? [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!;
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    const search = async (text: string) => {
      const field = host.querySelector<HTMLInputElement>('input[type="search"]')!;
      field.value = text;
      field.dispatchEvent(new Event('input'));
      host.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { fixture, host, button, settle, search };
  }

  it('US-A005-AC01 lists assigned teachers and adds a searched teacher', async () => {
    users.search.mockResolvedValue({ ok: true, body: { users: [account('A', 'Ane Holm'), account('B', 'Bo Lund')], total: 2 } });
    courses.saveCourseTeachers.mockResolvedValue({ ok: true, teachers: [ane, bo] });
    const { host, button, settle, search } = await render([ane]);

    expect(courses.loadCourseTeachers).toHaveBeenCalledWith('course-1', 'admin-token');
    expect(host.textContent).toContain('Ane Holm');
    expect(host.textContent).toContain('ane@example.test');
    await search('lund');
    expect(users.search).toHaveBeenCalledWith('admin-token', 'lund');
    expect(button('Add Ane Holm')).toBeUndefined();
    button('Add Bo Lund').click();
    await settle();

    expect(courses.saveCourseTeachers).toHaveBeenCalledWith('course-1', ['A', 'B'], 'admin-token');
    expect(host.querySelectorAll('.course-teachers-list li')).toHaveLength(2);
    expect(host.querySelector('[role="status"]')!.textContent).toContain('Teachers saved');
  });

  it('US-A005-AC07 marks an inactive teacher and still lets the admin remove them', async () => {
    courses.saveCourseTeachers.mockResolvedValue({ ok: true, teachers: [bo] });
    const { host, button, settle } = await render([{ ...ane, active: false }, bo]);

    expect(host.querySelector('.course-teachers-list li')!.textContent).toContain('Inactive');
    button('Remove Ane Holm').click();
    await settle();

    expect(courses.saveCourseTeachers).toHaveBeenCalledWith('course-1', ['B'], 'admin-token');
    expect(host.textContent).not.toContain('Ane Holm');
  });

  it('US-A005-AC08 keeps the previous list and shows the error when saving fails', async () => {
    courses.saveCourseTeachers.mockResolvedValue({ ok: false, message: 'Boom' });
    const { host, button, settle } = await render([ane, bo]);

    button('Remove Ane Holm').click();
    await settle();

    expect(host.querySelectorAll('.course-teachers-list li')).toHaveLength(2);
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Boom');
    expect(host.querySelector('[role="status"]')!.textContent).not.toContain('Teachers saved');
  });

  it('shows the empty state and offers only active teachers who are not assigned yet', async () => {
    users.search.mockResolvedValue({ ok: true, body: { users: [
      account('S', 'Sara Student', 'student'), account('D', 'Dina Disabled', 'teacher', 'disabled'), account('C', 'Carl Admin', 'admin'), account('T', 'Tove Teacher'),
    ], total: 4 } });
    const { host, button, search } = await render([]);

    expect(host.textContent).toContain('No teachers yet. Only admins can edit this course.');
    await search('');
    expect([...host.querySelectorAll('.course-teachers-results li')].map((row) => row.textContent)).toEqual([expect.stringContaining('Tove Teacher')]);
    expect(button('Add Tove Teacher')).toBeDefined();
  });

  it('moves focus to the next Remove button after removing a teacher', async () => {
    const cy: CourseTeacher = { id: 'C', displayName: 'Cy Berg', email: 'cy@example.test', active: true };
    courses.saveCourseTeachers.mockResolvedValue({ ok: true, teachers: [ane, cy] });
    const { button, settle } = await render([ane, bo, cy]);

    button('Remove Bo Lund').click();
    await settle();

    await vi.waitFor(() => expect(document.activeElement).toBe(button('Remove Cy Berg')));
  });
});
