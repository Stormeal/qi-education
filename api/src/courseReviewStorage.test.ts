import { describe, expect, it, vi } from 'vitest';
import { MongoCourseContentRepository, type CourseContentDocument } from './courseContentRepository.js';
import type { CourseReviewWorkflow } from './courseReview.js';
import { AmbiguousCourseWriteError } from './courseMutationLock.js';

const workflow: CourseReviewWorkflow = { version: 1, liveStatus: null, live: null, working: null, history: [] };
describe('US-T002 atomic workflow storage', () => {
  it('refuses to report a publication write when its document was not matched', async () => {
    const existing: CourseContentDocument = { _id: 'course', sections: [], createdAt: 'original', updatedAt: 'original' };
    const repository = new MongoCourseContentRepository(async () => ({ findOne: async () => existing,
      updateOne: async () => ({ acknowledged: true, matchedCount: 0 }), insertOne: vi.fn(), deleteOne: vi.fn() }) as never);
    await expect(repository.saveCourseReview('course', workflow)).rejects.toBeInstanceOf(AmbiguousCourseWriteError);
  });
  it('restores workflow and live sections from the same provider write after repository replacement', async () => {
    let stored: CourseContentDocument = { _id: 'course', sections: [], createdAt: 'original', updatedAt: 'original' };
    const loader = async () => ({ findOne: async () => structuredClone(stored), updateOne: async (_filter: unknown, update: { $set: Partial<CourseContentDocument> }) => {
      stored = { ...stored, ...structuredClone(update.$set) }; return { acknowledged: true, matchedCount: 1 }; }, insertOne: vi.fn(), deleteOne: vi.fn() }) as never;
    await new MongoCourseContentRepository(loader).saveCourseReview('course', workflow);
    const restored = await new MongoCourseContentRepository(loader).getCourseContent('course');
    expect(restored?.review).toEqual(workflow); expect(restored?.sections).toEqual([]); expect(restored?.createdAt).toBe('original');
  });
});
