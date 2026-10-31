import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { LocalMailSender } from './mailSender.js';
import { createServer } from './server.js';
import { InMemoryTermsAcceptanceRepository } from './termsAcceptanceRepository.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});
const body = { displayName: 'New Learner', email: 'new@example.test', password: 'Password123!' };
async function setup(configured: boolean) {
  const auth = new InMemoryAuthRepository();
  const terms = new InMemoryTermsAcceptanceRepository();
  const verify = vi.fn(async (_token: string | undefined) => false);
  const server = createServer({ authRepository: auth, termsAcceptanceRepository: terms, turnstileVerifier: { configured, verify },
    mailSender: new LocalMailSender(() => {}), clientLimitOptions: { signupLimit: 1 },
  }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, input: unknown) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  return { auth, terms, verify, base, post };
}

describe('US-P020 API-02 signup human check', () => {
  it('API-03 exposes public Turnstile state without credentials on both config aliases', async () => {
    const { base } = await setup(false);
    for (const prefix of ['', '/api']) {
      const response = await fetch(base + prefix + '/health/config');
      expect(response.headers.get('cache-control')).toBe('no-store');
      const config = await response.json();
      expect(config.turnstile).toEqual({ configured: false, siteKey: null });
      expect(JSON.stringify(config)).not.toContain('TURNSTILE_SECRET_KEY');
    }
  });
  it.each(['/signup', '/auth/signup', '/api/signup', '/api/auth/signup'])('rejects missing/invalid tokens before account lookups or budget use (%s)', async path => {
    const { auth, verify, post } = await setup(true);
    const find = vi.spyOn(auth, 'findByEmail'), create = vi.spyOn(auth, 'createUser');
    for (const token of [undefined, 'invalid']) {
      const response = await post(path, { ...body, turnstileToken: token });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message: 'human-check-failed' });
    }
    expect(find).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    verify.mockResolvedValue(true);
    const response = await post(path, { ...body, turnstileToken: 'valid' });
    expect(response.status).toBe(201);
    expect(verify).toHaveBeenLastCalledWith('valid');
    expect(await auth.findByEmail(body.email)).toMatchObject({ emailConfirmed: false });
    expect((await post(path, { ...body, email: 'second@example.test', turnstileToken: 'next' })).status).toBe(429);
  });
  it('validates the body before calling Cloudflare', async () => {
    const { post, verify } = await setup(true);
    expect((await post('/signup', { ...body, password: 'short' })).status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });
  it('keeps unconfigured signup open without invoking the verifier', async () => {
    const { post, verify } = await setup(false);
    expect((await post('/signup', body)).status).toBe(201);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe.each(['/signup', '/auth/signup', '/api/signup', '/api/auth/signup'])('US-P022 signup acceptance %s', path => {
  it('records the server ToS version only after creating the account and keeps the signup response unchanged', async () => {
    const { auth, terms, post } = await setup(false);
    const record = terms.record.bind(terms);
    vi.spyOn(terms, 'record').mockImplementation(async (userId, documentId, version) => {
      expect(await auth.findById(userId)).toMatchObject({ email: body.email });
      await record(userId, documentId, version);
    });
    const response = await post(path, { ...body, acceptTos: true, version: 999 });
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(Object.keys(result).sort()).toEqual(['permissions', 'token', 'user']);
    expect(await terms.listForUser(result.user.id)).toEqual([
      { userId: result.user.id, documentId: 'tos', version: 1, acceptedAt: expect.any(String) },
    ]);
  });

  it('keeps legacy signup without acceptance open without recording a row', async () => {
    const { terms, post } = await setup(false);
    const response = await post(path, body);
    expect(response.status).toBe(201);
    expect(await terms.listForUser((await response.json()).user.id)).toEqual([]);
  });

  it('refuses false or non-boolean acceptance before creating the account', async () => {
    const { auth, post } = await setup(false);
    for (const acceptTos of [false, null, 1, 'true', {}]) {
      expect((await post(path, { ...body, acceptTos })).status).toBe(400);
      expect(await auth.findByEmail(body.email)).toBeNull();
    }
  });

  it('keeps an already-created account usable if recording fails so the next session can ask again', async () => {
    const { auth, terms, base, post } = await setup(false);
    vi.spyOn(terms, 'record').mockRejectedValue(new Error('Store offline'));
    const response = await post(path, { ...body, acceptTos: true });
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(await auth.findById(result.user.id)).toMatchObject({ email: body.email });
    const me = await fetch(base + '/auth/me', { headers: { authorization: `Bearer ${result.token}` } });
    expect(await me.json()).toMatchObject({ termsPending: true });
    expect(await terms.listForUser(result.user.id)).toEqual([]);
  });
});
