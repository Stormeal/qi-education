import { describe, expect, it, vi } from 'vitest';
import { AmbiguousCourseWriteError, CourseBusyError, InMemoryCourseMutationLock, MongoCourseMutationLock, type CourseMutationLockDocument } from './courseMutationLock.js';

function collectionFixture() {
  const records = new Map<string, CourseMutationLockDocument>();
  const collection = {
    insertOne: vi.fn(async (document: CourseMutationLockDocument) => {
      if (records.has(document._id)) throw Object.assign(new Error('Duplicate key'), { code: 11000 });
      records.set(document._id, document);
      return { acknowledged: true, insertedId: document._id };
    }),
    deleteOne: vi.fn(async (filter: { _id: string; owner: string }) => {
      const matched = records.get(filter._id)?.owner === filter.owner;
      if (matched) records.delete(filter._id);
      return { acknowledged: true, deletedCount: matched ? 1 : 0 };
    }),
  };
  return { records, collection };
}

describe('course operation coordination', () => {
  it.each(['loading', 'insertion'])('bounds stalled %s without entering the protected operation', async (stage) => {
    vi.useFakeTimers();
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { collection } = collectionFixture();
      const stalled = new Promise<never>(() => {});
      if (stage === 'insertion') collection.insertOne.mockImplementation(() => stalled);
      const lock = new MongoCourseMutationLock(() => stage === 'loading' ? stalled : Promise.resolve(collection as never));
      const operation = vi.fn();
      let completed = false;
      const attempt = lock.run('course', operation).catch((error) => { completed = error instanceof CourseBusyError; });
      await vi.advanceTimersByTimeAsync(5100);
      expect(completed).toBe(true);
      expect(operation).not.toHaveBeenCalled();
      expect(collection.deleteOne).not.toHaveBeenCalled();
      await attempt;
    } finally { vi.useRealTimers(); logging.mockRestore(); }
  });
  it.each(['memory', 'mongodb'] as const)('serializes same-course operations but permits different courses in %s', async (storage) => {
    const { collection } = collectionFixture();
    const firstLock = storage === 'memory' ? new InMemoryCourseMutationLock() : new MongoCourseMutationLock(async () => collection as never);
    const secondLock = storage === 'memory' ? firstLock : new MongoCourseMutationLock(async () => collection as never);
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const calls: string[] = [];
    const first = firstLock.run('course', async () => { calls.push('first'); started(); await paused; });
    await entered;
    const second = secondLock.run('course', async () => { calls.push('second'); });
    await secondLock.run('other-course', async () => { calls.push('other'); });
    expect(calls).toEqual(['first', 'other']);
    release();
    await Promise.all([first, second]);
    expect(calls).toEqual(['first', 'other', 'second']);
  });

  it('releases after an operation throws and deletes only its own owner', async () => {
    const { collection, records } = collectionFixture();
    const lock = new MongoCourseMutationLock(async () => collection as never);
    await expect(lock.run('course', async () => { throw new Error('Storage failed'); })).rejects.toThrow('Storage failed');
    expect(records.size).toBe(0);
    const acquired = collection.insertOne.mock.calls[0][0];
    expect(collection.insertOne).toHaveBeenCalledWith(acquired, { writeConcern: { w: 'majority' }, timeoutMS: expect.any(Number) });
    expect(collection.deleteOne).toHaveBeenCalledWith({ _id: 'course', owner: acquired.owner }, { writeConcern: { w: 'majority' }, timeoutMS: 5000 });
    await expect(lock.run('course', async () => 'retry')).resolves.toBe('retry');
  });

  it('never takes over an abandoned durable owner and bounds retry waiting', async () => {
    vi.useFakeTimers();
    try {
      const { collection, records } = collectionFixture();
      records.set('course', { _id: 'course', owner: 'old-owner', acquiredAt: '2000-01-01T00:00:00Z' });
      const operation = vi.fn();
      const lock = new MongoCourseMutationLock(async () => collection as never);
      const attempted = lock.run('course', operation);
      const rejected = expect(attempted).rejects.toBeInstanceOf(CourseBusyError);
      await vi.advanceTimersByTimeAsync(5100);
      await rejected;
      expect(operation).not.toHaveBeenCalled();
      expect(records.get('course')?.owner).toBe('old-owner');
      expect(collection.deleteOne).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('retains ownership after an ambiguous remote write instead of permitting a successor', async () => {
    const { collection, records } = collectionFixture();
    const lock = new MongoCourseMutationLock(async () => collection as never);
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(lock.run('course', async () => { throw new AmbiguousCourseWriteError(new Error('ECONNRESET')); }))
        .rejects.toBeInstanceOf(AmbiguousCourseWriteError);
      expect(records.has('course')).toBe(true);
      expect(collection.deleteOne).not.toHaveBeenCalled();
    } finally { logging.mockRestore(); }
  });
});
