import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { learningFixture } from './learningBackendTestFixture.js';

describe.each(['', '/api'])('US-L016 lesson feedback (%s)', prefix => {
  let f: Awaited<ReturnType<typeof learningFixture>>;
  const root = '/users/me/courses/course';
  beforeEach(async () => { f = await learningFixture(prefix); });
  afterEach(async () => { await f.close(); });
  const report = { page: 'learning', rating: 'needs-work', message: 'Video is broken', courseId: 'course', componentId: 'video', category: 'video' };
  it('votes return private headers even when the JSON parser rejects the request', async () => {
    const response = await fetch(f.base + prefix + root + '/lessons/video/vote', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toContain('Authorization');
  });
  it('AC02 stores a report in admin triage with its lesson context', async () => {
    const response = await f.request('/feedback', f.student, 'POST', report);
    expect(response.status).toBe(201);
    expect(Object.keys(await response.json()).sort()).toEqual(['createdAt', 'id']);
    const entries = await (await f.request('/feedback', f.admin)).json();
    expect(entries[0]).toMatchObject(report);
  });
  it.each([
    [{ componentId: 'missing' }, 400], [{ courseId: 'missing' }, 404], [{ componentId: '' }, 400],
    [{ courseId: undefined }, 400], [{ category: 'bad' }, 400],
  ])('report rejects bad context %j without storing', async (changes, status) => {
    const response = await f.request('/feedback', f.student, 'POST', { ...report, ...changes });
    expect(response.status).toBe(status); expect(await response.json()).toHaveProperty('message');
    expect(await f.feedback.listFeedback()).toEqual([]);
  });
  it('report requires enrollment and authentication', async () => {
    expect((await f.request('/feedback', f.other, 'POST', report)).status).toBe(403);
    expect((await f.request('/feedback', null, 'POST', report)).status).toBe(401);
    expect(await f.feedback.listFeedback()).toEqual([]);
  });
  it('AC03 accepts ordinary feedback with exactly the existing response', async () => {
    const response = await f.request('/feedback', f.other, 'POST', { page: 'home', rating: 'great', message: 'Thanks' });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: expect.any(String), createdAt: expect.any(String) });
    const [entry] = await f.feedback.listFeedback();
    expect(entry).toMatchObject({ page: 'home', rating: 'great', message: 'Thanks' });
    expect(entry.courseId).toBeUndefined();
  });
  it('AC01 changes one vote, isolates learners, repeats safely and removes with null', async () => {
    const vote = (value: unknown) => f.request(root + '/lessons/video/vote', f.student, 'PUT', { vote: value });
    expect((await vote('up')).status).toBe(200);
    expect(await (await vote('down')).json()).toEqual({ componentId: 'video', vote: 'down' });
    await Promise.all([vote('down'), vote('down')]);
    expect(await (await f.request(root + '/lesson-votes')).json()).toEqual({ votes: [{ componentId: 'video', vote: 'down' }] });
    await f.auth.enrollUserInCourse(f.other.id, 'course');
    expect(await (await f.request(root + '/lesson-votes', f.other)).json()).toEqual({ votes: [] });
    expect(await (await vote(null)).json()).toEqual({ componentId: 'video', vote: null });
    expect(await (await f.request(root + '/lesson-votes')).json()).toEqual({ votes: [] });
    expect(await f.feedback.listFeedback()).toEqual([]);
  });
  it.each(['GET', 'PUT'])('votes enforce access and private headers on %s', async method => {
    const path = method === 'GET' ? root + '/lesson-votes' : root + '/lessons/video/vote';
    for (const [user, status] of [[null, 401], [f.other, 403]] as const) {
      const response = await f.request(path, user, method, { vote: 'up' });
      expect(response.status).toBe(status); expect(await response.json()).toHaveProperty('message');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toContain('Authorization');
    }
    const unknown = await f.request(path.replace('/course/', '/missing/'), f.student, method, method === 'GET' ? undefined : { vote: 'up' });
    expect(unknown.status).toBe(404);
  });
  it.each([{ vote: 'bad' }, {}, { vote: 1 }])('votes reject %j', async body => {
    expect((await f.request(root + '/lessons/video/vote', f.student, 'PUT', body)).status).toBe(400);
    expect(await (await f.request(root + '/lesson-votes')).json()).toEqual({ votes: [] });
  });
  it('votes reject unknown lessons and omit deleted lessons', async () => {
    expect((await f.request(root + '/lessons/missing/vote', f.student, 'PUT', { vote: 'up' })).status).toBe(400);
    expect((await f.request(root + '/lessons/video/vote', f.student, 'PUT', { vote: 'up' })).status).toBe(200);
    await f.content.updateCourseContent('course', []);
    expect(await (await f.request(root + '/lesson-votes')).json()).toEqual({ votes: [] });
  });
});
