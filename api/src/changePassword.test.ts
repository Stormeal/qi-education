import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authSheetHeaders, authUserToSheetRow, createSessionToken, signupSchema, type AuthUser } from './auth.js';
import { GoogleSheetsAuthRepository, InMemoryAuthRepository, type AuthRepository } from './authRepository.js';
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

const sheet = vi.hoisted(() => ({ rows: [] as string[][] }));
vi.mock('./googleSheets.js', () => ({ createSheetsClient: () => ({ spreadsheets: { values: {
  get: async () => ({ data: { values: structuredClone(sheet.rows) } }),
  update: async ({ range, requestBody, valueInputOption }: { range: string; requestBody: { values: string[][] }; valueInputOption: string }) => {
    expect(valueInputOption).toBe('RAW'); const row = /!D(\d+)$/.exec(range)!;
    sheet.rows[Number(row[1]) - 1][3] = requestBody.values[0][0]; return {};
  },
} } }) }));
const incorrect = { message: 'Your current password is not correct.', code: 'current-password-incorrect' };
const invalid = { message: 'This reset link is no longer valid. Request a new one.', code: 'reset-link-invalid' };
const oldPassword = 'Password123!'; const newPassword = 'Changed456!';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

describe.each(['', '/api'])('US-L013 isolated HTTP (%s)', prefix => {
  let servers: Server[]; let base: string; let auth: InMemoryAuthRepository; let tokens: InMemoryPasswordResetRepository;
  let mail: LocalMailSender; let users: AuthUser[];
  async function start(repository: AuthRepository = auth, sender: MailSender = mail) {
    const server = createServer({ authRepository: repository, mailSender: sender, passwordResetRepository: tokens,
      passwordResetOptions: { now: () => 1000, appPublicUrl: 'https://example.test' },
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
    servers = []; auth = new InMemoryAuthRepository(); tokens = new InMemoryPasswordResetRepository(); mail = new LocalMailSender(() => {});
    users = (await Promise.all(['student', 'teacher', 'admin'].map(role => auth.findByEmail(`${role}@qi-education.local`)))) as AuthUser[];
    sheet.rows = [[...authSheetHeaders], ...users.map(authUserToSheetRow)]; base = await start();
  });
  afterEach(async () => { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); vi.restoreAllMocks(); });
  function session(user = users[0], ttl = 3600) { return createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET, ttl); }
  function post(path: string, body: unknown, bearer: string | null = session(), origin = base) {
    return fetch(origin + prefix + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer === null ? {} : { Authorization: 'Bearer ' + bearer }) }, body: JSON.stringify(body) });
  }
  function change(body: unknown = { currentPassword: oldPassword, newPassword }, bearer: string | null = session(), origin = base) {
    return post('/users/me/password', body, bearer, origin);
  }
  async function issue(user = users[0], origin = base) {
    const index = mail.messages.length;
    const response = await post('/auth/password-reset/request', { email: user.email }, null, origin); expect(response.status).toBe(202);
    return mail.messages[index].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
  }
  async function isInvalid(raw: string) {
    for (const action of ['check', 'confirm']) {
      const response = await post('/auth/password-reset/' + action, { token: raw, password: 'Another123!' }, null);
      expect(response.status).toBe(410); expect(await response.json()).toEqual(invalid);
    }
  }
  it.each([0, 1, 2])('AC01 changes the password for role index %i and preserves signed sessions', async index => {
    const bearer = session(users[index]); const response = await change(undefined, bearer);
    expect(response.status).toBe(204); expect(await response.text()).toBe(''); expect(response.headers.get('cache-control')).toBe('no-store');
    for (const [password, status] of [[oldPassword, 401], [newPassword, 200]] as const) {
      const login = await post('/auth/login', { email: users[index].email, password }, null); expect(login.status).toBe(status);
    }
    expect((await fetch(base + prefix + '/auth/me', { headers: { Authorization: 'Bearer ' + bearer } })).status).toBe(200);
    expect(mail.messages).toEqual([{ to: users[index].email, subject: 'Your QI Academy password was changed',
      text: 'Your QI Academy password was changed. If you did not make this change, contact QI Academy support.' }]);
  });
  it('AC01 exercises the same route with the actual Sheets hash-cell adapter over isolated rows', async () => {
    const repository = new GoogleSheetsAuthRepository(); const origin = await start(repository);
    expect((await change(undefined, session(), origin)).status).toBe(204);
    expect((await post('/auth/login', { email: users[0].email, password: oldPassword }, null, origin)).status).toBe(401);
    expect((await post('/auth/login', { email: users[0].email, password: newPassword }, null, origin)).status).toBe(200);
    const before = authUserToSheetRow(users[0]); const stored = sheet.rows[1];
    expect(stored.filter((_, index) => index !== 3)).toEqual(before.filter((_, index) => index !== 3));
  });
  it.each(['wrong', '', null, 42, undefined])('AC01/03 rejects current proof %j before invalid or equal new passwords', async currentPassword => {
    const raw = await issue();
    for (const value of ['short', currentPassword]) {
      const response = await change({ currentPassword, newPassword: value }); expect(response.status).toBe(400);
      expect(await response.json()).toEqual(incorrect); expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect((await post('/auth/password-reset/check', { token: raw }, null)).status).toBe(204); expect(mail.messages).toHaveLength(1);
    expect((await post('/auth/login', { email: users[0].email, password: oldPassword }, null)).status).toBe(200);
  });
  it.each(['short', 'nocapital123', 'NoNumberHere', 'A1'.repeat(101), 42, undefined])('AC03 preserves links/password for invalid new password %j', async password => {
    const raw = await issue(); const parsed = signupSchema.shape.password.safeParse(password); if (parsed.success) throw new Error('Bad fixture');
    const response = await change({ currentPassword: oldPassword, newPassword: password }); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: parsed.error.issues[0].message });
    expect((await post('/auth/password-reset/check', { token: raw }, null)).status).toBe(204); expect(mail.messages).toHaveLength(1);
  });
  it('AC03 requires a different password after valid current proof', async () => {
    const response = await change({ currentPassword: oldPassword, newPassword: oldPassword }); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Choose a password that differs from your current one.' }); expect(mail.messages).toEqual([]);
  });
  it.each(['missing', 'malformed', 'expired', 'disabled', 'deleted'])('AC04 preserves the protected 401 for %s sessions', async kind => {
    const bearer = kind === 'missing' ? null : kind === 'malformed' ? 'bad' : session(users[0], kind === 'expired' ? -1 : 3600);
    if (kind === 'disabled') users[0].status = 'disabled'; if (kind === 'deleted') vi.spyOn(auth, 'findById').mockResolvedValue(null);
    const response = await change(undefined, bearer); expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: expect.any(String) }); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mail.messages).toEqual([]);
  });
  it('AC04 returns safe 503 for configured-unavailable user storage and thrown read/write failures, without logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {}); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unavailable = await start({ unavailableReason: 'User storage unavailable.', findById: async () => null, findByEmail: async () => null,
      createUser: auth.createUser.bind(auth), enrollUserInCourse: auth.enrollUserInCourse.bind(auth), updatePasswordHash: auth.updatePasswordHash.bind(auth) });
    let response = await change(undefined, session(), unavailable); expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: expect.any(String) });
    const read = vi.spyOn(auth, 'findById').mockRejectedValueOnce(new Error('Private ' + users[0].passwordHash));
    response = await change(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: expect.any(String) }); read.mockRestore();
    vi.spyOn(auth, 'updatePasswordHash').mockRejectedValueOnce(new Error('Private ' + newPassword));
    response = await change(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it('AC02 attempts one shared notice and ignores failure after the change', async () => {
    const send = vi.fn().mockRejectedValue(new Error('private ' + newPassword)); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const origin = await start(auth, { provider: 'local', available: true, send });
    const response = await change(undefined, session(), origin); expect(response.status).toBe(204); expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({ to: users[0].email, subject: 'Your QI Academy password was changed',
      text: 'Your QI Academy password was changed. If you did not make this change, contact QI Academy support.' });
    expect(error).not.toHaveBeenCalled();
  });
  it.each(['profile', 'reset'])('AC05 cancels active/pending own links through %s and preserves another account and mail slots', async kind => {
    const one = await issue(); const two = await issue(); const other = await issue(users[1]); const pending = 'P'.repeat(43);
    await tokens.reserve(users[0].id, hash(pending), 1000);
    const response = kind === 'profile' ? await change() : await post('/auth/password-reset/confirm', { token: one, password: newPassword }, null);
    expect(response.status).toBe(204); await isInvalid(one); await isInvalid(two); await isInvalid(pending);
    expect(await tokens.activate(users[0].id, hash(pending))).toBe(false);
    expect((await post('/auth/password-reset/check', { token: other }, null)).status).toBe(204);
    const count = mail.messages.length; await post('/auth/password-reset/request', { email: users[0].email }, null); expect(mail.messages).toHaveLength(count);
  });
  it('AC05 cannot activate a pending mail whose response arrives after a profile change', async () => {
    const entered = deferred(); const release = deferred(); let raw = '';
    const origin = await start(auth, { provider: 'local', available: true, async send(message) {
      raw = message.text.match(/#token=([A-Za-z0-9_-]+)/)![1]; entered.resolve(); await release.promise; } });
    const request = post('/auth/password-reset/request', { email: users[0].email }, null, origin); await entered.promise;
    try { expect((await change()).status).toBe(204); } finally { release.resolve(); }
    await request; await isInvalid(raw);
  });
  it('AC05 rejects a late reset reservation that captured the old credential before invalidation', async () => {
    const entered = deferred(); const release = deferred(); const reserve = tokens.reserve.bind(tokens);
    vi.spyOn(tokens, 'reserve').mockImplementationOnce(async (...args) => { entered.resolve(); await release.promise; return reserve(...args); });
    const request = post('/auth/password-reset/request', { email: users[0].email }, null); await entered.promise;
    try { expect((await change()).status).toBe(204); } finally { release.resolve(); }
    await request; const raw = mail.messages.find(message => message.subject === 'Reset your QI Academy password')!.text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    await isInvalid(raw);
  });
  it('AC04 cancels no password write on cancellation failure and keeps its diagnostics private', async () => {
    const write = vi.spyOn(auth, 'updatePasswordHash'); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(tokens, 'invalidateAll').mockRejectedValueOnce(new Error('Private ' + users[0].passwordHash));
    const response = await change(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(write).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it.each(['memory', 'sheets'])('AC05 rejects a late token claimed after the profile change completed (%s)', async kind => {
    const repository = kind === 'memory' ? auth : new GoogleSheetsAuthRepository();
    const origin = await start(repository); const writeEntered = deferred(); const writeRelease = deferred();
    const consumeEntered = deferred(); const consumeRelease = deferred();
    const write = repository.updatePasswordHash.bind(repository); const consume = tokens.consume.bind(tokens);
    const writes = vi.spyOn(repository, 'updatePasswordHash').mockImplementationOnce(async (...args) => {
      writeEntered.resolve(); await writeRelease.promise; return write(...args);
    });
    vi.spyOn(tokens, 'consume').mockImplementationOnce(async (...args) => {
      consumeEntered.resolve(); await consumeRelease.promise; return consume(...args);
    });
    const profile = change(undefined, session(), origin); await writeEntered.promise;
    let confirm: Promise<Response> | undefined;
    try {
      const raw = await issue(users[0], origin);
      confirm = post('/auth/password-reset/confirm', { token: raw, password: 'Another123!' }, null, origin);
      await consumeEntered.promise; writeRelease.resolve(); expect((await profile).status).toBe(204);
      consumeRelease.resolve(); const response = await confirm; expect(response.status).toBe(410); expect(await response.json()).toEqual(invalid);
      expect(writes).toHaveBeenCalledTimes(1);
      expect((await post('/auth/login', { email: users[0].email, password: newPassword }, null, origin)).status).toBe(200);
    } finally { writeRelease.resolve(); consumeRelease.resolve(); await profile; if (confirm) await confirm; }
  });
  it('AC04 sets no-store for parser errors before authentication', async () => {
    const response = await fetch(base + prefix + '/users/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ message: expect.any(String) }); expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
