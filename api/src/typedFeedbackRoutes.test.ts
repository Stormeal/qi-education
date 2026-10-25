import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { createServer } from './server.js';

describe.each(['', '/api'])('US-A006 feedback HTTP contract %s', prefix => {
  let server: Server;
  afterEach(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); vi.restoreAllMocks(); });
  async function start(frozen = false) {
    const auth = new InMemoryAuthRepository(), feedback = new InMemoryFeedbackRepository();
    const student = toAuthenticatedUser((await auth.findByEmail('student@qi-education.local'))!);
    const admin = toAuthenticatedUser((await auth.findByEmail('admin@qi-education.local'))!);
    const createIssue = vi.fn(async () => ({ number: 1, url: 'https://github.example.test/fixture/issues/1' }));
    const previous = apiConfig.FEEDBACK_STORE_READ_ONLY;
    apiConfig.FEEDBACK_STORE_READ_ONLY = frozen ? '1' : '0';
    try { server = createServer({ authRepository: auth, feedbackRepository: feedback, gitHubFeedbackService: { createIssueFromFeedback: createIssue } }).listen(0, '127.0.0.1'); }
    finally { apiConfig.FEEDBACK_STORE_READ_ONLY = previous; }
    await new Promise<void>(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`;
    const request = (path: string, role: 'student' | 'admin' | 'guest', method = 'GET', body?: unknown) => fetch(base + path, { method, headers: {
      'Content-Type': 'application/json', ...(role !== 'guest' ? { authorization: `Bearer ${createSessionToken(role === 'student' ? student : admin, apiConfig.AUTH_TOKEN_SECRET!)}` } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { request, feedback, student, createIssue };
  }
  it('AC01-04 persists all types with authenticated identity and restricts the private inbox', async () => {
    const { request, student } = await start();
    for (const type of ['feedback', 'defect', 'change-request']) {
      const result = await request('/feedback', 'student', 'POST', { type, page: 'Courses', summary: `A ${type} report`, message: 'Something useful', userId: 'forged', ...(type === 'defect' ? { reproductionSteps: 'Search', expectedBehavior: 'Keep category' } : {}) });
      expect(result.status).toBe(201); expect(await result.json()).toMatchObject({ id: expect.any(String), createdAt: expect.any(String) });
    }
    expect((await request('/feedback', 'guest')).status).toBe(401);
    expect((await request('/feedback', 'student')).status).toBe(403);
    const inbox = await request('/feedback', 'admin'); expect(inbox.headers.get('cache-control')).toContain('private'); expect(inbox.headers.get('cache-control')).toContain('no-store'); expect(inbox.headers.get('vary')).toContain('Authorization');
    const entries = await inbox.json(); expect(entries).toHaveLength(3); expect(entries.every((entry: { userId: string }) => entry.userId === student.id)).toBe(true);
    const patch = await request(`/feedback/${entries[0].id}/triage`, 'admin', 'PATCH', { workStatus: 'completed' });
    expect(patch.status).toBe(200); expect(patch.headers.get('cache-control')).toContain('no-store');
  });
  it('AC09 freezes submission and triage before any GitHub effects while reads remain available', async () => {
    const { request, feedback, student, createIssue } = await start(true);
    const entry = await feedback.createFeedback({ page: 'Courses', rating: 'okay', message: 'Existing' }, student);
    expect((await request('/feedback', 'student', 'POST', { page: 'Home', rating: 'great' })).status).toBe(503);
    expect((await request(`/feedback/${entry.id}/triage`, 'admin', 'PATCH', { workStatus: 'work' })).status).toBe(503);
    expect((await request('/feedback', 'admin')).status).toBe(200);
    expect(createIssue).not.toHaveBeenCalled(); expect(await feedback.listFeedback()).toHaveLength(1);
  });
});
