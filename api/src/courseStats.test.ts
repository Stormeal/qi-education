import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { learningFixture } from './learningBackendTestFixture.js';

describe.each(['', '/api'])('US-L017 enrolled count (%s)', prefix => {
  let f: Awaited<ReturnType<typeof learningFixture>>;
  beforeEach(async () => { f = await learningFixture(prefix); });
  afterEach(async () => { vi.restoreAllMocks(); await f.close(); });
  const root = '/courses/course/stats';
  it('AC01 counts active enrolled accounts and allows anonymous reads', async () => {
    await f.auth.enrollUserInCourse(f.other.id, 'course');
    const third = await f.auth.createUser({ ...f.student, id: 'third', email: 'third@example.test' });
    await f.auth.enrollUserInCourse(third.id, 'course');
    const disabled = await f.auth.createUser({ ...f.student, id: 'disabled', email: 'disabled@example.test' });
    await f.auth.enrollUserInCourse(disabled.id, 'course'); await f.auth.updateStatus(disabled.id, 'disabled');
    const response = await f.request(root, null);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ courseId: 'course', enrolledCount: 3 });
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  });
  it('AC02 checks visibility on every read even when the count is cached', async () => {
    expect((await f.request(root, null)).status).toBe(200);
    const course = (await f.courses.listCourses()).find(item => item.id === 'course')!;
    await f.courses.updateCourse('course', { ...course, status: 'draft' });
    for (const user of [null, f.student, f.other]) expect((await f.request(root, user)).status).toBe(404);
    const owner = await f.request(root, f.teacher);
    expect(owner.status).toBe(200);
    expect(owner.headers.get('cache-control')).toBe('private, no-store');
    expect(owner.headers.get('vary')).toContain('Authorization');
    expect((await f.request('/courses/missing/stats', f.admin)).status).toBe(404);
  });
  it('caches for five minutes then refreshes, including account status changes', async () => {
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(await (await f.request(root, null)).json()).toEqual({ courseId: 'course', enrolledCount: 1 });
    await f.auth.enrollUserInCourse(f.other.id, 'course');
    clock.mockReturnValue(now + 299999);
    expect(await (await f.request(root, null)).json()).toEqual({ courseId: 'course', enrolledCount: 1 });
    clock.mockReturnValue(now + 300000);
    expect(await (await f.request(root, null)).json()).toEqual({ courseId: 'course', enrolledCount: 2 });
    await f.auth.updateStatus(f.other.id, 'disabled'); clock.mockReturnValue(now + 600000);
    expect(await (await f.request(root, null)).json()).toEqual({ courseId: 'course', enrolledCount: 1 });
  });
  it('refreshes a cached count immediately after enrollment and keeps repeat enrollment idempotent', async () => {
    expect(await (await f.request(root, null)).json()).toEqual({ courseId: 'course', enrolledCount: 1 });
    expect((await f.request('/users/me/courses/course', f.other, 'POST')).status).toBe(200);
    expect(await (await f.request(root, null)).json()).toEqual({ courseId: 'course', enrolledCount: 2 });
    expect((await f.request('/users/me/courses/course', f.other, 'POST')).status).toBe(200);
    expect(await (await f.request(root, null)).json()).toEqual({ courseId: 'course', enrolledCount: 2 });
  });
});
