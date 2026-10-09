import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CourseContentDocument, CourseListItem, LoginState } from '../app.models';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';
import { AuthService } from './auth.service';

const course: CourseListItem = {
  id: 'course', ownerUserId: 'teacher', title: 'Private course', description: 'Private metadata for the owner.',
  teacher: 'Teacher', level: 'Beginner', requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '',
  careerGoals: [], status: 'draft', createdAt: '', priceDkk: null, thumbnailAssetId: '', isPremium: false,
  isBestseller: false, rating: 0, ratingCount: 0, category: 'Uncategorized', languages: [],
};
const attachment = { id: 'attachment', assetId: 'asset', fileName: 'notes.pdf', contentType: 'application/pdf', sizeBytes: 1, createdAt: '' };
const authorContent: CourseContentDocument = { _id: 'course', view: 'author', createdAt: '', updatedAt: '',
  sections: [{ id: 'section', title: 'Private section', components: [
    { id: 'text', title: 'Private body', type: 'text', content: 'Private author content', resourceUrl: '', durationMinutes: 0, attachments: [attachment] },
    { id: 'video', title: 'Private video', type: 'video', content: '', resourceUrl: '', durationMinutes: 0, attachments: [],
      mux: { provider: 'mux', uploadId: 'upload', assetId: 'mux-asset', playbackId: 'playback', playbackPolicy: 'public',
        status: 'ready', durationSeconds: 1, thumbnailUrl: '', errorMessage: '', captions: [] } },
  ] }],
};
function session(id: string, role: 'teacher' | 'student' | 'admin'): LoginState {
  return { token: 'same-test-token', user: { id, role, email: `${id}@example.test`, displayName: id,
    status: 'active', createdAt: '', enrolledCourseIds: [] },
    permissions: { canCreateCourses: role !== 'student', hasAdminAccess: role === 'admin' } };
}
function deferred<T>() {
  let resolve!: (result: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve: (result: T) => resolve(result) };
}

describe('course responses stay within their initiating session/view (DEF-003)', () => {
  let state: AppStateService;
  let service: CourseService;
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    state = TestBed.inject(AppStateService);
    service = TestBed.inject(CourseService);
    state.loginState.set(session('teacher', 'admin'));
    state.availableCourses.set([course]);
    state.currentPath.set('/courses/course/edit');
    state.courseContent.set(structuredClone(authorContent));
    state.loadedCourseContentId.set('course');
    state.courseDraft.set({ ...course, requirements: '', whatYoullLearn: '', careerGoals: '' });
    state.initialCourseDraftSnapshot.set(JSON.stringify(state.courseDraft()));
    state.initialCourseContentSnapshot.set(JSON.stringify({ _id: 'course', sections: authorContent.sections }));
  });
  afterEach(() => vi.restoreAllMocks());

  const methods = ['saveCourse', 'saveCourseContent', 'uploadComponentAttachment', 'removeComponentAttachment',
    'createMuxUpload', 'removeMuxVideo', 'saveCoursePrice', 'saveCourseCatalogMetadata', 'uploadCourseThumbnail', 'enrollCourse'] as const;
  it.each(methods)('discards a late %s response after changing accounts', async (method) => {
    const oldSession = state.loginState()!;
    const result = { ok: true as const, course, content: structuredClone(authorContent), attachment,
      uploadId: 'upload', uploadUrl: 'http://127.0.0.1:1/upload', login: { user: oldSession.user, permissions: oldSession.permissions } };
    const reply = deferred<typeof result | { ok: false; message: string }>();
    vi.spyOn(service, 'saveCourseContent').mockResolvedValue({ ok: true, content: authorContent });
    const transport = vi.spyOn(service, method).mockReturnValue(reply.promise);
    let pending: Promise<void>;
    switch (method) {
      case 'saveCourse': state.courseDraft.update(draft => ({ ...draft, title: 'Changed private title' })); pending = state.submitCourse(); break;
      case 'saveCourseContent': state.initialCourseContentSnapshot.set('changed'); pending = state.submitCourse(); break;
      case 'uploadComponentAttachment': pending = state.uploadCourseComponentAttachment(0, 0, new File(['x'], 'notes.pdf', { type: 'application/pdf' }), 'marker'); break;
      case 'removeComponentAttachment': pending = state.removeCourseComponentAttachment(0, 0, 'asset'); break;
      case 'createMuxUpload': state.courseContent.update(content => ({ ...content!, sections: [{ ...content!.sections[0], components: [{ ...content!.sections[0].components[1], mux: undefined }] }] }));
        state.initialCourseContentSnapshot.set(JSON.stringify({ _id: 'course', sections: state.courseContent()!.sections }));
        pending = state.uploadCourseComponentMuxVideo(0, 0, new File(['x'], 'video.mp4', { type: 'video/mp4' })); break;
      case 'removeMuxVideo': pending = state.removeCourseComponentMuxVideo(0, 1); break;
      case 'saveCoursePrice': pending = state.saveCoursePrice('course', 500); break;
      case 'saveCourseCatalogMetadata': pending = state.saveCourseCatalogMetadata('course', course); break;
      case 'uploadCourseThumbnail': pending = state.uploadCourseThumbnail(new File(['x'], 'image.png', { type: 'image/png' })); break;
      case 'enrollCourse': pending = state.enrollInCourse('course'); break;
    }
    await vi.waitFor(() => expect(transport).toHaveBeenCalled());
    const newSession = session('learner', 'student');
    const safeContent: CourseContentDocument = { _id: 'other-course', view: 'learner', createdAt: '', updatedAt: '', sections: [] };
    state.loginState.set(newSession);
    state.currentPath.set('/library/other-course');
    state.courseContent.set(safeContent);
    state.availableCourses.set([]);
    state.courseDraft.update(draft => ({ ...draft, title: 'New view' }));
    state.courseEnrollmentSubmitting.set(true);
    reply.resolve(method === 'createMuxUpload' ? { ok: false, message: 'Old private failure' } : result);
    await pending;
    expect(state.loginState()).toBe(newSession);
    expect(state.courseContent()).toBe(safeContent);
    expect(state.availableCourses()).toEqual([]);
    expect(state.courseDraft().title).toBe('New view');
    expect(state.muxUploadError()).toBe('');
    expect(state.courseSaveNotice()).toBe('');
    expect(state.coursePriceNotice()).toBe('');
    expect(state.courseCatalogNotice()).toBe('');
    expect(state.courseEnrollmentSubmitting()).toBe(true);
  });

  it('does not apply an author save after navigating to its public preview', async () => {
    const reply = deferred<{ ok: true; content: CourseContentDocument }>();
    vi.spyOn(service, 'saveCourseContent').mockReturnValue(reply.promise);
    state.initialCourseContentSnapshot.set('changed');
    const pending = state.submitCourse();
    const outline: CourseContentDocument = { _id: 'course', view: 'outline', sections: [], createdAt: '', updatedAt: '' };
    state.currentPath.set('/courses/course'); state.courseContent.set(outline);
    reply.resolve({ ok: true, content: authorContent }); await pending;
    expect(state.courseContent()).toBe(outline);
  });

  it('discards an old author load even if the new session has the same token text', async () => {
    const reply = deferred<CourseContentDocument>();
    vi.spyOn(service, 'loadCourseContent').mockReturnValue(reply.promise);
    state.loadedCourseContentId.set(null);
    const pending = (state as unknown as { loadCourseContentWhenNeeded(): Promise<void> }).loadCourseContentWhenNeeded();
    state.loginState.set(session('learner', 'student'));
    const safe: CourseContentDocument = { _id: 'course', view: 'learner', sections: [], createdAt: '', updatedAt: '' };
    state.courseContent.set(safe);
    reply.resolve(authorContent); await pending;
    expect(state.courseContent()).toBe(safe);
  });

  it('restarts an in-flight outline after enrollment updates the current session', async () => {
    const reply = deferred<CourseContentDocument>();
    const outline: CourseContentDocument = { _id: 'course', view: 'outline', sections: [], createdAt: '', updatedAt: '' };
    const load = vi.spyOn(service, 'loadCourseOutline').mockReturnValueOnce(reply.promise).mockResolvedValue(outline);
    state.currentPath.set('/courses/course');
    state.loadedCourseContentId.set(null);
    const initial = (state as unknown as { loadCourseContentWhenNeeded(): Promise<void> }).loadCourseContentWhenNeeded();
    const login = state.loginState()!;
    vi.spyOn(service, 'enrollCourse').mockResolvedValue({ ok: true, login: {
      user: { ...login.user, enrolledCourseIds: ['course'] }, permissions: login.permissions } });
    await state.enrollInCourse('course');
    reply.resolve(outline); await initial;
    await (state as unknown as { loadCourseContentWhenNeeded(): Promise<void> }).loadCourseContentWhenNeeded();
    expect(load).toHaveBeenCalledTimes(2);
    expect(state.courseContent()).toEqual(outline);
    expect(state.courseContentLoading()).toBe(false);
  });

  it('ignores an old transport 401 after changing accounts', async () => {
    const reply = deferred<Response>();
    const fetching = vi.spyOn(window, 'fetch').mockReturnValue(reply.promise);
    state.loadedCourseContentId.set(null);
    const pending = (state as unknown as { loadCourseContentWhenNeeded(): Promise<void> }).loadCourseContentWhenNeeded();
    expect(fetching).toHaveBeenCalled();
    const current = session('learner', 'student');
    state.loginState.set(current);
    reply.resolve(new Response('{}', { status: 401 })); await pending;
    expect(state.loginState()).toBe(current);
    expect(state.loginError()).toBe('');
  });

  it('clears private data for a 401 belonging to the current session', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    state.loadedCourseContentId.set(null);
    await (state as unknown as { loadCourseContentWhenNeeded(): Promise<void> }).loadCourseContentWhenNeeded();
    expect(state.loginState()).toBeNull();
    expect(state.courseContent()).toBeNull();
    expect(state.availableCourses()).toEqual([]);
    expect(state.loginError()).toBe('Please log in again.');
  });

  it.each(['admin', 'student'] as const)('restarts catalog loading for a restored %s without reusing privileged data', async (role) => {
    const remembered = state.loginState()!;
    const authReply = deferred<{ user: LoginState['user']; permissions: LoginState['permissions'] }>();
    const catalogReply = deferred<CourseListItem[]>();
    vi.spyOn(TestBed.inject(AuthService), 'restoreSession').mockReturnValue(authReply.promise);
    const currentCourses = role === 'admin' ? [course] : [];
    const listing = vi.spyOn(service, 'listCourses').mockReturnValueOnce(catalogReply.promise).mockResolvedValue(currentCourses);
    vi.spyOn(service, 'loadCourseContent').mockResolvedValue(authorContent);
    state.availableCourses.set([]);
    state.loadedCourseContentId.set(null);
    const restoring = (state as unknown as { restoreStoredSession(): Promise<void> }).restoreStoredSession();
    const initialLoad = (state as unknown as { loadCoursesWhenNeeded(): Promise<void> }).loadCoursesWhenNeeded();
    const refreshed = session(remembered.user.id, role);
    authReply.resolve({ user: refreshed.user, permissions: refreshed.permissions }); await restoring;
    catalogReply.resolve([course]); await initialLoad;
    await vi.waitFor(() => expect(state.coursesLoading()).toBe(false));
    expect(listing).toHaveBeenCalledTimes(2);
    expect(state.availableCourses()).toEqual(currentCourses);
    expect(state.canUseCourseEditor()).toBe(role === 'admin');
  });
});
