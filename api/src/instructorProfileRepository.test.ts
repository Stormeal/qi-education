import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import {
  createInstructorProfileRepository, InMemoryInstructorProfileRepository,
  InstructorProfileUnavailableError, MongoInstructorProfileRepository,
  type InstructorProfileCollection,
} from './instructorProfileRepository.js';

// Executes the actual Mongo adapter against isolated collection semantics.
function memoryCollection() {
  const rows = new Map<string, { _id: string; description: string }>();
  const collection: InstructorProfileCollection = {
    async findOne(filter) { return structuredClone(rows.get(filter._id) ?? null); },
    find() { return { async toArray() { return structuredClone([...rows.values()]); } }; },
    async updateOne(filter, update, options) {
      const existing = rows.has(filter._id);
      if (existing || options.upsert) rows.set(filter._id, { _id: filter._id, description: update.$set.description });
      return { matchedCount: existing ? 1 : 0 };
    },
    async deleteOne(filter) { rows.delete(filter._id); return { acknowledged: true }; },
  };
  return collection;
}

describe.each(['memory', 'mongo-adapter'])('US-T007 storage (%s)', kind => {
  function repository() {
    return kind === 'memory' ? new InMemoryInstructorProfileRepository()
      : new MongoInstructorProfileRepository(async () => memoryCollectionInstance);
  }
  let memoryCollectionInstance: InstructorProfileCollection;
  it('saves per user, replaces only that user and clears absent or empty descriptions', async () => {
    memoryCollectionInstance = memoryCollection();
    const profiles = repository();
    expect(await profiles.get('one')).toBeNull();
    await profiles.save('one', 'First');
    await profiles.save('two', 'Second');
    await profiles.save('one', 'Updated');
    expect(await profiles.list()).toEqual([{ _id: 'one', description: 'Updated' }, { _id: 'two', description: 'Second' }]);
    await profiles.clear('missing');
    await profiles.save('one', '');
    await profiles.clear('one');
    expect(await profiles.get('one')).toBeNull();
    expect(await profiles.get('two')).toEqual({ _id: 'two', description: 'Second' });
  });

  it('does not expose mutable stored snapshots', async () => {
    memoryCollectionInstance = memoryCollection();
    const profiles = repository();
    await profiles.save('one', 'Original');
    (await profiles.get('one'))!.description = 'Changed';
    (await profiles.list())[0]._id = 'forged';
    expect(await profiles.list()).toEqual([{ _id: 'one', description: 'Original' }]);
  });
});

describe('US-T007 Mongo write failures and factory', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('retries a concurrent first-upsert duplicate as an acknowledged replacement', async () => {
    const collection = memoryCollection();
    await collection.updateOne({ _id: 'one' }, { $set: { description: 'Concurrent winner' } }, { upsert: true, writeConcern: { w: 'majority' } });
    const writes = vi.spyOn(collection, 'updateOne').mockRejectedValueOnce({ code: 11000 });
    const profiles = new MongoInstructorProfileRepository(async () => collection);
    await profiles.save('one', 'Latest');
    expect(await profiles.get('one')).toEqual({ _id: 'one', description: 'Latest' });
    expect(writes).toHaveBeenLastCalledWith({ _id: 'one' }, { $set: { description: 'Latest' } }, { upsert: false, writeConcern: { w: 'majority' } });
  });

  it('does not report success when a duplicate retry has no target', async () => {
    const collection = memoryCollection();
    const error = { code: 11000 };
    vi.spyOn(collection, 'updateOne').mockRejectedValueOnce(error);
    await expect(new MongoInstructorProfileRepository(async () => collection).save('one', 'New')).rejects.toBe(error);
  });

  it.each(['get', 'list', 'save', 'clear'] as const)('propagates %s provider errors', async operation => {
    const failure = new Error('Offline');
    const profiles = new MongoInstructorProfileRepository(async () => { throw failure; });
    const promise = operation === 'get' ? profiles.get('one') : operation === 'list' ? profiles.list()
      : operation === 'save' ? profiles.save('one', 'New') : profiles.clear('one');
    await expect(promise).rejects.toBe(failure);
  });

  it('does not convert an arbitrary write error into a duplicate retry', async () => {
    const collection = memoryCollection();
    const writes = vi.spyOn(collection, 'updateOne').mockRejectedValue(new Error('Offline'));
    await expect(new MongoInstructorProfileRepository(async () => collection).save('one', 'New')).rejects.toThrow('Offline');
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('uses memory in tests even when Mongo configuration exists', () => {
    expect(createInstructorProfileRepository()).toBeInstanceOf(InMemoryInstructorProfileRepository);
  });

  it('uses configured Mongo outside tests without opening a connection', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true);
    expect(createInstructorProfileRepository()).toBeInstanceOf(MongoInstructorProfileRepository);
  });

  it('refuses temporary storage in production without Mongo configuration', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(config, 'hasMongoConfig').mockReturnValue(false);
    const profiles = createInstructorProfileRepository();
    await expect(profiles.get('one')).rejects.toBeInstanceOf(InstructorProfileUnavailableError);
    await expect(profiles.save('one', 'New')).rejects.toBeInstanceOf(InstructorProfileUnavailableError);
    await expect(profiles.list()).rejects.toBeInstanceOf(InstructorProfileUnavailableError);
    await expect(profiles.clear('one')).rejects.toBeInstanceOf(InstructorProfileUnavailableError);
  });
});
