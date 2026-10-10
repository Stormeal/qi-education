import type { CareerPathDocument } from './careerPath.js';
import { careerPathContentSchema } from './careerPath.js';
import { InMemoryCareerPathRepository, MongoCareerPathRepository } from './careerPathRepository.js';
import { getMongoDatabase } from './mongo.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real Mongo adapter receives a memory-only collection. This mock is installed
// before imports, so no Mongo client can be created or contact any provider.
vi.mock('./mongo.js', () => ({ getMongoDatabase: vi.fn() }));

const draft = careerPathContentSchema.parse({ title: 'Isolated path', steps: [] });
const document = (updatedAt: string, title = 'Isolated path'): CareerPathDocument => ({
  _id: 'test-manager', revision: 0, published: null, draft: { ...draft, title }, updatedAt,
});

function collectionFixture() {
  const records = new Map<string, CareerPathDocument>();
  const collection = {
    find: () => ({ toArray: async () => structuredClone([...records.values()]) }),
    findOne: vi.fn(async (filter: { _id: string }) => structuredClone(records.get(filter._id) ?? null)),
    insertOne: vi.fn(async (replacement: CareerPathDocument) => {
      if (records.has(replacement._id)) throw Object.assign(new Error('Duplicate _id'), { code: 11000 });
      records.set(replacement._id, structuredClone(replacement));
      return { acknowledged: true, insertedId: replacement._id };
    }),
    replaceOne: vi.fn(async (filter: { _id: string; updatedAt?: string }, replacement: CareerPathDocument, options: { upsert?: boolean }) => {
      const current = records.get(filter._id);
      const matches = current && (filter.updatedAt === undefined || current.updatedAt === filter.updatedAt);
      if (matches || (!current && options.upsert)) records.set(filter._id, structuredClone(replacement));
      return { acknowledged: true, matchedCount: matches ? 1 : 0, modifiedCount: matches ? 1 : 0,
        upsertedCount: !current && options.upsert ? 1 : 0, upsertedId: !current && options.upsert ? replacement._id : null };
    }),
  };
  vi.mocked(getMongoDatabase).mockResolvedValue({ collection: () => collection } as never);
  return { collection, records };
}

describe.each(['memory', 'mongo-adapter'] as const)('US-A003 conditional path writes (%s)', (storage) => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  const setup = () => {
    const fixture = collectionFixture();
    const first = storage === 'memory' ? new InMemoryCareerPathRepository() : new MongoCareerPathRepository();
    const second = storage === 'memory' ? first : new MongoCareerPathRepository();
    return { ...fixture, first, second };
  };

  it('allows only one of two writes based on the same stored version, including independent Mongo adapters', async () => {
    const { first, second } = setup();
    const old = await first.savePath(document('old'));
    const results = await Promise.allSettled([
      first.savePath(document('first', 'First admin'), old.updatedAt),
      second.savePath(document('second', 'Second admin'), old.updatedAt),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ message: expect.stringMatching(/changed.*load/i) });
    const winner = results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<CareerPathDocument>;
    expect(await first.listPaths()).toEqual([winner.value]);
    expect(winner.value.draft?.title).toBe('First admin');
    expect(Date.parse(winner.value.updatedAt)).toBeGreaterThan(Date.parse(old.updatedAt));
  });

  it('never inserts a nonexistent path or overwrites an existing path with a stale version', async () => {
    const { first } = setup();
    await expect(first.savePath(document('new'), 'fictional')).rejects.toThrow(/changed.*load/i);
    expect(await first.listPaths()).toEqual([]);
    const old = await first.savePath(document('old'));
    await expect(first.savePath(document('new'), 'stale')).rejects.toThrow(/changed.*load/i);
    expect(await first.listPaths()).toEqual([old]);
  });

  it('keeps unconditional create and replacement for omitted or empty versions', async () => {
    const { first } = setup();
    await first.savePath(document('first'));
    const last = await first.savePath(document('second'), '');
    expect(await first.listPaths()).toEqual([last]);
  });

  it('keeps overlapping legacy saves successful but gives each a distinct persisted version', async () => {
    const { first, second } = setup();
    const initial = await first.savePath(document('2099-01-01T00:00:00.000Z'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T00:00:00.000Z'));
    const [one, two] = await Promise.all([
      first.savePath(document(initial.updatedAt, 'Legacy one')),
      second.savePath(document(initial.updatedAt, 'Legacy two')),
    ]);
    expect(Date.parse(one.updatedAt)).toBe(Date.parse(initial.updatedAt) + 1);
    expect(Date.parse(two.updatedAt)).toBe(Date.parse(initial.updatedAt) + 2);
    expect(await first.listPaths()).toEqual([two]);
    await expect(first.savePath(document(one.updatedAt, 'Protected stale edit'), one.updatedAt)).rejects.toThrow(/changed.*load/i);
    expect(await first.listPaths()).toEqual([two]);
  });
});

describe('US-A003 Mongo conditional write command (memory collection only)', () => {
  it('uses one acknowledged atomic replacement, a version predicate, and no upsert', async () => {
    const { collection, records } = collectionFixture();
    records.set('test-manager', document('old'));
    const saved = await new MongoCareerPathRepository().savePath(document('new'), 'old');
    expect(collection.replaceOne).toHaveBeenCalledExactlyOnceWith(
      { _id: 'test-manager', updatedAt: 'old' }, saved, { upsert: false, writeConcern: { w: 'majority' } },
    );
    expect(records.get('test-manager')).toEqual(saved);
  });

  it('propagates storage failures rather than misreporting them as stale edits', async () => {
    const { collection } = collectionFixture();
    collection.replaceOne.mockRejectedValueOnce(new Error('Isolated storage failure'));
    await expect(new MongoCareerPathRepository().savePath(document('new'), 'old')).rejects.toThrow('Isolated storage failure');
  });

  it('retries a simultaneous first legacy save on the unique id without losing compatibility or reusing its token', async () => {
    const { records } = collectionFixture();
    const [first, second] = await Promise.all([
      new MongoCareerPathRepository().savePath(document('', 'First creation')),
      new MongoCareerPathRepository().savePath(document('', 'Second creation')),
    ]);
    expect(records.size).toBe(1);
    expect(records.get('test-manager')).toEqual(second);
    expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));
  });

  it('propagates an unrelated unique-index creation failure rather than retrying forever', async () => {
    const { collection, records } = collectionFixture();
    collection.insertOne.mockRejectedValueOnce(Object.assign(new Error('Unrelated unique index'), { code: 11000 }));
    await expect(new MongoCareerPathRepository().savePath(document(''))).rejects.toThrow('Unrelated unique index');
    expect(records.size).toBe(0);
  });
});
