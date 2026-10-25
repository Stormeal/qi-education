import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { appConfig } from '../app.config';
import type { CourseComponentAttachment, CourseContentDocument, CourseListItem, LoginState, QuizQuestion } from '../app.models';
import { attachmentProblem } from '../utils/attachment-rules';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';

vi.mock('@mux/mux-player', () => ({}));

const course: CourseListItem = { id: 'course', ownerUserId: 'teacher', title: 'Course', description: 'Description',
  level: 'Beginner', teacher: 'Owner', requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '', careerGoals: [],
  status: 'draft', createdAt: '', priceDkk: null, thumbnailAssetId: '', isPremium: false, isBestseller: false,
  rating: 0, ratingCount: 0, category: 'Uncategorized', languages: [] };
const attachment: CourseComponentAttachment = { id: 'att', assetId: 'asset-1', fileName: 'diagram.png', contentType: 'image/png', sizeBytes: 10, createdAt: '' };
function content(image: QuizQuestion['image'] = null, attachments: CourseComponentAttachment[] = []): CourseContentDocument {
  return { _id: 'course', createdAt: '', updatedAt: '', sections: [
    { id: 'chapter', title: 'Chapter', components: [{ id: 'quiz', title: 'Quiz', type: 'quiz', content: '', resourceUrl: '', durationMinutes: 2, attachments,
      quiz: { passPoints: 1, questions: [{ id: 'q', question: 'What does the diagram show?', points: 1, explanation: '', image, answers: [
        { id: 'a0', text: 'A', description: '', isCorrect: true }, { id: 'a1', text: 'B', description: '', isCorrect: false }] }] } }] },
  ], review: { course, version: 3, revisionId: 'revision', liveStatus: null, editable: true, history: [] } };
}
const login: LoginState = { token: 'isolated-token', user: { id: 'teacher', email: 'teacher@example.test',
  displayName: 'Owner', role: 'teacher', status: 'active', createdAt: '', enrolledCourseIds: [] },
  permissions: { canCreateCourses: true, hasAdminAccess: false } };
const png = () => new File(['x'], 'diagram.png', { type: 'image/png' });

describe('US-T014 question image in the editor state', () => {
  let state: AppStateService, service: CourseService;
  const question = (): QuizQuestion => {
    const component = state.courseContent()!.sections[0].components[0];
    if (component.type !== 'quiz') throw new Error('Missing quiz');
    return component.quiz.questions[0];
  };
  async function open(initial: CourseContentDocument): Promise<void> {
    localStorage.clear(); sessionStorage.clear();
    // Every request stays in the test, including the image download.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([course]), { status: 200 })));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await TestBed.configureTestingModule({ providers: appConfig.providers }).compileComponents();
    state = TestBed.inject(AppStateService); service = TestBed.inject(CourseService);
    vi.spyOn(service, 'loadQuizImages').mockImplementation(() => {});
    state.availableCourses.set([course]); state.loginState.set(login);
    vi.spyOn(service, 'loadCourseContent').mockResolvedValue(structuredClone(initial));
    await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseReview()?.version).toBe(3)); TestBed.tick();
  }
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('AC01 uploads the file to the quiz lesson, points the question at it and saves at once', async () => {
    await open(content());
    const upload = vi.spyOn(service, 'uploadComponentAttachment').mockResolvedValue({ ok: true, attachment, content: content(null, [attachment]) });
    const save = vi.spyOn(service, 'saveCourseContent').mockImplementation(async (_id, sections) =>
      ({ ok: true, content: { ...content(), sections: structuredClone(sections) } }));
    await state.uploadCourseComponentAttachment(0, 0, png(), 'quiz-image', 'q');
    expect(upload.mock.calls[0].slice(0, 4)).toEqual(['course', 'chapter', 'quiz', expect.any(File)]);
    const saved = save.mock.calls.at(-1)![1][0].components[0];
    expect(saved.type === 'quiz' && saved.quiz.questions[0].image).toEqual({ assetId: 'asset-1', alt: '' });
    expect(question().image).toEqual({ assetId: 'asset-1', alt: '' });
    expect(question().answers).toHaveLength(2);
    expect(state.hasUnsavedCourseChanges()).toBe(false);
    expect(state.attachmentUploadError()).toBe('');
  });

  it('AC01 refuses a file that is not an image before anything is sent', async () => {
    await open(content());
    const upload = vi.spyOn(service, 'uploadComponentAttachment');
    await state.uploadCourseComponentAttachment(0, 0, new File(['x'], 'notes.pdf', { type: 'application/pdf' }), 'quiz-image', 'q');
    expect(upload).not.toHaveBeenCalled();
    expect(state.attachmentUploadError()).toBe('A question image must be a JPEG, PNG or WebP file.');
    expect(attachmentProblem('quiz', png())).toBe('');
  });

  it('US-P018-AC04 refuses a 51st file in one lesson before anything is sent', async () => {
    const full = Array.from({ length: 50 }, (_, index) => ({ ...attachment, id: `att-${index}`, assetId: `asset-${index}` }));
    await open(content(null, full));
    const upload = vi.spyOn(service, 'uploadComponentAttachment');
    await state.uploadCourseComponentAttachment(0, 0, png(), 'quiz-image', 'q');
    expect(upload).not.toHaveBeenCalled();
    expect(state.attachmentUploadError()).toBe('A lesson holds at most 50 files. Remove one to add another.');
  });

  it('AC01 edits the description of the image', async () => {
    await open(content({ assetId: 'asset-1', alt: '' }, [attachment]));
    state.editCourseComponentQuizQuestion(0, 0, 0, { kind: 'image-alt', value: 'A test pyramid' });
    expect(question().image).toEqual({ assetId: 'asset-1', alt: 'A test pyramid' });
    expect(state.hasUnsavedCourseChanges()).toBe(true);
  });

  it('AC01 ignores a description for a question without an image', async () => {
    await open(content());
    state.editCourseComponentQuizQuestion(0, 0, 0, { kind: 'image-alt', value: 'ignored' });
    expect(question().image ?? null).toBeNull();
  });

  it('AC02 removing the image deletes the file and keeps the question and its answers', async () => {
    await open(content({ assetId: 'asset-1', alt: 'A test pyramid' }, [attachment]));
    const savedBeforeDelete: unknown[] = [];
    vi.spyOn(service, 'saveCourseContent').mockImplementation(async (_id, sections) => {
      const quiz = sections[0].components[0];
      savedBeforeDelete.push(quiz.type === 'quiz' ? quiz.quiz.questions[0].image : 'not a quiz');
      return { ok: true, content: { ...content(), sections: structuredClone(sections) } };
    });
    const remove = vi.spyOn(service, 'removeComponentAttachment').mockResolvedValue({ ok: true, content: content() });
    await state.removeQuizQuestionImage(0, 0, 0);
    // The reference is saved as cleared before the file is deleted, so a failed delete never leaves a broken image.
    expect(savedBeforeDelete[0]).toBeUndefined();
    expect(remove.mock.calls[0].slice(0, 4)).toEqual(['course', 'chapter', 'quiz', 'asset-1']);
    expect(question().image ?? null).toBeNull();
    expect(question().question).toBe('What does the diagram show?');
    expect(question().answers).toHaveLength(2);
  });
});
