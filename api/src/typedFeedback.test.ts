import { describe, expect, it } from 'vitest';
import { createFeedbackSchema, feedbackType } from './feedback.js';

describe('US-A006 typed feedback contract', () => {
  const base = { page: 'Courses', summary: '  Search loses my filter  ', message: '  After searching the category resets.  ' };
  it.each(['feedback', 'defect', 'change-request'] as const)('AC01-03 accepts %s without a forced rating', type => {
    expect(createFeedbackSchema.parse({ ...base, type })).toMatchObject({ type,
      summary: 'Search loses my filter', message: 'After searching the category resets.' });
  });
  it('AC02 preserves defect reproduction, expected behavior and safe internal path', () => {
    expect(createFeedbackSchema.parse({ ...base, type: 'defect', reproductionSteps: 'Search, then filter',
      expectedBehavior: 'Keep the category', path: '/courses' })).toMatchObject({ reproductionSteps: 'Search, then filter', expectedBehavior: 'Keep the category', path: '/courses' });
  });
  it.each([
    { summary: '' }, { message: '   ' }, { summary: 'x'.repeat(121) }, { message: 'x'.repeat(2001) },
    { expectedBehavior: 'x'.repeat(2001) }, { path: 'https://example.test/courses' }, { path: '//example.test' },
    { path: '/courses?token=secret' }, { path: '/courses#secret' },
  ])('AC04 rejects invalid explicit submissions %j', fields => {
    expect(createFeedbackSchema.safeParse({ ...base, type: 'defect', ...fields }).success).toBe(false);
  });
  it('AC04 rejects ratings on defects and defect details on other types', () => {
    expect(createFeedbackSchema.safeParse({ ...base, type: 'defect', rating: 'great' }).success).toBe(false);
    expect(createFeedbackSchema.safeParse({ ...base, type: 'change-request', reproductionSteps: 'Click' }).success).toBe(false);
  });
  it('AC06 retains legacy rating-only requests and derives lesson problem types', () => {
    expect(createFeedbackSchema.parse({ page: 'Home', rating: 'great' })).toMatchObject({ message: '', rating: 'great' });
    expect(createFeedbackSchema.safeParse({ page: 'Home' }).success).toBe(false);
    expect(feedbackType({ lessonFeedbackKind: 'problem' })).toBe('defect');
    expect(feedbackType({ lessonFeedbackKind: 'helpful' })).toBe('feedback');
    expect(feedbackType({ type: 'change-request' })).toBe('change-request');
  });
});
