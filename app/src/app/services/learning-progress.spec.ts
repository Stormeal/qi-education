import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { computed } from '@angular/core';
import { vi } from 'vitest';
import { appConfig } from '../app.config';
import { CourseContentDocument, CourseListItem, LoginState } from '../app.models';
import { AppStateService } from './app-state.service';
import { LearningProgressService } from './learning-progress.service';
import { CourseService } from './course.service';

const course: CourseListItem = {
  id: 'course', ownerUserId: 'teacher', title: 'Real enrolled course', description: 'Learn from real lessons.',
  teacher: 'Teacher', level: 'Beginner', requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '',
  careerGoals: [], status: 'published', createdAt: '', priceDkk: null, thumbnailAssetId: '', isPremium: false,
  isBestseller: false, rating: 0, ratingCount: 0, category: 'Uncategorized', languages: [],
};
const content: CourseContentDocument = { _id: 'course', view: 'learner', createdAt: '', updatedAt: '',
  sections: [{ id: 'section', title: 'Current lessons', components: [
    { id: 'text', title: 'First lesson', type: 'text', content: 'Read this lesson.', resourceUrl: '', durationMinutes: 1, attachments: [] },
    { id: 'quiz', title: 'Final quiz', type: 'quiz', content: '', resourceUrl: '', durationMinutes: 1, attachments: [],
      quiz: { passPoints: 1, questions: [{ id: 'q', question: 'Which answer?', points: 1, answers: [
        { id: 'a', text: 'First', description: '' }, { id: 'b', text: 'Second', description: '' },
        { id: 'c', text: 'Third', description: '' }, { id: 'd', text: 'Fourth', description: '' },
      ] }] } },
  ] }],
};
const login: LoginState = { token: 'local-session', user: { id: 'learner', email: 'learner@example.test', displayName: 'Learner',
  role: 'student', status: 'active', createdAt: '', enrolledCourseIds: ['course'] }, permissions: { canCreateCourses: false, hasAdminAccess: false } };
const key = 'qi-education:course-progress:learner@example.test:course';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

describe('honest account progress (DEF-007, DEF-009, DEF-014)', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function open(path: string, options: { empty?: boolean; saved?: unknown; outlineFailure?: boolean; catalogFailure?: boolean; otherAccount?: boolean; emptyCourse?: boolean; delayedOutline?: boolean; manyLessons?: boolean } = {}) {
    const restored = options.otherAccount ? { ...login, user: { ...login.user, email: 'other@example.test', id: 'other' } } : login;
    localStorage.setItem('qiEducationSession', JSON.stringify(restored));
    if (options.saved !== undefined) localStorage.setItem(key, typeof options.saved === 'string' ? options.saved : JSON.stringify(options.saved));
    let failOutline = options.outlineFailure ?? false;
    let failCatalog = options.catalogFailure ?? false;
    let resolveOutline!: () => void;
    const delayed = new Promise<void>(resolve => { resolveOutline = resolve; });
    const document = options.emptyCourse ? { ...content, sections: [] } : options.manyLessons ? { ...content,
      sections: [0, 1].map(section => ({ id: `s${section}`, title: 'Lessons', components: Array.from({ length: 100 }, (_, index) => ({
        ...content.sections[0].components[0], id: `lesson-${section * 100 + index}`, title: `Lesson ${section * 100 + index + 1}`,
      })) })) } : content;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/users/me/learning-progress')) return json({ progress: [] });
      if (url.pathname.includes('/learning-progress/') && url.pathname.includes('/lessons/')) return json({ courseId: 'course', completedIds: [] });
      if (url.pathname.endsWith('/me')) return json(options.empty ? { ...restored, user: { ...restored.user, enrolledCourseIds: [] } } : restored);
      if (url.pathname.endsWith('/courses')) return failCatalog ? json({ message: 'Catalog unavailable' }, 503) : json([course]);
      if (url.pathname.endsWith('/outline')) {
        if (options.delayedOutline) await delayed;
        return failOutline ? json({ message: 'Outline unavailable' }, 503) : json(document);
      }
      if (url.pathname.endsWith('/content')) return json(document);
      if (url.pathname.endsWith('/quiz-attempts')) return json({ score: 1, totalPoints: 1, passPoints: 1, passed: true,
        feedback: [{ questionId: 'q', answerId: 'a', correct: true, description: 'Passed' }] });
      throw new Error(`Unexpected isolated request: ${url.pathname}`);
    }));
    TestBed.configureTestingModule({ providers: appConfig.providers });
    const state = TestBed.inject(AppStateService);
    const harness = await RouterTestingHarness.create(path);
    await vi.waitFor(() => { expect(state.coursesLoading()).toBe(false); expect(state.courseContentLoading()).toBe(false); });
    const body = () => { harness.detectChanges(); return harness.routeNativeElement!; };
    const button = (label: string) => [...body().querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)!;
    return { state, harness, body, button, resolveOutline, retryOutline: () => { failOutline = false; failCatalog = false; } };
  }

  it('RD-04 hides unfinished Home controls and keeps Browse courses operable', async () => {
    const { body, button, harness } = await open('/', { empty: true });
    expect([...body().querySelectorAll('button')].some(item => item.textContent?.includes('Adjust track'))).toBe(false);
    button('Browse courses').click(); await harness.fixture.whenStable();
    expect(body().querySelector('app-courses-page')).not.toBeNull();
  });

  it('RD-04 presents readable course overview without nonfunctional tabs', async () => {
    const { body, button, harness } = await open('/library/course');
    expect([...body().querySelectorAll('button')].some(item => /^(Q&A|Notes|Overview)$/.test(item.textContent?.trim() ?? ''))).toBe(false);
    expect(body().querySelector('.learning-overview-body')?.textContent).toContain('Real enrolled course');
    button('Mark complete').click(); harness.detectChanges();
    expect(body().textContent).toContain('Question 1 of 1');
  });

  it('LP-01 shares explicit lesson completion across workspace, library, Home and resume', async () => {
    const { harness, body, button } = await open('/library/course');
    button('Mark complete').click(); harness.detectChanges();
    expect(localStorage.getItem(key)).toBe('["text"]');
    await harness.navigateByUrl('/library');
    await vi.waitFor(() => expect(body().querySelector('.library-course-side')?.textContent).toContain('50%'));
    await harness.navigateByUrl('/');
    await vi.waitFor(() => expect(body().querySelector('.db-actions-section')?.textContent).toContain('50%'));
    expect(body().textContent).toContain('Real enrolled course');
    expect(body().textContent).not.toContain('Chapter 3');
    await harness.navigateByUrl('/library/course');
    await vi.waitFor(() => expect(body().textContent).toContain('Which answer?'));
    (body().querySelector('input[type=radio]') as HTMLInputElement).click();
    button('Submit answer').click(); await harness.fixture.whenStable();
    button('Finish quiz').click(); await harness.fixture.whenStable();
    expect(body().querySelector('.learning-complete-badge')).not.toBeNull();
    await harness.navigateByUrl('/library');
    await vi.waitFor(() => expect(body().querySelector('.library-course-side')?.textContent).toContain('100%'));
    await harness.navigateByUrl('/');
    await vi.waitFor(() => expect(body().querySelector('.db-actions-section')?.textContent).toContain('100%'));
  });

  it('LP-03 gives an unenrolled Home a real starting action without invented activity', async () => {
    const { body, button, harness } = await open('/', { empty: true });
    expect(body().textContent).toContain('No courses');
    expect(body().textContent).not.toMatch(/62%|38%|Chapter 3|Test analysis and design|ISTQB Advanced Test Analyst/);
    button('Browse courses').click(); await harness.fixture.whenStable();
    expect(body().querySelector('app-courses-page')).not.toBeNull();
  });

  it('LP-05 describes an untouched quiz as position without claiming completion', async () => {
    const { body, button, harness } = await open('/library/course');
    button('Mark complete').click(); harness.detectChanges();
    expect(body().textContent).toContain('Question 1 of 1');
    expect(body().textContent).not.toContain('100% complete');
    expect(body().querySelector('[role=progressbar]')?.getAttribute('aria-label')).toBe('Question position');
    expect(body().querySelector('.learning-complete-badge')).toBeNull();
    expect(localStorage.getItem(key)).toBe('["text"]');
  });

  it.each([
    { saved: ['text', 'text', 'removed', 123], percent: '50%' },
    { saved: '{broken', percent: '0%' },
    { saved: { text: true }, percent: '0%' },
  ])('LP-02 restores only unique current completion from $saved', async ({ saved, percent }) => {
    const { body } = await open('/library', { saved });
    await vi.waitFor(() => expect(body().querySelector('.library-course-side')?.textContent).toContain(percent));
  });

  it('LP-02 does not reuse another account completion', async () => {
    const { body } = await open('/library', { saved: ['text', 'quiz'], otherAccount: true });
    await vi.waitFor(() => expect(body().querySelector('.library-course-side')?.textContent).toContain('0%'));
  });

  it('LP-02 an empty course does not claim completion', async () => {
    const { body } = await open('/', { emptyCourse: true, saved: ['text', 'quiz'] });
    await vi.waitFor(() => expect(body().querySelector('.db-actions-section')?.textContent).toContain('0 of 0 completed'));
    expect(body().querySelector('.db-action-row')?.classList.contains('is-complete')).toBe(false);
  });

  it('LP-04 outline failure is unavailable and retry retains saved completion', async () => {
    const { body, button, harness, retryOutline } = await open('/', { outlineFailure: true, saved: ['text'] });
    await vi.waitFor(() => expect(body().textContent).toContain('Progress unavailable'));
    expect(body().querySelector('.db-actions-section')?.textContent).not.toContain('0%');
    retryOutline(); button('Retry').click(); await harness.fixture.whenStable();
    await vi.waitFor(() => expect(body().querySelector('.db-actions-section')?.textContent).toContain('50%'));
    expect(localStorage.getItem(key)).toBe('["text"]');
  });

  it('LP-01 real Home activity opens the actual enrolled course', async () => {
    const { body, harness } = await open('/');
    await vi.waitFor(() => expect(body().querySelector('.db-action-row a')).not.toBeNull());
    (body().querySelector('.db-action-row a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    await vi.waitFor(() => expect(body().textContent).toContain('Read this lesson.'));
  });

  it('LP-04 keeps completion during route changes when browser persistence fails', async () => {
    const { harness, body, button } = await open('/library/course');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError'); });
    button('Mark complete').click(); harness.detectChanges();
    expect(body().textContent).toContain('1 of 2 completed');
    await harness.navigateByUrl('/library');
    await vi.waitFor(() => expect(body().querySelector('.library-course-side')?.textContent).toContain('50%'));
    await harness.navigateByUrl('/');
    await vi.waitFor(() => expect(body().querySelector('.db-actions-section')?.textContent).toContain('50%'));
  });

  it('LP-04 offers an in-page retry after My Learning catalog retrieval fails', async () => {
    const { body, button, harness, retryOutline } = await open('/library', { catalogFailure: true, saved: ['text'] });
    expect(body().textContent).toContain('Catalog unavailable');
    expect(button('Retry')).toBeDefined();
    retryOutline(); button('Retry').click(); await harness.fixture.whenStable();
    await vi.waitFor(() => expect(body().querySelector('.library-course-side')?.textContent).toContain('50%'));
  });

  it('LP-04 pending outlines do not fabricate zero progress', async () => {
    const { body, resolveOutline } = await open('/library', { delayedOutline: true, saved: ['text'] });
    expect(body().querySelector('.library-course-side')?.textContent).toContain('Loading');
    expect(body().querySelector('.library-course-side')?.textContent).not.toContain('0%');
    resolveOutline();
    await vi.waitFor(() => expect(body().querySelector('.library-course-side')?.textContent).toContain('50%'));
  });

  it('LP-04 ignores delayed outlines after logout', async () => {
    const { state, body, resolveOutline, harness } = await open('/library', { delayedOutline: true, saved: ['text'] });
    state.logout(true); resolveOutline(); await harness.fixture.whenStable();
    expect(state.courses()).toEqual([]);
    expect(body().querySelector('app-login-page')).not.toBeNull();
  });

  it('LP-02 reserves 100 percent for all current components completed', async () => {
    const { body } = await open('/library', { manyLessons: true, saved: Array.from({ length: 199 }, (_, index) => `lesson-${index}`) });
    await vi.waitFor(() => expect(body().querySelector('.library-course-side')?.textContent).toContain('99%'));
    expect(body().querySelector('.library-course-side')?.textContent).toContain('199 of 200');
  });
});

describe('account-backed completion (US-L002-AC02)', () => {
  let service: LearningProgressService;
  let server: Map<string, string[]>;
  let writes: string[];
  let failSaves: boolean;
  let quizAllowed: boolean;
  let gateRead: (() => Promise<void>) | undefined;
  let gateWrite: (() => Promise<void>) | undefined;
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    window.qiEducationConfig = { apiBaseUrl: 'http://127.0.0.1:9/api' };
    localStorage.setItem('qiEducationSession', JSON.stringify(login));
    server = new Map(); writes = []; failSaves = quizAllowed = false; gateRead = gateWrite = undefined;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const token = new Headers(init?.headers).get('authorization')!;
      if (path.endsWith('/users/me/learning-progress')) {
        const ids = [...(server.get(token) ?? [])];
        await gateRead?.();
        return json({ progress: ids.length ? [{ courseId: 'course', completedIds: ids }] : [] });
      }
      if (path.includes('/learning-progress/') && path.includes('/lessons/')) {
        const courseId = path.split('/learning-progress/')[1].split('/')[0];
        const accountKey = courseId === 'course' ? token : `${token}:${courseId}`;
        const id = decodeURIComponent(path.split('/').at(-1)!);
        writes.push(`${token}:${id}`);
        await gateWrite?.();
        if (failSaves) return json({ message: 'Temporarily unavailable' }, 503);
        if (id === 'quiz' && !quizAllowed) return json({ message: 'No passing proof' }, 409);
        const ids = [...new Set([...(server.get(accountKey) ?? []), id])];
        server.set(accountKey, ids);
        return json({ courseId, completedIds: ids });
      }
      throw new Error(`Unexpected isolated progress request: ${path}`);
    }));
    TestBed.configureTestingModule({ providers: [{ provide: CourseService, useValue: { loadCourseOutline: async () => content } }] });
    service = TestBed.inject(LearningProgressService);
  });
  afterEach(() => {
    TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete window.qiEducationConfig;
  });

  it('AP-01 restores server completion into synchronous readers and merges legacy browser IDs by union', async () => {
    server.set('Bearer local-session', ['quiz']); localStorage.setItem(key, '["text","removed"]');
    await service.loadCourses([course], login.token);
    await vi.waitFor(() => expect(server.get('Bearer local-session')?.sort()).toEqual(['quiz', 'text']));
    expect(service.completedIds(login.user.email, 'course')).toEqual(['text', 'removed', 'quiz']);
    expect(service.summary(login.user.email, 'course')).toMatchObject({ percent: 100, completed: 2 });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['text', 'removed', 'quiz']);
    expect(writes.some(value => value.endsWith(':removed'))).toBe(false);
  });

  it('AP-01 a direct roadmap computed read restores account progress without loadCourses', async () => {
    server.set('Bearer local-session', ['text', 'quiz']);
    const progress = computed(() => service.forContent(login.user.email, content).percent);
    expect(progress()).toBe(0);
    await vi.waitFor(() => expect(progress()).toBe(100));
    expect(localStorage.getItem(key)).toBe('["text","quiz"]');
    expect(writes).toEqual([]);
  });

  it('AP-03 reset cancels a queued direct-reader load before any account request is sent', async () => {
    service.forContent(login.user.email, content);
    service.reset(); localStorage.removeItem('qiEducationSession');
    await Promise.resolve();
    expect(window.fetch).not.toHaveBeenCalled();
    expect(service.accountSyncState()).toBe('idle');
  });

  it('AP-02 merges an off-page legacy course without depending on a working outline request', async () => {
    localStorage.setItem('qi-education:course-progress:learner@example.test:off-page', '["text"]');
    vi.spyOn(TestBed.inject(CourseService), 'loadCourseOutline').mockRejectedValue(new Error('Outline unavailable'));
    await service.loadCourses([], login.token);
    await vi.waitFor(() => expect(server.get('Bearer local-session:off-page')).toEqual(['text']));
    expect(service.accountSyncState()).toBe('ready');
  });

  it('AP-02 retains synchronous local completion during a save failure and retries after backoff', async () => {
    await service.loadCourses([course], login.token);
    vi.useFakeTimers(); failSaves = true;
    expect(service.complete(login.user.email, content, 'text')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.forContent(login.user.email, content).percent).toBe(50);
    expect(localStorage.getItem(key)).toBe('["text"]');
    expect(server.get('Bearer local-session')).toBeUndefined();
    failSaves = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(server.get('Bearer local-session')).toEqual(['text']);
  });

  it('AP-01 another device without local storage restores account completion', async () => {
    await service.loadCourses([course], login.token); service.complete(login.user.email, content, 'text');
    await vi.waitFor(() => expect(server.get('Bearer local-session')).toEqual(['text']));
    service.reset(); localStorage.removeItem(key);
    await service.loadCourses([course], login.token);
    expect(service.forContent(login.user.email, content)).toMatchObject({ completed: 1, percent: 50 });
    expect(localStorage.getItem(key)).toBe('["text"]');
  });

  it('AP-03 a late account load cannot populate switched accounts or persist its response', async () => {
    let release!: () => void;
    gateRead = () => new Promise<void>(resolve => { release = resolve; });
    server.set('Bearer local-session', ['text']);
    const loading = service.loadCourses([course], login.token);
    await vi.waitFor(() => expect(release).toBeDefined());
    service.reset();
    const other = { ...login, token: 'other-session', user: { ...login.user, id: 'other', email: 'other@example.test' } };
    localStorage.setItem('qiEducationSession', JSON.stringify(other)); gateRead = undefined; release();
    await loading; await service.loadCourses([course], other.token);
    expect(service.completedIds(other.user.email, 'course')).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
    expect(writes).toEqual([]);
  });

  it('AP-03 a late save after logout neither changes local storage nor schedules an old-session retry', async () => {
    await service.loadCourses([course], login.token);
    let release!: () => void;
    gateWrite = () => new Promise<void>(resolve => { release = resolve; });
    service.complete(login.user.email, content, 'text');
    await vi.waitFor(() => expect(release).toBeDefined());
    service.reset(); localStorage.removeItem('qiEducationSession');
    server.set('Bearer local-session', ['quiz']); release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(localStorage.getItem(key)).toBe('["text"]');
    expect(writes).toHaveLength(1);
  });

  it('AP-05 legacy quiz denial never drops local completion or blocks another lesson', async () => {
    localStorage.setItem(key, '["quiz","text"]');
    await service.loadCourses([course], login.token);
    await vi.waitFor(() => expect(server.get('Bearer local-session')).toEqual(['text']));
    expect(service.forContent(login.user.email, content).percent).toBe(100);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(['quiz', 'text']);
    expect(writes).toContain('Bearer local-session:quiz');
    // Finishing a newly verified attempt must retry even though its legacy ID
    // already exists locally, without requiring a page change or local deletion.
    quizAllowed = true; service.complete(login.user.email, content, 'quiz');
    await vi.waitFor(() => expect(server.get('Bearer local-session')?.sort()).toEqual(['quiz', 'text']));
  });

  it('AP-01 a completion made during a pending account read is included in the union', async () => {
    let release!: () => void;
    gateRead = () => new Promise<void>(resolve => { release = resolve; });
    const loading = service.loadCourses([course], login.token);
    await vi.waitFor(() => expect(release).toBeDefined());
    service.complete(login.user.email, content, 'text'); release();
    await loading;
    await vi.waitFor(() => expect(server.get('Bearer local-session')).toEqual(['text']));
    expect(service.forContent(login.user.email, content).percent).toBe(50);
  });
});
