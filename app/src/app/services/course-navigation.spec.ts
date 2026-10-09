import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { routes } from '../app.routes';
import { appConfig } from '../app.config';
import { CourseContentDocument, CourseListItem, LoginState } from '../app.models';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';
import { ApiClientService } from './api-client.service';

const course: CourseListItem = {
  id: 'course', ownerUserId: 'teacher', title: 'Navigation course', description: 'A valid course description.',
  teacher: 'Teacher', level: 'Beginner', requirements: [], whatYoullLearn: [], audience: '',
  partOfCareer: '', careerGoals: [], status: 'published', createdAt: '', priceDkk: null,
  thumbnailAssetId: '', isPremium: false, isBestseller: false, rating: 0, ratingCount: 0,
  category: 'Uncategorized', languages: [],
};
const content: CourseContentDocument = {
  _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 'section', title: 'First section', components: [{
    id: 'lesson', title: 'First lesson', type: 'text', durationMinutes: 1, content: '<p>Private lesson body</p>', resourceUrl: '', attachments: [],
  }] }],
};
function session(role: 'teacher' | 'student' = 'teacher'): LoginState {
  return { token: 'isolated-token', user: { id: role, email: `${role}@example.test`, displayName: role,
    role, status: 'active', createdAt: '', enrolledCourseIds: role === 'student' ? ['course'] : [] },
    permissions: { canCreateCourses: role === 'teacher', hasAdminAccess: false } };
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('unsaved course navigation (DEF-006)', () => {
  let state: AppStateService;
  let harness: RouterTestingHarness;
  let confirm: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    localStorage.clear(); sessionStorage.clear();
    const draft = { ...course, status: 'draft' };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/courses')) return json([draft, { ...draft, id: 'other' }]);
      if (url.pathname.endsWith('/content')) return json({ ...content, _id: url.pathname.includes('/other/') ? 'other' : 'course', view: 'author' });
      throw new Error(`Unexpected isolated request: ${url.pathname}`);
    }));
    TestBed.configureTestingModule({ providers: appConfig.providers });
    state = TestBed.inject(AppStateService);
    state.loginState.set(session());
    confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    harness = await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.coursesLoading()).toBe(false));
    harness.detectChanges();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('NW-01 keeps metadata and outline edits when Cancel is declined', async () => {
    state.updateCourseTitle('Unsaved title');
    state.updateCourseSectionTitle(0, 'Unsaved section');
    state.cancelCreateCourse();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(TestBed.inject(Router).url).toBe('/courses/course/edit');
    expect(state.courseDraft().title).toBe('Unsaved title');
    expect(state.courseContent()!.sections[0].title).toBe('Unsaved section');
  });

  it.each(['/library', '/courses/other/edit', '/courses/new'])('NW-01 guards navigation to %s', async (url) => {
    state.updateCourseTitle('Unsaved title');
    expect(await TestBed.inject(Router).navigateByUrl(url)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(state.courseDraft().title).toBe('Unsaved title');
  });

  it('NW-01 does not clear edits before opening another editor', async () => {
    state.updateCourseTitle('Keep this draft');
    state.openEditCourse('other');
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(TestBed.inject(Router).url).toBe('/courses/course/edit');
    expect(state.courseDraft().title).toBe('Keep this draft');
    state.openCreateCourse();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(state.courseDraft().title).toBe('Keep this draft');
  });

  it('NW-02 discards confirmed edits and reloads saved values when returning', async () => {
    state.updateCourseSectionTitle(0, 'Discard this section');
    confirm.mockReturnValue(true);
    await harness.navigateByUrl('/courses');
    expect(confirm).toHaveBeenCalledOnce();
    await harness.navigateByUrl('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseContentLoading()).toBe(false));
    expect(state.courseContent()!.sections[0].title).toBe('First section');
  });

  it('NW-02 guards a new-course draft', async () => {
    await harness.navigateByUrl('/courses/new');
    state.updateCourseTitle('Unsaved new course');
    expect(await TestBed.inject(Router).navigateByUrl('/courses')).toBe(false);
    expect(state.courseDraft().title).toBe('Unsaved new course');
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('NW-03 warns on browser departure only while changes remain unsaved', async () => {
    const departure = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(departure()).toBe(false);
    state.updateCourseTitle('Unsaved');
    expect(departure()).toBe(true);
    state.updateCourseTitle(course.title);
    expect(departure()).toBe(false);
    state.updateCourseSectionTitle(0, 'Unsaved outline');
    expect(departure()).toBe(true);
    vi.spyOn(TestBed.inject(CourseService), 'saveCourseContent').mockImplementation(async (_id, sections) => ({
      ok: true, content: { ...content, sections },
    }));
    await state.submitCourse();
    expect(departure()).toBe(false);
    await harness.navigateByUrl('/courses');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('NW-04 preserves a failed save and continues warning until retry succeeds', async () => {
    state.updateCourseTitle('Retry this title');
    const save = vi.spyOn(TestBed.inject(CourseService), 'saveCourse').mockResolvedValue({ ok: false, message: 'Isolated save failure' });
    await state.submitCourse();
    expect(state.courseCreateError()).toContain('Isolated save failure');
    expect(await TestBed.inject(Router).navigateByUrl('/courses')).toBe(false);
    expect(state.courseDraft().title).toBe('Retry this title');
    save.mockResolvedValue({ ok: true, course: { ...course, status: 'draft', title: 'Retry this title' } });
    await state.submitCourse();
    confirm.mockClear();
    expect(await TestBed.inject(Router).navigateByUrl('/courses')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('NW-05 lets voluntary logout stay but session expiry always clears private state', async () => {
    state.updateCourseTitle('Unsaved private title');
    state.logout();
    expect(confirm).toHaveBeenCalledOnce();
    expect(state.loginState()).not.toBeNull();
    expect(state.courseDraft().title).toBe('Unsaved private title');
    confirm.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Expired' }, 401)));
    await TestBed.inject(ApiClientService).fetch('/me', { headers: { authorization: 'Bearer isolated-token' } });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/'));
    expect(confirm).not.toHaveBeenCalled();
    expect(state.loginState()).toBeNull();
    expect(state.courseContent()).toBeNull();
    expect(state.courseDraft().title).toBe('');
  });

  it('NW-04 retains both edited parts after metadata saves and outline saving fails', async () => {
    state.updateCourseTitle('Partially saved title');
    state.updateCourseSectionTitle(0, 'Unsaved outline');
    vi.spyOn(TestBed.inject(CourseService), 'saveCourse').mockResolvedValue({ ok: true, course: { ...course, status: 'draft', title: 'Partially saved title' } });
    vi.spyOn(TestBed.inject(CourseService), 'saveCourseContent').mockResolvedValue({ ok: false, message: 'Outline failed' });
    await state.submitCourse();
    expect(state.courseContentError()).toContain('Outline failed');
    expect(state.courseSaveNotice()).toBe('');
    expect(await TestBed.inject(Router).navigateByUrl('/courses')).toBe(false);
    expect(state.courseDraft().title).toBe('Partially saved title');
    expect(state.courseContent()!.sections[0].title).toBe('Unsaved outline');
  });

  it('NW-03 removes the browser warning listener when the service is destroyed', () => {
    state.updateCourseTitle('Unsaved');
    TestBed.resetTestingModule();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('NW-01 preserves new-course edits when a delayed catalog load finishes', async () => {
    const catalog = deferred<CourseListItem[]>();
    vi.spyOn(TestBed.inject(CourseService), 'listCourses').mockReturnValue(catalog.promise);
    await harness.navigateByUrl('/courses/new');
    state.updateCourseTitle('Keep new draft while loading');
    catalog.resolve([course]);
    await vi.waitFor(() => expect(state.coursesLoading()).toBe(false));
    expect(state.courseDraft().title).toBe('Keep new draft while loading');
    expect(await TestBed.inject(Router).navigateByUrl('/courses')).toBe(false);
  });

  it('NW-01 initializes saved metadata before a slow thumbnail makes the editor editable', async () => {
    await harness.navigateByUrl('/courses');
    await vi.waitFor(() => expect(state.coursesLoading()).toBe(false));
    state.availableCourses.set([]);
    const thumbnail = deferred<void>();
    vi.spyOn(TestBed.inject(CourseService), 'preloadCourseThumbnails').mockReturnValue(thumbnail.promise);
    await harness.navigateByUrl('/courses/other/edit');
    await vi.waitFor(() => expect(state.canUseCourseEditor()).toBe(true));
    expect(state.courseDraft().title).toBe(course.title);
    state.updateCourseTitle('Keep edits during thumbnail load');
    thumbnail.resolve();
    await vi.waitFor(() => expect(state.coursesLoading()).toBe(false));
    expect(state.courseDraft().title).toBe('Keep edits during thumbnail load');
  });

  it('NW-03 does not warn when the only failed part of a partial save is reverted', async () => {
    state.updateCourseTitle('Saved metadata');
    state.updateCourseSectionTitle(0, 'Unsaved outline');
    vi.spyOn(TestBed.inject(CourseService), 'saveCourse').mockResolvedValue({ ok: true, course: { ...course, status: 'draft', title: 'Saved metadata' } });
    vi.spyOn(TestBed.inject(CourseService), 'saveCourseContent').mockResolvedValue({ ok: false, message: 'Outline failed' });
    await state.submitCourse();
    state.updateCourseSectionTitle(0, 'First section');
    expect(await TestBed.inject(Router).navigateByUrl('/courses')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['lesson', 'section'] as const)('NW-03 warns for focused %s text before blur commits it', async (field) => {
    const root = harness.routeNativeElement!;
    if (field === 'lesson') {
      (root.querySelectorAll<HTMLButtonElement>('.builder-component-row button.edit-component-button')[0] ??
        Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Edit')!).click();
    } else {
      root.querySelector<HTMLAnchorElement>('.rename-link')!.click();
    }
    harness.detectChanges();
    const editor = root.querySelector<HTMLElement>(field === 'lesson' ? '.rich-text-editor' : '.builder-section-title')!;
    expect(editor).not.toBeNull();
    editor.focus();
    const original = editor.innerHTML;
    editor.innerHTML = 'Unsaved focused text';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    const departure = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(departure);
    expect(departure.defaultPrevented).toBe(true);
    expect(await TestBed.inject(Router).navigateByUrl('/courses')).toBe(false);
    expect(editor.textContent).toBe('Unsaved focused text');
    editor.innerHTML = original;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    const reverted = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(reverted);
    expect(reverted.defaultPrevented).toBe(false);
  });

  it('NW-03 compares focused text with the current saved lesson after an earlier edit', async () => {
    const root = harness.routeNativeElement!;
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Edit')!.click();
    harness.detectChanges();
    const editor = root.querySelector<HTMLElement>('.rich-text-editor')!;
    editor.innerHTML = '<p>New saved lesson</p>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('blur'));
    harness.detectChanges();
    vi.spyOn(TestBed.inject(CourseService), 'saveCourseContent').mockImplementation(async (_id, sections) => ({ ok: true, content: { ...content, sections } }));
    await state.submitCourse();
    harness.detectChanges();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(['unchanged Markdown', 'cleared text'])('NW-03 distinguishes %s when the focused buffer commits', (behavior) => {
    const document = structuredClone(content);
    document.sections[0].components[0].content = '# Stored Markdown\nSaved paragraph';
    state.courseContent.set(document);
    state.initialCourseContentSnapshot.set(JSON.stringify({ _id: document._id, sections: document.sections }));
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === 'Edit')!.click();
    harness.detectChanges();
    const editor = root.querySelector<HTMLElement>('.rich-text-editor')!;
    if (behavior === 'cleared text') {
      editor.innerHTML = '';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    editor.dispatchEvent(new Event('blur'));
    harness.detectChanges();
    expect(state.courseContent()!.sections[0].components[0].content).toBe(behavior === 'cleared text' ? '' : '# Stored Markdown\nSaved paragraph');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(behavior === 'cleared text');
  });
});

describe('direct learning restoration (DEF-010)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function open(options: { missing?: boolean; catalogError?: boolean; contentError?: boolean; expired?: boolean; unenrolled?: boolean; delayed?: boolean } = {}) {
    localStorage.clear(); sessionStorage.clear();
    const remembered = session('student');
    const restored = { ...remembered, user: { ...remembered.user, enrolledCourseIds: options.unenrolled ? [] : ['course'] } };
    localStorage.setItem('qiEducationSession', JSON.stringify(remembered));
    const me = deferred<Response>(), catalog = deferred<Response>(), lesson = deferred<Response>();
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input)); requests.push(url.pathname + url.search);
      if (url.pathname.endsWith('/me')) return (await me.promise).clone();
      if (url.pathname.endsWith('/courses')) return (await catalog.promise).clone();
      if (url.pathname.endsWith('/content')) return (await lesson.promise).clone();
      throw new Error(`Unexpected isolated request: ${url.pathname}`);
    }));
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const state = TestBed.inject(AppStateService);
    const harness = await RouterTestingHarness.create('/library/course');
    const page = () => { harness.detectChanges(); return harness.routeNativeElement!.textContent!; };
    const finish = async () => {
      me.resolve(options.expired ? json({ message: 'Expired' }, 401) : json(restored));
      catalog.resolve(options.catalogError ? json({ message: 'Catalog unavailable' }, 503) : json(options.missing ? [] : [course]));
      lesson.resolve(options.contentError || options.unenrolled ? json({ message: 'Lesson unavailable' }, 403) : json({ ...content, view: 'learner' }));
      await vi.waitFor(() => { expect(state.isSessionRestoring()).toBe(false); expect(state.coursesLoading()).toBe(false); expect(state.courseContentLoading()).toBe(false); });
      harness.detectChanges();
    };
    if (!options.delayed) await finish();
    return { state, harness, page, requests, me, catalog, lesson, finish };
  }

  it('DL-01 loads an entitled direct URL through deferred restoration without false missing states', async () => {
    const { state, page, requests, me, catalog, lesson } = await open({ delayed: true });
    expect(page()).not.toContain('Course not found');
    expect(state.isSessionRestoring()).toBe(true);
    me.resolve(json(session('student')));
    await vi.waitFor(() => expect(state.isSessionRestoring()).toBe(false));
    expect(page()).not.toContain('Course not found');
    catalog.resolve(json([course]));
    await vi.waitFor(() => expect(state.availableCourses()).toHaveLength(1));
    expect(page()).not.toContain('Course not found');
    lesson.resolve(json({ ...content, view: 'learner' }));
    await vi.waitFor(() => expect(state.coursesLoading()).toBe(false));
    expect(page()).toContain('Private lesson body');
    expect(requests.some(path => path.endsWith('/courses'))).toBe(true);
    expect(requests.filter(path => path.includes('/content')).every(path => !path.includes('author'))).toBe(true);
  });

  it('DL-02 reports genuinely missing metadata after lookup', async () => {
    const { page } = await open({ missing: true });
    expect(page()).toContain('Course not found');
    expect(page()).not.toContain('Private lesson body');
  });

  it.each(['catalogError', 'contentError'] as const)('DL-03 distinguishes %s from a missing course', async (failure) => {
    const { page } = await open({ [failure]: true });
    expect(page()).toContain(failure === 'catalogError' ? 'Catalog unavailable' : 'Lesson unavailable');
    expect(page()).not.toContain('Course not found');
    expect(page()).not.toContain('Private lesson body');
  });

  it('DL-04 clears an expired remembered session and shows login', async () => {
    const { state, harness } = await open({ expired: true });
    await vi.waitFor(() => expect(state.currentPath()).toBe('/'));
    harness.detectChanges();
    expect(state.loginState()).toBeNull();
    expect(localStorage.getItem('qiEducationSession')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('app-login-page')).not.toBeNull();
  });

  it('DL-04 applies restored enrollment instead of remembered enrollment', async () => {
    const { page, state } = await open({ unenrolled: true });
    expect(state.selectedCourseIsEnrolled()).toBe(false);
    expect(page()).not.toContain('Private lesson body');
    expect(page()).toContain('This course is not available in My Learning yet');
  });
});
