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
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

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

  it.each(['teacher', 'admin'] as const)('US-T002 exposes draft submission without arbitrary publication for %s', role => {
    state.loginState.set(login(role)); state.currentPath.set('/courses/owned-course/edit');
    state.courseReview.set({ course: ownedCourse, version: 0, revisionId: 'initial', liveStatus: null, editable: true, history: [] });
    const fixture = TestBed.createComponent(CourseEditorRoute); fixture.detectChanges();
    const buttons = [...fixture.nativeElement.querySelectorAll('button')].map(button => (button as HTMLButtonElement).textContent);
    expect(buttons.some(text => text?.includes('Submit for review'))).toBe(true);
    expect(buttons.some(text => text?.includes('Publish revision'))).toBe(false);
    expect(buttons.some(text => text?.includes('Archive course'))).toBe(false);
  });

  it('US-T002 keeps published teacher fields read-only before revision creation', () => {
    state.availableCourses.set([{ ...ownedCourse, status: 'published' }]);
    state.currentPath.set('/courses/owned-course/edit');
    const fixture = TestBed.createComponent(CourseEditorRoute); fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('input[placeholder="ISTQB Foundation 4.0"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('DEF-003 discards a pending author video poll after moving to a preview', async () => {
    vi.useFakeTimers();
    state.currentPath.set('/courses/owned-course/edit');
    state.loadedCourseContentId.set('owned-course');
    const outline = { _id: 'owned-course', view: 'outline' as const, sections: [], createdAt: '', updatedAt: '' };
    state.courseContent.set({ ...outline, view: 'author', sections: [{ id: 's', title: 'Video', components: [{
      id: 'video', type: 'video', title: 'Video', content: '', resourceUrl: '', durationMinutes: 1, attachments: [],
      mux: { provider: 'mux', uploadId: 'pending-upload', assetId: '', playbackId: '', playbackPolicy: 'public',
        status: 'processing', durationSeconds: null, thumbnailUrl: '', errorMessage: '', captions: [] },
    }] }] });
    let resolve!: (value: typeof outline) => void;
    const load = vi.spyOn(TestBed.inject(CourseService), 'loadCourseContent').mockImplementation(() => new Promise((done) => { resolve = done; }));
    const poll = (state as unknown as { refreshMuxVideoUntilReady(id: string, component: string, attempts: number): Promise<void> })
      .refreshMuxVideoUntilReady('owned-course', 'video', 1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalled();
    state.currentPath.set('/courses/owned-course');
    state.courseContent.set(outline);
    resolve({ ...outline, view: 'author' } as unknown as typeof outline);
    await poll;
    expect(state.courseContent()).toBe(outline);
  });

  it('DEF-005 saves edited draft content before requesting review validation', async () => {
    state.currentPath.set('/courses/owned-course/edit');
    state.loadedCourseContentId.set('owned-course');
    state.courseDraft.update((draft) => ({ ...draft, title: ownedCourse.title, description: ownedCourse.description,
      teacher: ownedCourse.teacher, level: ownedCourse.level, status: 'draft' }));
    const content = { _id: 'owned-course', view: 'author' as const, sections: [], createdAt: '', updatedAt: '' };
    state.courseContent.set(content);
    const calls: string[] = [];
    const service = TestBed.inject(CourseService);
    vi.spyOn(service, 'saveCourseContent').mockImplementation(async () => { calls.push('content'); return { ok: true, content }; });
    const review = { course: ownedCourse, version: 2, revisionId: 'initial', liveStatus: null, editable: true, history: [] } as const;
    state.courseReview.set({ ...review, history: [] });
    vi.spyOn(service, 'saveCourse').mockImplementation(async () => { calls.push('metadata'); return { ok: true, course: ownedCourse }; });
    vi.spyOn(service, 'loadCourseContent').mockResolvedValue({ ...content, review: { ...review, history: [] } });
    vi.spyOn(service, 'performReviewAction').mockImplementation(async () => { calls.push('review'); throw new Error('Assessment needs correction.'); });
    await state.reviewCourse('submit');
    expect(calls).toEqual(['metadata', 'content', 'review']);
    expect(state.courseReviewError()).toContain('Assessment needs correction');
    expect(state.courseContent()).toEqual(content);
    expect(state.courseDraft().status).toBe('draft');
    expect(state.availableCourses()[0].status).toBe('draft');
  });
});
