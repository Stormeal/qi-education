import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { appConfig } from '../app.config';
import type { CourseContentDocument, CourseListItem, LoginState, QuizQuestion } from '../app.models';
import { CourseEditorPage } from '../pages/course-editor-page/course-editor-page';
import { AppStateService } from './app-state.service';
import { CourseService } from './course.service';

vi.mock('@mux/mux-player', () => ({}));

const course: CourseListItem = { id: 'course', ownerUserId: 'teacher', title: 'Course', description: 'Description',
  level: 'Beginner', teacher: 'Owner', requirements: [], whatYoullLearn: [], audience: '', partOfCareer: '', careerGoals: [],
  status: 'draft', createdAt: '', priceDkk: null, thumbnailAssetId: '', isPremium: false, isBestseller: false,
  rating: 0, ratingCount: 0, category: 'Uncategorized', languages: [] };
const answers = (count: number) => Array.from({ length: count }, (_, index) =>
  ({ id: `a${index}`, text: `Choice ${index}`, description: '', isCorrect: index < 2 }));
const content: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '', sections: [
  { id: 'chapter', title: 'Chapter', components: [{ id: 'quiz', title: 'Quiz', type: 'quiz', content: '', resourceUrl: '', durationMinutes: 2, attachments: [],
    quiz: { passPoints: 1, questions: [{ id: 'q', question: 'Which two?', points: 5, explanation: 'The first two.', answers: answers(5) }] } }] },
], review: { course, version: 3, revisionId: 'revision', liveStatus: null, editable: true, history: [] } };
const login: LoginState = { token: 'isolated-token', user: { id: 'teacher', email: 'teacher@example.test',
  displayName: 'Owner', role: 'teacher', status: 'active', createdAt: '', enrolledCourseIds: [] },
  permissions: { canCreateCourses: true, hasAdminAccess: false } };

describe('US-T013 quiz questions in the editor state', () => {
  let state: AppStateService, harness: RouterTestingHarness;
  const question = (): QuizQuestion => {
    const component = state.courseContent()!.sections[0].components[0];
    if (component.type !== 'quiz') throw new Error('Missing quiz');
    return component.quiz.questions[0];
  };
  beforeEach(async () => {
    localStorage.clear(); sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([course]), { status: 200 })));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await TestBed.configureTestingModule({ providers: appConfig.providers }).compileComponents();
    state = TestBed.inject(AppStateService);
    state.availableCourses.set([course]); state.loginState.set(login);
    vi.spyOn(TestBed.inject(CourseService), 'loadCourseContent').mockResolvedValue(structuredClone(content));
    harness = await RouterTestingHarness.create('/courses/course/edit');
    await vi.waitFor(() => expect(state.courseReview()?.version).toBe(3)); TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('loading keeps five answers, two correct answers and the explanation, and counts the question as 1', () => {
    expect(question().answers.map(answer => answer.id)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4']);
    expect(question().answers.filter(answer => answer.isCorrect)).toHaveLength(2);
    expect(question().explanation).toBe('The first two.');
    expect(question().points).toBe(1);
    expect(state.hasUnsavedCourseChanges()).toBe(false);
  });

  it('adds answers up to six and removes them down to two, through the routed editor', () => {
    const editor = harness.fixture.debugElement.query(By.directive(CourseEditorPage)).componentInstance as CourseEditorPage;
    const edit = (change: Parameters<AppStateService['editCourseComponentQuizQuestion']>[3]) =>
      editor.courseComponentQuizQuestionEdited.emit({ sectionIndex: 0, componentIndex: 0, questionIndex: 0, edit: change });
    edit({ kind: 'add-answer' }); edit({ kind: 'add-answer' });
    expect(question().answers).toHaveLength(6);
    expect(state.hasUnsavedCourseChanges()).toBe(true);
    for (let count = 0; count < 6; count++) edit({ kind: 'remove-answer', answerIndex: 0 });
    expect(question().answers).toHaveLength(2);
    edit({ kind: 'explanation', value: 'Changed.' });
    expect(question().explanation).toBe('Changed.');
  });
});
