import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CourseContentDocument } from '../../app.models';
import { CourseService } from '../../services/course.service';
import { CourseViewPage } from './course-view-page';

const content: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 's', title: 'Quiz', components: [{
  id: 'quiz', title: 'Assessment', type: 'quiz', durationMinutes: 1, content: '', resourceUrl: '', attachments: [],
  quiz: { passPoints: 1, questions: [{ id: 'q', question: 'Which answer?', points: 1, answers: [
    { id: 'a', text: 'First', description: '', isCorrect: true },
    { id: 'b', text: 'Second', description: '', isCorrect: false },
    { id: 'c', text: 'Third', description: '', isCorrect: false },
    { id: 'd', text: 'Fourth', description: '', isCorrect: false },
  ] }] },
}] }] };

describe('trusted quiz feedback (DEF-003)', () => {
  const gradeQuiz = vi.fn();
  beforeEach(async () => {
    localStorage.clear();
    gradeQuiz.mockReset();
    await TestBed.configureTestingModule({ imports: [CourseViewPage], providers: [provideRouter([]),
      { provide: CourseService, useValue: { gradeQuiz, thumbnailUrl: () => '' } },
    ] }).compileComponents();
  });

  function setup(document = content) {
    const fixture = TestBed.createComponent(CourseViewPage);
    const inputs = { appVersion: 'test', currentYear: 2026, student: { name: 'Learner', initials: 'L', role: 'Student' },
      authToken: 'session', userEmail: 'learner@example.test', userRoleLabel: 'Student', canAccessAdmin: false, canEditCourse: false,
      course: { id: 'course', title: 'Quiz course', status: 'published', priceDkk: null, requirements: [], whatYoullLearn: [], careerGoals: [],
        thumbnailAssetId: '', category: 'Uncategorized', languages: [] },
      coursesLoading: false, coursesError: '', courseContent: document, courseContentLoading: false, courseContentError: '',
      priceSaving: false, priceSaveNotice: '', priceSaveNoticeError: false, catalogSaving: false, catalogSaveNotice: '', catalogSaveNoticeError: false,
      viewMode: 'learning', isEnrolled: true, enrollmentSubmitting: false, enrollmentError: '', isFeedbackOpen: false,
      feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '', feedbackSubmitting: false, feedbackError: '', feedbackOptions: [],
    };
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const body = fixture.nativeElement as HTMLElement;
    const button = (label: string) => [...body.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)!;
    const choose = () => { (body.querySelector('input[type=radio]') as HTMLInputElement).click(); fixture.detectChanges(); };
    return { fixture, body, button, choose };
  }

  it('uses the server score even when a client answer flag says correct', async () => {
    gradeQuiz.mockResolvedValue({ score: 0, totalPoints: 1, passPoints: 1, passed: false,
      feedback: [{ questionId: 'q', answerId: 'a', correct: false, description: 'Server explanation' }] });
    const { fixture, body, button, choose } = setup();
    choose(); button('Submit answer').click(); await fixture.whenStable(); fixture.detectChanges();
    expect(gradeQuiz).toHaveBeenCalledWith('course', 's', 'quiz', [{ questionId: 'q', answerId: 'a' }], 'session');
    expect(body.textContent).toContain('Server explanation');
    button('Finish quiz').click(); await fixture.whenStable(); fixture.detectChanges();
    expect(body.textContent).toContain('Score: 0 / 1');
    expect(body.textContent).toContain('Try again');
    expect(localStorage.getItem('qi-education:course-progress:learner@example.test:course') ?? '').not.toContain('quiz');
  });

  it('keeps an answer available for retry when scoring fails', async () => {
    gradeQuiz.mockRejectedValueOnce(new Error('Unable to score this answer.'));
    const { fixture, body, button, choose } = setup();
    choose(); button('Submit answer').click(); await fixture.whenStable(); fixture.detectChanges();
    expect(body.textContent).toContain('Unable to score this answer.');
    expect(button('Submit answer').disabled).toBe(false);
    gradeQuiz.mockResolvedValue({ score: 1, totalPoints: 1, passPoints: 1, passed: true,
      feedback: [{ questionId: 'q', answerId: 'a', correct: true, description: 'Correct' }] });
    button('Submit answer').click(); await fixture.whenStable(); fixture.detectChanges();
    button('Finish quiz').click(); await fixture.whenStable(); fixture.detectChanges();
    expect(body.textContent).toContain('Score: 1 / 1');
    expect(body.querySelector('.learning-complete-badge')).not.toBeNull();
  });

  it('LP-05 final question position and skipped answers do not complete a multi-question quiz', async () => {
    const document = structuredClone(content);
    const component = document.sections[0].components[0];
    if (component.type !== 'quiz') throw new Error('Expected quiz fixture');
    const secondQuestion = structuredClone(component.quiz.questions[0]);
    secondQuestion.id = 'q2'; secondQuestion.question = 'Second question?';
    secondQuestion.answers.forEach(answer => { answer.id += '2'; });
    component.quiz.questions.push(secondQuestion);
    const { body, fixture, button } = setup(document);
    expect(body.textContent).toContain('Question 1 of 2');
    button('Skip').click(); fixture.detectChanges();
    expect(body.textContent).toContain('Question 2 of 2');
    expect(body.textContent).not.toContain('100% complete');
    expect(body.querySelector('[role=progressbar]')?.getAttribute('aria-valuetext')).toBe('Question 2 of 2');
    expect(body.querySelector('.learning-complete-badge')).toBeNull();
    gradeQuiz.mockResolvedValue({ score: 0, totalPoints: 2, passPoints: 1, passed: false, feedback: [] });
    button('Skip').click(); await fixture.whenStable(); fixture.detectChanges();
    expect(body.textContent).toContain('Try again');
    expect(localStorage.getItem('qi-education:course-progress:learner@example.test:course') ?? '').not.toContain('quiz');
  });
});
