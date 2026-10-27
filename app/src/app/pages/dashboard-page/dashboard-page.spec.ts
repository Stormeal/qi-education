import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CourseSummary } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { AppStateService } from '../../services/app-state.service';
import { LearningProgressService } from '../../services/learning-progress.service';
import { DashboardPage } from './dashboard-page';

const course = (id: string, status: string, completed: number, total = 4): CourseSummary => ({
  id, title: `Course ${id}`, teacher: '', level: '', status, progress: total ? Math.round(completed / total * 100) : 0,
  progressState: status === 'Unavailable' ? 'error' : 'ready', completed, total, nextLesson: '', goals: [],
});

describe('Home recommendation (US-L007)', () => {
  let fixture: ComponentFixture<DashboardPage>;

  const rows = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('.db-action-row')];
  const titles = () => rows().map((row) => row.querySelector('h3')!.textContent!.trim());
  const ribbons = () => rows().filter((row) => row.querySelector('.db-ribbon'));

  function show(courses: CourseSummary[]): void {
    fixture.componentRef.setInput('courses', courses);
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: CareerPathService, useValue: { milestoneProgress: signal(null), selectedPath: signal(null), progress: signal(null),
        nextAction: signal(null), focusedPath: signal(null), state: signal('ready'), load: async () => {} } },
      { provide: LearningProgressService, useValue: { accountSyncState: signal('idle') } },
    ] });
    fixture = TestBed.createComponent(DashboardPage);
    const inputs: Record<string, unknown> = {
      appVersion: '0', currentYear: 2026, student: { name: 'Learner', currentRole: 'Student' }, userEmail: 'learner@example.test',
      userRoleLabel: 'Student', canAccessAdmin: false, activeCourse: null, courses: [], coursesLoading: false, coursesError: '',
      isFeedbackOpen: false, feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '',
      feedbackSubmitting: false, feedbackError: '', feedbackOptions: [],
    };
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  });

  it('US-L007-AC01 puts the course in progress first with a "Recommended" ribbon and keeps the rest in order', () => {
    show([course('a', 'Completed', 4), course('b', 'In progress', 0), course('c', 'In progress', 2), course('d', 'Unavailable', 0)]);
    expect(titles()).toEqual(['Course c', 'Course a', 'Course b', 'Course d']);
    expect(ribbons()).toHaveLength(1);
    expect(rows()[0].querySelector('.db-ribbon')!.textContent!.trim()).toBe('Recommended');
  });

  it('US-L007-AC01 recommends the first course not started when none is in progress', () => {
    show([course('a', 'Completed', 4), course('b', 'Unavailable', 0), course('c', 'In progress', 0), course('d', 'In progress', 0)]);
    expect(titles()).toEqual(['Course c', 'Course a', 'Course b', 'Course d']);
    expect(ribbons()).toHaveLength(1);
  });

  it('US-L007-AC02 shows no recommendation when every course is completed or its progress is unknown', () => {
    show([course('a', 'Completed', 4), course('b', 'Unavailable', 0)]);
    expect(titles()).toEqual(['Course a', 'Course b']);
    expect(ribbons()).toHaveLength(0);
  });

  it.each([[false, true], [true, false], [undefined, false]])('US-L014-AC02/AC03 emailConfirmed %s shows the confirm notice: %s', (emailConfirmed, shown) => {
    TestBed.inject(AppStateService).loginState.set({ token: 'session', permissions: { canCreateCourses: false, hasAdminAccess: false },
      user: { id: 'u', email: 'learner@example.test', displayName: 'Learner', role: 'student', status: 'active', createdAt: '', enrolledCourseIds: [], emailConfirmed } });
    show([]);
    const notice = (fixture.nativeElement as HTMLElement).querySelector('.db-confirm-email');
    expect(Boolean(notice)).toBe(shown);
    if (notice) {
      expect(notice.textContent).toContain('We sent a link to learner@example.test. It works for 24 hours.');
      expect(notice.querySelector('button')!.textContent!.trim()).toBe('Send a new link');
    }
  });

  it.each([['admin', true], ['teacher', false], ['student', false]] as const)('admin Home: a %s sees the attention cards instead of learning: %s', async (role, admin) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
    TestBed.inject(AppStateService).loginState.set({ token: 'session', permissions: { canCreateCourses: role !== 'student', hasAdminAccess: role === 'admin' },
      user: { id: 'u', email: 'u@example.test', displayName: 'User', role, status: 'active', createdAt: '', enrolledCourseIds: [] } });
    show([course('a', 'In progress', 1)]);
    const page = fixture.nativeElement as HTMLElement;
    expect(Boolean(page.querySelector('app-admin-attention'))).toBe(admin);
    expect(Boolean(page.querySelector('app-teaching-overview'))).toBe(role === 'teacher');
    expect(Boolean(page.querySelector('.db-stats'))).toBe(!admin);
    expect(Boolean(page.querySelector('.db-actions-section'))).toBe(!admin);
    expect(page.querySelector('#actions')).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
