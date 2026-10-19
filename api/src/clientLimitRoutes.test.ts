import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { LocalMailSender } from './mailSender.js';
import { InMemoryPasswordResetRepository } from './passwordResetRepository.js';
import { createServer } from './server.js';
import { InMemoryClientLimitRepository, MongoClientLimitRepository, type ClientLimitRepository } from './clientLimitRepository.js';
import { fakeClientLimitCollection } from '../test/fakeClientLimitCollection.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});

const reset = '/auth/password-reset/request';
const signupPaths = ['/signup', '/auth/signup', '/api/signup', '/api/auth/signup'];
const resetPaths = [reset, '/api' + reset];
const signupBody = (i: number) => ({ displayName: 'New Learner', email: `client-${i}@example.test`, password: 'Password123!' });
async function setup(dependencies: NonNullable<Parameters<typeof createServer>[0]> = {}) {
  const auth = new InMemoryAuthRepository(), mail = new LocalMailSender(() => {}), tokens = new InMemoryPasswordResetRepository();
  const server = createServer({ authRepository: auth, mailSender: mail, passwordResetRepository: tokens,
    passwordResetOptions: { appPublicUrl: 'https://example.test' }, muxVideoService: null, muxWebhookService: null,
    ...dependencies,
  }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, client = '198.51.100.1') => fetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': client }, body: JSON.stringify(body) });
  return { auth, mail, tokens, post, base };
}

describe('US-P008 client limits through HTTP', () => {
  it('AC05 refuses the eleventh valid reset request before sending mail', async () => {
    const mail = new LocalMailSender(() => {});
    const server = createServer({ authRepository: new InMemoryAuthRepository(), mailSender: mail,
      passwordResetRepository: new InMemoryPasswordResetRepository(),
      passwordResetOptions: { appPublicUrl: 'https://example.test' },
      muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = (email: string) => fetch(base + '/auth/password-reset/request', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    for (let i = 0; i < 10; i++) expect((await request(`unknown-${i}@example.test`)).status).toBe(202);
    const response = await request('student@qi-education.local');
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ message: expect.stringMatching(/^Too many requests from your network\. Try again in \d+ minutes?\.$/), code: 'too-many-requests' });
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(mail.messages).toEqual([]);
  });

  it('AC05 shares reset counts across aliases; existing, unknown and disabled addresses get identical private 429s', async () => {
    const { auth, mail, tokens, post } = await setup({ clientLimitOptions: { now: () => 1800000 } });
    vi.spyOn(config, 'getServicesMode').mockReturnValue('hosted');
    const disabled = (await auth.findByEmail('teacher@qi-education.local'))!;
    await auth.updateStatus(disabled.id, 'disabled');
    for (let i = 0; i < 10; i++) expect((await post(resetPaths[i % 2], { email: 'unknown@example.test' })).status).toBe(202);
    const find = vi.spyOn(auth, 'findByEmail'), reserve = vi.spyOn(tokens, 'reserve');
    for (const email of ['student@qi-education.local', 'unknown@example.test', disabled.email]) {
      for (const path of resetPaths) {
        const response = await post(path, { email });
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('1800');
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ message: 'Too many requests from your network. Try again in 30 minutes.', code: 'too-many-requests' });
      }
    }
    expect(find).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled(); expect(mail.messages).toEqual([]);
    expect((await post(reset, { email: 'student@qi-education.local' }, '198.51.100.2')).status).toBe(202);
    expect(mail.messages).toHaveLength(1);
  });

  it('AC06 shares signup counts across every alias and refuses account creation after twenty requests', async () => {
    const { auth, post } = await setup({ clientLimitOptions: { now: () => 1800000 } });
    for (let i = 0; i < 20; i++) expect((await post(signupPaths[i % 4], signupBody(i))).status).toBe(201);
    const find = vi.spyOn(auth, 'findByEmail'), create = vi.spyOn(auth, 'createUser');
    for (const path of signupPaths) {
      const response = await post(path, signupBody(21));
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('1800');
      expect(await response.json()).toEqual({ message: 'Too many requests from your network. Try again in 30 minutes.', code: 'too-many-requests' });
    }
    expect(find).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    expect((await auth.listUsers()).filter(user => user.email.startsWith('client-'))).toHaveLength(20);
  });

  it('AC05/AC06 do not count invalid bodies, and signup and reset use separate budgets', async () => {
    const { post } = await setup({ clientLimitOptions: { resetLimit: 1, signupLimit: 1, now: () => 1800000 } });
    for (const path of signupPaths) expect((await post(path, { ...signupBody(0), password: 'bad' })).status).toBe(400);
    for (const path of resetPaths) expect((await post(path, { email: 'bad' })).status).toBe(400);
    expect((await post('/signup', signupBody(0))).status).toBe(201);
    expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(202);
    expect((await post('/signup', signupBody(1))).status).toBe(429);
    expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(429);
    // Validation retains its 400 response even after the valid-request budget is exhausted.
    expect((await post('/signup', {})).status).toBe(400);
    expect((await post(reset, {})).status).toBe(400);
  });

  it('AC06 counts a valid duplicate signup before looking up the account', async () => {
    const { auth, post } = await setup({ clientLimitOptions: { signupLimit: 1 } });
    const existing = { ...signupBody(0), email: 'student@qi-education.local' };
    expect((await post('/signup', existing)).status).toBe(409);
    const find = vi.spyOn(auth, 'findByEmail');
    expect((await post('/signup', signupBody(1))).status).toBe(429);
    expect(find).not.toHaveBeenCalled();
  });

  it('AC05 limits leave admin links, sign-in, reset checks and confirmations unchanged', async () => {
    const { auth, mail, post, base } = await setup({ clientLimitOptions: { resetLimit: 1, signupLimit: 1 } });
    expect((await post(reset, { email: 'student@qi-education.local' })).status).toBe(202);
    const raw = mail.messages[0].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    expect((await post(reset, { email: 'student@qi-education.local' })).status).toBe(429);
    const login = await post('/auth/login', { email: 'admin@qi-education.local', password: 'Password123!' });
    expect(login.status).toBe(200);
    const { token } = await login.json();
    const student = (await auth.findByEmail('student@qi-education.local'))!;
    expect((await post('/auth/password-reset/check', { token: raw })).status).toBe(204);
    expect((await post('/auth/password-reset/confirm', { token: raw, password: 'Changed456!' })).status).toBe(204);
    expect(mail.messages).toHaveLength(2);
    const adminLink = await fetch(`${base}/admin/users/${student.id}/password-reset`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` },
    });
    expect(adminLink.status).toBe(202);
    expect(mail.messages).toHaveLength(3);
  });

  it.each([
    [3539999, '61', '2 minutes'], [3540000, '60', '1 minute'], [3599999, '1', '1 minute'],
  ] as const)('AC05 Retry-After and rounded message agree at %s milliseconds', async (now, retry, phrase) => {
    const { post } = await setup({ clientLimitOptions: { resetLimit: 1, now: () => now } });
    await post(reset, { email: 'unknown@example.test' });
    const response = await post(reset, { email: 'unknown@example.test' });
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe(retry);
    expect(await response.json()).toEqual({ message: `Too many requests from your network. Try again in ${phrase}.`, code: 'too-many-requests' });
  });

  it('AC05 admits a request at the next fixed window boundary', async () => {
    let now = 3599999;
    const { post } = await setup({ clientLimitOptions: { resetLimit: 1, now: () => now } });
    expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(202);
    expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(429);
    now = 3600000;
    expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(202);
  });

  it.each(['isolated', 'shared', 'hosted'] as const)('AC05 trusts forwarding only in hosted mode (%s)', async mode => {
    const { post } = await setup({ clientLimitOptions: { resetLimit: 1 } });
    vi.spyOn(config, 'getServicesMode').mockReturnValue(mode);
    expect((await post(reset, { email: 'unknown@example.test' }, '198.51.100.1, 198.51.100.9')).status).toBe(202);
    expect((await post(reset, { email: 'unknown@example.test' }, '198.51.100.1, 198.51.100.10')).status).toBe(429);
    expect((await post(reset, { email: 'unknown@example.test' }, '198.51.100.2')).status).toBe(mode === 'hosted' ? 202 : 429);
  });

  it.each(['throw', 'timeout'] as const)('AC05/AC06 fail open once per %s without logging provider or client details', async failure => {
    const increment = vi.fn<ClientLimitRepository['increment']>(async (_key, _start, _expiry, _signal) => {
      if (failure === 'throw') throw new Error('private address 198.51.100.1 provider credentials');
      return new Promise<number>(() => {});
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { auth, mail, post } = await setup({ clientLimitRepository: { increment }, clientLimitOptions: { storageTimeoutMs: 10 } });
    expect((await post(reset, { email: 'student@qi-education.local' })).status).toBe(202);
    expect((await post('/signup', signupBody(0))).status).toBe(201);
    expect(mail.messages).toHaveLength(1); expect(await auth.findByEmail(signupBody(0).email)).not.toBeNull();
    expect(warn.mock.calls).toEqual(Array(2).fill(['Client limit storage unavailable; protection may be bypassed.']));
    if (failure === 'timeout') for (const call of increment.mock.calls) expect(call[3]?.aborted).toBe(true);
  });

  it.each(['loader', 'index'])('AC05 recovers after Mongo %s initialization times out', async stage => {
    const fake = fakeClientLimitCollection();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    if (stage === 'index') vi.spyOn(fake.collection, 'createIndex').mockImplementationOnce(async (_keys, options) => {
      await gate; options.signal?.throwIfAborted();
    });
    const store = new MongoClientLimitRepository(async () => {
      if (stage === 'loader' && first) { first = false; await gate; }
      return fake.collection;
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { post } = await setup({ clientLimitRepository: store, clientLimitOptions: { resetLimit: 1, storageTimeoutMs: 20 } });
    try {
      expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(202);
    } finally { release(); }
    await new Promise<void>(resolve => setImmediate(resolve));
    expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(202);
    expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(429);
    expect(warn.mock.calls).toEqual([['Client limit storage unavailable; protection may be bypassed.']]);
  });

  it.each(['memory', 'mongodb'])('AC05/AC06 parallel requests cannot exceed either budget with %s storage', async kind => {
    const fake = fakeClientLimitCollection();
    const store = kind === 'memory' ? new InMemoryClientLimitRepository() : new MongoClientLimitRepository(async () => fake.collection);
    const { auth, post } = await setup({ clientLimitRepository: store });
    const find = vi.spyOn(auth, 'findByEmail'), create = vi.spyOn(auth, 'createUser');
    const resets = await Promise.all(Array.from({ length: 15 }, (_, i) => post(resetPaths[i % 2], { email: 'unknown@example.test' })));
    expect(resets.filter(response => response.status === 202)).toHaveLength(10);
    expect(resets.filter(response => response.status === 429)).toHaveLength(5);
    expect(find).toHaveBeenCalledTimes(10);
    const signups = await Promise.all(Array.from({ length: 25 }, (_, i) => post(signupPaths[i % 4], signupBody(i))));
    expect(signups.filter(response => response.status === 201)).toHaveLength(20);
    expect(signups.filter(response => response.status === 429)).toHaveLength(5);
    expect(create).toHaveBeenCalledTimes(20);
    if (kind === 'mongodb') {
      expect([...fake.documents.values()].map(document => document.count).sort((a, b) => a - b)).toEqual([15, 25]);
      expect(JSON.stringify([...fake.documents.values()])).not.toMatch(/127\.0\.0\.1|198\.51\.100|example\.test|reset|signup/);
    }
  });

  it('AC05/AC06 injectable policies can raise limits for isolated release journeys', async () => {
    const { post } = await setup({ clientLimitOptions: { signupLimit: 21, resetLimit: 11 } });
    for (let i = 0; i < 21; i++) expect((await post('/signup', signupBody(i))).status).toBe(201);
    for (let i = 0; i < 11; i++) expect((await post(reset, { email: 'unknown@example.test' })).status).toBe(202);
  });
});
