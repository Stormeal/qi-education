import { describe, expect, it } from 'vitest';
import { updateCourseContentSchema } from './courseContent.js';

const contentWithAnswer = (text: string, description: string, explanation = '') => ({
  sections: [{ id: 's', title: 'S', components: [{ id: 'q', title: 'Q', type: 'quiz', quiz: { passPoints: 1, questions: [{
    id: 'q1', question: 'Q?', explanation, answers: [{ id: 'a', text, description, isCorrect: true }, { id: 'b', text: 'No', isCorrect: false }],
  }] } }] }],
});

describe('US-P018-AC04 content limits remain unchanged', () => {
  it.each([50, 51])('accepts at most 50 questions (count %i)', count => {
    const body = contentWithAnswer('Yes', '');
    const quiz = body.sections[0].components[0].quiz;
    quiz.questions = Array.from({ length: count }, (_, i) => ({ ...quiz.questions[0], id: `q${i}` }));
    expect(updateCourseContentSchema.safeParse(body).success).toBe(count <= 50);
  });
  it.each([1, 2, 6, 7])('retains the 2-6 answer limit (count %i)', count => {
    const body = contentWithAnswer('Yes', '');
    body.sections[0].components[0].quiz.questions[0].answers = Array.from({ length: count }, (_, i) => ({
      id: `a${i}`, text: `Answer ${i}`, description: '', isCorrect: i === 0,
    }));
    expect(updateCourseContentSchema.safeParse(body).success).toBe(count >= 2 && count <= 6);
  });
  it.each([50, 51])('accepts at most 50 attachments (count %i)', count => {
    const body = contentWithAnswer('Yes', '');
    Object.assign(body.sections[0].components[0], { attachments: Array.from({ length: count }, (_, i) => ({
      id: `ref${i}`, assetId: `asset${i}`, fileName: 'notes.pdf', contentType: 'application/pdf', sizeBytes: 1, createdAt: '2026-10-25T00:00:00.000Z',
    })) });
    expect(updateCourseContentSchema.safeParse(body).success).toBe(count <= 50);
  });
  it.each([200, 201])('accepts at most 200 lessons per chapter (count %i)', count => {
    const body = { sections: [{ id: 's', title: 'Chapter', components: Array.from({ length: count }, (_, i) => ({ id: `lesson${i}`, title: 'Lesson', type: 'text' })) }] };
    expect(updateCourseContentSchema.safeParse(body).success).toBe(count <= 200);
  });
  it.each([200, 201])('accepts at most 200 chapters (count %i)', count => {
    const body = { sections: Array.from({ length: count }, (_, i) => ({ id: `s${i}`, title: 'Chapter', components: [] })) };
    expect(updateCourseContentSchema.safeParse(body).success).toBe(count <= 200);
  });
});

describe('US-T015 quiz answer limits', () => {
  it('US-P018-AC04 defaults an omitted points field to one', () => {
    const parsed = updateCourseContentSchema.parse(contentWithAnswer('Yes', ''));
    const component = parsed.sections[0].components[0];
    expect(component.type === 'quiz' && component.quiz.questions[0].points).toBe(1);
  });
  it.each([undefined, null, 0, 5, '5', false, {}, []])('US-P018-AC04 retains legacy points normalization for %j', points => {
    const body = contentWithAnswer('Yes', '');
    Object.assign(body.sections[0].components[0].quiz.questions[0], { points });
    const component = updateCourseContentSchema.parse(body).sections[0].components[0];
    expect(component.type === 'quiz' && component.quiz.questions[0].points).toBe(1);
  });
  it('US-T015-AC06 keeps long imported answers and feedback whole', () => {
    const parsed = updateCourseContentSchema.parse(contentWithAnswer('a'.repeat(600), 'f'.repeat(1500)));
    const component = parsed.sections[0].components[0];
    expect(component.type === 'quiz' && component.quiz.questions[0].answers[0])
      .toMatchObject({ text: 'a'.repeat(600), description: 'f'.repeat(1500) });
  });

  it('US-T015-AC06 keeps a long imported explanation whole', () => {
    const parsed = updateCourseContentSchema.parse(contentWithAnswer('a', '', 'e'.repeat(1500)));
    const component = parsed.sections[0].components[0];
    expect(component.type === 'quiz' && component.quiz.questions[0].explanation).toBe('e'.repeat(1500));
    expect(updateCourseContentSchema.safeParse(contentWithAnswer('a', '', 'e'.repeat(1501))).success).toBe(false);
  });

  it('still rejects answers over 600 and feedback over 1,500 characters', () => {
    expect(updateCourseContentSchema.safeParse(contentWithAnswer('a'.repeat(601), '')).success).toBe(false);
    expect(updateCourseContentSchema.safeParse(contentWithAnswer('a', 'f'.repeat(1501))).success).toBe(false);
  });
});
