import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { CourseListItem, LoginState } from '../app.models';
import { CourseEditorRoute } from '../routes/course-editor-route';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';

const ownedCourse = {
  id: 'owned-course', ownerUserId: 'teacher-a', title: 'Owned course',
  description: 'A valid course description.', teacher: 'Renamed instructor', level: 'Beginner',
  requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '', careerGoals: [],
  status: 'draft', createdAt: '2026-10-04T00:00:00.000Z', priceDkk: null, thumbnailAssetId: '',
  isPremium: false, isBestseller: false, rating: 0, ratingCount: 0,
  category: 'Uncategorized', languages: [],
} satisfies CourseListItem & { ownerUserId: string };

function login(role: 'teacher' | 'admin' | 'student', id = 'teacher-a'): LoginState {
  return { token: 'test-session', user: { id, email: `${id}@example.test`, displayName: 'Same display name',
    role, status: 'active', createdAt: '2026-10-04T00:00:00.000Z', enrolledCourseIds: [] },
    permissions: { canCreateCourses: role !== 'student', hasAdminAccess: role === 'admin' },
  };
}

describe('course ownership UI (DEF-001)', () => {
  let state: AppStateService;
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({ imports: [CourseEditorRoute], providers: [provideRouter([])] }).compileComponents();
    state = TestBed.inject(AppStateService);
    state.availableCourses.set([ownedCourse]);
    state.loginState.set(login('teacher'));
  });
  afterEach(() => vi.restoreAllMocks());

  it('blocks editor entry for a different teacher even with the same display name', () => {
    state.loginState.set(login('teacher', 'teacher-b'));
    const draft = state.courseDraft();
    const navigation = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    state.openEditCourse('owned-course');
    expect(state.courseDraft()).toEqual(draft);
    expect(navigation).not.toHaveBeenCalled();
  });

  it.each(['teacher', 'student'] as const)('shows a denied state on a direct editor URL for an unrelated %s', (role) => {
    state.loginState.set(login(role, 'teacher-b'));
    state.currentPath.set('/courses/owned-course/edit');
    const fixture = TestBed.createComponent(CourseEditorRoute);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('app-course-editor-page')).toBeNull();
    expect(page.textContent).toContain('You do not have permission to edit this course');
    expect(page.querySelector('button')?.textContent).toContain('Back to courses');
  });

  it.each(['teacher', 'admin'] as const)('allows the owner or %s to open the editor after the instructor label changes', (role) => {
    state.loginState.set(login(role));
    state.currentPath.set('/courses/owned-course/edit');
    const fixture = TestBed.createComponent(CourseEditorRoute);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-course-editor-page')).not.toBeNull();
  });

  it('retains metadata edits when the API denies a save after editor entry', async () => {
    state.currentPath.set('/courses/owned-course/edit');
    state.courseDraft.update((draft) => ({ ...draft, title: 'Keep my unsaved edits' }));
    vi.spyOn(TestBed.inject(CourseService), 'saveCourse').mockResolvedValue({ ok: false, message: 'You do not have permission to edit this course.' });
    await state.submitCourse();
    expect(state.courseDraft().title).toBe('Keep my unsaved edits');
    expect(state.courseCreateError()).toContain('permission');
    expect(state.courseSubmitting()).toBe(false);
  });
});
