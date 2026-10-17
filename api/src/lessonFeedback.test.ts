import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feedbackFromSheetRow, feedbackSheetHeaders, feedbackToSheetRow, type FeedbackEntry } from './feedback.js';
import { GoogleSheetsFeedbackRepository } from './feedbackRepository.js';
import { toAuthenticatedUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';

const fixture = vi.hoisted(() => ({ rows: [] as string[][], ranges: [] as string[] }));
vi.mock('./googleSheets.js', () => ({
  ensureWorksheetHeaders: async () => {},
  createSheetsClient: () => ({ spreadsheets: { values: {
    get: async ({ range }: { range: string }) => { fixture.ranges.push(range); return { data: { values: structuredClone(fixture.rows) } }; },
    append: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      fixture.ranges.push(range); fixture.rows.push(...structuredClone(requestBody.values));
    },
    update: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      fixture.ranges.push(range);
      if (range.endsWith('1')) fixture.rows[0] = [...requestBody.values[0]];
      else {
        const index = Number(range.match(/!J(\d+)/)![1]) - 1;
        fixture.rows[index].splice(9, 4, ...requestBody.values[0]);
      }
    },
  } } }),
}));

const entry = { id: 'feedback', userId: 'learner', userEmail: 'learner@example.test', userRole: 'student',
  createdAt: '2026-10-17T10:00:00.000Z', page: 'lesson', rating: 'needs-work', message: 'Video stuck',
  courseId: 'course', componentId: 'video', lessonFeedbackKind: 'problem', problemCategory: 'video' } as FeedbackEntry;

describe('US-L015 AC04 Sheets feedback compatibility', () => {
  beforeEach(() => { fixture.rows = []; fixture.ranges = []; });
  it('appends four columns after the original thirteen and reads legacy short rows', () => {
    const row = feedbackToSheetRow(entry);
    expect(feedbackSheetHeaders.slice(13)).toEqual(['Course ID', 'Component ID', 'Lesson Feedback Kind', 'Problem Category']);
    expect(row.slice(13)).toEqual(['course', 'video', 'problem', 'video']);
    expect(feedbackFromSheetRow(row)).toMatchObject(entry);
    const legacy = feedbackFromSheetRow(row.slice(0, 9));
    for (const field of ['courseId', 'componentId', 'lessonFeedbackKind', 'problemCategory'] as const) expect(legacy[field]).toBeUndefined();
  });
  it('stores, lists and triages lesson fields through the actual Sheets adapter without overwriting them', async () => {
    fixture.rows.push([...feedbackSheetHeaders]);
    const repository = new GoogleSheetsFeedbackRepository();
    const user = toAuthenticatedUser((await new InMemoryAuthRepository().findByEmail('student@qi-education.local'))!);
    const saved = await repository.createFeedback(entry, user);
    expect((await repository.listFeedback())[0]).toMatchObject({ ...entry, id: saved.id, userId: user.id, userEmail: user.email, createdAt: saved.createdAt });
    const updated = await repository.updateFeedbackTriage(saved.id, { workStatus: 'work', priority: 'high', githubIssueNumber: 42, githubIssueUrl: 'https://example.test/42' });
    expect(updated).toMatchObject({ courseId: 'course', componentId: 'video', lessonFeedbackKind: 'problem', problemCategory: 'video', workStatus: 'work', githubIssueNumber: 42 });
    expect(fixture.ranges.filter(range => !range.includes('!J'))).toEqual(expect.arrayContaining([expect.stringMatching(/!A:Q$/), expect.stringMatching(/!A1:Q1$/)]));
  });
});
