import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsCourseRepository } from './courseRepository.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { createServer } from './server.js';

const { sheet } = vi.hoisted(() => ({ sheet: [
  ['id', 'title', 'description', 'level', 'teacher', 'careerGoals', 'status', 'createdAt', 'requirements',
    'audience', 'priceDkk', 'partOfCareer', 'whatYoullLearn', 'thumbnailAssetId', 'isPremium',
    'isBestseller', 'rating', 'ratingCount', 'category', 'languages', 'ownerUserId'],
  ['categorized', 'Complete Software Testing and Quality Engineering Certification for Modern Product Teams',
    'A fully populated catalog fixture.', 'Intermediate', 'Teacher', 'Automation', 'published', '2026-10-09',
    'Basic testing', 'Testers', '2500', 'Quality Engineering', 'API checks', '', 'TRUE', 'TRUE', '4.8', '12345',
    'API Testing', 'English', 'owner'],
  ['legacy', 'Legacy course', 'No category was stored.', 'Beginner', 'Teacher', '', 'published', '2026-10-09'],
] }));

// The external Sheets boundary models range truncation; production repository,
// row mapping and API DTOs are real. There is deliberately no mutation API.
vi.mock('./googleSheets.js', () => ({
  createSheetsClient: () => ({ spreadsheets: { values: { get: async ({ range }: { range: string }) => {
    const last = /!A:([A-Z]+)$/.exec(range)?.[1] ?? '';
    const width = [...last].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);
    return { data: { values: sheet.map(row => row.slice(0, width)) } };
  } } } }),
  ensureWorksheetHeaders: async () => { throw new Error('Shared mutations disabled'); },
}));

describe('catalog category data path (DEF-012)', () => {
  it('RD-05 preserves column S in repository and public API even with a legacy configured range', async () => {
    const courses = new GoogleSheetsCourseRepository();
    const server = createServer({ courseRepository: courses, authRepository: new InMemoryAuthRepository(),
      courseContentRepository: new InMemoryCourseContentRepository(), courseAssetRepository: new InMemoryCourseAssetRepository(),
      muxVideoService: null, muxWebhookService: null,
      gitHubFeedbackService: { hasConfig: () => false, createIssue: async () => { throw new Error('Disabled'); } },
    }).listen(0);
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/courses`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.find((course: { id: string }) => course.id === 'categorized')).toMatchObject({
        category: 'API Testing', languages: ['English'], rating: 4.8, ratingCount: 12345,
      });
      expect(body.find((course: { id: string }) => course.id === 'legacy')).toMatchObject({ category: 'Uncategorized', languages: [] });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
