import { afterEach, describe, expect, it, vi } from 'vitest';
import { authSheetHeaders, authUserToSheetRow } from './auth.js';
import { GoogleSheetsAuthRepository, InMemoryAuthRepository } from './authRepository.js';
const store = vi.hoisted(() => ({ rows: [] as string[][], writes: [] as unknown[], beforeWrite: async () => {} }));
vi.mock('./googleSheets.js', () => ({ createSheetsClient: () => ({ spreadsheets: { values: {
  get: async () => ({ data: { values: structuredClone(store.rows) } }),
  update: async (input: { range: string; requestBody: { values: string[][] }; valueInputOption: string }) => { await store.beforeWrite(); expect(input.valueInputOption).toBe('RAW'); const cell = input.range.match(/!([EF])(\d+)$/); expect(cell).not.toBeNull(); store.writes.push(input); store.rows[Number(cell![2]) - 1][cell![1] === 'E' ? 4 : 5] = input.requestBody.values[0][0]; return {}; },
} } }), ensureWorksheetHeaders: async () => {} }));
afterEach(() => vi.restoreAllMocks());
describe.each(['memory', 'sheets'])('US-A001 status repository %s', kind => {
  async function setup() { const memory = new InMemoryAuthRepository(); const users = await memory.listUsers(); store.rows = [[...authSheetHeaders], ...users.map(authUserToSheetRow)]; store.writes = []; store.beforeWrite = async () => {}; return { repo: kind === 'memory' ? memory : new GoogleSheetsAuthRepository(), user: structuredClone(users[0]) }; }
  it('updates active/disabled without losing other fields and no-ops unchanged status', async () => { const { repo, user } = await setup(); expect(await repo.updateStatus(user.id, 'active')).toEqual(user); expect(store.writes).toEqual([]); expect(await repo.updateStatus(user.id, 'disabled')).toEqual({ ...user, status: 'disabled' }); expect(await repo.updateStatus(user.id, 'disabled')).toEqual({ ...user, status: 'disabled' }); expect(await repo.updateStatus(user.id, 'active')).toEqual(user); if (kind === 'sheets') expect(store.writes).toHaveLength(2); });
  it.each(['role', 'status'])('reports the adapter prior %s only when it actually writes', async field => {
    const { repo, user } = await setup(); const desired = field === 'role' ? 'teacher' : 'disabled';
    const mutate = field === 'role' ? () => repo.updateRoleWithChange(user.id, 'teacher') : () => repo.updateStatusWithChange(user.id, 'disabled');
    expect(await mutate()).toEqual({ user: { ...user, [field]: desired }, previous: user });
    expect(await mutate()).toEqual({ user: { ...user, [field]: desired }, previous: null });
    if (kind === 'sheets') expect(store.writes).toHaveLength(1);
  });
  it('missing user returns null without a cell write', async () => { const { repo } = await setup(); expect(await repo.updateStatus('missing', 'disabled')).toBeNull(); expect(store.writes).toEqual([]); });
  it('read after changing status is fresh, not a previous cached object', async () => { const { repo, user } = await setup(); const before = await repo.findById(user.id); await repo.updateStatus(user.id, 'disabled'); expect(before!.status).toBe('active'); expect((await repo.findById(user.id, { fresh: true }))!.status).toBe('disabled'); });
});
