import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryCourseRatingRepository, MongoCourseRatingRepository, createCourseRatingRepository,
  type CourseRatingCollection, type CourseRatingRepository } from './courseRatingRepository.js';
import { aggregateRatings, ratingInputSchema, type CourseRating } from './courseRatings.js';

function collectionFixture() {
  const rows: CourseRating[] = [];
  const matches = (row: CourseRating, filter: Partial<CourseRating>) => Object.entries(filter).every(([key, value]) => row[key as keyof CourseRating] === value);
  const collection: CourseRatingCollection = {
    createIndex: vi.fn(async () => 'index'),
    findOne: vi.fn(async filter => structuredClone(rows.find(row => matches(row, filter)) ?? null)),
    find: vi.fn(filter => ({ toArray: async () => structuredClone(rows.filter(row => matches(row, filter))) })),
    findOneAndUpdate: vi.fn(async (filter, update, options) => {
      let row = rows.find(row => matches(row, filter));
      if (!row && options.upsert) { row = { ...update.$setOnInsert } as CourseRating; rows.push(row); }
      if (!row) return null;
      Object.assign(row, update.$set);
      if (update.$unset?.comment !== undefined) delete row.comment;
      return structuredClone(row);
    }),
    updateMany: vi.fn(async filter => {
      for (const row of rows.filter(row => matches(row, filter))) delete row.comment;
      return { acknowledged: true };
    }),
  };
  return { rows, collection };
}

describe.each(['memory', 'mongo'] as const)('US-L028 rating store %s', adapter => {
  let repository: CourseRatingRepository;
  beforeEach(() => {
    const { collection } = collectionFixture();
    repository = adapter === 'memory' ? new InMemoryCourseRatingRepository() : new MongoCourseRatingRepository(async () => collection);
  });

  it('AC01 replaces one course/user rating, retaining id, createdAt and moderation', async () => {
    expect(await repository.get('course', 'ada')).toBeNull();
    const first = await repository.upsert('course', 'ada', { stars: 5, comment: 'Helpful' });
    await repository.setHidden('course', first.id, true);
    const replaced = await repository.upsert('course', 'ada', { stars: 2 });
    expect(replaced).toMatchObject({ id: first.id, courseId: 'course', userId: 'ada', createdAt: first.createdAt, hidden: true, stars: 2 });
    expect(replaced).not.toHaveProperty('comment');
    expect(await repository.listForCourse('course')).toHaveLength(1);
    replaced.stars = 1;
    expect((await repository.get('course', 'ada'))?.stars).toBe(2);
  });

  it('isolates courses/users, scopes review IDs to courses, and exports only the caller', async () => {
    const first = await repository.upsert('course', 'ada', { stars: 5, comment: 'Private text' });
    await repository.upsert('other-course', 'ada', { stars: 3 });
    await repository.upsert('course', 'bob', { stars: 1 });
    expect(await repository.setHidden('other-course', first.id, true)).toBeNull();
    expect(await repository.collectForExport('ada')).toEqual([
      { courseId: 'course', stars: 5, comment: 'Private text', hidden: false, createdAt: first.createdAt, updatedAt: first.updatedAt },
      { courseId: 'other-course', stars: 3, hidden: false, createdAt: expect.any(String), updatedAt: expect.any(String) },
    ]);
    await repository.anonymizeForUser('ada');
    await repository.anonymizeForUser('ada');
    expect(await repository.get('course', 'ada')).toMatchObject({ id: first.id, stars: 5 });
    expect(await repository.get('course', 'ada')).not.toHaveProperty('comment');
    expect(await repository.listForCourse('course')).toHaveLength(2);
    expect(await repository.collectForExport('missing')).toEqual([]);
  });
});

describe('US-L028 Mongo and domain contracts', () => {
  it('uses unique course/user and newest-review indexes with majority writes', async () => {
    const { collection } = collectionFixture();
    const repository = new MongoCourseRatingRepository(async () => collection);
    await repository.upsert('course', 'ada', { stars: 4, comment: 'Useful' });
    expect(collection.createIndex).toHaveBeenCalledWith({ courseId: 1, userId: 1 }, { unique: true });
    expect(collection.createIndex).toHaveBeenCalledWith({ courseId: 1, updatedAt: -1 });
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith({ courseId: 'course', userId: 'ada' }, expect.objectContaining({
      $set: { stars: 4, comment: 'Useful', updatedAt: expect.any(String) },
      $setOnInsert: expect.objectContaining({ hidden: false, createdAt: expect.any(String) }),
    }), { upsert: true, returnDocument: 'after', includeResultMetadata: false, writeConcern: { w: 'majority' } });
  });

  it('retries a duplicate-key first-write race without creating another row', async () => {
    const { collection } = collectionFixture();
    const repository = new MongoCourseRatingRepository(async () => collection);
    const first = await repository.upsert('course', 'ada', { stars: 5 });
    vi.mocked(collection.findOneAndUpdate).mockRejectedValueOnce({ code: 11000 });
    expect(await repository.upsert('course', 'ada', { stars: 3 })).toMatchObject({ id: first.id, stars: 3 });
    expect(await repository.listForCourse('course')).toHaveLength(1);
  });

  it('does not swallow failed or unconfirmed writes, and can retry failed index initialization', async () => {
    const { collection } = collectionFixture();
    const repository = new MongoCourseRatingRepository(async () => collection);
    vi.mocked(collection.createIndex).mockRejectedValueOnce(new Error('offline'));
    await expect(repository.upsert('course', 'ada', { stars: 4 })).rejects.toThrow('offline');
    await expect(repository.upsert('course', 'ada', { stars: 4 })).resolves.toMatchObject({ stars: 4 });
    vi.mocked(collection.updateMany).mockResolvedValue({ acknowledged: false });
    await expect(repository.anonymizeForUser('ada')).rejects.toThrow();
  });

  it('AC02 averages visible ratings to one decimal and excludes hidden rows', () => {
    expect(aggregateRatings([])).toEqual({ average: 0, count: 0 });
    expect(aggregateRatings([{ stars: 5, hidden: false }, { stars: 4, hidden: false }, { stars: 4, hidden: false },
      { stars: 1, hidden: true }])).toEqual({ average: 4.3, count: 3 });
  });

  it('validates strict input and normalizes an empty or padded comment', () => {
    expect(ratingInputSchema.parse({ stars: 1, comment: '  useful  ' })).toEqual({ stars: 1, comment: 'useful' });
    expect(ratingInputSchema.parse({ stars: 5, comment: '   ' })).toEqual({ stars: 5 });
    for (const input of [{}, { stars: 0 }, { stars: 6 }, { stars: 2.5 }, { stars: '5' }, { stars: 4, hidden: true },
      { stars: 4, userId: 'another' }, { stars: 3, comment: 'x'.repeat(1001) }]) {
      expect(ratingInputSchema.safeParse(input).success).toBe(false);
    }
  });

  it('uses an unseeded in-memory store in isolated tests', async () => {
    const repository = createCourseRatingRepository();
    expect(repository).toBeInstanceOf(InMemoryCourseRatingRepository);
    expect(await repository.listForCourse('demo-course-1')).toEqual([]);
  });
});
