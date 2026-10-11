import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { createUserChangeRepository, InMemoryUserChangeRepository, MongoUserChangeRepository, type UserChange, type UserChangeCollection } from './userChangeRepository.js';
const change = (id = 'change', at = '2026-10-11T12:00:00.000Z'): UserChange => ({ id, at, actor: { id: 'admin', displayName: 'Original Admin' }, target: { id: 'user', displayName: 'Original User', email: 'user@example.test' }, field: 'status', from: 'active', to: 'disabled' });
function collection() {
  const rows: Array<Omit<UserChange, 'id'> & { _id: string }> = []; const options: unknown[] = [];
  const db: UserChangeCollection = {
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
