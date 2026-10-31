import { describe, expect, it, vi } from 'vitest';
import { InMemoryAccountCareersRepository, MongoAccountCareersRepository, type AccountCareersDocument } from './accountCareersRepository.js';

function fixture() {
  const records = new Map<string, AccountCareersDocument>();
  const collection = {
    async deleteOne(filter: { _id: string }) { return { acknowledged: true, deletedCount: records.delete(filter._id) ? 1 : 0 }; },
    findOne: vi.fn(async ({ _id }: { _id: string }) => structuredClone(records.get(_id) ?? null)),
    insertOne: vi.fn(async (document: AccountCareersDocument) => {
      if (records.has(document._id)) throw Object.assign(new Error('Duplicate id'), { code: 11000 });
      records.set(document._id, structuredClone(document)); return { acknowledged: true };
    }),
    replaceOne: vi.fn(async (filter: { _id: string; version: number }, document: AccountCareersDocument) => {
      const matchedCount = records.get(filter._id)?.version === filter.version ? 1 : 0;
      if (matchedCount) records.set(document._id, structuredClone(document));
      return { acknowledged: true, matchedCount };
    }),
  };
  return { records, collection };
}

describe.each(['memory', 'mongo-adapter'])('atomic account careers (%s)', storage => {
  const setup = () => {
    const { records, collection } = fixture();
    const one = storage === 'memory' ? new InMemoryAccountCareersRepository() : new MongoAccountCareersRepository(async () => collection as never);
    const two = storage === 'memory' ? one : new MongoAccountCareersRepository(async () => collection as never);
    return { one, two, records, collection };
  };
  const initial = { followedPathIds: ['legacy'], focusPathId: 'legacy', achievements: [] };
  it('US-L021-AC04 merges concurrent first and later follows across adapters without duplicates', async () => {
    const { one, two } = setup();
    const add = (id: string) => (document: AccountCareersDocument) => {
      if (!document.followedPathIds.includes(id)) document.followedPathIds.push(id);
    };
    await Promise.all([one.mutate('account', initial, add('technical')), two.mutate('account', initial, add('manager'))]);
    await Promise.all([two.mutate('account', initial, add('analyst')), one.mutate('account', initial, add('technical'))]);
    expect((await two.get('account'))?.followedPathIds).toEqual(['legacy', 'technical', 'manager', 'analyst']);
    expect(await one.get('someone-else')).toBeNull();
    const copy = (await one.get('account'))!; copy.followedPathIds.push('not-saved');
    expect((await two.get('account'))?.followedPathIds).not.toContain('not-saved');
  });
  it('US-L019-AC03 US-L019-AC04 preserves first declaration time across concurrent retries and rolls back a failed mutation', async () => {
    const { one, two } = setup();
    const add = (time: string) => (document: AccountCareersDocument) => {
      if (!document.achievements.some(item => item.actionId === 'exam')) document.achievements.push({ actionId: 'exam', provenance: 'self-reported', declaredAt: time });
    };
    await Promise.all([one.mutate('account', initial, add('first')), two.mutate('account', initial, add('second'))]);
    const saved = await one.get('account');
    expect(saved?.achievements).toEqual([{ actionId: 'exam', provenance: 'self-reported', declaredAt: 'first' }]);
    await expect(one.mutate('account', initial, document => {
      document.followedPathIds.push('failed'); throw new Error('Isolated failed mutation');
    })).rejects.toThrow('Isolated failed mutation');
    expect(await two.get('account')).toEqual(saved);
  });
});

it('US-L019-AC04 US-L021-AC04 Mongo adapter propagates failed writes and retries only account id collisions', async () => {
  const { collection } = fixture();
  const repository = new MongoAccountCareersRepository(async () => collection as never);
  const initial = { followedPathIds: [], focusPathId: null, achievements: [] };
  collection.insertOne.mockRejectedValueOnce(new Error('Storage failed'));
  await expect(repository.mutate('account', initial, () => {})).rejects.toThrow('Storage failed');
  expect(await repository.get('account')).toBeNull();
  collection.insertOne.mockRejectedValueOnce(Object.assign(new Error('Other unique index'), { code: 11000 }));
  await expect(repository.mutate('account', initial, () => {})).rejects.toThrow('Other unique index');
});
