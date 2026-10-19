import { createServer as createHttpServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema } from './courseContent.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { AmbiguousCourseWriteError, CourseBusyError, MongoCourseMutationLock, type CourseMutationLockDocument } from './courseMutationLock.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { createServer } from './server.js';

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// Removing the response hold must fail these tests: an HTTP response must not
// commit headers or finish while owner deletion is paused, even on validation.
describe.each(['', '/api'])('DEF-042 response after lock release %s', prefix => {
  let server: Server, base: string, token: string, wire: ServerResponse;
  let content: InMemoryCourseContentRepository, courses: InMemoryCourseRepository;
  let releaseStarted: ReturnType<typeof signal>, allowRelease: ReturnType<typeof signal>;
  let releaseFailure: Error | undefined, acquisitionFailure: Error | undefined;
  let records: Map<string, CourseMutationLockDocument>, events: string[];

  beforeEach(async () => {
    releaseStarted = signal(); allowRelease = signal(); events = [];
    releaseFailure = undefined; acquisitionFailure = undefined; records = new Map();
    const lock = new MongoCourseMutationLock(async () => ({
      find: () => ({ toArray: async () => structuredClone([...records.values()]) }),
      async insertOne(document: CourseMutationLockDocument) {
        if (acquisitionFailure) throw acquisitionFailure;
        records.set(document._id, document);
        return { acknowledged: true, insertedId: document._id };
      },
      async findOne({ _id }: { _id: string }) { return records.get(_id) ?? null; },
      async deleteOne(filter: { _id: string; owner: string }) {
        events.push('release-started'); releaseStarted.resolve();
        await allowRelease.promise;
        if (releaseFailure) throw releaseFailure;
        const matches = records.get(filter._id)?.owner === filter.owner;
        if (matches) records.delete(filter._id);
        events.push('released');
        return { acknowledged: true, deletedCount: matches ? 1 : 0 };
      },
    }) as never);
    const auth = new InMemoryAuthRepository();
    const admin = (await auth.findByEmail('admin@qi-education.local'))!;
    token = createSessionToken(toAuthenticatedUser(admin), apiConfig.AUTH_TOKEN_SECRET!);
    courses = new InMemoryCourseRepository(); content = new InMemoryCourseContentRepository();
    await courses.createCourse(createCourseSchema.parse({ title: 'Isolated course', description: 'Isolated course description',
      teacher: 'Admin', level: 'Beginner' }), { id: 'course', ownerUserId: admin.id, createdAt: '2026-10-16T00:00:00.000Z' });
    await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons',
      components: [{ id: 'video', type: 'video', title: 'Video lesson' }] }] }).sections);
    vi.spyOn(content, 'withCourseMutationLock').mockImplementation((id, operation) => lock.run(id, operation));
    const app = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: new InMemoryCourseAssetRepository(), muxWebhookService: null,
      muxVideoService: { createDirectUpload: async () => ({ uploadId: 'upload', uploadUrl: 'https://isolated.test/upload', playbackPolicy: 'public' }),
        removeVideo: async () => {} } });
    server = createHttpServer((request, response) => {
      wire = response;
      response.on('finish', () => events.push('response-finished'));
      app(request, response);
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`;
  });

  afterEach(async () => {
    allowRelease.resolve();
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.restoreAllMocks();
  });

  function request(path: string, method: string, body?: unknown) {
    return fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      origin: 'http://localhost:4200' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }

  async function finishAfterRelease(pending: Promise<Response>) {
    await releaseStarted.promise;
    try {
      expect(records.has('course')).toBe(true);
      expect(wire.headersSent).toBe(false);
      expect(wire.writableEnded).toBe(false);
      expect(events).toEqual(['release-started']);
    } finally { allowRelease.resolve(); }
    const response = await pending;
    expect(events).toEqual(['release-started', 'released', 'response-finished']);
    expect(records.size).toBe(0);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:4200');
    return response;
  }

  it('PUT preserves the thumbnail response and headers after release', async () => {
    const pending = fetch(base + '/courses/course/thumbnail', { method: 'PUT', headers: {
      authorization: `Bearer ${token}`, 'Content-Type': 'image/png', origin: 'http://localhost:4200' }, body: Buffer.from('isolated image') });
    const response = await finishAfterRelease(pending);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'course', thumbnailAssetId: expect.any(String), review: { version: 1 } });
  });

  it('POST preserves the Mux upload 201 response after release', async () => {
    const response = await finishAfterRelease(request('/courses/course/content/components/video/mux-upload', 'POST', { sectionId: 's' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ uploadId: 'upload', uploadUrl: 'https://isolated.test/upload', playbackPolicy: 'public',
      content: { _id: 'course', review: { version: 1 } } });
  });

  it('PATCH preserves price and cache headers after release', async () => {
    const response = await finishAfterRelease(request('/courses/course/price', 'PATCH', { priceDkk: 123 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'course', priceDkk: 123 });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toContain('Authorization');
  });

  it('DELETE preserves the idempotent video removal response after release', async () => {
    const response = await finishAfterRelease(request('/courses/course/content/components/video/mux-video', 'DELETE', { sectionId: 's' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: { _id: 'course', sections: [{ id: 's', components: [{ id: 'video', type: 'video' }] }] } });
  });

  it('holds a handler validation response until release', async () => {
    const response = await finishAfterRelease(request('/courses/course/content/components/missing/mux-video', 'DELETE', { sectionId: 's' }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Video component not found' });
  });

  it('forwards handler errors only after release, with the normal 400 body', async () => {
    const response = await finishAfterRelease(request('/courses/course/price', 'PATCH', { priceDkk: -1 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: 'Invalid request body', issues: [{ path: ['priceDkk'] }] });
  });

  it('logs failed release before sending the successful handler response', async () => {
    releaseFailure = new CourseBusyError();
    vi.spyOn(console, 'error').mockImplementation(() => { events.push('logged'); });
    const pending = request('/courses/course/price', 'PATCH', { priceDkk: 123 });
    await releaseStarted.promise;
    try { expect(wire.headersSent).toBe(false); } finally { allowRelease.resolve(); }
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'course', priceDkk: 123 });
    expect(records.has('course')).toBe(true);
    expect(events).toEqual(['release-started', 'logged', 'logged', 'response-finished']);
  });

  it('keeps acquisition failure as 409 without running the handler', async () => {
    acquisitionFailure = new CourseBusyError();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request('/courses/course/price', 'PATCH', { priceDkk: 123 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'This course is being updated. Please try again shortly.' });
    expect((await courses.listCourses()).find(course => course.id === 'course')!.priceDkk).toBeNull();
    expect(records.size).toBe(0);
    expect(events).toEqual(['response-finished']);
  });

  it('preserves uncertain ownership and the handler error response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(courses, 'updateCoursePrice').mockRejectedValueOnce(new AmbiguousCourseWriteError(new Error('uncertain write')));
    const response = await request('/courses/course/price', 'PATCH', { priceDkk: 123 });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'Unexpected server error' });
    expect(records.has('course')).toBe(true);
    expect(events).toEqual(['response-finished']);
  });

  it('keeps missing-course 404 without acquiring ownership', async () => {
    const response = await request('/courses/missing/price', 'PATCH', { priceDkk: 123 });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Course not found' });
    expect(records.size).toBe(0);
    expect(events).toEqual(['response-finished']);
  });
});
