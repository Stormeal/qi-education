import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { appConfig } from '../app.config';
import type { CourseContentDocument, CourseListItem, LoginState } from '../app.models';
import { CourseEditorPage } from '../pages/course-editor-page/course-editor-page';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';
import { CourseDraftRecoveryService } from './course-draft-recovery.service';

// Playback is verified at the API boundary here; the external web component has
// browser layout requirements that jsdom does not implement.
vi.mock('@mux/mux-player', () => ({}));

const course: CourseListItem = { id: 'course', ownerUserId: 'teacher', title: 'Course', description: 'Description',
  level: 'Beginner', teacher: 'Owner', requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '', careerGoals: [],
  status: 'draft', createdAt: '', priceDkk: null, thumbnailAssetId: '', isPremium: false, isBestseller: false,
  rating: 0, ratingCount: 0, category: 'Uncategorized', languages: [] };
const content: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '', sections: [
  { id: 'source', title: 'Source', components: [{ id: 'video', title: 'Video', type: 'video', content: 'Intro',
    resourceUrl: 'https://example.test/video', durationMinutes: 3,
    attachments: [{ id: 'attachment', assetId: 'asset', fileName: 'Notes.pdf', contentType: 'application/pdf', sizeBytes: 10, createdAt: '' }],
    mux: { provider: 'mux', uploadId: 'upload', assetId: 'mux-asset', playbackId: 'playback', playbackPolicy: 'public',
      status: 'ready', durationSeconds: 180, thumbnailUrl: '', errorMessage: '', captions: [] } },
    { id: 'quiz', title: 'Quiz', type: 'quiz', content: 'Which?', resourceUrl: '', durationMinutes: 2, attachments: [],
      quiz: { passPoints: 1, questions: [{ id: 'question', question: 'Which?', points: 1, answers: [
        { id: 'a', text: 'A', description: '', isCorrect: true }, { id: 'b', text: 'B', description: '', isCorrect: false },
        { id: 'c', text: 'C', description: '', isCorrect: false }, { id: 'd', text: 'D', description: '', isCorrect: false },
      ] }] } }] },
  { id: 'target', title: 'Target', components: [{ id: 'text', title: 'Text', type: 'text', content: '<p>Reading</p>',
    resourceUrl: '', durationMinutes: 1, attachments: [] }] },
  { id: 'empty', title: 'Empty', components: [] },
], review: { course, version: 3, revisionId: 'revision', liveStatus: null, editable: true, history: [] } };
const login: LoginState = { token: 'isolated-token', user: { id: 'teacher', email: 'teacher@example.test',
  displayName: 'Owner', role: 'teacher', status: 'active', createdAt: '', enrolledCourseIds: [] },
  permissions: { canCreateCourses: true, hasAdminAccess: false } };

describe('US-T012 state, route and save integration', () => {
  let state: AppStateService, service: CourseService, harness: RouterTestingHarness;
  async function open() {
    await TestBed.configureTestingModule({ providers: appConfig.providers }).compileComponents();
    state = TestBed.inject(AppStateService); service = TestBed.inject(CourseService);
    state.availableCourses.set([course]); state.loginState.set(login);
    vi.spyOn(service, 'loadCourseContent').mockResolvedValue(structuredClone(content));
    harness = await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseReview()?.version).toBe(3)); TestBed.tick();
  }
  const move = (from: number, index: number, to: number, chapter?: number) => state.moveCourseComponent(from, index, to, chapter);
  beforeEach(async () => {
    localStorage.clear(); sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([course]), { status: 200 })));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await open();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('AC03 moves the complete component to an empty chapter even when both indices are zero', () => {
    const before = structuredClone(state.courseContent()!.sections[0].components[0]);
    move(0, 0, 0, 2);
    expect(state.courseContent()!.sections[0].components.map(item => item.id)).toEqual(['quiz']);
    expect(state.courseContent()!.sections[2].components).toEqual([before]);
    expect(state.hasUnsavedCourseChanges()).toBe(true);
    move(0, 0, 1, 2);
    expect(state.courseContent()!.sections[2].components[1]).toEqual(content.sections[0].components[1]);
  });
  it('AC01/03 inserts before a destination lesson and preserves the legacy reorder call', () => {
    move(0, 0, 0, 1);
    expect(state.courseContent()!.sections[1].components.map(item => item.id)).toEqual(['video', 'text']);
    move(1, 0, 1);
    expect(state.courseContent()!.sections[1].components.map(item => item.id)).toEqual(['text', 'video']);
  });
  it('AC02 forwards the destination from the routed editor output to the real state handler', () => {
    const editor = harness.fixture.debugElement.query(By.directive(CourseEditorPage)).componentInstance as CourseEditorPage;
    editor.courseComponentMoved.emit({ sectionIndex: 0, fromIndex: 0, toIndex: 1, toSectionIndex: 1 });
    expect(state.courseContent()!.sections[1].components.map(item => item.id)).toEqual(['text', 'video']);
    expect(state.courseContent()!.sections[0].components.map(item => item.id)).toEqual(['quiz']);
  });
  it.each(['mux', 'attachment', 'read-only', 'saving', 'submitting'])('AC04 refuses a direct move during %s', blocked => {
    if (blocked === 'mux') state.muxUploadComponentId.set('video');
    if (blocked === 'attachment') state.attachmentUploadComponentId.set('video');
    if (blocked === 'read-only') state.courseReview.set({ ...content.review!, editable: false });
    if (blocked === 'saving') state.courseContentSaving.set(true);
    if (blocked === 'submitting') state.courseSubmitting.set(true);
    move(0, 0, 1, 1);
    expect(state.courseContent()!.sections).toEqual(content.sections);
    expect(state.hasUnsavedCourseChanges()).toBe(false);
  });
  it('AC03 rejects invalid move indices without losing or duplicating a lesson', () => {
    for (const args of [[-1, 0, 0, 2], [0, -1, 0, 2], [0, 0, -1, 2], [0, 0, 0, 9], [0, 0, 9, 1], [0, 0.5, 0, 2]]) {
      move(args[0], args[1], args[2], args[3]);
    }
    expect(state.courseContent()!.sections).toEqual(content.sections);
    expect(state.hasUnsavedCourseChanges()).toBe(false);
  });
  it('AC03 saves the moved outline using the existing revision and clears dirty state', async () => {
    move(0, 0, 1, 1);
    const sections = structuredClone(state.courseContent()!.sections);
    const save = vi.spyOn(service, 'saveCourseContent').mockResolvedValue({ ok: true,
      content: { ...content, sections, review: { ...content.review!, version: 4 } } });
    await state.submitCourse();
    expect(save.mock.calls[0][1][1].components.map(item => item.id)).toEqual(['text', 'video']);
    expect(save.mock.calls[0][3]).toMatchObject({ revisionId: 'revision', version: 3 });
    expect(state.hasUnsavedCourseChanges()).toBe(false);
  });
  it('AC03 retains the move through a save conflict and explicit reconciliation', async () => {
    move(0, 0, 1, 1);
    vi.spyOn(service, 'saveCourseContent').mockResolvedValue({ ok: false, message: 'Newer saved outline', code: 'AUTHORING_CONFLICT' });
    await state.submitCourse();
    expect(state.courseSaveConflict()).toBe(true);
    vi.mocked(service.loadCourseContent).mockResolvedValue({ ...content, review: { ...content.review!, version: 4 } });
    await state.compareLatestCourse(); state.reconcileCourseDraft();
    expect(state.courseContent()!.sections[1].components.map(item => item.id)).toEqual(['text', 'video']);
    expect(state.courseReview()?.version).toBe(4);
    expect(state.hasUnsavedCourseChanges()).toBe(true);
  });
  it('AC03 recovers the moved outline after reopening without automatically saving it', async () => {
    move(0, 0, 0, 2); TestBed.tick();
    await vi.waitFor(() => expect(TestBed.inject(CourseDraftRecoveryService).load('teacher', 'course')).not.toBeNull());
    TestBed.resetTestingModule(); await open();
    expect(state.recoverableCourseDraft()).not.toBeNull(); state.restoreCourseDraft();
    expect(state.courseContent()!.sections[2].components.map(item => item.id)).toEqual(['video']);
    expect(state.courseContent()!.sections[2].components[0]).toEqual(content.sections[0].components[0]);
    expect(state.hasUnsavedCourseChanges()).toBe(true);
  });
});
