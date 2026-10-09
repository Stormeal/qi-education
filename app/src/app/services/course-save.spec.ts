import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { appConfig } from '../app.config';
import { CourseContentDocument, CourseListItem, LoginState } from '../app.models';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';
import { CourseDraftRecoveryService } from './course-draft-recovery.service';
const course: CourseListItem = { id: 'course', ownerUserId: 'teacher', title: 'Original title', description: 'Original description', level: 'Beginner', teacher: 'Owner', requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '', careerGoals: [], status: 'draft', createdAt: '', priceDkk: null, thumbnailAssetId: '', isPremium: false, isBestseller: false, rating: 0, ratingCount: 0, category: 'Uncategorized', languages: [] };
const content: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 's', title: 'Original section', components: [] }], review: { course, version: 3, revisionId: 'revision', liveStatus: null, editable: true, history: [] } };
const login: LoginState = { token: 'isolated-token', user: { id: 'teacher', email: 'teacher@example.test', displayName: 'Owner', role: 'teacher', status: 'active', createdAt: '', enrolledCourseIds: [] }, permissions: { canCreateCourses: true, hasAdminAccess: false } };
describe('US-T003/005 draft and save behavior', () => {
  let state: AppStateService, service: CourseService;
  beforeEach(async () => {
    localStorage.clear(); sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([course]), { status: 200 })));
    await TestBed.configureTestingModule({ providers: appConfig.providers }).compileComponents();
    state = TestBed.inject(AppStateService); service = TestBed.inject(CourseService);
    state.availableCourses.set([course]); state.loginState.set(login);
    vi.spyOn(service, 'loadCourseContent').mockResolvedValue(structuredClone(content));
    await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseReview()?.version).toBe(3));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('AC02 advances the confirmed metadata revision and retries only failed lessons', async () => {
    state.updateCourseTitle('Saved details'); state.updateCourseSectionTitle(0, 'Unsaved lessons');
    const updated = { ...course, title: 'Saved details' };
    const metadata = vi.spyOn(service, 'saveCourse').mockResolvedValue({ ok: true, course: updated, review: { ...content.review!, course: updated, version: 4 } });
    const lessons = vi.spyOn(service, 'saveCourseContent').mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue({ ok: true, content: { ...content, sections: [{ id: 's', title: 'Unsaved lessons', components: [] }], review: { ...content.review!, course: updated, version: 5 } } });
    await state.submitCourse(); expect(state.courseContentError()).toContain('Details saved');
    expect(state.hasUnsavedCourseChanges()).toBe(true); expect(state.courseReview()?.version).toBe(4);
    await state.submitCourse(); expect(metadata).toHaveBeenCalledTimes(1);
    expect(lessons.mock.calls[1][3]).toMatchObject({ version: 4, revisionId: 'revision' });
    expect(state.hasUnsavedCourseChanges()).toBe(false);
  });
  it('AC01 preserves a conflicting draft until explicit reconciliation against the viewed latest snapshot', async () => {
    state.updateCourseTitle('My local draft');
    vi.spyOn(service, 'saveCourse').mockResolvedValue({ ok: false, message: 'Newer work saved', code: 'AUTHORING_CONFLICT' });
    await state.submitCourse(); expect(state.courseDraft().title).toBe('My local draft'); expect(state.courseSaveConflict()).toBe(true);
    vi.mocked(service.loadCourseContent).mockResolvedValue({ ...content, review: { ...content.review!, version: 4, course: { ...course, title: 'Other editor title' } } });
    await state.compareLatestCourse(); expect(state.latestCourseVersion()?.review?.course.title).toBe('Other editor title');
    expect(state.courseReview()?.version).toBe(3); state.reconcileCourseDraft();
    expect(state.courseReview()?.version).toBe(4); expect(state.courseDraft().title).toBe('My local draft');
    expect(state.hasUnsavedCourseChanges()).toBe(true);
  });
  it('RS-03 preserves local outlines and focused buffers during a newer media refresh', () => {
    state.updateCourseSectionTitle(0, 'Unsaved section'); state.courseEditorBufferDirty.set(true);
    state.applyCourseBackgroundRefresh({ ...content, review: { ...content.review!, version: 4 } });
    expect(state.courseContent()?.sections[0].title).toBe('Unsaved section'); expect(state.courseEditorBufferDirty()).toBe(true);
    expect(state.courseReview()?.version).toBe(3); expect(state.courseSaveConflict()).toBe(true);
  });
  async function reopen(latest = content) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ providers: appConfig.providers }).compileComponents();
    state = TestBed.inject(AppStateService); service = TestBed.inject(CourseService);
    state.availableCourses.set([course]); state.loginState.set(login);
    vi.spyOn(service, 'loadCourseContent').mockResolvedValue(structuredClone(latest));
    await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseReview()).not.toBeNull()); TestBed.tick();
  }
  it('AC03 recovers metadata and focused text after refresh without automatically saving', async () => {
    TestBed.tick();
    state.courseContent.set({ ...content, sections: [{ id: 's', title: 'Original section', components: [{ id: 'text', title: 'Text', type: 'text', content: 'Saved text', resourceUrl: '', durationMinutes: 1, attachments: [] }] }] });
    state.updateCourseTitle('Recovered title'); state.updateFocusedCourseBuffer({ sectionId: 's', componentId: 'text', value: '<p>Focused unsaved text</p>' });
    await vi.waitFor(() => expect(TestBed.inject(CourseDraftRecoveryService).load('teacher', 'course')).not.toBeNull());
    await reopen(); expect(state.courseDraft().title).toBe('Original title'); expect(state.recoverableCourseDraft()).not.toBeNull();
    state.restoreCourseDraft(); expect(state.courseDraft().title).toBe('Recovered title');
    expect(state.courseContent()?.sections[0].components[0].content).toContain('Focused unsaved text'); expect(state.hasUnsavedCourseChanges()).toBe(true);
  });
  it('DR-01 preserves a stale recovered base and requires explicit reconciliation', async () => {
    TestBed.tick(); state.updateCourseTitle('My older draft'); TestBed.tick();
    await reopen({ ...content, review: { ...content.review!, version: 4, course: { ...course, title: 'Newer server title' } } });
    state.restoreCourseDraft(); expect(state.courseDraft().title).toBe('My older draft'); expect(state.courseReview()?.version).toBe(3);
    expect(state.latestCourseVersion()?.review?.course.title).toBe('Newer server title'); expect(state.courseSaveConflict()).toBe(true);
  });
  it('AC03/DR-02 clears a saved or intentionally discarded local draft', async () => {
    TestBed.tick(); state.updateCourseTitle('Recovery draft'); TestBed.tick();
    await reopen(); state.discardRecoverableCourseDraft();
    expect(TestBed.inject(CourseDraftRecoveryService).load('teacher', 'course')).toBeNull();
    state.updateCourseTitle('Successfully saved'); TestBed.tick();
    const saved = { ...course, title: 'Successfully saved' };
    vi.spyOn(service, 'saveCourse').mockResolvedValue({ ok: true, course: saved, review: { ...content.review!, course: saved, version: 4 } });
    await state.submitCourse();
    expect(TestBed.inject(CourseDraftRecoveryService).load('teacher', 'course')).toBeNull();
  });
  it('AC01 ignores a late comparison after the editor account changes', async () => {
    let resolve!: (doc: CourseContentDocument) => void;
    vi.mocked(service.loadCourseContent).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const comparison = state.compareLatestCourse(); state.logout(true); resolve(content); await comparison;
    expect(state.latestCourseVersion()).toBeNull(); expect(state.recoverableCourseDraft()).toBeNull();
  });
  it('AC03 never submits a saved revision while a local recovery decision is pending', async () => {
    TestBed.tick(); state.updateCourseTitle('Pending recovery choice'); TestBed.tick(); await reopen();
    const decision = vi.spyOn(service, 'performReviewAction');
    await state.reviewCourse('submit'); expect(decision).not.toHaveBeenCalled();
    expect(state.courseReviewError()).toContain('Restore or discard'); expect(state.recoverableCourseDraft()).not.toBeNull();
  });
  it('RS-03 holds the outline busy through a delayed media response', async () => {
    state.courseContent.set({ ...content, sections: [{ id: 's', title: 'Section', components: [{ id: 'text', title: 'Lesson', type: 'text', content: 'Body', resourceUrl: '', durationMinutes: 1, attachments: [] }] }] });
    const saved = { ...state.courseContent()!, review: { ...content.review!, version: 4 } };
    vi.spyOn(service, 'saveCourseContent').mockResolvedValue({ ok: true, content: saved });
    let resolve!: (value: Awaited<ReturnType<CourseService['uploadComponentAttachment']>>) => void;
    vi.spyOn(service, 'uploadComponentAttachment').mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const upload = state.uploadCourseComponentAttachment(0, 0, new File(['data'], 'notes.txt', { type: 'text/plain' }), 'marker');
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    expect(state.courseContentSaving()).toBe(true);
    resolve({ ok: false, message: 'Isolated failure' }); await upload;
    expect(state.courseContentSaving()).toBe(false);
  });
  it('US-T009-AC02 refuses an attachment over 4 MB before any upload starts', async () => {
    state.courseContent.set({ ...content, sections: [{ id: 's', title: 'Section', components: [{ id: 'text', title: 'Lesson', type: 'text', content: 'Body', resourceUrl: '', durationMinutes: 1, attachments: [] }] }] });
    const upload = vi.spyOn(service, 'uploadComponentAttachment');
    await state.uploadCourseComponentAttachment(0, 0, new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'slides.pdf', { type: 'application/pdf' }), 'marker');
    expect(state.attachmentUploadError()).toBe('Attachments must be 4 MB or smaller.');
    expect(upload).not.toHaveBeenCalled();
  });
});
