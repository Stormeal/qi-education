import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository, MongoCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseMutationLock, MongoCourseMutationLock } from './courseMutationLock.js';
import { createServer } from './server.js';

const checkedAt = '2026-10-19T12:00:00.000Z';
function lockStore() {
  const records: Array<{ _id: string; owner: string; acquiredAt?: unknown }> = [];
  const collection = {
    find: vi.fn(() => ({ toArray: async () => structuredClone(records) })),
    insertOne: vi.fn(async () => { throw new Error('Inspection must not acquire a lock'); }),
    deleteOne: vi.fn(async () => { throw new Error('Inspection must not delete a lock'); }),
  };
  const lock = new MongoCourseMutationLock(async () => collection as never);
  return { records, collection, lock };
}

describe('US-P005 read-only lock inspection', () => {
  let server: Server | undefined, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let users: AuthUser[], content: MongoCourseContentRepository, store: ReturnType<typeof lockStore>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(checkedAt));
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository(); store = lockStore();
    content = new MongoCourseContentRepository(async () => { throw new Error('Lock inspection must not load course content'); }, store.lock);
    users = await Promise.all(['admin', 'student', 'teacher'].map(async role => (await auth.findByEmail(`${role}@qi-education.local`))!));
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    vi.useRealTimers(); vi.restoreAllMocks();
  });
  function request(path: string, role: number | null = 0, method = 'GET', token?: string) {
    return fetch(base + path, { method, headers: role === null ? {} : {
      Authorization: `Bearer ${token ?? createSessionToken(users[role], apiConfig.AUTH_TOKEN_SECRET!)}`,
    } });
  }
  const paths = ['/admin/course-locks', '/api/admin/course-locks'];

  it.each(paths)('US-P005-AC01 returns the exact held evidence and missing course titles on %s', async path => {
    store.records.push({ _id: 'demo-course-1', owner: 'owner-1', acquiredAt: '2026-10-19T11:59:00.000Z' },
      { _id: 'missing', owner: 'owner-2', acquiredAt: checkedAt });
    const response = await request(path);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ checkedAt, locks: [
      { courseId: 'demo-course-1', courseTitle: 'Career Discovery Workshop', owner: 'owner-1', acquiredAt: '2026-10-19T11:59:00.000Z', expiresAt: '2026-10-19T12:30:00.000Z', state: 'held' },
      { courseId: 'missing', courseTitle: null, owner: 'owner-2', acquiredAt: checkedAt, expiresAt: '2026-10-19T12:31:00.000Z', state: 'held' },
    ] });
    expect(store.collection.insertOne).not.toHaveBeenCalled(); expect(store.collection.deleteOne).not.toHaveBeenCalled();
    expect(store.collection.find).toHaveBeenCalledWith({}, { timeoutMS: 5000 });
  });
  it.each(paths)('US-P005-AC01 returns an empty snapshot on %s', async path => {
    const response = await request(path);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ checkedAt, locks: [] });
  });
  it.each(paths)('US-P005-AC02 refuses anonymous, student and teacher before reading stores on %s', async path => {
    const readCourses = vi.spyOn(courses, 'listCourses');
    for (const role of [null, 1, 2]) {
      const response = await request(path, role);
      expect(response.status).toBe(role === null ? 401 : 403);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ message: role === null ? 'Authentication required' : 'Admin access is required' });
    }
    expect(store.collection.find).not.toHaveBeenCalled(); expect(readCourses).not.toHaveBeenCalled();
  });
  it.each(paths)('US-P005-AC02 rejects invalid or expired sessions on %s', async path => {
    for (const token of ['bad', createSessionToken(users[0], apiConfig.AUTH_TOKEN_SECRET!, -1)]) {
      const response = await request(path, 0, 'GET', token);
      expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ message: 'Invalid or expired session token' });
    }
    expect(store.collection.find).not.toHaveBeenCalled();
  });
  it.each(paths)('US-P005-AC03 preserves malformed and held ownership while sorting malformed first on %s', async path => {
    store.records.push(
      { _id: 'new', owner: 'held', acquiredAt: checkedAt },
      { _id: 'bad-date', owner: 'bad', acquiredAt: '2026-02-30T00:00:00Z' },
      { _id: 'missing', owner: 'missing' },
      { _id: 'number', owner: 'number', acquiredAt: 123 },
      { _id: 'old', owner: 'old', acquiredAt: '2026-10-19T11:59:00Z' },
    );
    const before = structuredClone(store.records);
    for (let i = 0; i < 2; i++) {
      const response = await request(path); expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.locks.map((lock: { courseId: string }) => lock.courseId)).toEqual(['bad-date', 'missing', 'number', 'old', 'new']);
      expect(body.locks.slice(0, 3)).toEqual([
        { courseId: 'bad-date', courseTitle: null, owner: 'bad', acquiredAt: '2026-02-30T00:00:00Z', expiresAt: null, state: 'needs-recovery' },
        { courseId: 'missing', courseTitle: null, owner: 'missing', acquiredAt: null, expiresAt: null, state: 'needs-recovery' },
        { courseId: 'number', courseTitle: null, owner: 'number', acquiredAt: null, expiresAt: null, state: 'needs-recovery' },
      ]);
    }
    expect(store.records).toEqual(before);
    expect(store.collection.insertOne).not.toHaveBeenCalled(); expect(store.collection.deleteOne).not.toHaveBeenCalled();
  });
  it.each(paths)('US-P005-AC03 provides no release or delete endpoint on %s', async path => {
    for (const method of ['POST', 'DELETE', 'PATCH']) {
      for (const suffix of ['', '/demo-course-1', '/demo-course-1/release']) {
        expect((await request(path + suffix, 0, method)).status).toBe(404);
      }
    }
    expect(store.collection.find).not.toHaveBeenCalled(); expect(store.collection.deleteOne).not.toHaveBeenCalled();
  });
  it.each(paths)('US-P005-AC04 distinguishes expiry at the boundary without removing expired owners on %s', async path => {
    store.records.push({ _id: 'held', owner: 'held', acquiredAt: '2026-10-19T11:29:00.001Z' },
      { _id: 'expired', owner: 'expired', acquiredAt: '2026-10-19T11:29:00.000Z' });
    const response = await request(path); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checkedAt, locks: [
      { courseId: 'expired', courseTitle: null, owner: 'expired', acquiredAt: '2026-10-19T11:29:00.000Z', expiresAt: checkedAt, state: 'expired' },
      { courseId: 'held', courseTitle: null, owner: 'held', acquiredAt: '2026-10-19T11:29:00.001Z', expiresAt: '2026-10-19T12:00:00.001Z', state: 'held' },
    ] });
    expect(store.records).toHaveLength(2); expect(store.collection.deleteOne).not.toHaveBeenCalled();
  });
  it.each(paths)('US-P005-AC01 maps lock store failures to a safe uncached 503 on %s', async path => {
    store.collection.find.mockImplementation(() => { throw new Error('mongodb://private:secret@example.test'); });
    const response = await request(path); expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json(); expect(body).toEqual({ message: expect.any(String) }); expect(JSON.stringify(body)).not.toContain('secret');
  });
  it('US-P005-AC01 lists and copies active memory ownership through the content repository', async () => {
    const memory = new InMemoryCourseContentRepository();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const work = memory.withCourseMutationLock('memory-course', async () => { await gate; });
    try {
      const locks = await memory.listCourseMutationLocks();
      expect(locks).toEqual([{ courseId: 'memory-course', owner: expect.any(String), acquiredAt: checkedAt,
        expiresAt: '2026-10-19T12:31:00.000Z', state: 'held' }]);
      expect(locks[0].owner.length).toBeGreaterThan(0);
      locks[0].owner = 'modified';
      expect((await memory.listCourseMutationLocks())[0].owner).not.toBe('modified');
    } finally { release(); await work; }
    expect(await memory.listCourseMutationLocks()).toEqual([]);
  });
  it('US-P005-AC01 lists in-memory locks only while the operation is held', async () => {
    const lock = new InMemoryCourseMutationLock();
    await lock.run('course', async () => { expect(await lock.list()).toHaveLength(1); });
    expect(await lock.list()).toEqual([]);
  });
  it.each(['', 'yesterday', '2026-10-19', '2026-10-19T11:59:00+00:00', '2026-10-19T11:59:00.00Z',
    '2026-10-19T11:59:00Z ', '2026-13-19T11:59:00Z', null, false])('US-P005-AC03 treats invalid acquisition %j as needing recovery', async acquiredAt => {
    store.records.push({ _id: 'course', owner: 'owner', acquiredAt });
    expect(await store.lock.list()).toEqual([{ courseId: 'course', owner: 'owner',
      acquiredAt: typeof acquiredAt === 'string' ? acquiredAt : null, expiresAt: null, state: 'needs-recovery' }]);
    expect(store.collection.insertOne).not.toHaveBeenCalled(); expect(store.collection.deleteOne).not.toHaveBeenCalled();
  });
  it('US-P005-AC01 serves a held lock from the actual in-memory repository over both routes', async () => {
    const memory = new InMemoryCourseContentRepository();
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: memory,
      muxVideoService: null, muxWebhookService: null }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const work = memory.withCourseMutationLock('demo-course-1', async () => { await gate; });
    const acquire = vi.spyOn(memory, 'withCourseMutationLock');
    try {
      for (const path of paths) {
        const response = await request(path); expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ checkedAt, locks: [{ courseId: 'demo-course-1',
          courseTitle: 'Career Discovery Workshop', owner: expect.any(String), acquiredAt: checkedAt,
          expiresAt: '2026-10-19T12:31:00.000Z', state: 'held' }] });
      }
      expect(acquire).not.toHaveBeenCalled();
    } finally { release(); await work; }
    expect((await (await request(paths[0])).json()).locks).toEqual([]);
  });
});
