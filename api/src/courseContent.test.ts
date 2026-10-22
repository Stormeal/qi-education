import { describe, expect, it } from 'vitest';
import { updateCourseContentSchema } from './courseContent.js';

const contentWithAnswer = (text: string, description: string, explanation = '') => ({
  sections: [{ id: 's', title: 'S', components: [{ id: 'q', title: 'Q', type: 'quiz', quiz: { passPoints: 1, questions: [{
    id: 'q1', question: 'Q?', explanation, answers: [{ id: 'a', text, description, isCorrect: true }, { id: 'b', text: 'No', isCorrect: false }],
  }] } }] }],
});

describe('US-T015 quiz answer limits', () => {
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
