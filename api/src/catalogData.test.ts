import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { MongoCourseRepository } from './mongoCourseRepository.js';
import { fakeCourseCollection } from '../test/fakeCourseCollection.js';
import { createCourseSchema } from './course.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { createServer } from './server.js';

describe('catalog category data path (DEF-012)', () => {
  it('RD-05 preserves category, languages and ratings through the repository and public API', async () => {
    const fake = fakeCourseCollection();
    const courses = new MongoCourseRepository(async () => fake.collection);
    for (const [id, fields] of [
      ['categorized', { category: 'API Testing', languages: ['English'], rating: 4.8, ratingCount: 12345 }],
      ['uncategorized', {}],
    ] as const) {
      await courses.createCourse(createCourseSchema.parse({ title: 'Catalog course', description: 'A complete catalog fixture.',
        teacher: 'Teacher', level: 'Intermediate', status: 'published', ...fields }), { id, createdAt: '2026-10-09' });
    }
    const server = createServer({ courseRepository: courses, authRepository: new InMemoryAuthRepository(),
      courseContentRepository: new InMemoryCourseContentRepository(), courseAssetRepository: new InMemoryCourseAssetRepository(),
      muxVideoService: null, muxWebhookService: null,
    }).listen(0);
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/courses`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.find((course: { id: string }) => course.id === 'categorized')).toMatchObject({
        category: 'API Testing', languages: ['English'], rating: 4.8, ratingCount: 12345,
      });
      expect(body.find((course: { id: string }) => course.id === 'uncategorized')).toMatchObject({ category: 'Uncategorized', languages: [] });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
