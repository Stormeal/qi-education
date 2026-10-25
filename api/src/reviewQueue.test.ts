import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

describe.each(['', '/api'])('admin review queue (%s)', prefix => {
  let server: Server, base: string, teacher: AuthUser, admin: AuthUser, student: AuthUser;
  const request = (route: string, account: AuthUser, method = 'GET', body?: unknown) => fetch(base + prefix + route, { method,
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${createSessionToken(toAuthenticatedUser(account), apiConfig.AUTH_TOKEN_SECRET!)}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const create = async (title: string) => {
    const id = (await (await request('/courses', teacher, 'POST',
      { title, description: 'A course for the review queue.', level: 'Beginner', teacher: 'Teacher Demo' })).json()).id as string;
    const { review } = await (await request(`/courses/${id}/content?view=author`, teacher)).json();
    const saved = await fetch(`${base}${prefix}/courses/${id}/content`, { method: 'PATCH', headers: { 'Content-Type': 'application/json',
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!)}`,
      'X-Course-Revision': JSON.stringify({ version: review.version, revisionId: review.revisionId }) },
      body: JSON.stringify({ sections: [{ id: 's1', title: 'Chapter', components: [{ id: 'c1', title: 'Lesson', type: 'text', content: 'Text' }] }] }) });
    expect(saved.status).toBe(200);
    return id;
  };
  const act = async (id: string, account: AuthUser, action: string) => {
    const { review } = await (await request(`/courses/${id}/content?view=author`, account)).json();
    const response = await request(`/courses/${id}/review`, account, 'POST', { action, expectedVersion: review.version, revisionId: review.revisionId });
    expect(response.status).toBe(200);
  };

  beforeEach(async () => {
    const auth = new InMemoryAuthRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    server = createServer({ authRepository: auth }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it('lists new courses and new versions of live courses waiting for review, newest first', async () => {
    const draft = await create('Still a draft');
    const first = await create('First submission');
    await act(first, teacher, 'submit');
    const live = await create('Live course');
    await act(live, teacher, 'submit');
    await act(live, admin, 'publish');
    await act(live, teacher, 'start-revision');
    await act(live, teacher, 'submit');

    const response = await request('/admin/review-queue', admin);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const queue = await response.json();
    expect(queue.map((item: { id: string }) => item.id)).toEqual([live, first]);
    expect(queue[0]).toEqual({ id: live, title: 'Live course', teacher: 'Teacher Demo', live: true, submittedAt: expect.any(String) });
    expect(queue[1]).toMatchObject({ id: first, live: false });
    expect(queue.some((item: { id: string }) => item.id === draft)).toBe(false);
  });

  it('is for admins only', async () => {
    expect((await request('/admin/review-queue', student)).status).toBe(403);
    expect((await request('/admin/review-queue', teacher)).status).toBe(403);
  });
});
