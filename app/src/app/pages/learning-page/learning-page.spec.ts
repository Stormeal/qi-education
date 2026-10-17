import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CourseComponent, CourseContentDocument } from '../../app.models';
import { CourseService } from '../../services/course.service';
import { LessonExtrasService, LessonNote } from '../../services/lesson-extras.service';
import { LearningPage } from './learning-page';

// jsdom cannot run the real Mux player; Mux skips its own registration when the tag already exists.
vi.hoisted(() => {
  if (!customElements.get('mux-player')) customElements.define('mux-player', class extends HTMLElement {});
});

const answers = [
  { id: 'a', text: 'First', description: '', isCorrect: true },
  { id: 'b', text: 'Second', description: '', isCorrect: false },
  { id: 'c', text: 'Third', description: '', isCorrect: false },
  { id: 'd', text: 'Fourth', description: '', isCorrect: false },
];
const base = { durationMinutes: 10, content: '', resourceUrl: '', attachments: [] };
const quizLesson: CourseComponent = { ...base, id: 'quiz', title: 'Assessment', type: 'quiz', durationMinutes: 1,
  quiz: { passPoints: 1, questions: [{ id: 'q', question: 'Which answer?', points: 1, answers }] } };
const quizContent: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '', sections: [{ id: 's', title: 'Quiz', components: [quizLesson] }] };

const attachment = (id: string) => ({ id, assetId: `asset-${id}`, fileName: `${id}.zip`, contentType: 'application/zip', sizeBytes: 2048, createdAt: '' });
const courseContent: CourseContentDocument = { _id: 'course', createdAt: '', updatedAt: '2026-10-03T00:00:00.000Z', sections: [
  { id: 's1', title: 'Getting started', components: [
    { ...base, id: 'video', title: 'Choosing stable locators', type: 'video', content: 'Why roles beat CSS.',
      mux: { provider: 'mux', uploadId: '', assetId: '', playbackId: 'play-1', playbackPolicy: 'public', status: 'ready', durationSeconds: 600,
        thumbnailUrl: '', errorMessage: '', captions: [{ id: 'c', languageCode: 'en', name: 'English', status: 'ready' }] } },
    { ...base, id: 'text', title: 'Locator cheat sheet', type: 'text', content: 'Read this.', attachments: [attachment('one'), attachment('two')] },
  ] },
  { id: 's2', title: 'Practice', components: [
    { ...base, id: 'exercise', title: 'Rewrite the brittle test', type: 'exercise', content: '- Download the starter\n- Replace locators',
      resourceUrl: 'https://shop.example.test', attachments: [attachment('starter')] },
  ] },
] };

const note = (overrides: Partial<LessonNote>): LessonNote => ({ id: 'n1', courseId: 'course', componentId: 'video', text: 'Roles first',
  videoSeconds: 95, createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z', ...overrides });

describe('learning page', () => {
  const gradeQuiz = vi.fn();
  const extras = {
    listNotes: vi.fn(), addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
    sendLessonFeedback: vi.fn(), enrolledLearners: vi.fn(),
  };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    gradeQuiz.mockReset();
    Object.values(extras).forEach((mock) => mock.mockReset());
    extras.listNotes.mockResolvedValue([]);
    extras.enrolledLearners.mockResolvedValue(312);
    extras.sendLessonFeedback.mockResolvedValue(undefined);
    await TestBed.configureTestingModule({ imports: [LearningPage], providers: [provideRouter([]),
      { provide: CourseService, useValue: { gradeQuiz, downloadAttachment: vi.fn(), loadQuizImages: () => {}, quizImageUrls: () => ({ 'asset-1': 'blob:test-image' }) } },
      { provide: LessonExtrasService, useValue: extras },
    ] }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  async function setup(document: CourseContentDocument = courseContent, completed: string[] = []) {
    if (completed.length) localStorage.setItem('qi-education:course-progress:learner@example.test:course', JSON.stringify(completed));
    const fixture = TestBed.createComponent(LearningPage);
    const inputs = { appVersion: 'test', currentYear: 2026, student: { name: 'Learner', initials: 'L', role: 'Student' },
      authToken: 'session', userEmail: 'learner@example.test', userRoleLabel: 'Student', canAccessAdmin: false, canEditCourse: false,
      course: { id: 'course', title: 'Playwright course', description: 'Build a maintainable suite.', level: 'Intermediate', status: 'published',
        priceDkk: null, requirements: [], whatYoullLearn: [], careerGoals: [], thumbnailAssetId: '', category: 'Uncategorized', languages: [],
        rating: 4.8, ratingCount: 120, createdAt: '' },
      coursesLoading: false, coursesError: '', courseContent: document, courseContentLoading: false, courseContentError: '',
      isEnrolled: true, isFeedbackOpen: false, feedbackSubmitted: false, feedbackPage: '', feedbackRating: '', feedbackText: '',
      feedbackSubmitting: false, feedbackError: '', feedbackOptions: [],
    };
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const body = fixture.nativeElement as HTMLElement;
    const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const button = (label: string) => [...body.querySelectorAll<HTMLButtonElement>('button')].find((item) => text(item) === label || item.getAttribute('aria-label') === label)!;
    // Scoring and saving are plain promises that whenStable does not wait for, so let one macrotask pass too.
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); await new Promise((resolve) => setTimeout(resolve)); fixture.detectChanges(); };
    return { fixture, body, button, text, settle };
  }

  describe('quiz lessons (moved from the details page)', () => {
    const choose = (body: HTMLElement) => (body.querySelector('input[type=radio]') as HTMLInputElement).click();

    it('DEF-003 uses the server score even when a client answer flag says correct', async () => {
      gradeQuiz.mockResolvedValue({ score: 0, totalPoints: 1, passPoints: 1, passed: false,
        feedback: [{ questionId: 'q', answerId: 'a', correct: false, description: 'Server explanation' }] });
      const { body, button, settle } = await setup(quizContent);
      choose(body); await settle(); button('Submit answer').click(); await settle();
      expect(gradeQuiz).toHaveBeenCalledWith('course', 's', 'quiz', [{ questionId: 'q', answerIds: ['a'] }], 'session');
      expect(body.textContent).toContain('Server explanation');
      button('Finish quiz').click(); await settle();
      expect(body.textContent).toContain('Score: 0 / 1');
      expect(body.textContent).toContain('Try again');
      expect(localStorage.getItem('qi-education:course-progress:learner@example.test:course') ?? '').not.toContain('quiz');
    });

    it('DEF-003 keeps an answer available for retry when scoring fails', async () => {
      gradeQuiz.mockRejectedValueOnce(new Error('Unable to score this answer.'));
      const { body, button, settle } = await setup(quizContent);
      choose(body); await settle(); button('Submit answer').click(); await settle();
      expect(body.textContent).toContain('Unable to score this answer.');
      expect(button('Submit answer').disabled).toBe(false);
      gradeQuiz.mockResolvedValue({ score: 1, totalPoints: 1, passPoints: 1, passed: true,
        feedback: [{ questionId: 'q', answerId: 'a', correct: true, description: 'Correct' }] });
      button('Submit answer').click(); await settle();
      button('Finish quiz').click(); await settle();
      expect(body.textContent).toContain('Score: 1 / 1');
      expect(body.querySelector('.complete-badge')).not.toBeNull();
    });

    it('LP-05 final question position and skipped answers do not complete a multi-question quiz', async () => {
      const document = structuredClone(quizContent);
      const component = document.sections[0].components[0];
      if (component.type !== 'quiz') throw new Error('Expected quiz fixture');
      const second = structuredClone(component.quiz.questions[0]);
      second.id = 'q2'; second.question = 'Second question?';
      second.answers.forEach((answer) => { answer.id += '2'; });
      component.quiz.questions.push(second);
      const { body, button, settle } = await setup(document);
      expect(body.textContent).toContain('Question 1 of 2');
      button('Skip').click(); await settle();
      expect(body.textContent).toContain('Question 2 of 2');
      expect(body.querySelector('.quiz-card [role=progressbar]')?.getAttribute('aria-valuetext')).toBe('Question 2 of 2');
      expect(body.querySelector('.complete-badge')).toBeNull();
      gradeQuiz.mockResolvedValue({ score: 0, totalPoints: 2, passPoints: 1, passed: false, feedback: [] });
      button('Skip').click(); await settle();
      expect(body.textContent).toContain('Try again');
      expect(localStorage.getItem('qi-education:course-progress:learner@example.test:course') ?? '').not.toContain('quiz');
    });

    it('US-T014 shows no image element without a question image', async () => {
      expect((await setup(quizContent)).body.querySelector('.quiz-image')).toBeNull();
    });

    it('US-T014 renders the question image', async () => {
      const document = structuredClone(quizContent);
      const quiz = document.sections[0].components[0];
      if (quiz.type !== 'quiz') throw new Error('Missing quiz');
      quiz.quiz.questions[0].image = { assetId: 'asset-1', alt: 'A test pyramid' };
      const image = (await setup(document)).body.querySelector<HTMLImageElement>('.quiz-image')!;
      expect(image.getAttribute('src')).toBe('blob:test-image');
      expect(image.alt).toBe('A test pyramid');
    });

    it('US-T013 a question with several correct answers takes ticks and sends them all', async () => {
      const document = structuredClone(quizContent);
      const quiz = document.sections[0].components[0];
      if (quiz.type !== 'quiz') throw new Error('Missing quiz');
      quiz.quiz.questions[0].multiple = true;
      gradeQuiz.mockResolvedValue({ score: 0, totalPoints: 1, passPoints: 1, passed: false,
        feedback: [{ questionId: 'q', answerIds: ['a', 'c'], answerId: 'a', correct: false, explanation: 'Both first and second.', description: '' }] });
      const { body, button, settle } = await setup(document);
      expect(body.textContent).toContain('Select all that apply');
      expect(body.textContent).toContain('1 of 1 correct to pass');
      const boxes = [...body.querySelectorAll<HTMLInputElement>('.quiz-answers input[type=checkbox]')];
      expect(boxes).toHaveLength(4);
      boxes[0].click(); boxes[2].click(); await settle();
      button('Submit answer').click(); await settle();
      expect(gradeQuiz).toHaveBeenCalledWith('course', 's', 'quiz', [{ questionId: 'q', answerIds: ['a', 'c'] }], 'session');
      expect(body.textContent).toContain('Not correct. Every correct answer must be ticked, and nothing else.');
      expect(body.textContent).toContain('Both first and second.');
      // The API does not say which tick was wrong, so no single answer is painted as wrong.
      expect(body.querySelector('.quiz-answer.is-incorrect')).toBeNull();
    });
  });

  it('US-L016-AC01 leads the sidebar with overall and per-section progress', async () => {
    const { body, text } = await setup(courseContent, ['video']);
    const head = text(body.querySelector('.curriculum-head'));
    expect(head).toContain('33%');
    expect(head).toContain('1 of 3 lessons complete');
    expect(head).toContain('20 min left');
    const sections = [...body.querySelectorAll('.section-head small')].map(text);
    expect(sections).toEqual(['1 of 2 complete, 20 min', '0 of 1 complete, 10 min']);
  });

  it('US-L016-AC02 Previous and Next move through lessons across sections', async () => {
    const { body, button, text, settle } = await setup();
    expect(text(body.querySelector('h1'))).toBe('Choosing stable locators');
    expect(button('Previous').disabled).toBe(true);
    button('Next').click(); await settle();
    button('Next').click(); await settle();
    expect(text(body.querySelector('h1'))).toBe('Rewrite the brittle test');
    expect(text(body.querySelector('.lesson-position'))).toBe('Section 2, Practice. Lesson 1 of 1');
    expect(button('Next').disabled).toBe(true);
    button('Previous').click(); await settle();
    expect(text(body.querySelector('h1'))).toBe('Locator cheat sheet');
  });

  it('US-L016-AC03 completes a video once its position passes 90 percent', async () => {
    const { body, fixture, settle } = await setup();
    const player = body.querySelector('mux-player') as HTMLElement;
    Object.defineProperty(player, 'duration', { value: 600, configurable: true });
    Object.defineProperty(player, 'currentTime', { value: 530, configurable: true, writable: true });
    player.dispatchEvent(new Event('timeupdate')); await settle();
    expect(body.querySelector('.lesson-item.is-done')).toBeNull();
    Object.defineProperty(player, 'currentTime', { value: 541, configurable: true, writable: true });
    player.dispatchEvent(new Event('timeupdate')); await settle();
    expect(body.querySelectorAll('.lesson-item.is-done')).toHaveLength(1);
    expect(body.querySelector('.up-next')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('1 of 3 lessons complete');
  });

  it('US-L016-AC04 starts the next lesson after 5 seconds unless cancelled', async () => {
    const first = await setup(courseContent, ['video']);
    vi.useFakeTimers();
    first.button('Mark complete').click(); first.fixture.detectChanges();
    expect(first.text(first.body.querySelector('.up-next'))).toContain('Up next in 5 seconds');
    vi.advanceTimersByTime(5000); first.fixture.detectChanges();
    expect(first.text(first.body.querySelector('h1'))).toBe('Rewrite the brittle test');

    first.button('Previous').click(); first.fixture.detectChanges();
    expect(first.body.querySelector('.complete-badge')).not.toBeNull();
    first.fixture.componentInstance['completeActiveLesson']();
    first.fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); first.fixture.detectChanges();
    vi.advanceTimersByTime(6000); first.fixture.detectChanges();
    expect(first.body.querySelector('.up-next')).toBeNull();
    expect(first.text(first.body.querySelector('h1'))).toBe('Locator cheat sheet');
  });

  it('US-L016-AC05 adds a note at the video time, jumps to it, and opens notes of other lessons', async () => {
    extras.listNotes.mockResolvedValue([note({ id: 'other', componentId: 'text', text: 'Cheat sheet tip', videoSeconds: null })]);
    extras.addNote.mockImplementation(async (_course: string, input: { componentId: string; text: string; videoSeconds: number | null }) =>
      note({ id: 'n2', ...input }));
    const { body, button, text, settle } = await setup();
    const player = body.querySelector('mux-player') as HTMLElement & { currentTime: number };
    Object.defineProperty(player, 'currentTime', { value: 754.4, configurable: true, writable: true });
    player.dispatchEvent(new Event('timeupdate')); await settle();
    expect(text(button('Add note at 12:34'))).toBe('Add note at 12:34');
    button('Add note at 12:34').click(); await settle();
    const textarea = body.querySelector<HTMLTextAreaElement>('.note-form textarea')!;
    textarea.value = 'Prefer getByRole'; textarea.dispatchEvent(new Event('input')); await settle();
    button('Save note').click(); await settle();
    expect(extras.addNote).toHaveBeenCalledWith('course', { componentId: 'video', text: 'Prefer getByRole', videoSeconds: 754 }, 'session');
    const first = body.querySelector('.note')!;
    expect(text(first.querySelector('.note-meta'))).toBe('12:34 This lesson');
    expect(text(first.querySelector('.note-text'))).toBe('Prefer getByRole');
    player.currentTime = 0;
    button('Play from 12:34').click();
    expect(player.currentTime).toBe(754);
    button('Locator cheat sheet').click(); await settle();
    expect(text(body.querySelector('h1'))).toBe('Locator cheat sheet');
  });

  it('US-L016-AC05 edits and deletes a note, and shows a failed load', async () => {
    extras.listNotes.mockResolvedValue([note({})]);
    extras.updateNote.mockResolvedValue(note({ text: 'Roles always' }));
    extras.deleteNote.mockResolvedValue(undefined);
    const { body, button, text, settle } = await setup();
    button('Notes 1').click(); await settle();
    button('Edit').click(); await settle();
    const editor = body.querySelector<HTMLTextAreaElement>('.note textarea')!;
    editor.value = 'Roles always'; editor.dispatchEvent(new Event('input')); await settle();
    button('Save').click(); await settle();
    expect(extras.updateNote).toHaveBeenCalledWith('course', 'n1', 'Roles always', 'session');
    expect(text(body.querySelector('.note-text'))).toBe('Roles always');
    button('Delete').click(); await settle();
    expect(extras.deleteNote).toHaveBeenCalledWith('course', 'n1', 'session');
    expect(body.querySelector('.note')).toBeNull();
  });

  it('US-L016-AC05 keeps the lesson usable when notes cannot load', async () => {
    extras.listNotes.mockRejectedValue(new Error('Notes are unavailable right now.'));
    const { body, button, settle } = await setup();
    button('Notes 0').click(); await settle();
    expect(body.querySelector('[role=alert]')?.textContent).toContain('Notes are unavailable right now.');
    expect(body.querySelector('mux-player')).not.toBeNull();
  });

  it('US-L016-AC06 sends a rating once and a problem report with its category', async () => {
    const { body, button, settle } = await setup();
    button('Yes, this lesson was helpful').click(); await settle();
    expect(extras.sendLessonFeedback).toHaveBeenCalledWith('course', { componentId: 'video', kind: 'helpful' }, 'session');
    expect(body.textContent).toContain('Thanks for rating this lesson.');
    expect(button('No, this lesson was not helpful')).toBeUndefined();

    button('Report a problem').click(); await settle();
    button('Send report').click(); await settle();
    expect(body.textContent).toContain('Choose what kind of problem it is.');
    [...body.querySelectorAll<HTMLInputElement>('input[name=problem-category]')][0].click(); await settle();
    const details = body.querySelector<HTMLTextAreaElement>('.problem-form textarea')!;
    details.value = 'Freezes at 3:10'; details.dispatchEvent(new Event('input')); await settle();
    button('Send report').click(); await settle();
    expect(extras.sendLessonFeedback).toHaveBeenLastCalledWith('course',
      { componentId: 'video', kind: 'problem', category: 'video', message: 'Freezes at 3:10' }, 'session');
    expect(body.querySelector('.problem-form')).toBeNull();
    expect(body.textContent).toContain('Thanks, your report was sent to the course team.');
  });

  describe('US-L016-AC09 keyboard focus stays on the page when the focused control goes away', () => {
    const focused = () => document.activeElement as HTMLElement;

    it('keeps the note field focused after saving a note', async () => {
      extras.addNote.mockImplementation(async (_course: string, input: { componentId: string; text: string; videoSeconds: number | null }) =>
        note({ id: 'n2', ...input }));
      const { body, button, settle } = await setup();
      button('Notes 0').click(); await settle();
      const textarea = body.querySelector<HTMLTextAreaElement>('.note-form textarea')!;
      textarea.value = 'Roles first'; textarea.dispatchEvent(new Event('input')); await settle();
      const save = button('Save note'); save.focus(); save.click(); await settle();
      expect(focused()).toBe(body.querySelector('.note-form textarea'));
    });

    it('moves focus to the thanks message after rating', async () => {
      const { body, button, settle } = await setup();
      const up = button('Yes, this lesson was helpful'); up.focus(); up.click(); await settle();
      expect(focused()).toBe(body.querySelector('#rating-thanks'));
    });

    it('returns focus to "Report a problem" after sending or cancelling the form', async () => {
      const { body, button, settle } = await setup();
      button('Report a problem').click(); await settle();
      const cancel = button('Cancel'); cancel.focus(); cancel.click(); await settle();
      expect(focused()).toBe(body.querySelector('#problem-toggle'));
      button('Report a problem').click(); await settle();
      body.querySelector<HTMLInputElement>('input[name=problem-category]')!.click(); await settle();
      const send = button('Send report'); send.focus(); send.click(); await settle();
      expect(focused()).toBe(body.querySelector('#problem-toggle'));
    });

    it('focuses "Start now" after Mark complete, and the lesson title after Stay here', async () => {
      const { body, button, settle } = await setup(courseContent, ['video']);
      const complete = button('Mark complete'); complete.focus(); complete.click(); await settle();
      expect(focused()).toBe(button('Start now'));
      button('Stay here').click(); await settle();
      expect(focused()).toBe(body.querySelector('#lesson-title'));
    });
  });

  it('US-L016-AC07 lists lesson files and shows course facts without a rating', async () => {
    const { body, button, text, settle } = await setup();
    const facts = [...body.querySelectorAll('.course-facts > div')].map((fact) => `${text(fact.querySelector('dt'))}: ${text(fact.querySelector('dd'))}`);
    expect(facts).toEqual(['Length: 30 min', 'Lessons: 3', 'Level: Intermediate', 'Enrolled: 312 learners', 'Updated: 3 Oct 2026', 'Captions: English']);
    button('Next').click(); await settle();
    expect(text(button('Lesson files 2'))).toBe('Lesson files 2');
    button('Lesson files 2').click(); await settle();
    const tabPanel = body.querySelector('[role=tabpanel]')!;
    expect([...tabPanel.querySelectorAll('.file-name')].map(text)).toEqual(['one.zip', 'two.zip']);
  });

  it('US-L016-AC08 shows an exercise with its steps, files, link and completion check', async () => {
    const { body, button, text, settle } = await setup(courseContent, ['video', 'text']);
    expect(text(body.querySelector('h1'))).toBe('Rewrite the brittle test');
    expect([...body.querySelectorAll('.reading-card li')].map(text)).toContain('Download the starter');
    expect(text(body.querySelector('.reading-card .file-list'))).toContain('starter.zip');
    expect(body.querySelector<HTMLAnchorElement>('.reading-card a.file-row')?.href).toBe('https://shop.example.test/');
    const check = body.querySelector<HTMLInputElement>('.exercise-check input')!;
    check.click(); await settle();
    expect(check.disabled).toBe(true);
    expect(text(body.querySelector('.curriculum-head'))).toContain('3 of 3 lessons complete');
    expect(button('Start now')).toBeUndefined();
  });
});
