import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryInstructorProfileRepository } from './instructorProfileRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { createServer } from './server.js';
import { createMailSender, LocalMailSender, type MailSender } from './mailSender.js';
import { InMemoryPasswordResetRepository } from './passwordResetRepository.js';
import { signupSchema, verifyPassword } from './auth.js';

const accepted = { message: 'If an account exists for this address, we have sent a reset link.' };
const invalid = { message: 'This reset link is no longer valid. Request a new one.', code: 'reset-link-invalid' };
describe.each(['', '/api'])('Account recovery HTTP (%s)', prefix => {
  let servers: Server[]; let base: string; let auth: InMemoryAuthRepository;
  let tokens: InMemoryPasswordResetRepository; let mail: LocalMailSender; let now: number;
  async function start(sender: MailSender = mail) {
    const server = createServer({ authRepository: auth, courseRepository: new InMemoryCourseRepository(),
      courseContentRepository: new InMemoryCourseContentRepository(), courseAssetRepository: new InMemoryCourseAssetRepository(),
      feedbackRepository: new InMemoryFeedbackRepository(), careerPathRepository: new InMemoryCareerPathRepository(),
      instructorProfileRepository: new InMemoryInstructorProfileRepository(), learningProgressRepository: new InMemoryLearningProgressRepository(),
      mailSender: sender, passwordResetRepository: tokens, passwordResetOptions: { now: () => now, appPublicUrl: 'https://example.test/' },
      gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('No shared services'); } }, muxVideoService: null, muxWebhookService: null }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve)); servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  beforeEach(async () => {
    servers = []; auth = new InMemoryAuthRepository(); tokens = new InMemoryPasswordResetRepository();
    mail = new LocalMailSender(() => {}); now = 1000; base = await start();
  });
  afterEach(async () => { await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  function request(action: string, body: unknown, origin = base) {
    return fetch(origin + prefix + '/auth/password-reset/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  it.each(['request', 'check', 'confirm'])('DEF-053 maps %s Mongo outages to retryable 503', async action => {
    const raw = action === 'request' ? '' : await issue();
    const failure = Object.assign(new Error('private connection details'), { name: 'MongoNetworkError' });
    if (action === 'request') vi.spyOn(auth, 'findByEmail').mockRejectedValueOnce(failure);
    else vi.spyOn(tokens, 'findActive').mockRejectedValueOnce(new Error('private wrapper', { cause: failure }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(action, { email: 'student@qi-education.local', token: raw, password: 'Changed456!' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Storage is temporarily unavailable. Please try again.', code: 'STORE_UNAVAILABLE', retryable: true });
    expect(log).toHaveBeenCalledTimes(1);
  });
  function token(index = 0) { return mail.messages[index].text.match(/#token=([A-Za-z0-9_-]+)/)![1]; }
  async function issue() { expect((await request('request', { email: 'student@qi-education.local' })).status).toBe(202); return token(); }
  async function invalidResponse(action: string, value: unknown) {
    const response = await request(action, { token: value, password: 'Changed456!' });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalid);
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  it('L004-AC01 returns the exact private accepted response for unknown email', async () => {
    const reserve = vi.spyOn(tokens, 'reserve');
    const response = await request('request', { email: 'unknown@example.test' });
    expect(response.status).toBe(202); expect(await response.json()).toEqual(accepted);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mail.messages).toEqual([]); expect(reserve).not.toHaveBeenCalled();
  });
  it('L004-AC01 normalizes the address and delivers a hash-only 256-bit, 60-minute fragment link', async () => {
    const reserve = vi.spyOn(tokens, 'reserve');
    const response = await request('request', { email: ' STUDENT@qi-education.local ' });
    expect(response.status).toBe(202); expect(await response.json()).toEqual(accepted);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mail.messages[0]).toMatchObject({ to: 'student@qi-education.local', subject: 'Reset your QI Academy password' });
    expect(mail.messages[0].text).toContain('60 minutes');
    expect(mail.messages[0].text).toContain('https://example.test/reset-password#token=');
    const raw = token(); expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    expect(reserve.mock.calls[0][1]).toMatch(/^[a-f0-9]{64}$/); expect(reserve.mock.calls[0][1]).not.toBe(raw);
  });
  it('L004-AC01 does not send or store for disabled accounts', async () => {
    const user = (await auth.findByEmail('student@qi-education.local'))!; user.status = 'disabled';
    const reserve = vi.spyOn(tokens, 'reserve'); const response = await request('request', { email: user.email });
    expect(response.status).toBe(202); expect(await response.json()).toEqual(accepted);
    expect(mail.messages).toEqual([]); expect(reserve).not.toHaveBeenCalled();
  });
  it.each([{}, null, { email: 'bad' }, { email: 1 }])('L004-AC01 rejects an invalid request %j with only a message', async body => {
    const response = await request('request', body); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: expect.any(String) }); expect(mail.messages).toEqual([]);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['check', 'confirm'])('L004-AC02 rejects malformed tokens on %s', async action => {
    const response = await request(action, { token: 'bad', password: 'Password123!' });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalid);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each([null, 42, '', 'x'.repeat(43)])('L004-AC02 rejects missing, malformed or unknown tokens %j', async value => {
    await invalidResponse('check', value); await invalidResponse('confirm', value);
  });
  it('L004-AC02 checks without consumption; confirm changes login and consumes the token', async () => {
    const raw = await issue();
    for (let count = 0; count < 2; count++) {
      const response = await request('check', { token: raw }); expect(response.status).toBe(204);
      expect(await response.text()).toBe(''); expect(response.headers.get('cache-control')).toBe('no-store');
    }
    const response = await request('confirm', { token: raw, password: 'Changed456!' });
    expect(response.status).toBe(204); expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await invalidResponse('check', raw); await invalidResponse('confirm', raw);
    for (const [password, status] of [['Password123!', 401], ['Changed456!', 200]] as const) {
      const login = await fetch(base + prefix + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'student@qi-education.local', password }) }); expect(login.status).toBe(status);
    }
    expect(mail.messages[1].subject).toBe('Your QI Academy password was changed');
    expect(mail.messages[1].text).not.toMatch(/Changed456|Password123|https?:|token=|reset-password/);
  });
  it.each(['short', 'nocapital123', 'NoNumberHere', 'A1'.repeat(101), 42])('L004-AC02 uses signup validation and keeps the token for bad password %j', async password => {
    const raw = await issue(); const validation = signupSchema.shape.password.safeParse(password);
    if (validation.success) throw new Error('Expected an invalid password fixture');
    const response = await request('confirm', { token: raw, password });
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ message: validation.error.issues[0].message });
    expect((await request('check', { token: raw })).status).toBe(204);
    expect((await request('confirm', { token: raw, password: 'Changed456!' })).status).toBe(204);
  });
  it('L004-AC02 expires exactly at 60 minutes and retains older links until then', async () => {
    const raw = await issue(); now += 1; await request('request', { email: 'student@qi-education.local' });
    now = 1000 + 3600000 - 1; expect((await request('check', { token: raw })).status).toBe(204);
    now++; await invalidResponse('check', raw); await invalidResponse('confirm', raw);
    expect((await request('check', { token: token(1) })).status).toBe(204);
  });
  it('L004-AC02 rejects a subsequently disabled or deleted account', async () => {
    const raw = await issue(); const user = (await auth.findByEmail('student@qi-education.local'))!; user.status = 'disabled';
    await invalidResponse('check', raw); await invalidResponse('confirm', raw);
    vi.spyOn(auth, 'findById').mockResolvedValue(null); await invalidResponse('check', raw);
  });
  it('L004-AC02 permits one password write under overlapping confirms on two API instances', async () => {
    const raw = await issue(); const second = await start(); const write = vi.spyOn(auth, 'updatePasswordHash');
    const responses = await Promise.all([request('confirm', { token: raw, password: 'First123!' }),
      request('confirm', { token: raw, password: 'Second123!' }, second)]);
    expect(responses.map(r => r.status).sort()).toEqual([204, 410]); expect(write).toHaveBeenCalledTimes(1);
    const user = (await auth.findByEmail('student@qi-education.local'))!;
    expect(verifyPassword('First123!', user.passwordHash) || verifyPassword('Second123!', user.passwordHash)).toBe(true);
  });
  it('P008-AC05 stores the shared three-mail limit even after consumption and frees it at the rolling-hour boundary', async () => {
    const second = await start(); const responses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      request('request', { email: 'student@qi-education.local' }, index % 2 ? second : base)));
    for (const response of responses) { expect(response.status).toBe(202); expect(await response.json()).toEqual(accepted); }
    expect(mail.messages).toHaveLength(3); await request('confirm', { token: token(), password: 'Changed456!' });
    await request('request', { email: 'student@qi-education.local' }); expect(mail.messages).toHaveLength(4); // includes notice only
    now += 3600000; await request('request', { email: 'student@qi-education.local' }); expect(mail.messages).toHaveLength(5);
  });
  it('L004-AC05 fails closed with unconfigured mail for active and unknown addresses', async () => {
    vi.stubEnv('NODE_ENV', 'production'); const origin = await start(createMailSender({}));
    for (const email of ['student@qi-education.local', 'unknown@example.test']) {
      const response = await request('request', { email }, origin); expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ message: 'We could not send email right now. Please try again later.' });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(mail.messages).toEqual([]);
    const health = await fetch(origin + prefix + '/health/config');
    expect((await health.json()).mail).toEqual({ configured: false, provider: 'brevo' });
  });
  it('returns a safe no-store failure when reset storage cannot reserve or activate', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(tokens, 'reserve').mockRejectedValueOnce(new Error('private token storage details'));
    let response = await request('request', { email: 'student@qi-education.local' });
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(mail.messages).toEqual([]);
    vi.spyOn(tokens, 'activate').mockRejectedValueOnce(new Error('private '));
    response = await request('request', { email: 'student@qi-education.local' });
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(response.headers.get('cache-control')).toBe('no-store');
    await invalidResponse('check', token()); expect(error).not.toHaveBeenCalled();
  });
  it('L004-AC05 provider failure leaves no usable token or logged details and counts its mail slot', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {}); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reserve = vi.spyOn(tokens, 'reserve'); let raw = '';
    const origin = await start({ provider: 'brevo', available: true, async send(message) {
      raw = message.text.match(/#token=([A-Za-z0-9_-]+)/)![1]; throw new Error('Provider credentials and ' + raw); } });
    for (let count = 0; count < 3; count++) {
      const response = await request('request', { email: 'student@qi-education.local' }, origin);
      expect(response.status).toBe(503); expect(await response.json()).toEqual({ message: 'We could not send email right now. Please try again later.' });
      await invalidResponse('check', raw);
    }
    const unknown = await request('request', { email: 'unknown@example.test' }, origin); expect(unknown.status).toBe(202);
    expect(reserve).toHaveBeenCalledTimes(3); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    expect((await request('request', { email: 'student@qi-education.local' })).status).toBe(202);
    expect(mail.messages).toEqual([]); now += 3600000; await issue();
  });
  it('L004-AC04 notice failure does not fail the password change or expose the message/token', async () => {
    const raw = await issue(); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const origin = await start({ provider: 'brevo', available: true, async send() { throw new Error('private ' + raw); } });
    const response = await request('confirm', { token: raw, password: 'Changed456!' }, origin); expect(response.status).toBe(204);
    await invalidResponse('check', raw); expect(error).not.toHaveBeenCalled();
  });
  it('P008-AC05 keeps the three-mail limit when delivery succeeded but the provider response was lost', async () => {
    const delivered: string[] = []; const origin = await start({ provider: 'brevo', available: true, async send(message) {
      delivered.push(message.text.match(/#token=([A-Za-z0-9_-]+)/)![1]); throw new Error('Response lost after delivery'); } });
    for (const status of [503, 503, 503, 202]) {
      const response = await request('request', { email: 'student@qi-education.local' }, origin); expect(response.status).toBe(status);
    }
    expect(delivered).toHaveLength(3);
    for (const raw of delivered) await invalidResponse('check', raw);
  });
  it('fails closed after a claimed token meets a failed password write', async () => {
    const raw = await issue(); const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const write = vi.spyOn(auth, 'updatePasswordHash').mockRejectedValueOnce(new Error('Sensitive ' + raw));
    const response = await request('confirm', { token: raw, password: 'Changed456!' }); expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: expect.any(String) }); await invalidResponse('confirm', raw);
    expect(write).toHaveBeenCalledTimes(1); expect(error).not.toHaveBeenCalled(); expect(mail.messages).toHaveLength(1);
  });
  it.each(['request', 'check', 'confirm'])('sets no-store even for malformed JSON on %s', async action => {
    const response = await fetch(base + prefix + '/auth/password-reset/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ message: expect.any(String) });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('P009-AC04 adds only the public mail configuration fields', async () => {
    const response = await fetch(base + prefix + '/health/config');
    expect(response.status).toBe(200); expect((await response.json()).mail).toEqual({ configured: false, provider: 'local' });
  });
});
