import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createSessionToken } from './auth.js';
import { createServer } from './server.js';
import { apiConfig } from './config.js';
import { privacyFixture } from '../test/privacyFixture.js';

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
}))); });
async function setup() {
  const fixture = await privacyFixture();
  const s = fixture.stores;
  const app = createServer({ authRepository: s.auth, accountProfileRepository: s.profile, instructorProfileRepository: s.instructorProfile,
    learningProgressRepository: s.progress, lessonNotesRepository: s.notes, accountCareersRepository: s.careers,
    careerPathRepository: s.legacyCareers, paymentRepository: s.payments, organizationRepository: s.organizations,
    feedbackRepository: s.feedback, notificationRepository: s.notifications, passwordResetRepository: s.resetTokens,
    emailConfirmationRepository: s.confirmationTokens, userChangeRepository: s.audit, courseRepository: s.courses, courseContentRepository: s.content });
  const server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const token = createSessionToken(fixture.user, apiConfig.AUTH_TOKEN_SECRET!);
  const request = (path: string, body?: unknown, bearer: string | null = token) => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ...fixture, request, token };
}

describe.each(['', '/api'])('US-P021 privacy HTTP %s', prefix => {
  it('exports only the caller with private no-store and rejects missing credentials', async () => {
    const { request, user, stores, other } = await setup();
    await stores.progress.complete(other.id, 'other-secret', 'private-lesson');
    expect((await request(`${prefix}/users/me/privacy/export`, undefined, null)).status).toBe(401);
    const response = await request(`${prefix}/users/me/privacy/export`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vary')).toContain('Authorization');
    const body = await response.json();
    expect(body.account.id).toBe(user.id);
    expect(JSON.stringify(body)).not.toContain('other-secret');
  });
  it('requires password and DELETE, refuses arbitrary target IDs, then permanently closes only the caller', async () => {
    const { request, stores, user, other } = await setup();
    expect((await request(`${prefix}/users/me/privacy/erase`, { password: 'wrong', confirmation: 'DELETE' })).status).toBe(401);
    expect((await request(`${prefix}/users/me/privacy/erase`, { password: 'Password123!', confirmation: 'delete' })).status).toBe(400);
    expect((await request(`${prefix}/users/me/privacy/erase`, { password: 'Password123!', confirmation: 'DELETE', userId: other.id })).status).toBe(400);
    const response = await request(`${prefix}/users/me/privacy/erase`, { password: 'Password123!', confirmation: 'DELETE' });
    expect(response.status).toBe(204);
    expect((await request(`${prefix}/auth/me`)).status).toBe(401);
    expect((await request(`${prefix}/users/me/privacy/export`)).status).toBe(401);
    expect(await stores.auth.findById(other.id)).toEqual(other);
    expect((await stores.auth.findById(user.id))?.passwordHash).toBe('');
  });
  it('resumes pending cleanup with the original valid session but grants no other account access', async () => {
    const { request, stores, user } = await setup();
    const remove = stores.notes.removeForUser.bind(stores.notes);
    stores.notes.removeForUser = async () => { throw new Error('Synthetic cleanup failure'); };
    expect((await request(`${prefix}/users/me/privacy/erase`, { password: 'Password123!', confirmation: 'DELETE' })).status).toBe(500);
    expect((await request(`${prefix}/auth/me`)).status).toBe(401);
    expect((await request(`${prefix}/users/me/privacy/erase`, { password: 'wrong', confirmation: 'DELETE' })).status).toBe(401);
    stores.notes.removeForUser = remove;
    expect((await request(`${prefix}/users/me/privacy/erase`, { password: 'Password123!', confirmation: 'DELETE' })).status).toBe(204);
    expect((await stores.auth.findById(user.id))?.privacyErasure?.state).toBe('complete');
  });

  it('waits for an admitted profile write before erasing it and refuses queued writes after erasure', async () => {
    const { request, stores, user, token } = await setup();
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const save = stores.profile.save.bind(stores.profile);
    stores.profile.save = async (...args) => { entered(); await gate; return save(...args); };
    // Use a profile write from the real HTTP route, paused at its storage boundary.
    const initial = await request(`${prefix}/users/me/profile`);
    const fields = await initial.json();
    const responseUrl = initial.url;
    const write = fetch(responseUrl, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: 'Private bio', jobTitle: '', company: '', learningGoals: '', avatarColor: fields.avatarColor }) });
    await waiting;
    const erase = request(`${prefix}/users/me/privacy/erase`, { password: 'Password123!', confirmation: 'DELETE' });
    release();
    expect((await write).status).toBe(200);
    expect((await erase).status).toBe(204);
    expect(await stores.profile.get(user.id)).toBeNull();
    expect((await fetch(responseUrl, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: 'Must not return', jobTitle: '', company: '', learningGoals: '', avatarColor: '#2f4f43' }) })).status).toBe(401);
  });
});
