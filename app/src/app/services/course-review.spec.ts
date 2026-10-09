import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from '../app.config';
import { vi } from 'vitest';
import { CourseListItem, LoginState, CourseContentDocument } from '../app.models';
import { CourseEditorRoute } from '../routes/course-editor-route';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';

const course: CourseListItem = { id: 'course', ownerUserId: 'teacher', title: 'Live course', description: 'Original reviewed course.', level: 'Beginner', teacher: 'Owner',
  requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '', careerGoals: [], status: 'published', createdAt: '2026-10-09', priceDkk: null,
  thumbnailAssetId: '', isPremium: false, isBestseller: false, rating: 0, ratingCount: 0, category: 'Uncategorized', languages: [] };
function login(role: 'teacher' | 'admin'): LoginState { return { token: 'isolated-token', user: { id: 'teacher', email: 'teacher@example.test', displayName: 'Owner', role,
  status: 'active', createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: true, hasAdminAccess: role === 'admin' } }; }
function document(status: 'draft' | 'ready-for-review' | 'published') {
  return { _id: 'course', view: 'author', sections: [], createdAt: '', updatedAt: '', review: { course: { ...course, status },
    version: 3, revisionId: status === 'published' ? null : 'revision', liveStatus: 'published', editable: status === 'draft', history: [
      { id: 'event', revisionId: 'revision', action: 'return', actorId: 'admin', actorName: 'Reviewer', createdAt: '2026-10-09T12:00:00Z', reason: 'Clarify the exercise' },
    ] } } as unknown as CourseContentDocument;
}
describe('US-T002 editor review flow', () => {
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
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function render(status: 'draft' | 'ready-for-review' | 'published', role: 'teacher' | 'admin' = 'teacher') {
    vi.spyOn(TestBed.inject(CourseService), 'loadCourseContent').mockResolvedValue(document(status));
    state.loginState.set(login(role));
    const harness = await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseReview()).not.toBeNull()); harness.detectChanges();
    return { nativeElement: harness.routeNativeElement!, detectChanges: () => harness.detectChanges() };
  }
  it('AC07 offers a private revision and keeps the published editor read-only until it starts', async () => {
    const fixture = await render('published'); const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Learners keep the published version');
    expect([...page.querySelectorAll('button')].find(button => button.textContent?.includes('Start revision'))).toBeTruthy();
    expect((page.querySelector('input[placeholder="ISTQB Foundation 4.0"]') as HTMLInputElement).disabled).toBe(true);
  });
  it('AC01/08 shows submission for an editable revision and preserves previous return feedback', async () => {
    const fixture = await render('draft'); const page = fixture.nativeElement as HTMLElement;
    expect([...page.querySelectorAll('button')].find(button => button.textContent?.includes('Submit for review'))).toBeTruthy();
    expect(page.textContent).toContain('Clarify the exercise'); expect(page.textContent).toContain('Reviewer');
    expect((page.querySelector('input[placeholder="ISTQB Foundation 4.0"]') as HTMLInputElement).disabled).toBe(false);
    expect(page.querySelector('select')).toBeNull();
  });
  it('AC03 freezes a submitted revision and offers review decisions only to admins', async () => {
    const fixture = await render('ready-for-review', 'admin'); const page = fixture.nativeElement as HTMLElement;
    state.courseContent.set({ ...document('ready-for-review'), sections: [{ id: 's', title: 'Review section', components: [{ id: 'lesson', type: 'text', title: 'Pending lesson', content: '<p>Private lesson to review</p>', durationMinutes: 0, resourceUrl: '', attachments: [] }] }] }); fixture.detectChanges();
    expect(page.textContent).toContain('Private lesson to review');
    expect(page.querySelector('[contenteditable="true"]')).toBeNull();
    expect(page.querySelector('.rename-link')).toBeNull();
    expect(page.textContent).toContain('Awaiting admin review');
    expect([...page.querySelectorAll('button')].find(button => button.textContent?.includes('Publish revision'))).toBeTruthy();
    expect([...page.querySelectorAll('button')].find(button => button.textContent?.includes('Return for changes'))).toBeTruthy();
    expect(page.querySelector('textarea[aria-label="Return reason"]')).toBeTruthy();
    expect((page.querySelector('input[placeholder="ISTQB Foundation 4.0"]') as HTMLInputElement).disabled).toBe(true);
    state.loginState.set(login('teacher')); fixture.detectChanges();
    expect([...page.querySelectorAll('button')].find(button => button.textContent?.includes('Publish revision'))).toBeUndefined();
  });
  it('AC04/06 keeps the entered return reason and frozen revision on a failed decision', async () => {
    const fixture = await render('ready-for-review', 'admin'); const page = fixture.nativeElement as HTMLElement;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Revision changed. Reload before deciding.' }), { status: 409, headers: { 'Content-Type': 'application/json' } })));
    const reason = page.querySelector('textarea[aria-label="Return reason"]') as HTMLTextAreaElement;
    reason.value = 'Explain the practical exercise'; reason.dispatchEvent(new Event('input')); fixture.detectChanges();
    [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Return for changes'))!.click();
    await vi.waitFor(() => expect(state.courseReviewError()).toContain('Revision changed'));
    fixture.detectChanges(); expect(reason.value).toBe('Explain the practical exercise');
    expect(state.courseReview()?.course.status).toBe('ready-for-review'); expect(state.courseReviewPending()).toBe(false);
    expect(state.hasUnsavedCourseChanges()).toBe(true);
  });
  it('AC06 archives live access policy without discarding an unsaved private revision', async () => {
    await render('draft', 'admin');
    state.courseDraft.update(draft => ({ ...draft, title: 'Unsaved pending title' }));
    const pending = { ...document('draft'), sections: [{ id: 's', title: 'Unsaved section', components: [] }] };
    state.courseContent.set(pending);
    const reply = document('draft'); reply.review!.liveStatus = 'archived';
    vi.spyOn(TestBed.inject(CourseService), 'performReviewAction').mockResolvedValue(reply);
    await state.reviewCourse('archive');
    expect(state.courseDraft().title).toBe('Unsaved pending title');
    expect(state.courseContent()?.sections[0].title).toBe('Unsaved section');
    expect(state.hasUnsavedCourseChanges()).toBe(true); expect(state.courseReview()?.liveStatus).toBe('archived');
  });
  it('AC06 ignores a successful decision response after logout' , async () => {
    await render('ready-for-review', 'admin');
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const decision = state.reviewCourse('publish');
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    state.logout(true);
    resolve(new Response(JSON.stringify(document('published')), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await decision; expect(state.courseReview()).toBeNull(); expect(state.courseContent()).toBeNull(); expect(state.courseReviewReason()).toBe('');
  });
  it('AC01 allows only one submission when clicked twice before the save completes', async () => {
    await render('draft'); let submissions = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/review')) { submissions++; return new Response(JSON.stringify(document('ready-for-review')), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response(JSON.stringify([course]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    await Promise.all([state.reviewCourse('submit'), state.reviewCourse('submit')]);
    expect(submissions).toBe(1); expect(state.courseReview()?.course.status).toBe('ready-for-review');
  });

});
