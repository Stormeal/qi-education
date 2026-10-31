import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { createUserChangeRepository, InMemoryUserChangeRepository, MongoUserChangeRepository, type UserChange, type UserChangeCollection } from './userChangeRepository.js';
const change = (id = 'change', at = '2026-10-11T12:00:00.000Z'): UserChange => ({ id, at, actor: { id: 'admin', displayName: 'Original Admin' }, target: { id: 'user', displayName: 'Original User', email: 'user@example.test' }, field: 'status', from: 'active', to: 'disabled' });
function collection() {
  const rows: Array<Omit<UserChange, 'id'> & { _id: string }> = []; const options: unknown[] = [];
  const db: UserChangeCollection = {
    async updateMany(filter, update, opts) {
      options.push(opts);
      for (const row of rows) {
        if (!Object.entries(filter).every(([key, value]) => { const [parent, child] = key.split('.'); return (row as unknown as Record<string, Record<string, unknown>>)[parent]?.[child] === value; })) continue;
        for (const [key, value] of Object.entries(update.$set)) { const [parent, child] = key.split('.'); (row as unknown as Record<string, Record<string, unknown>>)[parent][child] = value; }
      }
      return { acknowledged: true };
    },
    async updateOne(filter, update, opts) { options.push(opts); if (!rows.some(row => row._id === filter._id)) rows.push(structuredClone(update.$setOnInsert)); return { acknowledged: true }; },
    async insertOne(doc, opts) { options.push(opts); rows.push(structuredClone(doc)); },
    find() { return { sort(order) { expect(order).toEqual({ at: -1, _id: -1 }); return { limit(count) { expect(count).toBe(50); return { async toArray() { return structuredClone(rows).sort((a, b) => b.at.localeCompare(a.at) || b._id.localeCompare(a._id)).slice(0, count); } }; } }; } }; },
  };
  return { db, rows, options };
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe.each(['memory', 'mongo-adapter'])('US-A001 change log repository %s', kind => {
  const setup = () => { const store = collection(); return { ...store, repo: kind === 'memory' ? new InMemoryUserChangeRepository() : new MongoUserChangeRepository(async () => store.db) }; };
  it('returns an empty recent log', async () => { expect(await setup().repo.recent()).toEqual([]); });
  it('keeps detached actor/target snapshots and no extra fields', async () => {
    const { repo } = setup(); const input = change(); await repo.append(input); input.actor.displayName = 'Renamed'; input.target.email = 'renamed@example.test'; const result = await repo.recent(); expect(result).toEqual([change()]); result[0].target.displayName = 'Mutated result'; expect(await repo.recent()).toEqual([change()]);
  });
  it('returns newest 50 without removing older stored history', async () => {
    const { repo, rows } = setup(); for (let i = 54; i >= 0; i--) await repo.append(change('change-' + i, new Date(Date.parse('2026-10-11T12:00:00Z') + i * 1000).toISOString()));
    const results = await repo.recent(); expect(results).toHaveLength(50); expect(results[0].id).toBe('change-54'); expect(results[49].id).toBe('change-5'); if (kind === 'mongo-adapter') expect(rows).toHaveLength(55);
  });
});
describe('US-A001 Mongo log adapter and factory', () => {
  it('inserts immutable snapshot keyed by id with majority acknowledgment', async () => { const { db, rows, options } = collection(); await new MongoUserChangeRepository(async () => db).append(change()); const { id, ...rest } = change(); expect(rows).toEqual([{ _id: id, ...rest }]); expect(options).toEqual([{ writeConcern: { w: 'majority' } }]); });
  it('projects stored extras out of recent output', async () => { const { db, rows } = collection(); const { id, ...rest } = change(); rows.push({ _id: id, ...rest, passwordHash: 'secret', actor: { ...rest.actor, passwordHash: 'secret' } } as never); expect(await new MongoUserChangeRepository(async () => db).recent()).toEqual([change()]); });
  it('propagates log read and insert failures for the route to handle', async () => { const repo = new MongoUserChangeRepository(async () => { throw new Error('Unavailable'); }); await expect(repo.append(change())).rejects.toThrow('Unavailable'); await expect(repo.recent()).rejects.toThrow('Unavailable'); });
  it.each(['development', 'test'])('local/test memory remains memory in %s even with shared settings', async nodeEnv => { vi.stubEnv('NODE_ENV', nodeEnv); vi.stubEnv('VERCEL', undefined); vi.stubEnv('USE_SHARED_SERVICES', '1'); vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true); expect(createUserChangeRepository()).toBeInstanceOf(InMemoryUserChangeRepository); });
  it.each([{ NODE_ENV: 'production', VERCEL: undefined }, { NODE_ENV: 'development', VERCEL: '' }])('hosted configured log selects Mongo %j', input => { vi.stubEnv('NODE_ENV', input.NODE_ENV); vi.stubEnv('VERCEL', input.VERCEL); vi.spyOn(config, 'hasMongoConfig').mockReturnValue(true); expect(createUserChangeRepository()).toBeInstanceOf(MongoUserChangeRepository); });
  it('missing hosted Mongo refuses reads and writes', async () => { vi.stubEnv('NODE_ENV', 'production'); vi.spyOn(config, 'hasMongoConfig').mockReturnValue(false); const repo = createUserChangeRepository(); await expect(repo.append(change())).rejects.toThrow(/unavailable/); await expect(repo.recent()).rejects.toThrow(/unavailable/); });
});

describe.each(['memory', 'mongo-adapter'])('US-P021 retained audit privacy %s', kind => {
  const setup = () => { const store = collection(); return { ...store, repo: kind === 'memory' ? new InMemoryUserChangeRepository() : new MongoUserChangeRepository(async () => store.db) }; };
  it('anonymizes all matching targets and actors while retaining unrelated history', async () => {
    const { repo } = setup();
    await repo.append(change('target'));
    await repo.append({ ...change('actor'), actor: { id: 'user', displayName: 'Original User' }, target: { id: 'other', displayName: 'Other', email: 'other@example.test' } });
    await repo.append({ ...change('unrelated'), target: { id: 'other', displayName: 'Other', email: 'other@example.test' } });
    await repo.anonymizeForUser('user'); await repo.anonymizeForUser('user');
    const rows = await repo.recent();
    expect(rows.find(value => value.id === 'target')).toMatchObject({ target: { id: 'user', displayName: 'Deleted user', email: '' }, field: 'status', from: 'active', to: 'disabled' });
    expect(rows.find(value => value.id === 'actor')).toMatchObject({ actor: { id: 'user', displayName: 'Deleted user' }, target: { displayName: 'Other', email: 'other@example.test' } });
    expect(rows.find(value => value.id === 'unrelated')).toMatchObject({ actor: { displayName: 'Original Admin' }, target: { displayName: 'Other' } });
    expect(JSON.stringify(rows)).not.toMatch(/Original User|user@example.test/);
  });
  it('records exactly one account-erased marker when retried concurrently and retains the original timestamp', async () => {
    const { repo } = setup();
    await Promise.all([repo.recordErasure('user', '2026-10-31T10:00:00Z'), repo.recordErasure('user', '2026-10-31T11:00:00Z')]);
    const rows = await repo.recent(); expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ at: '2026-10-31T10:00:00Z', target: { id: 'user', displayName: 'Deleted user', email: '' }, to: 'erased' });
    expect(JSON.stringify(rows)).not.toMatch(/Original User|user@example.test/);
  });
});


it('US-P021 shares one deterministic erasure marker across Mongo repository hosts', async () => {
  const { db, rows, options } = collection();
  const first = new MongoUserChangeRepository(async () => db), second = new MongoUserChangeRepository(async () => db);
  await Promise.all([first.recordErasure('user', '2026-10-31T10:00:00Z'), second.recordErasure('user', '2026-10-31T11:00:00Z')]);
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ _id: 'account-erasure:user', at: '2026-10-31T10:00:00Z' });
  expect(options).toEqual([{ upsert: true, writeConcern: { w: 'majority' } }, { upsert: true, writeConcern: { w: 'majority' } }]);
});
