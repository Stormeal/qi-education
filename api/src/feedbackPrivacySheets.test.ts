import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feedbackSheetHeaders, feedbackToSheetRow, type FeedbackEntry } from './feedback.js';
import { GoogleSheetsFeedbackRepository } from './feedbackRepository.js';

const fixture = vi.hoisted(() => ({ rows: [] as string[][], writes: [] as string[] }));
vi.mock('./googleSheets.js', () => ({
  ensureWorksheetHeaders: async () => {},
  createSheetsClient: () => ({ spreadsheets: { values: {
    get: async () => ({ data: { values: structuredClone(fixture.rows) } }),
    update: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      fixture.writes.push(range);
      const match = range.match(/!([A-Z]+)(\d+)$/)!;
      const column = match[1].charCodeAt(0) - 65, row = Number(match[2]) - 1;
      fixture.rows[row][column] = requestBody.values[0][0];
    },
  } } }),
}));
const entry = (id: string, userId = 'user'): FeedbackEntry => ({ id, userId, userEmail: `${userId}@example.test`, userRole: 'student', createdAt: '2026-10-31T10:00:00Z', page: 'Home', rating: 'great', message: 'Retain general text' });
beforeEach(() => { fixture.rows = [[...feedbackSheetHeaders]]; fixture.writes = []; });
describe('US-P021 isolated legacy Sheets feedback privacy', () => {
  it('exports caller rows and clears only caller identity/lesson text cells without overwriting triage', async () => {
    fixture.rows.push(feedbackToSheetRow(entry('general')), feedbackToSheetRow({ ...entry('lesson'), lessonFeedbackKind: 'helpful', message: 'Delete lesson text', workStatus: 'work' }), feedbackToSheetRow(entry('other', 'other')));
    const repo = new GoogleSheetsFeedbackRepository();
    expect((await repo.collectForExport('user')).map(value => value.id)).toEqual(['lesson', 'general']);
    await repo.anonymizeForUser('user'); await repo.anonymizeForUser('user');
    expect(fixture.rows[1][3]).toBe(''); expect(fixture.rows[1][7]).toBe('Retain general text');
    expect(fixture.rows[2][3]).toBe(''); expect(fixture.rows[2][7]).toBe(''); expect(fixture.rows[2][9]).toBe('work');
    expect(fixture.rows[3][3]).toBe('other@example.test'); expect(fixture.rows[3][7]).toBe('Retain general text');
    expect(fixture.writes.every(range => /![DH][23]$/.test(range))).toBe(true);
  });
});
