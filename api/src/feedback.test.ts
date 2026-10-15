import { describe, expect, it } from 'vitest';
import { createFeedbackSchema, feedbackFromSheetRow, feedbackSheetHeaders, feedbackToSheetRow } from './feedback.js';
import { buildApiConfig } from './config.js';

describe('US-L016 feedback storage compatibility', () => {
  it('preserves lesson context in columns after GitHub Issue URL', () => {
    const input = createFeedbackSchema.parse({ page: 'learning', rating: 'needs-work', message: 'Broken', courseId: 'course', componentId: 'video', category: 'video' });
    expect(input).toMatchObject({ courseId: 'course', componentId: 'video', category: 'video' });
    const entry = { ...input, id: 'f', userId: 'u', userEmail: 'u@example.test', userRole: 'student', createdAt: '2026-10-15T00:00:00Z' };
    const row = feedbackToSheetRow(entry);
    expect(row.slice(13)).toEqual(['course', 'video', 'video']);
    expect(feedbackFromSheetRow(row)).toMatchObject(entry);
    expect(feedbackSheetHeaders.slice(12)).toEqual(['GitHub Issue URL', 'Course ID', 'Lesson ID', 'Category']);
    expect(buildApiConfig({ NODE_ENV: 'test' }).GOOGLE_SHEETS_FEEDBACK_RANGE).toBe('Feedback!A:P');
  });
  it.each([{ componentId: 'video' }, { category: 'other' }, { courseId: ' ' }, { courseId: 'c', category: 'bad' }])('rejects invalid context %j', fields => {
    expect(createFeedbackSchema.safeParse({ page: 'learning', rating: 'needs-work', ...fields }).success).toBe(false);
  });
  it('reads old rows without context and keeps old clients valid', () => {
    const entry = feedbackFromSheetRow(['f', 'date', 'u', 'u@example.test', 'student', 'home', 'great', 'Thanks']);
    expect(entry).toMatchObject({ id: 'f', page: 'home', rating: 'great', message: 'Thanks' });
    expect(entry.courseId).toBeUndefined(); expect(entry.componentId).toBeUndefined(); expect(entry.category).toBeUndefined();
    expect(createFeedbackSchema.parse({ page: 'home', rating: 'great' })).toEqual({ page: 'home', rating: 'great', message: '' });
  });
});
