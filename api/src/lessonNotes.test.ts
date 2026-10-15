import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { learningFixture } from './learningBackendTestFixture.js';

describe.each(['', '/api'])('US-L015 private notes (%s)', prefix => {
  let f: Awaited<ReturnType<typeof learningFixture>>;
  const root = '/users/me/courses/course/notes';
  const note = { componentId: 'video', body: '  Remember this  ', videoSeconds: 754 };
  beforeEach(async () => { f = await learningFixture(prefix); });
  afterEach(async () => { vi.restoreAllMocks(); await f.close(); });
  it('returns private headers on malformed JSON before authentication', async () => {
    const response = await fetch(f.base + prefix + root, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toContain('Authorization');
  });
  it('AC01 creates a timestamped video note, trims its body and lists newest first', async () => {
    const created = await f.request(root, f.student, 'POST', note);
    expect(created.status).toBe(201);
    const first = await created.json();
    expect(first).toEqual({ id: expect.stringMatching(/^[a-f0-9-]{36}$/), courseId: 'course', componentId: 'video',
      body: 'Remember this', videoSeconds: 754, createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(Number.isNaN(Date.parse(first.createdAt))).toBe(false);
    const second = await (await f.request(root, f.student, 'POST', { componentId: 'text', body: 'Text note' })).json();
    expect(second.videoSeconds).toBeNull();
    const list = await f.request(root);
    expect(list.headers.get('cache-control')).toBe('private, no-store');
    expect(list.headers.get('vary')).toContain('Authorization');
    expect((await list.json()).notes.map((item: { id: string }) => item.id)).toEqual([second.id, first.id]);
  });
  it('AC02 never lists or mutates another learner\'s note', async () => {
    await f.auth.enrollUserInCourse(f.other.id, 'course');
    const created = await f.request(root, f.student, 'POST', note);
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect(await (await f.request(root, f.other)).json()).toEqual({ notes: [] });
    for (const method of ['PATCH', 'DELETE']) {
      expect((await f.request('/users/me/notes/' + id, f.other, method, { body: 'Stolen' })).status).toBe(404);
    }
    expect((await (await f.request(root)).json()).notes).toHaveLength(1);
  });
  it('AC04 edits only the body with a later timestamp, then deletes', async () => {
    const response = await f.request(root, f.student, 'POST', note);
    expect(response.status).toBe(201);
    const original = await response.json();
    const edit = await f.request('/users/me/notes/' + original.id, f.student, 'PATCH', { body: '  Changed  ', videoSeconds: 12, componentId: 'text' });
    expect(edit.status).toBe(200);
    const updated = await edit.json();
    expect(updated).toMatchObject({ ...original, body: 'Changed', updatedAt: expect.any(String) });
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
    expect((await f.request('/users/me/notes/' + original.id, f.student, 'DELETE')).status).toBe(204);
    expect(await (await f.request(root)).json()).toEqual({ notes: [] });
    expect((await f.request('/users/me/notes/' + original.id, f.student, 'DELETE')).status).toBe(404);
  });
  it.each([
    { body: '' }, { body: '  ' }, { body: 'x'.repeat(2001) }, { componentId: 'missing' },
    { componentId: 'text' }, { videoSeconds: -1 }, { videoSeconds: 1.5 }, { videoSeconds: '12' }, { videoSeconds: null },
  ])('AC03 rejects invalid input %j and stores nothing', async changes => {
    const response = await f.request(root, f.student, 'POST', { ...note, ...changes });
    expect(response.status).toBe(400); expect(await response.json()).toHaveProperty('message');
    expect(await (await f.request(root)).json()).toEqual({ notes: [] });
  });
  it.each(['GET', 'POST'])('AC03 requires auth, a known course and learning access for %s', async method => {
    for (const [path, user, status] of [[root, null, 401], [root, f.other, 403], [root.replace('/course/', '/missing/'), f.student, 404]] as const) {
      const response = await f.request(path, user, method, method === 'POST' ? note : undefined);
      expect(response.status).toBe(status); expect(await response.json()).toHaveProperty('message');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toContain('Authorization');
    }
  });
  it('checks lost access on edit and delete, and rejects invalid edits', async () => {
    const response = await f.request(root, f.student, 'POST', note);
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect((await f.request('/users/me/notes/' + id, f.student, 'PATCH', { body: ' ' })).status).toBe(400);
    const current = (await f.courses.listCourses()).find(item => item.id === 'course')!;
    await f.courses.updateCourse('course', { ...current, status: 'draft' });
    for (const method of ['PATCH', 'DELETE']) {
      const denied = await f.request('/users/me/notes/' + id, f.student, method, { body: 'Changed' });
      expect(denied.status).toBe(403);
      expect(denied.headers.get('cache-control')).toBe('private, no-store');
    }
  });
  it('leaves notes on removed lessons out of the list', async () => {
    expect((await f.request(root, f.student, 'POST', note)).status).toBe(201);
    await f.content.updateCourseContent('course', []);
    expect(await (await f.request(root)).json()).toEqual({ notes: [] });
  });
  it('rejects edits on a removed lesson but allows the owner to delete the obsolete note', async () => {
    const created = await f.request(root, f.student, 'POST', note);
    expect(created.status).toBe(201);
    const { id } = await created.json();
    await f.content.updateCourseContent('course', []);
    const edited = await f.request('/users/me/notes/' + id, f.student, 'PATCH', { body: 'Changed' });
    expect(edited.status).toBe(400);
    expect(await edited.json()).toEqual({ message: 'Lesson not found' });
    expect((await f.request('/users/me/notes/' + id, f.student, 'DELETE')).status).toBe(204);
  });
  it('caps notes at 500 per learner and course including simultaneous requests', async () => {
    // Requests exercise the real route and isolated store, including the boundary race.
    for (let index = 0; index < 499; index++) expect((await f.request(root, f.student, 'POST', note)).status).toBe(201);
    const results = await Promise.all([f.request(root, f.student, 'POST', note), f.request(root, f.student, 'POST', note)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 400]);
    expect((await (await f.request(root)).json()).notes).toHaveLength(500);
    await f.auth.enrollUserInCourse(f.other.id, 'course');
    expect((await f.request(root, f.other, 'POST', note)).status).toBe(201);
  }, 20000);
});
