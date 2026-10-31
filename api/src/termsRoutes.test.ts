import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';
import { InMemoryTermsAcceptanceRepository } from './termsAcceptanceRepository.js';

let server: Server, base: string, auth: InMemoryAuthRepository, terms: InMemoryTermsAcceptanceRepository, student: AuthUser;
beforeEach(async () => {
  auth = new InMemoryAuthRepository();
  terms = new InMemoryTermsAcceptanceRepository();
  student = (await auth.findByEmail('student@qi-education.local'))!;
  server = createServer({ authRepository: auth, termsAcceptanceRepository: terms }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
});
const request = (path: string, body?: unknown, bearer: string | null = createSessionToken(student, apiConfig.AUTH_TOKEN_SECRET)) => fetch(base + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'Content-Type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe.each(['/auth/me', '/me', '/api/auth/me', '/api/me'])('US-P022 session flag %s', path => {
  it('requires current ToS acceptance, independently of purchase terms and other accounts', async () => {
    await terms.record('another-user', 'tos', 1);
    await terms.record(student.id, 'purchase', 1);
    expect(await (await request(path)).json()).toMatchObject({ user: { id: student.id }, termsPending: true });
    await terms.record(student.id, 'tos', 0);
    expect(await (await request(path)).json()).toMatchObject({ termsPending: true });
    await terms.record(student.id, 'tos', 1);
    expect(await (await request(path)).json()).toMatchObject({ termsPending: false });
    await terms.record(student.id, 'tos', 2);
    expect(await (await request(path)).json()).toMatchObject({ termsPending: false });
  });

  it('keeps every other session field available and omits the flag on an acceptance-store outage', async () => {
    const healthy = await (await request(path)).json();
    vi.spyOn(terms, 'latestAccepted').mockRejectedValue(new Error('Private store details'));
    const response = await request(path);
    expect(response.status).toBe(200);
    const body = await response.json();
    const { termsPending: _flag, ...rest } = healthy;
    expect(body).toEqual(rest);
    expect(body).not.toHaveProperty('termsPending');
    expect(body).toMatchObject({ user: { id: student.id }, unreadNotifications: 0, organization: null, permissions: expect.any(Object) });
  });
});

describe.each(['', '/api'])('US-P022 accept route %s', prefix => {
  it('allows every signed-in role to accept the server version for itself, idempotently', async () => {
    for (const role of ['student', 'teacher', 'admin']) {
      const user = (await auth.findByEmail(`${role}@qi-education.local`))!;
      const bearer = createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET);
      for (const documentId of ['tos', 'purchase']) {
        const response = await request(`${prefix}/users/me/terms/accept`, { documentId }, bearer);
        expect(response.status).toBe(204);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('vary')).toContain('Authorization');
        expect(await response.text()).toBe('');
        expect((await request(`${prefix}/users/me/terms/accept`, { documentId }, bearer)).status).toBe(204);
      }
      expect(await terms.listForUser(user.id)).toEqual([
        { userId: user.id, documentId: 'tos', version: 1, acceptedAt: expect.any(String) },
        { userId: user.id, documentId: 'purchase', version: 1, acceptedAt: expect.any(String) },
      ]);
    }
    expect(await (await request(`${prefix}/auth/me`)).json()).toMatchObject({ termsPending: false });
    expect(await terms.listForUser('another-user')).toEqual([]);
  });

  it('rejects malformed bodies and client-supplied versions or identities before recording', async () => {
    for (const body of [{}, null, 'tos', { documentId: 'privacy' }, { documentId: false },
      { documentId: 'tos', version: 99 }, { documentId: 'tos', userId: 'another-user' }]) {
      expect((await request(`${prefix}/users/me/terms/accept`, body)).status).toBe(400);
    }
    expect(await terms.listForUser(student.id)).toEqual([]);
    expect(await terms.listForUser('another-user')).toEqual([]);
  });

  it('rejects missing, invalid and disabled sessions without recording', async () => {
    for (const bearer of [null, 'invalid']) {
      expect((await request(`${prefix}/users/me/terms/accept`, { documentId: 'tos' }, bearer)).status).toBe(401);
    }
    await auth.updateStatus(student.id, 'disabled');
    expect((await request(`${prefix}/users/me/terms/accept`, { documentId: 'tos' })).status).toBe(401);
    expect(await terms.listForUser(student.id)).toEqual([]);
  });

  it('returns a safe retryable 503 when acceptance cannot be recorded', async () => {
    vi.spyOn(terms, 'record').mockRejectedValue(new Error('Private database details'));
    const response = await request(`${prefix}/users/me/terms/accept`, { documentId: 'tos' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Terms acceptance is temporarily unavailable. Please try again.' });
  });
});
