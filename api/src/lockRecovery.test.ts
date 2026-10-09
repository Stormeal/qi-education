import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmbiguousCourseWriteError, CourseBusyError, MongoCourseMutationLock, protectCourseWrite, type CourseMutationLockDocument } from './courseMutationLock.js';

const expiryMs = 31 * 60 * 1000;
function fixture() {
  const records = new Map<string, CourseMutationLockDocument>();
  const collection = {
    insertOne: vi.fn(async (doc: CourseMutationLockDocument) => {
      if (records.has(doc._id)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      records.set(doc._id, doc); return { acknowledged: true, insertedId: doc._id };
    }),
    findOne: vi.fn(async ({ _id }: { _id: string }) => structuredClone(records.get(_id) ?? null)),
    deleteOne: vi.fn(async (filter: { _id: string; owner: string; acquiredAt?: string }) => {
      const current = records.get(filter._id);
      const matches = current?.owner === filter.owner && (!filter.acquiredAt || current?.acquiredAt === filter.acquiredAt);
      if (matches) records.delete(filter._id);
      return { acknowledged: true, deletedCount: matches ? 1 : 0 };
    }),
  };
  return { records, collection, lock: new MongoCourseMutationLock(async () => collection as never) };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('INV-006 / US-P005 bounded expiry', () => {
  it('recovers a failed write only after the host-duration bound', async () => {
    vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => {});
    const { records, lock } = fixture();
    await expect(lock.run('course', () => protectCourseWrite(async () => { throw new Error('Sheets 429'); }))).rejects.toBeInstanceOf(AmbiguousCourseWriteError);
    expect(records.has('course')).toBe(true);
    const owner = records.get('course')!.owner;
    const pending = lock.run('course', async () => 'too early');
    const reject = expect(pending).rejects.toBeInstanceOf(CourseBusyError);
    await vi.advanceTimersByTimeAsync(5100); await reject;
    expect(records.get('course')!.owner).toBe(owner);
    vi.setSystemTime(Date.now() + expiryMs);
    const successor = lock.run('course', async () => 'recovered').then(value => value, error => error);
    await vi.advanceTimersByTimeAsync(5100);
    expect(await successor).toBe('recovered');
    expect(records.size).toBe(0);
  });
  it('recovers a killed legacy invocation at the exact expiry boundary', async () => {
    vi.useFakeTimers();
    const { records, collection, lock } = fixture();
    const old = { _id: 'course', owner: 'killed', acquiredAt: new Date(Date.now() - expiryMs).toISOString() };
    records.set('course', old);
    const pending = lock.run('course', async () => 'successor').then(value => value, error => error);
    await vi.advanceTimersByTimeAsync(5100);
    expect(await pending).toBe('successor');
    expect(collection.deleteOne).toHaveBeenCalledWith(old, { writeConcern: { w: 'majority' }, timeoutMS: expect.any(Number) });
  });
  it.each(['young', 'invalid', '0', '2026-02-30T00:00:00Z'])('never reclaims a %s owner', async kind => {
    vi.useFakeTimers();
    const { records, collection, lock } = fixture();
    records.set('course', { _id: 'course', owner: 'held', acquiredAt: kind === 'young' ? new Date().toISOString() : kind });
    const operation = vi.fn(); const pending = lock.run('course', operation).then(value => value, error => error);
    await vi.advanceTimersByTimeAsync(5100); expect(await pending).toBeInstanceOf(CourseBusyError);
    expect(operation).not.toHaveBeenCalled(); expect(collection.deleteOne).not.toHaveBeenCalled();
  });
  it('cannot remove a successor installed between expiry inspection and deletion', async () => {
    vi.useFakeTimers();
    const { records, collection, lock } = fixture();
    records.set('course', { _id: 'course', owner: 'killed', acquiredAt: new Date(Date.now() - expiryMs).toISOString() });
    const successor = { _id: 'course', owner: 'successor', acquiredAt: new Date().toISOString() };
    const find = collection.findOne.getMockImplementation()!;
    collection.findOne.mockImplementationOnce(async filter => { const old = await find(filter); records.set('course', successor); return old; });
    const pending = lock.run('course', vi.fn()); const reject = expect(pending).rejects.toBeInstanceOf(CourseBusyError);
    await vi.advanceTimersByTimeAsync(5100); await reject;
    expect(records.get('course')).toEqual(successor);
  });
  it('old release cannot remove a newer owner', async () => {
    const { records, lock } = fixture();
    await lock.run('course', async () => { records.set('course', { _id: 'course', owner: 'new', acquiredAt: new Date().toISOString() }); });
    expect(records.get('course')!.owner).toBe('new');
  });
});
