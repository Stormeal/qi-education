import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../app.config';
import { vi } from 'vitest';
import { CourseContentDocument, CourseListItem, CourseReviewState, LoginState } from '../app.models';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';

const course: CourseListItem = { id: 'course', ownerUserId: 'teacher', teacherIds: ['teacher'], reviewerIds: ['rikke'], title: 'Test design',
  description: 'A course waiting for review.', level: 'Beginner', teacher: 'Owner', requirements: [], whatYoullLearn: [], audience: '',
  partOfCareer: '', careerGoals: [], status: 'ready-for-review', createdAt: '2026-10-09', priceDkk: null, thumbnailAssetId: '',
  isPremium: false, isBestseller: false, rating: 0, ratingCount: 0, category: 'Software Testing', languages: [] };
function login(id: string, role: 'teacher' | 'admin'): LoginState {
  return { token: 'isolated-token', user: { id, email: `${id}@example.test`, displayName: id, role, status: 'active', createdAt: '',
    enrolledCourseIds: [] }, permissions: { canCreateCourses: true, hasAdminAccess: role === 'admin' } };
}
function document(status: 'draft' | 'ready-for-review', reviewers?: CourseReviewState['reviewers'], history: CourseReviewState['history'] = []) {
  return { _id: 'course', view: 'author', createdAt: '', updatedAt: '',
    sections: [{ id: 's', title: 'Section', components: [{ id: 'l', type: 'text', title: 'Lesson', content: '<p>Lesson to review</p>',
      durationMinutes: 0, resourceUrl: '', attachments: [] }] }],
    review: { course: { ...course, status }, version: 3, revisionId: 'revision', liveStatus: null, editable: status === 'draft', history,
      ...(reviewers ? { reviewers } : {}) } } as unknown as CourseContentDocument;
}
const button = (page: HTMLElement, label: string) =>
  [...page.querySelectorAll('button')].find((item) => item.textContent?.trim() === label) as HTMLButtonElement | undefined;

describe('US-A007 reviewer in the course editor', () => {
  let state: AppStateService;
  beforeEach(async () => {
    localStorage.clear(); sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/courses')) return new Response(JSON.stringify([course]), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      throw new Error('Unexpected isolated request: ' + path);
    }));
    await TestBed.configureTestingModule({ providers: appConfig.providers }).compileComponents();
    state = TestBed.inject(AppStateService); state.availableCourses.set([course]);
  });
  afterEach(async () => { await vi.waitFor(() => expect(TestBed.inject(Router).currentNavigation()).toBeNull()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function render(user: LoginState, content: CourseContentDocument) {
    vi.spyOn(TestBed.inject(CourseService), 'loadCourseContent').mockResolvedValue(content);
    state.loginState.set(user);
    const harness = await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseReview()).not.toBeNull()); harness.detectChanges();
    return { page: harness.routeNativeElement as HTMLElement, detectChanges: () => harness.detectChanges() };
  }

  it('US-A007-AC02 a reviewer reads the course read-only and sends a verdict', async () => {
    const perform = vi.spyOn(TestBed.inject(CourseService), 'performReviewAction')
      .mockResolvedValue(document('ready-for-review', { total: 1, approved: 1, viewerVerdict: 'approved' }));
    const { page, detectChanges } = await render(login('rikke', 'teacher'), document('ready-for-review', { total: 1, approved: 0, viewerVerdict: 'waiting' }));

    expect(page.textContent).toContain('You are reviewing this course');
    expect(page.textContent).toContain('Waiting for your verdict');
    expect((page.querySelector('input[placeholder="ISTQB Foundation 4.0"]') as HTMLInputElement).disabled).toBe(true);
    expect(button(page, 'Submit for review')).toBeUndefined();
    expect(button(page, 'Publish revision')).toBeUndefined();
    expect(button(page, 'Request changes')!.disabled).toBe(true);

    const comment = page.querySelector('textarea[aria-label="Review comment"]') as HTMLTextAreaElement;
    comment.value = 'Quiz 2 has two right answers.'; comment.dispatchEvent(new Event('input')); detectChanges();
    expect(button(page, 'Request changes')!.disabled).toBe(false);

    button(page, 'Approve')!.click();
    await vi.waitFor(() => expect(perform).toHaveBeenCalledWith('course', 'approve', expect.anything(), 'Quiz 2 has two right answers.', 'isolated-token'));
    await vi.waitFor(() => expect(state.courseSaveNotice()).toBe('Approval sent.'));
  });

  it('US-A007-AC04 a returned course is not waiting for the reviewer', async () => {
    const { page } = await render(login('rikke', 'teacher'), document('draft', { total: 1, approved: 0, viewerVerdict: 'waiting' }));
    expect(page.textContent).toContain('This course is back with its teachers for changes.');
    expect(button(page, 'Submit for review')).toBeUndefined();
    expect(button(page, 'Approve')).toBeUndefined();
    expect((page.querySelector('input[placeholder="ISTQB Foundation 4.0"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('US-A007-AC03 an admin cannot publish until every reviewer approved, and sees verdicts in history', async () => {
    const { page } = await render(login('admin', 'admin'), document('ready-for-review', { total: 2, approved: 1, viewerVerdict: null }, [
      { id: 'e1', revisionId: 'revision', action: 'approve', actorId: 'rikke', actorName: 'Rikke Dam', createdAt: '2026-10-26T12:00:00Z', reason: '' },
      { id: 'e2', revisionId: 'revision', action: 'request-changes', actorId: 'bo', actorName: 'Bo Lund', createdAt: '2026-10-26T13:00:00Z', reason: 'Fix chapter 3' },
    ]));
    expect(page.textContent).toContain('Waiting for 1 of 2 reviewers');
    expect(button(page, 'Publish revision')!.disabled).toBe(true);
    expect(button(page, 'Return for changes')!.disabled).toBe(false);
    expect(button(page, 'Approve')).toBeUndefined();
    expect(page.textContent).toContain('Approved by reviewer');
    expect(page.textContent).toContain('Changes requested by reviewer');
    expect(page.textContent).toContain('Fix chapter 3');
  });

  it('US-A007-AC06 a course without reviewers publishes as before', async () => {
    const { page } = await render(login('admin', 'admin'), document('ready-for-review'));
    expect(page.querySelector('.review-gate')).toBeNull();
    expect(button(page, 'Publish revision')!.disabled).toBe(false);
  });
});
