import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CourseBuilder } from './course-builder';
import type { CourseContentDocument, QuizQuestion } from '../../app.models';

vi.mock('@mux/mux-player', () => ({}));
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => {
  document.body.classList.remove('builder-modal-open');
  document.documentElement.classList.remove('builder-modal-open');
  document.body.removeAttribute('style');
});

const question = (id: string, text = 'Which answer?', correct = true): QuizQuestion => ({
  id, question: text, points: 2,
  answers: [0, 1, 2, 3].map(index => ({ id: `${id}-${index}`, text: `Choice ${index + 1}`,
    description: '', isCorrect: correct && index === 0 })) as QuizQuestion['answers'],
});
function outline(): CourseContentDocument {
  return { _id: 'course', createdAt: '', updatedAt: '', sections: [
    { id: 'source', title: 'Source chapter', components: [{ id: 'quiz', title: 'Knowledge check', type: 'quiz',
      content: '', resourceUrl: '', durationMinutes: 5, attachments: [],
      quiz: { passPoints: 2, questions: [question('one'), question('two', 'Second question', false)] } }] },
    { id: 'target', title: 'Destination chapter', components: [{ id: 'text', title: 'Reading', type: 'text',
      content: 'Body', resourceUrl: '', durationMinutes: 1, attachments: [] }] },
    { id: 'empty', title: 'Empty chapter', components: [] },
  ] };
}
function setup() {
  const fixture = TestBed.createComponent(CourseBuilder);
  const doc = outline();
  const inputs = { courseContent: doc, courseContentLoading: false, courseContentSaving: false,
    courseSubmitting: false, courseContentError: '', muxUploadComponentId: '', muxUploadError: '',
    muxUploadProgress: {}, attachmentUploadComponentId: '', attachmentUploadProgress: {},
    attachmentUploadStage: {}, attachmentUploadError: '' };
  Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const open = () => { (host.querySelector('.component-row-action') as HTMLButtonElement).click(); fixture.detectChanges(); };
  return { fixture, host, doc, open };
}
describe('US-T011 quiz authoring interactions', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  it('AC01 aligns the added header to the editor top and focuses only the new text field', async () => {
    const { fixture, host, doc, open } = setup(); open();
    const body = host.querySelector('.builder-modal-body') as HTMLElement;
    body.style.maxHeight = '600px';
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(body, 'scrollHeight', { configurable: true, get: () =>
      500 + (parseFloat(host.querySelector<HTMLElement>('.quiz-scroll-space')?.style.height || '') || 0) });
    body.scrollTop = 25;
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ top: 40 } as DOMRect);
    // Model the browser's scroll-range clamp: a requested offset alone is not alignment.
    const scroll = vi.fn((position?: ScrollToOptions | number, y?: number) => {
      const top = typeof position === 'number' ? y || 0 : position?.top || 0;
      body.scrollTop = Math.max(0, Math.min(top, body.scrollHeight - body.clientHeight));
    }); body.scrollTo = scroll;
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
    fixture.componentInstance.courseComponentQuizQuestionAdded.subscribe(() => {
      const next = structuredClone(doc);
      if (next.sections[0].components[0].type !== 'quiz') throw new Error('Missing quiz');
      next.sections[0].components[0].quiz.questions.push(question('three', '', false));
      fixture.componentRef.setInput('courseContent', next); fixture.detectChanges();
      vi.spyOn(host.querySelectorAll('.quiz-question-card')[2], 'getBoundingClientRect')
        .mockReturnValue({ top: 300 } as DOMRect);
    });
    (host.querySelector('.quiz-add-question-button') as HTMLButtonElement).click(); fixture.detectChanges();
    await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelectorAll('.quiz-question-field input')[0]));
    expect(host.querySelectorAll('.quiz-question-body')).toHaveLength(1);
    expect(host.querySelectorAll('.quiz-question-trigger')[2].getAttribute('aria-expanded')).toBe('true');
    expect(scroll).toHaveBeenCalledWith({ top: 285, behavior: 'auto' });
    expect(body.scrollTop).toBe(285);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('AC02/03 exposes summaries, allows all questions to close, and reopens one at a time', () => {
    const { fixture, host, open } = setup(); open();
    const headers = () => [...host.querySelectorAll<HTMLButtonElement>('.quiz-question-trigger')];
    expect(headers()[1].getAttribute('aria-expanded')).toBe('false');
    expect(headers()[1].textContent).toMatch(/Second question.*4 answers.*No correct answer/s);
    headers()[0].click(); fixture.detectChanges();
    expect(host.querySelectorAll('.quiz-question-body')).toHaveLength(0);
    expect(headers()[0].getAttribute('aria-expanded')).toBe('false');
    headers()[1].click(); fixture.detectChanges();
    expect(headers()[1].getAttribute('aria-expanded')).toBe('true');
    expect(headers()[0].getAttribute('aria-expanded')).toBe('false');
  });
  it('AC04 shows existing readiness reasons while a question is collapsed', () => {
    const { fixture, host, doc, open } = setup();
    const quiz = doc.sections[0].components[0]; if (quiz.type !== 'quiz') throw new Error('Missing quiz');
    quiz.quiz.questions[1].question = ' ';
    quiz.quiz.questions[1].answers[2].text = '';
    fixture.componentRef.setInput('courseContent', structuredClone(doc)); fixture.detectChanges(); open();
    const second = host.querySelectorAll('.quiz-question-card')[1];
    expect(second.textContent).toMatch(/Needs attention/);
    expect(second.textContent).toMatch(/Write the question/);
    expect(second.textContent).toMatch(/Fill in every answer/);
    expect(second.textContent).toMatch(/Tick at least one correct answer/);
    expect(second.querySelector('.quiz-question-body')).toBeNull();
  });
  it('AC04 does not mark a complete collapsed question as needing attention', () => {
    const { fixture, host, open } = setup(); open();
    (host.querySelector('.quiz-question-trigger') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(host.querySelector('.quiz-question-card')!.querySelector('.quiz-question-attention')).toBeNull();
    expect(host.querySelector('.quiz-question-card')!.textContent).toContain('1 correct answer');
  });
  it('AC05 labels answer text and explanation fields and connects toggle to its content', () => {
    const { host, open } = setup(); open();
    const trigger = host.querySelector('.quiz-question-trigger')!;
    const body = host.querySelector('.quiz-question-body')!;
    expect(trigger.getAttribute('aria-controls')).toBe(body.id);
    for (const control of host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.quiz-answer-input, .quiz-answer-description')) {
      expect(control.labels?.length || control.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('US-T012 builder move events', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  function drag(host: HTMLElement, target: Element) {
    host.querySelector('.builder-component-row')!.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    target.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
  }
  it('AC01 drags to a position in another chapter with the optional destination field', () => {
    const { fixture, host } = setup(); const moves: unknown[] = [];
    fixture.componentInstance.courseComponentMoved.subscribe(value => moves.push(value));
    drag(host, host.querySelectorAll('.builder-component-row')[1]);
    expect(moves).toEqual([{ sectionIndex: 0, fromIndex: 0, toIndex: 0, toSectionIndex: 1 }]);
  });
  it('AC01 accepts the end of an empty chapter', () => {
    const { fixture, host } = setup(); const moves: unknown[] = [];
    fixture.componentInstance.courseComponentMoved.subscribe(value => moves.push(value));
    const end = host.querySelectorAll('.chapter-drop-end')[2]; expect(end).toBeTruthy();
    drag(host, end);
    expect(moves).toEqual([{ sectionIndex: 0, fromIndex: 0, toIndex: 0, toSectionIndex: 2 }]);
  });
  it('AC01 preserves the legacy payload when dragging within a chapter', () => {
    const { fixture, host, doc } = setup(); const moves: unknown[] = [];
    doc.sections[0].components.push({ ...doc.sections[1].components[0], id: 'other' });
    fixture.componentRef.setInput('courseContent', structuredClone(doc)); fixture.detectChanges();
    fixture.componentInstance.courseComponentMoved.subscribe(value => moves.push(value));
    drag(host, host.querySelectorAll('.builder-component-row')[1]);
    expect(moves).toEqual([{ sectionIndex: 0, fromIndex: 0, toIndex: 1 }]);
  });
  it('AC02 lists only other chapters and moves to the chosen chapter end', () => {
    const { fixture, host } = setup(); const moves: unknown[] = [];
    fixture.componentInstance.courseComponentMoved.subscribe(value => moves.push(value));
    const select = host.querySelector<HTMLSelectElement>('select.lesson-move-select'); expect(select).toBeTruthy();
    expect([...select!.options].map(item => item.textContent)).toEqual(['Move to chapter', '2. Destination chapter', '3. Empty chapter']);
    select!.value = '1'; select!.dispatchEvent(new Event('change'));
    expect(moves).toEqual([{ sectionIndex: 0, fromIndex: 0, toIndex: 1, toSectionIndex: 1 }]);
    expect(select!.value).toBe('');
  });
  it('AC02 restores keyboard focus on the moved lesson in its new chapter', async () => {
    const { fixture, host, doc } = setup();
    fixture.componentInstance.courseComponentMoved.subscribe(move => {
      const next = structuredClone(doc);
      const [lesson] = next.sections[move.sectionIndex].components.splice(move.fromIndex, 1);
      next.sections[move.toSectionIndex!].components.splice(move.toIndex, 0, lesson);
      fixture.componentRef.setInput('courseContent', next); fixture.detectChanges();
    });
    const original = host.querySelector<HTMLSelectElement>('select.lesson-move-select')!;
    original.focus(); original.value = '1'; original.dispatchEvent(new Event('change')); fixture.detectChanges();
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label') || '').toContain('Move Knowledge check'));
    expect(document.activeElement).not.toBe(original);
    expect(host.querySelectorAll('.builder-section')[1].contains(document.activeElement)).toBe(true);
  });
  it.each(['muxUploadComponentId', 'attachmentUploadComponentId', 'courseContentSaving', 'courseSubmitting'])
    ('AC04 guards drag and control moves while %s is active, including after drag start', input => {
      const { fixture, host } = setup(); const moves: unknown[] = [];
      fixture.componentInstance.courseComponentMoved.subscribe(value => moves.push(value));
      host.querySelector('.builder-component-row')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
      fixture.componentRef.setInput(input, input.endsWith('Id') ? 'quiz' : true); fixture.detectChanges();
      host.querySelectorAll('.builder-component-row')[1].dispatchEvent(new Event('drop', { bubbles: true }));
      expect(moves).toEqual([]);
      expect(host.querySelector('.builder-component-row')!.getAttribute('draggable')).toBe('false');
      expect(host.querySelector<HTMLSelectElement>('select.lesson-move-select')!.disabled).toBe(true);
    });
  it('AC04 guards an attempted drop after the builder becomes read-only', () => {
    const { fixture, host } = setup(); const moves: unknown[] = [];
    fixture.componentInstance.courseComponentMoved.subscribe(value => moves.push(value));
    const target = host.querySelectorAll('.builder-component-row')[1];
    host.querySelector('.builder-component-row')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    fixture.componentRef.setInput('readOnly', true);
    target.dispatchEvent(new Event('drop', { bubbles: true }));
    expect(moves).toEqual([]);
  });

describe('US-T013 simple quiz questions', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  const button = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('.quiz-question-body button')].find(item => (item.textContent ?? '').trim() === label);

  it('offers answer rows with a correct box and delete, and no points field', () => {
    const { fixture, host, open } = setup(); open();
    const edits: unknown[] = [];
    fixture.componentInstance.courseComponentQuizQuestionEdited.subscribe(event => edits.push(event.edit));
    expect(host.querySelectorAll('.quiz-question-body .quiz-answer-row')).toHaveLength(4);
    expect(host.querySelector('.quiz-question-body')!.textContent).not.toContain('points');
    button(host, '+ Add answer')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Delete answer 2"]')!.click();
    expect(edits).toEqual([{ kind: 'add-answer' }, { kind: 'remove-answer', answerIndex: 1 }]);
  });

  it('keeps a question between two and six answers', () => {
    const { fixture, host, doc, open } = setup();
    const quiz = doc.sections[0].components[0];
    if (quiz.type !== 'quiz') throw new Error('Missing quiz');
    quiz.quiz.questions[0].answers = quiz.quiz.questions[0].answers.slice(0, 2);
    fixture.componentRef.setInput('courseContent', structuredClone(doc)); fixture.detectChanges(); open();
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Delete answer 1"]')!.disabled).toBe(true);
    quiz.quiz.questions[0].answers = [0, 1, 2, 3, 4, 5].map(index => ({ id: `a${index}`, text: `Choice ${index}`, description: '', isCorrect: index === 0 }));
    fixture.componentRef.setInput('courseContent', structuredClone(doc)); fixture.detectChanges();
    expect(button(host, '+ Add answer')).toBeUndefined();
  });

  it('keeps keyboard focus in the quiz after an answer or a question is deleted', async () => {
    const { fixture, host, doc, open } = setup(); open();
    const quizOf = (content: typeof doc) => { const item = content.sections[0].components[0]; if (item.type !== 'quiz') throw new Error('Missing quiz'); return item.quiz; };
    fixture.componentInstance.courseComponentQuizQuestionEdited.subscribe(event => {
      if (event.edit.kind !== 'remove-answer') return;
      const next = structuredClone(doc); quizOf(next).questions[0].answers.splice(event.edit.answerIndex, 1);
      fixture.componentRef.setInput('courseContent', next); fixture.detectChanges();
    });
    const remove = host.querySelector<HTMLButtonElement>('[aria-label="Delete answer 4"]')!;
    remove.focus(); remove.click();
    // The last row is gone, so focus lands on the new last answer.
    await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelectorAll('.quiz-answer-input')[2]));

    fixture.componentInstance.courseComponentQuizQuestionRemoved.subscribe(event => {
      const next = structuredClone(doc); quizOf(next).questions.splice(event.questionIndex, 1);
      fixture.componentRef.setInput('courseContent', next); fixture.detectChanges();
    });
    const removeQuestion = host.querySelector<HTMLButtonElement>('.quiz-question-remove')!;
    removeQuestion.focus(); removeQuestion.click(); fixture.detectChanges();
    await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector('.quiz-question-trigger[aria-expanded="true"]')));
  });

  it('opens the optional explanation only when asked, or when one is already written', () => {
    const { fixture, host, doc, open } = setup(); open();
    const edits: unknown[] = [];
    fixture.componentInstance.courseComponentQuizQuestionEdited.subscribe(event => edits.push(event.edit));
    expect(host.querySelector('.quiz-explanation')).toBeNull();
    button(host, '+ Add explanation')!.click(); fixture.detectChanges();
    const field = host.querySelector<HTMLTextAreaElement>('.quiz-explanation textarea')!;
    field.value = 'Because.'; field.dispatchEvent(new Event('input')); 
    expect(edits).toEqual([{ kind: 'explanation', value: 'Because.' }]);

    const quiz = doc.sections[0].components[0];
    if (quiz.type !== 'quiz') throw new Error('Missing quiz');
    quiz.quiz.questions[1].explanation = 'Already written.';
    fixture.componentRef.setInput('courseContent', structuredClone(doc)); fixture.detectChanges();
    host.querySelectorAll<HTMLButtonElement>('.quiz-question-trigger')[1].click(); fixture.detectChanges();
    expect(host.querySelector<HTMLTextAreaElement>('.quiz-explanation textarea')!.value).toBe('Already written.');
  });
});
});
