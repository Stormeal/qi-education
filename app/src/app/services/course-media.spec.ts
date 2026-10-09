import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
vi.mock('@mux/mux-player', () => ({}));
const uploader = vi.hoisted(() => ({ abort: vi.fn(), on: vi.fn() }));
vi.mock('@mux/upchunk', () => ({ createUpload: vi.fn() }));
import { createUpload } from '@mux/upchunk';
import { appConfig } from '../app.config';
import { CourseContentDocument, CourseListItem, LoginState } from '../app.models';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';
const course: CourseListItem = { id: 'course', ownerUserId: 'teacher', title: 'Original title', description: 'Original description', level: 'Beginner', teacher: 'Owner', requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '', careerGoals: [], status: 'draft', createdAt: '', priceDkk: null, thumbnailAssetId: '', isPremium: false, isBestseller: false, rating: 0, ratingCount: 0, category: 'Uncategorized', languages: [] };
const content: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 's', title: 'Original section', components: [] }], review: { course, version: 3, revisionId: 'revision', liveStatus: null, editable: true, history: [] } };
const login: LoginState = { token: 'isolated-token', user: { id: 'teacher', email: 'teacher@example.test', displayName: 'Owner', role: 'teacher', status: 'active', createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: true, hasAdminAccess: false } };

describe('US-T006 pending video polling', () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
    // Set per test: some runner versions reset vi.fn implementations in restoreAllMocks.
    vi.mocked(createUpload).mockImplementation(() => uploader as never);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function openPending() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([course]), { status: 200 })));
    await TestBed.configureTestingModule({ providers: appConfig.providers }).compileComponents();
    const state = TestBed.inject(AppStateService), service = TestBed.inject(CourseService);
    state.availableCourses.set([course]); state.loginState.set(login);
    const pending: CourseContentDocument = { ...content, sections: [{ id: 's', title: 'Video', components: [{ id: 'video', title: 'Video', type: 'video', content: '', resourceUrl: '', durationMinutes: 1, attachments: [], mux: { provider: 'mux', uploadId: 'upload', assetId: 'asset', playbackId: '', playbackPolicy: 'public', status: 'processing', durationSeconds: null, thumbnailUrl: '', errorMessage: '', captions: [] } }] }] };
    const load = vi.spyOn(service, 'loadCourseContent').mockResolvedValue(pending);
    vi.useFakeTimers();
    await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseContent()?.sections[0].components[0].type).toBe('video'));
    return { state, load, pending };
  }
  it('VO-03 resumes on reopening and continues beyond one minute, then stops on removal', async () => {
    const { state, load } = await openPending();
    await vi.advanceTimersByTimeAsync(195_000);
    expect(load.mock.calls.length).toBeGreaterThan(13);
    const count = load.mock.calls.length;
    state.courseContent.set(content);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load.mock.calls.length).toBe(count);
  });
  it('VO-03 refreshes ready media without overwriting unsaved teacher text or advancing its revision', async () => {
    const { state, load, pending } = await openPending();
    state.updateCourseSectionTitle(0, 'Unsaved lesson title');
    const ready = structuredClone(pending);
    const video = ready.sections[0].components[0];
    if (video.type !== 'video') throw new Error('Missing video fixture');
    video.mux = { ...video.mux!, status: 'ready', playbackId: 'public-playback' };
    ready.review = { ...ready.review!, version: 4 };
    load.mockResolvedValue(ready);
    await vi.advanceTimersByTimeAsync(15_000);
    const shown = state.courseContent()?.sections[0].components[0];
    expect(shown?.type === 'video' && shown.mux?.status).toBe('ready');
    expect(state.courseContent()?.sections[0].title).toBe('Unsaved lesson title');
    expect(state.courseReview()?.version).toBe(3);
    expect(state.courseSaveConflict()).toBe(true);
  });

  it('VO-03 retries transient read failures and discards a response after navigation', async () => {
    const { state, load, pending } = await openPending();
    load.mockRejectedValueOnce(new Error('Isolated read failure'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load.mock.calls.length).toBe(3);
    let resolve!: (content: CourseContentDocument) => void;
    load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(15_000);
    state.currentPath.set('/courses/course'); state.courseContent.set(content);
    resolve(pending);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.courseContent()).toEqual(content);
    expect(load.mock.calls.length).toBe(4);
  });
  it('VO-03 aborts a stalled upload after ten minutes without progress, enabling removal and re-upload', async () => {
    const { state, pending } = await openPending();
    const service = TestBed.inject(CourseService);
    const empty = structuredClone(pending);
    const video = empty.sections[0].components[0];
    if (video.type !== 'video') throw new Error('Missing video');
    delete video.mux;
    state.courseContent.set(empty);
    vi.spyOn(service, 'saveCourseContent').mockResolvedValue({ ok: true, content: empty });
    const create = vi.spyOn(service, 'createMuxUpload').mockResolvedValue({ ok: true, uploadId: 'upload', uploadUrl: 'https://isolated.test/upload', content: pending });
    const uploading = state.uploadCourseComponentMuxVideo(0, 0, new File(['isolated'], 'video.mp4', { type: 'video/mp4' }));
    await vi.advanceTimersByTimeAsync(0);
    // Report why an upload stopped early before asserting that it is still running.
    expect({ error: state.muxUploadError(), saveError: state.courseContentError(), conflict: state.courseSaveConflict(), draft: !!state.recoverableCourseDraft() })
      .toEqual({ error: '', saveError: '', conflict: false, draft: false });
    expect(state.muxUploadComponentId()).toBe('video');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await uploading;
    expect(uploader.abort).toHaveBeenCalled();
    expect(state.muxUploadError()).toContain('no progress for 10 minutes');
    expect(state.muxUploadComponentId()).toBe('');
    vi.spyOn(service, 'removeMuxVideo').mockResolvedValue({ ok: true, content: empty });
    await state.removeCourseComponentMuxVideo(0, 0);
    const retry = state.uploadCourseComponentMuxVideo(0, 0, new File(['retry'], 'retry.mp4', { type: 'video/mp4' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(create).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10 * 60_000); await retry;
  });

});
