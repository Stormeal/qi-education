import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { createServer } from './server.js';
import { InMemorySignInAttemptRepository, type SignInAttemptRepository } from './signInAttemptRepository.js';
import { signInAddressKey } from './signInLimit.js';
import type { SignInLimitOptions } from './signInLimit.js';
import { LocalMailSender } from './mailSender.js';
import { InMemoryPasswordResetRepository } from './passwordResetRepository.js';
import { AuthUnavailableError } from './authRepository.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});
async function start(auth = new InMemoryAuthRepository(), attempts: SignInAttemptRepository = new InMemorySignInAttemptRepository(), options: SignInLimitOptions = {}) {
  const mail = new LocalMailSender(() => {});
  const server = createServer({ authRepository: auth, signInAttemptRepository: attempts, signInLimitOptions: options,
    mailSender: mail, passwordResetRepository: new InMemoryPasswordResetRepository() }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve)); servers.push(server);
  return { auth, mail, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}
function login(base: string, email = 'student@qi-education.local', password = 'wrong', route = '/auth/login') {
  return fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
}
describe('US-P008-AC02 / INV-014 isolated login', () => {
  it.each(['/auth/login', '/login', '/api/auth/login', '/api/login'])('DEF-034 / 11 bounds abandoned pending capacity without reading users (%s)', async route => {
    const attempts = new InMemorySignInAttemptRepository(); const key = signInAddressKey('student@qi-education.local');
    const policy = { limit: 10, windowMs: 900000, lockMs: 900000 };
    await Promise.all(Array.from({ length: 10 }, () => attempts.reserve(key, 1000, policy)));
    const { auth, base } = await start(undefined, attempts, { now: () => 1000, capacityWaitMs: 25 });
    const reads = vi.spyOn(auth, 'findByEmail'); const polls = vi.spyOn(attempts, 'reserve');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 250);
    let outcome: unknown;
    try {
      const response = await fetch(base + route, { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@qi-education.local', password: 'Password123!' }) });
      outcome = { status: response.status, body: await response.json(), retry: response.headers.get('retry-after'), cache: response.headers.get('cache-control') };
    } catch (error) { outcome = (error as Error).name; }
    finally { clearTimeout(timeout); }
    expect({ outcome, userReads: reads.mock.calls.length }).toEqual({ outcome: { status: 429,
      body: { message: 'Too many sign-in attempts. Try again in 15 minutes.', code: 'too-many-attempts' }, retry: '900', cache: 'no-store' }, userReads: 0 });
    expect(polls.mock.calls.length).toBeLessThanOrEqual(2);
  });
  it.each(['failure', 'pending'])('11 uses the earliest %s expiry for Retry-After and does not create a lock', async earliest => {
    let now = 840001;
    const attempts = new InMemorySignInAttemptRepository(); const key = signInAddressKey('student@qi-education.local');
    const policy = { limit: 2, windowMs: 900000, lockMs: 900000 };
    if (earliest === 'pending') await attempts.reserve(key, 0, policy);
    const failureAt = earliest === 'failure' ? 0 : 100000;
    const failed = await attempts.reserve(key, failureAt, policy);
    if (!('ticket' in failed)) throw new Error('Expected reservation');
    await attempts.complete(key, failed.ticket, 'failure', failureAt, policy);
    if (earliest === 'failure') await attempts.reserve(key, 100000, policy);
    const { auth, base } = await start(undefined, attempts, { now: () => now, limit: 2, capacityWaitMs: 25 });
    const reads = vi.spyOn(auth, 'findByEmail');
    for (let index = 0; index < 2; index++) {
      const result = await login(base, undefined, 'Password123!');
      expect(result.status).toBe(429); expect(result.headers.get('retry-after')).toBe('60');
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(await result.json()).toEqual({ message: 'Too many sign-in attempts. Try again in 1 minute.', code: 'too-many-attempts' });
    }
    expect(reads).not.toHaveBeenCalled();
    now = 900000;
    expect((await login(base, undefined, 'Password123!')).status).toBe(200);
  });
  it('DEF-033 refuses attempt 11 before reading users, after ten generic 401 failures', async () => {
    const { auth, base } = await start(); const reads = vi.spyOn(auth, 'findByEmail');
    const statuses = [];
    for (let index = 0; index < 12; index++) statuses.push((await login(base)).status);
    // Reproduction evidence includes both unbounded responses and user-store reads.
    expect({ statuses, reads: reads.mock.calls.length }).toEqual({ statuses: [...Array(10).fill(401), 429, 429], reads: 10 });
  });
  it.each(['/auth/login', '/login', '/api/auth/login', '/api/login'])('01/02 keeps contracts and skips locked user/password checks (%s)', async route => {
    let now = 1000;
    const { auth, base } = await start(undefined, undefined, { now: () => now });
    for (let index = 0; index < 10; index++) {
      const result = await login(base, undefined, undefined, route);
      expect(result.status).toBe(401); expect(await result.json()).toEqual({ message: 'Invalid email or password' });
    }
    vi.spyOn(auth, 'findByEmail').mockRejectedValue(new Error('A locked login must never read users'));
    const locked = await login(base, undefined, 'Password123!', route);
    expect(locked.status).toBe(429); expect(locked.headers.get('cache-control')).toBe('no-store');
    expect(locked.headers.get('retry-after')).toBe('900');
    expect(await locked.json()).toEqual({ message: 'Too many sign-in attempts. Try again in 15 minutes.', code: 'too-many-attempts' });
    now += 840001;
    const lastMinute = await login(base, undefined, undefined, route);
    expect(lastMinute.headers.get('retry-after')).toBe('60');
    expect(await lastMinute.json()).toEqual({ message: 'Too many sign-in attempts. Try again in 1 minute.', code: 'too-many-attempts' });
    vi.restoreAllMocks(); now = 901000;
    const success = await login(base, undefined, 'Password123!', route);
    expect(success.status).toBe(200); expect(await success.json()).toMatchObject({ token: expect.any(String), user: { email: 'student@qi-education.local' } });
  });
  it('03 makes unknown and disabled addresses indistinguishable and leaves another account usable', async () => {
    const { auth, base } = await start(undefined, undefined, { now: () => 1000 });
    const disabled = (await auth.findByEmail('teacher@qi-education.local'))!; disabled.status = 'disabled';
    const results = [];
    for (const [email, password] of [['student@qi-education.local', 'wrong'], ['unknown@example.test', 'wrong'], ['teacher@qi-education.local', 'Password123!']]) {
      for (let index = 0; index < 10; index++) expect((await login(base, email, password)).status).toBe(401);
      const response = await login(base, email, password);
      results.push({ status: response.status, body: await response.json(), retry: response.headers.get('retry-after'), cache: response.headers.get('cache-control') });
    }
    expect(results[0].status).toBe(429); expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect((await login(base, 'admin@qi-education.local', 'Password123!')).status).toBe(200);
  });
  it('04 shares normalized addresses across routes and does not count 400 input', async () => {
    const { base } = await start();
    for (let index = 0; index < 12; index++) expect((await login(base, undefined, '')).status).toBe(400);
    const routes = ['/auth/login', '/login', '/api/auth/login', '/api/login'];
    for (let index = 0; index < 10; index++) expect((await login(base, index % 2 ? ' STUDENT@QI-EDUCATION.LOCAL ' : undefined, 'wrong', routes[index % 4])).status).toBe(401);
    expect((await login(base)).status).toBe(429);
  });
  it('05 clears nine failures on successful login', async () => {
    const { base } = await start();
    for (let index = 0; index < 9; index++) expect((await login(base)).status).toBe(401);
    expect((await login(base, undefined, 'Password123!')).status).toBe(200);
    for (let index = 0; index < 10; index++) expect((await login(base)).status).toBe(401);
    expect((await login(base)).status).toBe(429);
  });
  it('06 clears a lock only after a successful reset password write', async () => {
    const { auth, base, mail } = await start();
    for (let index = 0; index < 10; index++) await login(base);
    const reset = (action: string, body: unknown) => fetch(base + '/auth/password-reset/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await reset('confirm', { token: 'invalid', password: 'Changed456!' })).status).toBe(410);
    expect((await login(base)).status).toBe(429);
    expect((await reset('request', { email: 'student@qi-education.local' })).status).toBe(202);
    const token = mail.messages[0].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    const write = vi.spyOn(auth, 'updatePasswordHash').mockRejectedValueOnce(new Error('Unavailable'));
    expect((await reset('confirm', { token, password: 'Changed456!' })).status).toBe(500);
    expect((await login(base)).status).toBe(429); write.mockRestore();
    expect((await reset('request', { email: 'student@qi-education.local' })).status).toBe(202);
    const nextToken = mail.messages[1].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    expect((await reset('confirm', { token: nextToken, password: 'Changed456!' })).status).toBe(204);
    expect((await login(base, undefined, 'Changed456!')).status).toBe(200);
  });
  it('07 excludes failures at the exact rolling-window boundary', async () => {
    let now = 1000; const { base } = await start(undefined, undefined, { now: () => now });
    for (let index = 0; index < 9; index++) await login(base);
    now += 900000;
    for (let index = 0; index < 10; index++) expect((await login(base)).status).toBe(401);
    expect((await login(base)).status).toBe(429);
  });
  it('08 bounds overlapping attempts on two API instances to ten user reads', async () => {
    const auth = new InMemoryAuthRepository(); const attempts = new InMemorySignInAttemptRepository();
    const first = await start(auth, attempts); const second = await start(auth, attempts);
    const reads = vi.spyOn(auth, 'findByEmail');
    const outcomes = await Promise.all(Array.from({ length: 24 }, (_, index) => login(index % 2 ? first.base : second.base)));
    expect(outcomes.filter(response => response.status === 401)).toHaveLength(10);
    expect(outcomes.filter(response => response.status === 429)).toHaveLength(14);
    expect(reads).toHaveBeenCalledTimes(10);
  });
  it('08 cancels HTTP capacity waits when the client disconnects', async () => {
    const attempts = new InMemorySignInAttemptRepository(); const key = signInAddressKey('student@qi-education.local');
    const policy = { limit: 10, windowMs: 900000, lockMs: 900000 };
    const pending = await Promise.all(Array.from({ length: 10 }, () => attempts.reserve(key, 1000, policy)));
    const { auth, base } = await start(undefined, attempts, { now: () => 1000 });
    const reads = vi.spyOn(auth, 'findByEmail');
    let observed!: () => void; const waiting = new Promise<void>(resolve => { observed = resolve; });
    const reserve = attempts.reserve.bind(attempts);
    vi.spyOn(attempts, 'reserve').mockImplementation(async (...args) => { const result = await reserve(...args); observed(); return result; });
    const controller = new AbortController();
    const request = fetch(base + '/login', { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'student@qi-education.local', password: 'wrong' }) });
    const failed = request.catch(error => error.name);
    await waiting; controller.abort(); expect(await failed).toBe('AbortError');
    // Let the server observe socket closure before releasing capacity.
    await new Promise(resolve => setTimeout(resolve, 30));
    if (!('ticket' in pending[0])) throw new Error('Expected reservation');
    await attempts.complete(key, pending[0].ticket, 'cancel', 1000, policy);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(reads).not.toHaveBeenCalled();
  });
  it('09 completed recovery remains successful if clearing the login lock hangs', async () => {
    const attempts = new InMemorySignInAttemptRepository();
    const { base, mail } = await start(undefined, attempts, { storageTimeoutMs: 20 });
    for (let index = 0; index < 10; index++) await login(base);
    const reset = (action: string, body: unknown) => fetch(base + '/auth/password-reset/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await reset('request', { email: 'student@qi-education.local' })).status).toBe(202);
    const token = mail.messages[0].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
    vi.spyOn(attempts, 'clear').mockImplementation(() => new Promise<never>(() => {}));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await reset('confirm', { token, password: 'Changed456!' })).status).toBe(204);
    expect(warning).toHaveBeenCalledWith('Sign-in attempt storage unavailable; protection may be bypassed.');
    vi.spyOn(attempts, 'reserve').mockRejectedValue(new Error('offline'));
    expect((await login(base, undefined, 'Changed456!')).status).toBe(200);
  });
  it.each(['reserve', 'complete', 'clear'] as const)('09 allows normal sign-in if %s storage fails, with safe logging', async method => {
    const attempts = new InMemorySignInAttemptRepository();
    vi.spyOn(attempts, method).mockRejectedValue(new Error('secret student@qi-education.local Password123!'));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { base } = await start(undefined, attempts);
    expect((await login(base, undefined, method === 'complete' ? 'wrong' : 'Password123!')).status).toBe(method === 'complete' ? 401 : 200);
    expect(log).toHaveBeenCalledWith('Sign-in attempt storage unavailable; protection may be bypassed.');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/student@|Password123|secret/);
  });
  it('09 does not count an unavailable user store', async () => {
    const { auth, base } = await start();
    const read = vi.spyOn(auth, 'findByEmail').mockRejectedValue(new AuthUnavailableError('Temporarily unavailable'));
    for (let index = 0; index < 12; index++) expect((await login(base)).status).toBe(503);
    read.mockRestore(); expect((await login(base, undefined, 'Password123!')).status).toBe(200);
  });
  it('injects limit, window and lock duration', async () => {
    let now = 100; const { base } = await start(undefined, undefined, { now: () => now, limit: 2, windowMs: 200, lockMs: 300 });
    expect((await login(base)).status).toBe(401); expect((await login(base)).status).toBe(401);
    expect((await login(base)).headers.get('retry-after')).toBe('1');
    now = 400; expect((await login(base, undefined, 'Password123!')).status).toBe(200);
  });
});
