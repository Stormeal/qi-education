import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuthRepository, type AuthRepository } from './authRepository.js';
import { MongoAuthRepository } from './mongoAuthRepository.js';
import { fakeAuthCollection } from '../test/fakeAuthCollection.js';
import { apiConfig } from './config.js';
import { InMemoryEmailConfirmationRepository, MongoEmailConfirmationRepository } from './emailConfirmationRepository.js';
import { fakeAccountMailTokenCollection } from '../test/fakeAccountMailTokenCollection.js';
import { resetTokenHash } from './passwordResetDelivery.js';
import { LocalMailSender } from './mailSender.js';
import { createServer } from './server.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});

const invalid = { message: 'This confirmation link is no longer valid. Request a new one.', code: 'confirm-link-invalid' };
const signup = { displayName: 'New Learner', email: 'new@example.test', password: 'Password123!' };
const confirm = '/auth/email-confirmation/confirm', resend = '/auth/email-confirmation/resend';
const rawToken = (mail: LocalMailSender, index = 0) => mail.messages[index].text.match(/#token=([A-Za-z0-9_-]+)/)![1];
async function setup(dependencies: NonNullable<Parameters<typeof createServer>[0]> = {}, auth: AuthRepository = new InMemoryAuthRepository()) {
  const mail = new LocalMailSender(() => {}), tokens = new InMemoryEmailConfirmationRepository(), clock = { now: 1000 };
  const server = createServer({ authRepository: auth, mailSender: mail, emailConfirmationRepository: tokens,
    emailConfirmationOptions: { now: () => clock.now, appPublicUrl: 'https://example.test/' },
    muxVideoService: null, muxWebhookService: null, ...dependencies }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, bearer?: string) => fetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
  const me = (path: string, bearer: string) => fetch(base + path, { headers: { authorization: `Bearer ${bearer}` } });
  const register = async (email = signup.email) => {
    const response = await post('/signup', { ...signup, email });
    expect(response.status).toBe(201); return response.json();
  };
  return { auth, mail, tokens, clock, post, me, register, base };
}

describe('US-L014 email confirmation HTTP', () => {
  it('AC01 signup stores an unconfirmed account and sends its confirmation link', async () => {
    const auth = new InMemoryAuthRepository(), mail = new LocalMailSender(() => {});
    const server = createServer({ authRepository: auth, mailSender: mail, muxVideoService: null, muxWebhookService: null }).listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(base + '/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'New Learner', email: 'new@example.test', password: 'Password123!' }) });
    expect(response.status).toBe(201);
    expect((await response.json()).user.emailConfirmed).toBe(false);
    expect((await auth.findByEmail('new@example.test'))?.emailConfirmed).toBe(false);
    expect(mail.messages).toHaveLength(1);
    expect(mail.messages[0].subject).toBe('Confirm your QI Academy email address');
    expect(mail.messages[0].text).toContain('/confirm-email#token=');
    expect(mail.messages[0].text).toContain('This link works for 24 hours.');
  });

  it.each(['memory', 'mongodb'])('AC01 confirms once without a session and updates login/me responses (%s)', async kind => {
    const fake = fakeAuthCollection();
    const auth = kind === 'memory' ? new InMemoryAuthRepository() : new MongoAuthRepository(async () => fake.collection);
    const { register, mail, tokens, post, me } = await setup({}, auth);
    const session = await register();
    const raw = rawToken(mail), hash = resetTokenHash(raw)!;
    expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    expect(mail.messages[0].text).toContain(`https://example.test/confirm-email#token=${raw}`);
    expect(await tokens.findActive(raw, 1000)).toBeNull();
    expect(await tokens.findActive(hash, 1000)).toMatchObject({ userId: session.user.id, hash });
    const before = (await auth.findById(session.user.id))!;
    expect(before.emailConfirmed).toBe(false);
    expect((await post('/api' + confirm, { token: raw })).status).toBe(204);
    expect(await auth.findById(session.user.id)).toEqual({ ...before, emailConfirmed: true });
    for (const path of ['/me', '/auth/me', '/api/me', '/api/auth/me']) {
      expect((await (await me(path, session.token)).json()).user.emailConfirmed).toBe(true);
    }
    const login = await post('/auth/login', { email: signup.email, password: signup.password });
    expect(login.status).toBe(200); expect((await login.json()).user.emailConfirmed).toBe(true);
    const reused = await post(confirm, { token: raw });
    expect(reused.status).toBe(410); expect(await reused.json()).toEqual(invalid);
    if (kind === 'mongodb') expect(fake.calls.writes).toContainEqual(expect.objectContaining({
      filter: { _id: session.user.id, status: 'active' }, update: { $set: { emailConfirmed: true } },
      options: expect.objectContaining({ writeConcern: { w: 'majority' } }),
    }));
  });

  it('AC01 a confirmation remains valid for 24 hours, but not at its expiry', async () => {
    const { register, mail, clock, post, auth } = await setup();
    const session = await register();
    clock.now += 24 * 3600000;
    const response = await post(confirm, { token: rawToken(mail) });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalid);
    expect((await auth.findById(session.user.id))?.emailConfirmed).toBe(false);
  });

  it.each([undefined, null, 42, '', 'invalid', 'A'.repeat(43)])('AC01 malformed or unknown token %j is private no-store 410', async token => {
    const { post } = await setup();
    const response = await post(confirm, { token });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalid);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('AC01 refuses a disabled account without confirming it', async () => {
    const { register, mail, post, auth } = await setup();
    const session = await register(); await auth.updateStatus(session.user.id, 'disabled');
    const response = await post(confirm, { token: rawToken(mail) });
    expect(response.status).toBe(410); expect(await response.json()).toEqual(invalid);
    expect((await auth.findById(session.user.id))?.emailConfirmed).toBe(false);
  });

  it.each(['send', 'settings', 'reservation', 'activation'])('AC01 signup still succeeds when confirmation %s fails', async failure => {
    const tokens = new InMemoryEmailConfirmationRepository(), mail = new LocalMailSender(() => {});
    if (failure === 'send') vi.spyOn(mail, 'send').mockRejectedValue(new Error('private provider detail'));
    if (failure === 'settings') Object.defineProperty(mail, 'available', { value: false });
    if (failure === 'reservation') vi.spyOn(tokens, 'reserve').mockRejectedValue(new Error('private storage detail'));
    if (failure === 'activation') vi.spyOn(tokens, 'activate').mockRejectedValue(new Error('private storage detail'));
    const { register, auth } = await setup({ mailSender: mail, emailConfirmationRepository: tokens });
    const session = await register();
    expect(session.user.emailConfirmed).toBe(false);
    expect((await auth.findById(session.user.id))?.emailConfirmed).toBe(false);
    if (mail.messages.length) expect(await tokens.findActive(resetTokenHash(rawToken(mail))!, 1000)).toBeNull();
  });

  it('AC02 unconfirmed users can sign in and enroll, and resend returns the exact accepted message', async () => {
    const { register, mail, post, me } = await setup();
    const session = await register();
    const login = await post('/api/login', { email: signup.email, password: signup.password });
    expect(login.status).toBe(200); expect((await login.json()).user.emailConfirmed).toBe(false);
    expect((await (await me('/auth/me', session.token)).json()).user.emailConfirmed).toBe(false);
    expect((await post('/users/me/courses/demo-course-1', {}, session.token)).status).toBe(200);
    const response = await post('/api' + resend, {}, session.token);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ message: 'We have sent a new link to new@example.test. It works for 24 hours.' });
    expect(mail.messages).toHaveLength(2);
  });

  it('AC02 the signup mail counts toward three, with exact rolling expiry and rounded Retry-After', async () => {
    const { register, mail, post, clock } = await setup();
    const session = await register();
    for (let i = 0; i < 2; i++) expect((await post(resend, {}, session.token)).status).toBe(202);
    clock.now += 3539999;
    let response = await post(resend, {}, session.token);
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('61');
    expect(await response.json()).toEqual({ message: 'You have asked for several links in a short time. Try again in 2 minutes.', code: 'too-many-requests' });
    clock.now++;
    response = await post(resend, {}, session.token);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(await response.json()).toEqual({ message: 'You have asked for several links in a short time. Try again in 1 minute.', code: 'too-many-requests' });
    expect(mail.messages).toHaveLength(3);
    clock.now = 3601000;
    expect((await post(resend, {}, session.token)).status).toBe(202);
    expect(mail.messages).toHaveLength(4);
  });

  it.each(['send', 'settings'])('AC02 failed %s consumes mail slots and returns the agreed 503 message', async failure => {
    const { register, mail, post } = await setup();
    const session = await register();
    if (failure === 'send') vi.spyOn(mail, 'send').mockRejectedValue(new Error('private provider detail'));
    else Object.defineProperty(mail, 'available', { value: false });
    for (let i = 0; i < 2; i++) {
      const response = await post(resend, {}, session.token);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ message: 'We could not send email right now. Please try again later.' });
    }
    expect((await post(resend, {}, session.token)).status).toBe(429);
    expect(mail.messages).toHaveLength(1);
  });

  it('AC02 the tenth resend uses the network budget before the account budget; the eleventh is a network 429', async () => {
    const { register, mail, tokens, post } = await setup({ clientLimitOptions: { now: () => 1800000 } });
    const session = await register();
    for (let i = 0; i < 10; i++) expect([202, 429]).toContain((await post(i % 2 ? resend : '/api' + resend, {}, session.token)).status);
    const reserve = vi.spyOn(tokens, 'reserve');
    const response = await post(resend, {}, session.token);
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('1800');
    expect(await response.json()).toEqual({ message: 'Too many requests from your network. Try again in 30 minutes.', code: 'too-many-requests' });
    expect(reserve).not.toHaveBeenCalled(); expect(mail.messages).toHaveLength(3);
  });

  it('AC02 resend requires a valid bearer and disabled sessions cannot send mail', async () => {
    const { register, mail, auth, post } = await setup();
    const session = await register();
    expect((await post(resend, {})).status).toBe(401);
    expect((await post(resend, {}, 'invalid')).status).toBe(401);
    await auth.updateStatus(session.user.id, 'disabled');
    expect((await post(resend, {}, session.token)).status).toBe(401);
    expect(mail.messages).toHaveLength(1);
  });

  it.each(['memory', 'mongodb'])('AC03 accounts without the flag report confirmed and resend sends nothing (%s)', async kind => {
    const memory = new InMemoryAuthRepository(), fake = fakeAuthCollection();
    const auth = kind === 'memory' ? memory : new MongoAuthRepository(async () => fake.collection);
    if (kind === 'mongodb') for (const user of await memory.listUsers()) await auth.createUser(user);
    const { tokens, mail, post, me } = await setup({}, auth);
    const reserve = vi.spyOn(tokens, 'reserve');
    const login = await post('/login', { email: 'student@qi-education.local', password: 'Password123!' });
    expect(login.status).toBe(200); const session = await login.json();
    expect(session.user.emailConfirmed).toBe(true);
    expect((await (await me('/api/me', session.token)).json()).user.emailConfirmed).toBe(true);
    expect((await post(resend, {}, session.token)).status).toBe(204);
    expect(reserve).not.toHaveBeenCalled(); expect(mail.messages).toEqual([]);
  });

  it('AC01 freezes confirm before token consumption, including prefixed/case/trailing aliases', async () => {
    const { register, tokens, mail, post, auth } = await setup();
    const session = await register(), consume = vi.spyOn(tokens, 'consume');
    const previous = apiConfig.USER_STORE_READ_ONLY;
    apiConfig.USER_STORE_READ_ONLY = '1';
    try {
      const frozen = await setup({ emailConfirmationRepository: tokens }, auth);
      for (const path of [confirm, '/api' + confirm, confirm.toUpperCase(), '/api' + confirm.toUpperCase() + '/']) {
        const response = await frozen.post(path, { token: rawToken(mail) });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ message: 'Accounts are briefly read-only for maintenance. Try again in a few minutes.' });
      }
      expect(consume).not.toHaveBeenCalled();
    } finally { apiConfig.USER_STORE_READ_ONLY = previous; }
    expect((await auth.findById(session.user.id))?.emailConfirmed).toBe(false);
    expect((await post(confirm, { token: rawToken(mail) })).status).toBe(204);
  });

  it('AC01 confirmation storage failures return a safe 503', async () => {
    const { register, tokens, mail, post } = await setup();
    await register(); vi.spyOn(tokens, 'findActive').mockRejectedValue(new Error('private storage detail'));
    const response = await post(confirm, { token: rawToken(mail) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Email confirmation is temporarily unavailable. Please try again later.' });
  });

  it('AC01 parallel confirms claim one token and make only one account write', async () => {
    const { register, mail, auth, post } = await setup();
    await register();
    const write = vi.spyOn(auth, 'confirmEmail');
    const results = await Promise.all([post(confirm, { token: rawToken(mail) }), post('/api' + confirm, { token: rawToken(mail) })]);
    expect(results.map(response => response.status).sort()).toEqual([204, 410]);
    expect(write).toHaveBeenCalledOnce();
  });

  it('AC02 parallel resends across two Mongo-backed API instances deliver only two more mails after signup', async () => {
    const fake = fakeAccountMailTokenCollection(), auth = new InMemoryAuthRepository(), mail = new LocalMailSender(() => {});
    const one = await setup({ emailConfirmationRepository: new MongoEmailConfirmationRepository(async () => fake.collection),
      mailSender: mail, clientLimitOptions: { confirmationLimit: 100 } }, auth);
    const two = await setup({ emailConfirmationRepository: new MongoEmailConfirmationRepository(async () => fake.collection),
      mailSender: mail, clientLimitOptions: { confirmationLimit: 100 } }, auth);
    const session = await one.register();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? one : two).post(resend, {}, session.token)));
    expect(results.filter(response => response.status === 202)).toHaveLength(2);
    expect(results.filter(response => response.status === 429)).toHaveLength(10);
    expect(mail.messages).toHaveLength(3);
    expect(fake.documents.get(session.user.id)?.tokens).toHaveLength(3);
  });

  it('AC02 confirmed accounts skip exhausted network and mail limits', async () => {
    const { register, mail, post } = await setup({ clientLimitOptions: { confirmationLimit: 1 } });
    const session = await register();
    expect((await post(resend, {}, session.token)).status).toBe(202);
    expect((await post(resend, {}, session.token)).status).toBe(429);
    expect((await post(confirm, { token: rawToken(mail) })).status).toBe(204);
    expect((await post(resend, {}, session.token)).status).toBe(204);
    expect(mail.messages).toHaveLength(2);
  });

  it('AC01 confirmation and reset tokens never authorize each other or invalidate each other', async () => {
    const { register, mail, post } = await setup();
    await register();
    const confirmation = rawToken(mail);
    expect((await post('/auth/password-reset/request', { email: signup.email })).status).toBe(202);
    const reset = rawToken(mail, 1);
    expect((await post(confirm, { token: reset })).status).toBe(410);
    expect((await post('/auth/password-reset/check', { token: confirmation })).status).toBe(410);
    expect((await post(confirm, { token: confirmation })).status).toBe(204);
    expect((await post('/auth/password-reset/check', { token: reset })).status).toBe(204);
  });

  it.each(['consume', 'account'])('AC01 %s write failure returns a safe confirmation 503', async failure => {
    const { register, mail, tokens, auth, post } = await setup();
    await register();
    if (failure === 'consume') vi.spyOn(tokens, 'consume').mockRejectedValue(new Error('private storage detail'));
    else vi.spyOn(auth, 'confirmEmail').mockRejectedValue(new Error('private storage detail'));
    const response = await post(confirm, { token: rawToken(mail) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Email confirmation is temporarily unavailable. Please try again later.' });
  });

  it.each(['reserve', 'activate'])('AC02 resend %s storage failure returns a safe 503', async failure => {
    const { register, tokens, post } = await setup();
    const session = await register();
    vi.spyOn(tokens, failure).mockRejectedValue(new Error('private storage detail'));
    const response = await post(resend, {}, session.token);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Email confirmation is temporarily unavailable. Please try again later.' });
  });

  it('AC01 malformed JSON retains the existing parser response and no-store on both confirmation routes', async () => {
    const { base } = await setup();
    for (const path of [confirm, '/api' + resend]) {
      const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
      expect(response.status).toBe(400); expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ message: expect.any(String) });
    }
  });
});
