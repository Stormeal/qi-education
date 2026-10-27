import { describe, expect, it, vi } from 'vitest';
import { InMemoryLearningProgressRepository, MongoLearningProgressRepository } from './learningProgressRepository.js';

describe('account completion storage boundaries', () => {
  it('US-T016 bulk memory read selects only enrolled accounts on one course and returns snapshots', async () => {
    const store = new InMemoryLearningProgressRepository();
    await store.complete('enrolled', 'course', 'one');
    await store.complete('author', 'course', 'two');
    await store.complete('enrolled', 'other', 'three');
    const rows = await store.listForCourse('course', ['enrolled', 'not-started']);
    expect(rows).toEqual([expect.objectContaining({ userId: 'enrolled', courseId: 'course', completedIds: ['one'] })]);
    rows[0].completedIds.push('forged');
    expect((await store.get('enrolled', 'course'))?.completedIds).toEqual(['one']);
    expect(await store.listForCourse('course', [])).toEqual([]);
  });

  it('US-T016 Mongo bulk read uses one course/enrolled-account query, including an empty enrollment shortcut', async () => {
    const documents = [{ userId: 'enrolled', courseId: 'course', completedIds: ['one'] }];
    const find = vi.fn().mockReturnValue({ toArray: async () => documents });
    const repository = new MongoLearningProgressRepository(async () => ({ find }) as never);
    expect(await repository.listForCourse('course', ['enrolled', 'second'])).toEqual(documents);
    expect(find.mock.calls).toEqual([[{ courseId: 'course', userId: { $in: ['enrolled', 'second'] } }]]);
    expect(await repository.listForCourse('course', [])).toEqual([]);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('keeps account/course compound keys distinct and returns isolated snapshots', async () => {
    const store = new InMemoryLearningProgressRepository();
    await store.complete('a:b', 'c', 'one'); await store.complete('a', 'b:c', 'two');
    await Promise.all([store.complete('a:b', 'c', 'two'), store.complete('a:b', 'c', 'one')]);
    const saved = await store.get('a:b', 'c');
    expect(saved?.completedIds).toEqual(['one', 'two']);
    saved!.completedIds.push('forged');
    expect((await store.get('a:b', 'c'))?.completedIds).toEqual(['one', 'two']);
    expect((await store.list('a')).map(item => item.completedIds)).toEqual([['two']]);
  });

  it('Mongo lesson and proof writes are atomic set additions, never snapshot replacement', async () => {
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const repository = new MongoLearningProgressRepository(async () => ({ updateOne }) as never);
    await Promise.all([repository.complete('learner', 'course', 'one'), repository.complete('learner', 'course', 'two'),
      repository.recordPass('learner', 'course', 'verified-fingerprint')]);
    expect(updateOne.mock.calls).toEqual([
      [{ _id: '["learner","course"]', userId: 'learner', courseId: 'course' },
        { $setOnInsert: { userId: 'learner', courseId: 'course', passedQuizzes: [] }, $addToSet: { completedIds: 'one' } }, { upsert: true }],
      [{ _id: '["learner","course"]', userId: 'learner', courseId: 'course' },
        { $setOnInsert: { userId: 'learner', courseId: 'course', passedQuizzes: [] }, $addToSet: { completedIds: 'two' } }, { upsert: true }],
      [{ _id: '["learner","course"]', userId: 'learner', courseId: 'course' },
        { $setOnInsert: { userId: 'learner', courseId: 'course', completedIds: [] }, $addToSet: { passedQuizzes: 'verified-fingerprint' } }, { upsert: true }],
    ]);
  });

  it('merges after a racing initial Mongo upsert but propagates unavailable or unacknowledged writes', async () => {
    const duplicate = Object.assign(new Error('Duplicate key'), { code: 11000 });
    const updateOne = vi.fn().mockRejectedValueOnce(duplicate).mockResolvedValueOnce({ matchedCount: 1 });
    const repository = new MongoLearningProgressRepository(async () => ({ updateOne }) as never);
    await repository.complete('learner', 'course', 'one');
    expect(updateOne.mock.calls[1]).toEqual([
      { _id: '["learner","course"]', userId: 'learner', courseId: 'course' }, { $addToSet: { completedIds: 'one' } },
    ]);
    const unavailable = new Error('Write acknowledgement unavailable');
    updateOne.mockRejectedValueOnce(unavailable);
    await expect(repository.complete('learner', 'course', 'two')).rejects.toBe(unavailable);
    updateOne.mockRejectedValueOnce(duplicate).mockResolvedValueOnce({ matchedCount: 0 });
    await expect(repository.complete('learner', 'course', 'three')).rejects.toBe(duplicate);
  });

  it('Mongo reads always use the authenticated account in their predicates', async () => {
    const find = vi.fn().mockReturnValue({ toArray: async () => [] });
    const findOne = vi.fn().mockResolvedValue(null);
    const repository = new MongoLearningProgressRepository(async () => ({ find, findOne }) as never);
    await repository.list('learner'); await repository.get('learner', 'course');
    expect(find).toHaveBeenCalledWith({ userId: 'learner' });
    expect(findOne).toHaveBeenCalledWith({ _id: '["learner","course"]', userId: 'learner' });
  });
});
