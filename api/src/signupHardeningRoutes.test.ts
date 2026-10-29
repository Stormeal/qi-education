import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { LocalMailSender } from './mailSender.js';
import { createServer } from './server.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  vi.restoreAllMocks();
});
const body = { displayName: 'New Learner', email: 'new@example.test', password: 'Password123!' };
async function setup(configured: boolean) {
  const auth = new InMemoryAuthRepository();
  const verify = vi.fn(async (_token: string | undefined) => false);
  const server = createServer({ authRepository: auth, turnstileVerifier: { configured, verify },
    mailSender: new LocalMailSender(() => {}), clientLimitOptions: { signupLimit: 1 },
  }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, input: unknown) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  return { auth, verify, base, post };
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
