import { afterEach, describe, expect, it, vi } from 'vitest';
import { authStoreDouble } from '../test/authStoreDouble.js';
import { InMemoryAuthRepository } from './authRepository.js';
afterEach(() => vi.restoreAllMocks());
describe.each(['memory', 'mongodb'])('US-A001 status repository %s', kind => {
  async function setup() { const memory = new InMemoryAuthRepository(); const users = await memory.listUsers(); const store = authStoreDouble(users); return { store, repo: kind === 'memory' ? memory : store.repository(), user: structuredClone(users[0]) }; }
  it('updates active/disabled without losing other fields and no-ops unchanged status', async () => { const { repo, user, store } = await setup(); expect(await repo.updateStatus(user.id, 'active')).toEqual(user); expect(store.writes).toEqual([]); expect(await repo.updateStatus(user.id, 'disabled')).toEqual({ ...user, status: 'disabled' }); expect(await repo.updateStatus(user.id, 'disabled')).toEqual({ ...user, status: 'disabled' }); expect(await repo.updateStatus(user.id, 'active')).toEqual(user); if (kind === 'mongodb') expect(store.writes).toHaveLength(2); });
  it.each(['role', 'status'])('reports the adapter prior %s only when it actually writes', async field => {
    const { repo, user, store } = await setup(); const desired = field === 'role' ? 'teacher' : 'disabled';
    const mutate = field === 'role' ? () => repo.updateRoleWithChange(user.id, 'teacher') : () => repo.updateStatusWithChange(user.id, 'disabled');
    expect(await mutate()).toEqual({ user: { ...user, [field]: desired }, previous: user });
    expect(await mutate()).toEqual({ user: { ...user, [field]: desired }, previous: null });
    if (kind === 'mongodb') expect(store.writes).toHaveLength(1);
  });
  it('missing user returns null without a write', async () => { const { repo, store } = await setup(); expect(await repo.updateStatus('missing', 'disabled')).toBeNull(); expect(store.writes).toEqual([]); });
  it('read after changing status is fresh, not a previous cached object', async () => { const { repo, user, store } = await setup(); const before = await repo.findById(user.id); await repo.updateStatus(user.id, 'disabled'); expect(before!.status).toBe('active'); expect((await repo.findById(user.id, { fresh: true }))!.status).toBe('disabled'); });
});
