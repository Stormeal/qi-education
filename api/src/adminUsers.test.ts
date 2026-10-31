import { authStoreDouble } from '../test/authStoreDouble.js';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, hashPassword, type AuthUser } from './auth.js';
import { createAuthRepository, InMemoryAuthRepository, type AuthRepository } from './authRepository.js';
import * as config from './config.js';
import { apiConfig } from './config.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryInstructorProfileRepository } from './instructorProfileRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { LocalMailSender, type MailSender } from './mailSender.js';
import { InMemoryPasswordResetRepository } from './passwordResetRepository.js';
import { createServer } from './server.js';

let accounts = authStoreDouble();
const mailUnavailable = { message: 'We could not send email right now. Please try again later.' };
const invalid = { message: 'This reset link is no longer valid. Request a new one.', code: 'reset-link-invalid' };
const limit = { message: 'This account already received three reset mails in the last hour.', code: 'reset-limit' };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

// Projection, authorization, independent field updates and shared recovery behavior are the breaks these cases guard.
describe.each(['', '/api'])('US-A001 isolated HTTP (%s)', prefix => {
  let servers: Server[], base: string, auth: InMemoryAuthRepository, tokens: InMemoryPasswordResetRepository;
  let mail: LocalMailSender, users: AuthUser[], now: number;
  async function start(repository: AuthRepository = auth, sender: MailSender = mail) {
    const server = createServer({ authRepository: repository, mailSender: sender, passwordResetRepository: tokens,
      passwordResetOptions: { now: () => now, appPublicUrl: 'https://example.test/' },
      courseRepository: new InMemoryCourseRepository(), courseContentRepository: new InMemoryCourseContentRepository(),
      courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
      careerPathRepository: new InMemoryCareerPathRepository(), instructorProfileRepository: new InMemoryInstructorProfileRepository(),
      learningProgressRepository: new InMemoryLearningProgressRepository(), muxVideoService: null, muxWebhookService: null,
      gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('Isolated only'); } },
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve)); servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  beforeEach(async () => {
    servers = []; auth = new InMemoryAuthRepository(); tokens = new InMemoryPasswordResetRepository(); mail = new LocalMailSender(() => {}); now = 1000;
    users = (await Promise.all(['student', 'teacher', 'admin'].map(role => auth.findByEmail(`${role}@qi-education.local`)))) as AuthUser[];
    accounts = authStoreDouble(users);
    base = await start();
  });
  afterEach(async () => { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  const session = (user: AuthUser, ttl = 3600) => createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET, ttl);
  function request(path: string, method = 'GET', body?: unknown, bearer: string | null = session(users[2]), origin = base) {
    return fetch(origin + prefix + path, { method, headers: { 'Content-Type': 'application/json', ...(bearer === null ? {} : { Authorization: 'Bearer ' + bearer }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const resetPath = () => `/admin/users/${users[0].id}/password-reset`;
  const rolePath = (id = users[0].id) => `/admin/users/${id}/role`;
  const rawToken = (index = 0) => mail.messages[index].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
  async function assertInvalid(raw: string) {
    for (const action of ['check', 'confirm']) {
      const result = await request('/auth/password-reset/' + action, 'POST', { token: raw, password: 'Changed456!' }, null);
      expect(result.status).toBe(410); expect(await result.json()).toEqual(invalid);
    }
  }
  it.each(['student', 'teacher', 'anonymous'])('AC02 denies %s on every route before target lookup', async role => {
    const bearer = role === 'anonymous' ? null : session(users[role === 'student' ? 0 : 1]);
    const find = vi.spyOn(auth, 'findById'); const reserve = vi.spyOn(tokens, 'reserve');
    for (const [path, method, body] of [['/admin/users?search=bad', 'GET', undefined], ['/admin/users/private-user/role', 'PATCH', { role: 'invalid' }],
      ['/admin/users/private-user/password-reset', 'POST', undefined]] as const) {
      const response = await request(path, method, body, bearer); expect(response.status).toBe(role === 'anonymous' ? 401 : 403);
      expect(await response.json()).toEqual({ message: role === 'anonymous' ? 'Authentication required' : 'Admin access is required' });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(find.mock.calls.every(([id]) => id !== 'private-user')).toBe(true); expect(reserve).not.toHaveBeenCalled(); expect(mail.messages).toEqual([]);
  });
  it.each(['malformed', 'expired'])('AC02 rejects a %s session on every route', async kind => {
    for (const [path, method, body] of [['/admin/users', 'GET', undefined], [rolePath(), 'PATCH', { role: 'teacher' }], [resetPath(), 'POST', undefined]] as const) {
      const response = await request(path, method, body, kind === 'malformed' ? 'bad' : session(users[2], -1));
      expect(response.status).toBe(401); expect(await response.json()).toEqual({ message: 'Invalid or expired session token' }); expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });
  it('AC03 returns precisely the six safe fields sorted by display name', async () => {
    users[0].enrolledCourseIds.push('private-course');
    const response = await request('/admin/users'); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ total: 3, users: [
      { id: users[2].id, email: 'admin@qi-education.local', displayName: 'Admin Demo', role: 'admin', status: 'active', createdAt: users[2].createdAt },
      { id: users[0].id, email: 'student@qi-education.local', displayName: 'Student Demo', role: 'student', status: 'active', createdAt: users[0].createdAt },
      { id: users[1].id, email: 'teacher@qi-education.local', displayName: 'Teacher Demo', role: 'teacher', status: 'active', createdAt: users[1].createdAt },
    ] });
  });
  it.each([' dEmO ', 'STuDeNt@', ' TEACHER dE ', 'not-a-match', ' '])('AC03 searches name/email with trimmed case-insensitive fragment %j', async search => {
    const response = await request('/admin/users?search=' + encodeURIComponent(search)); expect(response.status).toBe(200);
    const body = await response.json(); const emails: Record<string, string[]> = { ' dEmO ': ['admin@qi-education.local', 'student@qi-education.local', 'teacher@qi-education.local'],
      'STuDeNt@': ['student@qi-education.local'], ' TEACHER dE ': ['teacher@qi-education.local'], 'not-a-match': [], ' ': ['admin@qi-education.local', 'student@qi-education.local', 'teacher@qi-education.local'] };
    expect(body.users.map((u: { email: string }) => u.email)).toEqual(emails[search]); expect(body.total).toBe(emails[search].length);
  });
  it('AC03 limits sorted results to 50 but keeps the full match count', async () => {
    for (let i = 54; i >= 0; i--) await auth.createUser({ ...users[0], id: 'match-' + i, email: `match${i}@example.test`, displayName: 'Match ' + String(i).padStart(2, '0') });
    const response = await request('/admin/users?search=match'); expect(response.status).toBe(200); const body = await response.json();
    expect(body.total).toBe(55); expect(body.users).toHaveLength(50); expect(body.users[0].displayName).toBe('Match 00'); expect(body.users[49].displayName).toBe('Match 49');
    const all = await (await request('/admin/users')).json(); expect(all.total).toBe(58); expect(all.users).toHaveLength(50); expect(all.users[0].displayName).toBe('Admin Demo');
  });
  it.each(['?search=' + 'x'.repeat(101), '?search=a&search=b', '?search[name]=a'])('AC03 rejects invalid search %s', async query => {
    const response = await request('/admin/users' + query); expect(response.status).toBe(400); expect(await response.json()).toEqual({ message: expect.any(String) }); expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('AC03 accepts 100 trimmed characters and returns disabled accounts too', async () => {
    users[0].status = 'disabled'; users[0].displayName = 'x'.repeat(100);
    const response = await request('/admin/users?search=' + encodeURIComponent('  ' + 'x'.repeat(100) + '  ')); expect(response.status).toBe(200);
    const body = await response.json(); expect(body.total).toBe(1); expect(body.users[0].status).toBe('disabled');
  });
  it.each(['memory', 'mongodb'])('AC01 changes permissions on the existing session next request in %s', async kind => {
    const repository = kind === 'memory' ? auth : accounts.repository(); const origin = kind === 'memory' ? base : await start(repository);
    const bearer = session(users[0]); const response = await request(rolePath(), 'PATCH', { role: 'teacher' }, undefined, origin);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ id: users[0].id, email: users[0].email, displayName: 'Student Demo', role: 'teacher', status: 'active', createdAt: users[0].createdAt });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const profile = await request('/users/me/instructor-profile', 'PUT', { description: 'I teach.' }, bearer, origin); expect(profile.status).toBe(200);
    expect((await (await request('/auth/me', 'GET', undefined, bearer, origin)).json()).user.role).toBe('teacher');
    expect((await request(rolePath(), 'PATCH', { role: 'student' }, undefined, origin)).status).toBe(200);
    expect((await request('/users/me/instructor-profile', 'PUT', { description: 'Still teach?' }, bearer, origin)).status).toBe(403);
    expect((await repository.findById(users[0].id))!.enrolledCourseIds).toEqual([]);
  });
  it.each(['teacher', 'admin', 'disabled'])('DEF-027 next request cannot join an older %s authorization snapshot on another instance', async previous => {
    const a = accounts.repository(), b = accounts.repository(); const originA = await start(a), originB = await start(b);
    accounts.fake.documents.get(users[0].id)!.role = previous === 'disabled' ? 'student' : previous;
    const pause = deferred(), readStarted = deferred(); let holdFirst = true;
    accounts.beforeRead = async () => { if (holdFirst) { holdFirst = false; readStarted.resolve(); await pause.promise; } };
    const stale = b.findById(users[0].id); await readStarted.promise;
    if (previous === 'disabled') accounts.fake.documents.get(users[0].id)!.status = 'disabled';
    else expect((await request(rolePath(), 'PATCH', { role: 'student' }, undefined, originA)).status).toBe(200);
    const nextRead = deferred(), original = b.findById.bind(b);
    vi.spyOn(b, 'findById').mockImplementation((...args) => { nextRead.resolve(); return original(...args); });
    const pending = request(previous === 'disabled' ? '/auth/me' : previous === 'admin' ? '/admin/users' : '/users/me/instructor-profile', 'GET', undefined, session(users[0]), originB);
    await nextRead.promise; pause.resolve(); await stale;
    const result = await pending; expect(result.status).toBe(previous === 'disabled' ? 401 : 403);
    expect(await result.json()).toEqual({ message: previous === 'disabled' ? 'Authentication required' : previous === 'admin' ? 'Admin access is required' : 'Teacher or admin access is required' });
  });
  it('AC01 grants admin permission and removes it using the same signed token', async () => {
    const bearer = session(users[0]); await request(rolePath(), 'PATCH', { role: 'admin' });
    expect((await request('/admin/users', 'GET', undefined, bearer)).status).toBe(200);
    await request(rolePath(), 'PATCH', { role: 'student' }); expect((await request('/admin/users', 'GET', undefined, bearer)).status).toBe(403);
  });
  it.each([{}, { role: 'owner' }, { role: null }, { role: 1 }])('AC04 rejects role body %j without a write', async body => {
    const before = structuredClone(users[0]); const response = await request(rolePath(), 'PATCH', body); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: expect.any(String) }); expect(await auth.findById(before.id)).toEqual(before);
  });
  it('AC04 missing accounts are 404 for role and reset', async () => {
    for (const [path, method, body] of [['/admin/users/missing/role', 'PATCH', { role: 'teacher' }], ['/admin/users/missing/password-reset', 'POST', undefined]] as const) {
      const response = await request(path, method, body); expect(response.status).toBe(404); expect(await response.json()).toEqual({ message: 'User not found' });
    }
  });
  it.each(['student', 'teacher', 'admin'])('AC04 refuses own role even for %s', async role => {
    const response = await request(rolePath(users[2].id), 'PATCH', { role }); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'You cannot change your own role.', code: 'own-role' }); expect(users[2].role).toBe('admin');
  });
  it('AC04 same-role retry is 200 and leaves the target account unchanged', async () => {
    const repo = accounts.repository(), before = await repo.findById(users[0].id);
    const origin = await start(repo); const response = await request(rolePath(), 'PATCH', { role: 'student' }, undefined, origin);
    expect(response.status).toBe(200); expect((await response.json()).role).toBe('student');
    expect(await repo.findById(users[0].id)).toEqual(before); expect(accounts.writes).not.toContain('role');
  });
  it('AC04 role update survives overlapping enrollment and an actual reset confirmation', async () => {
    const repo = accounts.repository(), origin = await start(repo); const pause = deferred(), entered = deferred();
    accounts.beforeWrite = async range => { if (range === 'role') { entered.resolve(); await pause.promise; } };
    const pending = request(rolePath(), 'PATCH', { role: 'teacher' }, undefined, origin); await entered.promise;
    expect((await request(resetPath(), 'POST', undefined, undefined, origin)).status).toBe(202); const raw = rawToken();
    expect((await request('/auth/password-reset/confirm', 'POST', { token: raw, password: 'Changed456!' }, null, origin)).status).toBe(204);
    await accounts.repository().enrollUserInCourse(users[0].id, 'new-course'); pause.resolve();
    expect((await pending).status).toBe(200); const stored = (await repo.findById(users[0].id))!;
    expect(stored.role).toBe('teacher'); expect(stored.enrolledCourseIds).toEqual(['new-course']);
    expect((await request('/auth/login', 'POST', { email: users[0].email, password: 'Changed456!' }, null, origin)).status).toBe(200);
    expect((await request('/auth/login', 'POST', { email: users[0].email, password: 'Password123!' }, null, origin)).status).toBe(401);
    await assertInvalid(raw);
  });
  it('AC05 sends the ordinary mail; its token is checked, used once and sends one notice', async () => {
    const reserve = vi.spyOn(tokens, 'reserve'); const response = await request(resetPath(), 'POST'); expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ message: 'A reset link was sent to student@qi-education.local.' }); expect(response.headers.get('cache-control')).toBe('no-store');
    const raw = rawToken(); expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    expect(mail.messages).toEqual([{ to: 'student@qi-education.local', subject: 'Reset your QI Academy password',
      text: `We received a request to reset your QI Academy password.\n\nUse this link within 60 minutes:\nhttps://example.test/reset-password#token=${raw}\n\nIf you did not request this, you can ignore this message.` }]);
    expect(reserve.mock.calls[0][1]).toBe(createHash('sha256').update(raw).digest('hex')); expect(reserve.mock.calls[0][1]).not.toBe(raw);
    expect((await request('/auth/password-reset/check', 'POST', { token: raw }, null)).status).toBe(204);
    expect((await request('/auth/password-reset/confirm', 'POST', { token: raw, password: 'Changed456!' }, null)).status).toBe(204);
    await assertInvalid(raw); expect(mail.messages[1]).toEqual({ to: 'student@qi-education.local', subject: 'Your QI Academy password was changed',
      text: 'Your QI Academy password was changed. If you did not make this change, contact QI Academy support.' }); expect(mail.messages).toHaveLength(2);
    for (const [password, status] of [['Password123!', 401], ['Changed456!', 200]] as const) expect((await request('/auth/login', 'POST', { email: users[0].email, password }, null)).status).toBe(status);
  });
  it('AC05 expires the admin-issued token at exactly 60 minutes', async () => {
    expect((await request(resetPath(), 'POST')).status).toBe(202); const raw = rawToken(); now += 3599999;
    expect((await request('/auth/password-reset/check', 'POST', { token: raw }, null)).status).toBe(204); now++; await assertInvalid(raw);
  });
  it('AC06 reports inactive account without reserving or sending', async () => {
    users[0].status = 'disabled'; const response = await request(resetPath(), 'POST'); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'This account is not active.', code: 'account-inactive' }); expect(mail.messages).toEqual([]);
  });
  it('AC06 public and admin mail share three slots across API instances and free them on the rolling hour', async () => {
    const second = await start(); expect((await request('/auth/password-reset/request', 'POST', { email: users[0].email }, null)).status).toBe(202);
    expect((await request(resetPath(), 'POST')).status).toBe(202); expect((await request(resetPath(), 'POST', undefined, undefined, second)).status).toBe(202);
    let response = await request(resetPath(), 'POST'); expect(response.status).toBe(409); expect(await response.json()).toEqual(limit);
    expect((await request('/auth/password-reset/request', 'POST', { email: users[0].email }, null)).status).toBe(202); expect(mail.messages).toHaveLength(3);
    now += 3600000; response = await request(resetPath(), 'POST'); expect(response.status).toBe(202); expect(mail.messages).toHaveLength(4);
  });
  it('AC06 overlapping admin resets send only three messages', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => request(resetPath(), 'POST')));
    expect(responses.map(r => r.status).sort()).toEqual([202, 202, 202, 409, 409, 409, 409, 409]); expect(mail.messages).toHaveLength(3);
  });
  it('AC06 unconfigured mail returns exact 503 and stores nothing', async () => {
    const reserve = vi.spyOn(tokens, 'reserve'); const origin = await start(auth, { available: false, provider: 'local', async send() { throw new Error('Must not send'); } });
    const response = await request(resetPath(), 'POST', undefined, undefined, origin); expect(response.status).toBe(503); expect(await response.json()).toEqual(mailUnavailable);
    expect(reserve).not.toHaveBeenCalled();
  });
  it('AC06 failed mail leaves an unusable pending token and no private logs', async () => {
    let raw = ''; const log = vi.spyOn(console, 'log').mockImplementation(() => {}); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const origin = await start(auth, { available: true, provider: 'local', async send(message) { raw = message.text.match(/#token=([A-Za-z0-9_-]+)/)![1]; throw new Error('private ' + users[0].passwordHash); } });
    for (let i = 0; i < 3; i++) { const response = await request(resetPath(), 'POST', undefined, undefined, origin); expect(response.status).toBe(503); expect(await response.json()).toEqual(mailUnavailable); await assertInvalid(raw); }
    const response = await request(resetPath(), 'POST', undefined, undefined, origin); expect(response.status).toBe(409); expect(await response.json()).toEqual(limit);
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it('AC06 failed notice does not fail confirmation of an admin link', async () => {
    await request(resetPath(), 'POST'); const raw = rawToken(); vi.spyOn(mail, 'send').mockRejectedValueOnce(new Error('notice failed'));
    expect((await request('/auth/password-reset/confirm', 'POST', { token: raw, password: 'Changed456!' }, null)).status).toBe(204); await assertInvalid(raw);
  });
  it.each(['list', 'role', 'reset', 'auth'])('AC06 safely handles %s storage failures without private diagnostics', async action => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    if (action === 'list') vi.spyOn(auth, 'listUsers').mockRejectedValueOnce(new Error('private ' + users[0].passwordHash));
    if (action === 'role') vi.spyOn(auth, 'updateRoleWithChange').mockRejectedValueOnce(new Error('private ' + users[0].passwordHash));
    if (action === 'reset') vi.spyOn(tokens, 'reserve').mockRejectedValueOnce(new Error('private ' + users[0].passwordHash));
    if (action === 'auth') vi.spyOn(auth, 'findById').mockRejectedValueOnce(new Error('private ' + users[0].passwordHash));
    const response = await request(action === 'list' || action === 'auth' ? '/admin/users' : action === 'role' ? rolePath() : resetPath(),
      action === 'list' || action === 'auth' ? 'GET' : action === 'role' ? 'PATCH' : 'POST', action === 'role' ? { role: 'teacher' } : undefined);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: expect.any(String) }); expect(response.headers.get('cache-control')).toBe('no-store'); expect(error).not.toHaveBeenCalled();
  });
  it('AC02 no-store also covers malformed JSON on both mutation paths', async () => {
    for (const path of [rolePath(), resetPath()]) {
      const response = await fetch(base + prefix + path, { method: path.endsWith('/role') ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session(users[2]) }, body: '{' });
      expect(response.status).toBe(400); expect(await response.json()).toEqual({ message: expect.any(String) }); expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });
});

describe('US-A001 repository field-only role updates', () => {
  beforeEach(() => { accounts = authStoreDouble(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it.each(['memory', 'mongodb'])('changes role and preserves independent account fields in %s', async kind => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!; user.enrolledCourseIds.push('existing-course');
    const before = structuredClone(user); accounts = authStoreDouble([user]);
    const repo = kind === 'memory' ? memory : accounts.repository(); expect(await repo.updateRole(user.id, 'teacher')).toEqual({ ...before, role: 'teacher' });
    expect(await repo.findById(user.id)).toEqual({ ...before, role: 'teacher' });
    expect(await repo.updateRole(user.id, 'teacher')).toEqual({ ...before, role: 'teacher' });
    if (kind === 'mongodb') expect(accounts.writes).toEqual(['role']);
    expect(await repo.updateRole('missing', 'teacher')).toBeNull();
  });
  it.each(['role-first', 'role-last'])('preserves enrollment and password with %s overlapping writes in separate Mongo adapters', async order => {
    const memory = new InMemoryAuthRepository(); const user = (await memory.findByEmail('student@qi-education.local'))!;
    accounts = authStoreDouble([user]); const pause = deferred(), entered = deferred();
    accounts.beforeWrite = async range => { if (order === 'role-last' ? range === 'role' : range === 'enrolledCourseIds') { entered.resolve(); await pause.promise; } };
    const role = accounts.repository(), enrollment = accounts.repository(), password = accounts.repository();
    const pending = order === 'role-last' ? role.updateRole(user.id, 'teacher') : enrollment.enrollUserInCourse(user.id, 'new-course'); await entered.promise;
    const newHash = hashPassword('Changed456!'); await password.updatePasswordHash(user.id, newHash);
    if (order === 'role-last') await enrollment.enrollUserInCourse(user.id, 'new-course'); else await role.updateRole(user.id, 'teacher');
    pause.resolve(); await pending; const stored = (await role.findById(user.id))!;
    expect(stored.role).toBe('teacher'); expect(stored.passwordHash).toBe(newHash); expect(stored.enrolledCourseIds).toEqual(['new-course']);
    expect(stored).toEqual({ ...user, role: 'teacher', passwordHash: newHash, enrolledCourseIds: ['new-course'] });
  });
  it('does not expose seeded users or permit roles with unavailable production storage', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.spyOn(config, 'hasMongoConfig').mockReturnValue(false);
    const repo = createAuthRepository(); await expect(repo.listUsers()).rejects.toThrow(); await expect(repo.updateRole('user', 'admin')).rejects.toThrow();
  });
});
