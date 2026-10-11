import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authSheetHeaders, authUserToSheetRow, createSessionToken, type AuthUser } from './auth.js';
import { GoogleSheetsAuthRepository, InMemoryAuthRepository, type AuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { LocalMailSender } from './mailSender.js';
import { InMemoryPasswordResetRepository } from './passwordResetRepository.js';
import { createServer } from './server.js';
import type { UserChange } from './userChangeRepository.js';

const sheets = vi.hoisted(() => ({ rows: [] as string[][], writes: [] as string[], beforeRead: async () => {}, beforeWrite: async (_range: string) => {} }));
vi.mock('./googleSheets.js', () => ({ ensureWorksheetHeaders: async () => {}, createSheetsClient: () => ({ spreadsheets: { values: {
  get: async () => { const values = structuredClone(sheets.rows); await sheets.beforeRead(); return { data: { values } }; },
  update: async ({ range, requestBody, valueInputOption }: { range: string; requestBody: { values: string[][] }; valueInputOption: string }) => {
    expect(valueInputOption).toBe('RAW'); await sheets.beforeWrite(range);
    const cell = range.match(/!([DEFH])(\d+)$/); if (!cell) throw new Error('Non-cell write');
    const col = { D: 3, E: 4, F: 5, H: 7 }[cell[1]]!; sheets.writes.push(range); sheets.rows[Number(cell[2]) - 1][col] = requestBody.values[0][0]; return {};
  },
} } }) }));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
class ChangeDouble {
  entries: UserChange[] = [];
  append = vi.fn(async (change: UserChange) => { this.entries.push(structuredClone(change)); });
  recent = vi.fn(async () => structuredClone(this.entries).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, 50));
}

describe.each(['', '/api'])('US-A001 account status/change HTTP (%s)', prefix => {
  let servers: Server[], base: string, auth: InMemoryAuthRepository, changes: ChangeDouble, users: AuthUser[], mail: LocalMailSender, tokens: InMemoryPasswordResetRepository;
  let now: number, id: number;
  async function start(repository: AuthRepository = auth) {
    const server = createServer({ authRepository: repository, userChangeRepository: changes,
      userChangeOptions: { now: () => now, createId: () => 'change-' + String(++id).padStart(3, '0') },
      mailSender: mail, passwordResetRepository: tokens, passwordResetOptions: { now: () => now, appPublicUrl: 'https://example.test' },
      gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('No provider'); } }, muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1'); servers.push(server); await new Promise<void>(resolve => server.once('listening', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  beforeEach(async () => {
    servers = []; auth = new InMemoryAuthRepository(); users = await auth.listUsers(); changes = new ChangeDouble(); mail = new LocalMailSender(() => {}); tokens = new InMemoryPasswordResetRepository(); now = Date.parse('2026-10-11T12:00:00Z'); id = 0;
    sheets.rows = [[...authSheetHeaders], ...users.map(authUserToSheetRow)]; sheets.writes = []; sheets.beforeRead = async () => {}; sheets.beforeWrite = async () => {}; base = await start();
  });
  afterEach(async () => { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); vi.restoreAllMocks(); });
  const session = (user: AuthUser, ttl = 3600) => createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET, ttl);
  function request(path: string, method = 'GET', body?: unknown, bearer: string | null = session(users[2]), origin = base) {
    return fetch(origin + prefix + path, { method, headers: { 'Content-Type': 'application/json', ...(bearer === null ? {} : { Authorization: 'Bearer ' + bearer }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const statusPath = (userId = users[0].id) => `/admin/users/${userId}/status`;
  const rolePath = () => `/admin/users/${users[0].id}/role`;
  const dto = (user: AuthUser) => ({ id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status, createdAt: user.createdAt });
  it('DEF-031 disabled login is exactly a wrong-password failure on both aliases', async () => {
    users[0].status = 'disabled';
    for (const route of ['/auth/login', '/login']) {
      const wrong = await request(route, 'POST', { email: users[0].email, password: 'wrong' }, null); const correct = await request(route, 'POST', { email: users[0].email, password: 'Password123!' }, null);
      expect(correct.status).toBe(wrong.status); expect(await correct.json()).toEqual(await wrong.json());
    }
  });
  it.each([{ before: 'active', after: 'disabled', expected: 401 }, { before: 'disabled', after: 'active', expected: 200 }])('DEF-032 login after another instance changes status ignores an older $before snapshot', async ({ before, after, expected }) => {
    const a = new GoogleSheetsAuthRepository(), b = new GoogleSheetsAuthRepository(); const originA = await start(a), originB = await start(b);
    sheets.rows[1][5] = before;
    const entered = deferred(), release = deferred(); let first = true;
    sheets.beforeRead = async () => { if (first) { first = false; entered.resolve(); await release.promise; } };
    const stale = b.findByEmail(users[0].email); await entered.promise;
    expect((await request(statusPath(), 'PATCH', { status: after }, undefined, originA)).status).toBe(200);
    const loginStarted = deferred(), original = b.findByEmail.bind(b); vi.spyOn(b, 'findByEmail').mockImplementation((...args) => { loginStarted.resolve(); return original(...args); });
    const login = request('/auth/login', 'POST', { email: users[0].email, password: 'Password123!' }, null, originB);
    await loginStarted.promise; release.resolve(); await stale; const response = await login; expect(response.status).toBe(expected); if (expected === 401) expect(await response.json()).toEqual({ message: 'Invalid email or password' });
  });
  it.each(['student', 'teacher', 'anonymous', 'malformed', 'expired'])('AC11 rejects %s before any target/log read', async role => {
    const bearer = role === 'anonymous' ? null : role === 'malformed' ? 'bad' : session(users[role === 'student' ? 0 : role === 'teacher' ? 1 : 2], role === 'expired' ? -1 : 3600);
    const find = vi.spyOn(auth, 'findById');
    for (const [path, method, body] of [[statusPath('private-target'), 'PATCH', { status: 'invalid' }], ['/admin/users/changes', 'GET', undefined]] as const) {
      const response = await request(path, method, body, bearer); expect(response.status).toBe(['student', 'teacher'].includes(role) ? 403 : 401); expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ message: ['student', 'teacher'].includes(role) ? 'Admin access is required' : role === 'anonymous' ? 'Authentication required' : 'Invalid or expired session token' });
    }
    expect(find.mock.calls.every(([userId]) => userId !== 'private-target')).toBe(true); expect(changes.recent).not.toHaveBeenCalled(); expect(changes.append).not.toHaveBeenCalled();
  });
  it.each([{}, { status: 'inactive' }, { status: '' }, { status: null }, { status: 1 }, { status: ['disabled'] }])('AC10 invalid status %j', async body => {
    const write = vi.spyOn(auth, 'updateStatus'); const response = await request(statusPath(), 'PATCH', body); expect(response.status).toBe(400); expect(await response.json()).toEqual({ message: expect.any(String) }); expect(response.headers.get('cache-control')).toBe('no-store'); expect(write).not.toHaveBeenCalled(); expect(changes.append).not.toHaveBeenCalled();
  });
  it.each(['active', 'disabled'])('AC10 refuses own status %s including no-op', async status => {
    const response = await request(statusPath(users[2].id), 'PATCH', { status }); expect(response.status).toBe(409); expect(await response.json()).toEqual({ message: 'You cannot change the status of your own account.', code: 'own-status' }); expect(changes.entries).toEqual([]);
  });
  it('AC10 missing target is 404 without an entry', async () => {
    const response = await request(statusPath('missing'), 'PATCH', { status: 'disabled' }); expect(response.status).toBe(404); expect(await response.json()).toEqual({ message: 'User not found' }); expect(response.headers.get('cache-control')).toBe('no-store'); expect(changes.entries).toEqual([]);
  });
  it.each(['memory', 'sheets'])('AC07 status revokes and restores old session/login in %s', async kind => {
    const repository = kind === 'memory' ? auth : new GoogleSheetsAuthRepository(); const origin = kind === 'memory' ? base : await start(repository); const bearer = session(users[0]);
    const disable = await request(statusPath(), 'PATCH', { status: 'disabled' }, undefined, origin); expect(disable.status).toBe(200); expect(await disable.json()).toEqual({ ...dto(users[0]), status: 'disabled' }); expect(disable.headers.get('cache-control')).toBe('no-store');
    expect((await request('/auth/me', 'GET', undefined, bearer, origin)).status).toBe(401);
    const login = await request('/auth/login', 'POST', { email: users[0].email, password: 'Password123!' }, null, origin); expect(login.status).toBe(401); expect(await login.json()).toEqual({ message: 'Invalid email or password' });
    const enable = await request(statusPath(), 'PATCH', { status: 'active' }, undefined, origin); expect(enable.status).toBe(200); expect(await enable.json()).toEqual(dto(users[0]));
    expect((await request('/auth/me', 'GET', undefined, bearer, origin)).status).toBe(200); expect((await request('/auth/login', 'POST', { email: users[0].email, password: 'Password123!' }, null, origin)).status).toBe(200);
    expect(changes.entries.map(change => [change.field, change.from, change.to])).toEqual([['status', 'active', 'disabled'], ['status', 'disabled', 'active']]);
    if (kind === 'sheets') expect(sheets.writes).toEqual(['Users!F2', 'Users!F2']);
  });
  it('AC08 unchanged role/status is 200 with no write or entry', async () => {
    const status = vi.spyOn(auth, 'updateStatusWithChange'), role = vi.spyOn(auth, 'updateRoleWithChange');
    for (const [path, body] of [[statusPath(), { status: 'active' }], [rolePath(), { role: 'student' }]]) { const response = await request(path as string, 'PATCH', body); expect(response.status).toBe(200); expect(await response.json()).toEqual(dto(users[0])); }
    expect(status).toHaveBeenCalledOnce(); expect(role).toHaveBeenCalledOnce(); expect((await status.mock.results[0].value).previous).toBeNull(); expect((await role.mock.results[0].value).previous).toBeNull(); expect(changes.entries).toEqual([]);
  });
  it('AC08 captures exact snapshots for role and status, never private fields', async () => {
    const original = structuredClone(users); await request(rolePath(), 'PATCH', { role: 'teacher' }); now += 1000; await request(statusPath(), 'PATCH', { status: 'disabled' });
    for (const user of await auth.listUsers()) { user.displayName = 'Renamed'; user.email = 'renamed@example.test'; }
    const response = await request('/admin/users/changes'); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); expect(await response.json()).toEqual({ changes: [
      { id: 'change-002', at: '2026-10-11T12:00:01.000Z', actor: { id: original[2].id, displayName: original[2].displayName }, target: { id: original[0].id, displayName: original[0].displayName, email: original[0].email }, field: 'status', from: 'active', to: 'disabled' },
      { id: 'change-001', at: '2026-10-11T12:00:00.000Z', actor: { id: original[2].id, displayName: original[2].displayName }, target: { id: original[0].id, displayName: original[0].displayName, email: original[0].email }, field: 'role', from: 'student', to: 'teacher' },
    ] });
  });
  it('AC08 empty log and newest 50 preserve older records and strip extra fields', async () => {
    const empty = await request('/admin/users/changes'); expect(empty.status).toBe(200); expect(await empty.json()).toEqual({ changes: [] });
    for (let i = 0; i < 55; i++) changes.entries.push({ id: String(i), at: new Date(now + i * 1000).toISOString(), actor: { id: 'actor', displayName: 'Actor', passwordHash: 'secret' }, target: { id: 'target', displayName: 'Target', email: 'target@example.test', enrolledCourseIds: ['private'] }, field: 'role', from: 'student', to: 'teacher', passwordHash: 'secret', _id: 'mongo' } as UserChange);
    const body = await (await request('/admin/users/changes')).json(); expect(body.changes).toHaveLength(50); expect(body.changes.map((c: UserChange) => c.id)).toEqual(Array.from({ length: 50 }, (_, i) => String(54 - i))); expect(JSON.stringify(body)).not.toMatch(/secret|passwordHash|enrolledCourseIds|_id/); expect(changes.entries).toHaveLength(55);
  });
  it.each(['role', 'status'])('AC13 another instance already set %s: adapter no-op creates no false entry', async field => {
    const old = structuredClone(users[0]); const desired = field === 'role' ? 'teacher' : 'disabled';
    if (field === 'role') users[0].role = 'teacher'; else users[0].status = 'disabled';
    const find = auth.findById.bind(auth); vi.spyOn(auth, 'findById').mockImplementation(async userId => userId === users[0].id ? old : find(userId));
    const response = await request(field === 'role' ? rolePath() : statusPath(), 'PATCH', { [field]: desired }); expect(response.status).toBe(200); expect((await response.json())[field]).toBe(desired); expect(changes.append).not.toHaveBeenCalled();
  });
  it('AC13 role log uses the adapter actual previous role rather than an earlier route lookup', async () => {
    const old = structuredClone(users[0]); users[0].role = 'teacher'; const find = auth.findById.bind(auth); vi.spyOn(auth, 'findById').mockImplementation(async userId => userId === users[0].id ? old : find(userId));
    const response = await request(rolePath(), 'PATCH', { role: 'admin' }); expect(response.status).toBe(200); expect(changes.entries).toHaveLength(1); expect(changes.entries[0].from).toBe('teacher'); expect(changes.entries[0].to).toBe('admin');
  });
  it.each(['role', 'status'])('AC13 failed log still commits %s with one safe diagnostic', async field => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); changes.append.mockRejectedValue(new Error('private provider address/name'));
    const response = await request(field === 'role' ? rolePath() : statusPath(), 'PATCH', field === 'role' ? { role: 'teacher' } : { status: 'disabled' }); expect(response.status).toBe(200); expect((await response.json())[field]).toBe(field === 'role' ? 'teacher' : 'disabled'); expect((await auth.findById(users[0].id))![field]).toBe(field === 'role' ? 'teacher' : 'disabled'); expect(warn).toHaveBeenCalledTimes(1); expect(warn.mock.calls).toEqual([['User change log write failed.']]);
  });
  it.each(['role', 'status'])('AC13 failed %s account write never appends', async field => {
    vi.spyOn(auth, field === 'role' ? 'updateRoleWithChange' : 'updateStatusWithChange').mockRejectedValue(new Error('private')); const response = await request(field === 'role' ? rolePath() : statusPath(), 'PATCH', field === 'role' ? { role: 'teacher' } : { status: 'disabled' }); expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: 'User management is temporarily unavailable. Please try again later.' }); expect(changes.append).not.toHaveBeenCalled(); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('AC11 failed log read is safe no-store 503', async () => {
    changes.recent.mockRejectedValue(new Error('private')); const response = await request('/admin/users/changes'); expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: 'User management is temporarily unavailable. Please try again later.' }); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('AC11 malformed JSON keeps no-store and has no entry', async () => {
    const response = await fetch(base + prefix + statusPath(), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session(users[2]) }, body: '{' }); expect(response.status).toBe(400); expect(await response.json()).toEqual({ message: expect.any(String) }); expect(response.headers.get('cache-control')).toBe('no-store'); expect(changes.entries).toEqual([]);
  });
  it.each(['role', 'status'])('AC13 overlapping identical %s changes write/log once', async field => {
    const method = field === 'role' ? 'updateRoleWithChange' : 'updateStatusWithChange'; const original = auth[method].bind(auth); const entered = deferred(), release = deferred();
    const write = vi.spyOn(auth, method).mockImplementation(async (...args) => { entered.resolve(); await release.promise; return original(...args as never); });
    const path = field === 'role' ? rolePath() : statusPath(); const body = field === 'role' ? { role: 'teacher' } : { status: 'disabled' };
    const a = request(path, 'PATCH', body); await entered.promise; const b = request(path, 'PATCH', body); release.resolve(); const replies = await Promise.all([a, b]); expect(replies.map(r => r.status)).toEqual([200, 200]); expect(write).toHaveBeenCalledTimes(2); const outcomes = await Promise.all(write.mock.results.map(result => result.value)); expect(outcomes.filter(result => result.previous !== null)).toHaveLength(1); expect(changes.append).toHaveBeenCalledOnce();
  });
  it('AC12 held F write survives independent enrollment, role and actual reset confirmation', async () => {
    const repository = new GoogleSheetsAuthRepository(); const origin = await start(repository); const entered = deferred(), release = deferred();
    sheets.beforeWrite = async range => { if (range === 'Users!F2') { entered.resolve(); await release.promise; } };
    const disable = request(statusPath(), 'PATCH', { status: 'disabled' }, undefined, origin); await entered.promise;
    await repository.enrollUserInCourse(users[0].id, 'demo-course-1'); await repository.updateRole(users[0].id, 'teacher');
    expect((await request(`/admin/users/${users[0].id}/password-reset`, 'POST', undefined, undefined, origin)).status).toBe(202); const raw = mail.messages[0].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    expect((await request('/auth/password-reset/confirm', 'POST', { token: raw, password: 'Changed456!' }, null, origin)).status).toBe(204);
    release.resolve(); expect((await disable).status).toBe(200); const stored = await repository.findById(users[0].id, { fresh: true }); expect(stored!.status).toBe('disabled'); expect(stored!.role).toBe('teacher'); expect(stored!.enrolledCourseIds).toEqual(['demo-course-1']); expect(stored!.passwordHash).not.toBe(users[0].passwordHash); expect(sheets.writes).toEqual(['Users!H2', 'Users!E2', 'Users!D2', 'Users!F2']);
  });
});
