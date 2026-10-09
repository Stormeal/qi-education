import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema } from './courseContent.js';
import { createServer } from './server.js';

describe('request error contract (DEF-008)', () => {
  let server: Server;
  let base: string;
  let token: string;
  const courses = new InMemoryCourseRepository();
  const content = new InMemoryCourseContentRepository();
  const assets = new InMemoryCourseAssetRepository();
  beforeAll(async () => {
    const auth = new InMemoryAuthRepository();
    const owner = (await auth.findByEmail('teacher@qi-education.local'))!;
    token = createSessionToken(toAuthenticatedUser(owner), apiConfig.AUTH_TOKEN_SECRET!);
    await courses.createCourse(createCourseSchema.parse({ title: 'Error test course',
      description: 'Isolated parser and upload checks.', level: 'Beginner', teacher: 'Teacher' }),
      { id: 'course', createdAt: '2026-10-09', ownerUserId: owner.id });
    await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: [{
      id: 's', title: 'Introduction', components: [{ id: 'text', type: 'text', title: 'Notes' }],
    }] }).sections);
    server = createServer({ authRepository: auth, courseRepository: courses,
      courseContentRepository: content, courseAssetRepository: assets,
      muxVideoService: null, muxWebhookService: null,
      gitHubFeedbackService: { hasConfig: () => false, createIssue: async () => { throw new Error('Disabled'); } },
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it.each(['/auth/login', '/login', '/api/auth/login', '/api/login'])('RD-01 returns safe 400 for malformed JSON on %s', async path => {
    const response = await fetch(base + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{"private":"do-not-echo",' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toMatch(/JSON/i);
    expect(Object.keys(body)).toEqual(['message']);
    expect(JSON.stringify(body)).not.toContain('do-not-echo');
  });

  it.each([
    { path: '/courses/course/thumbnail', bytes: 2 * 1024 * 1024 + 1, type: 'image/png' },
    { path: '/api/courses/course/thumbnail', bytes: 2 * 1024 * 1024 + 1, type: 'image/png' },
    { path: '/courses/course/content/components/text/attachments', bytes: 4 * 1024 * 1024 + 1, type: 'application/pdf', limit: '4 MB' },
    { path: '/api/courses/course/content/components/text/attachments', bytes: 4 * 1024 * 1024 + 1, type: 'application/pdf', limit: '4 MB' },
  ])('RD-02 returns 413 and preserves data for $path', async ({ path, bytes, type, limit = '' }) => {
    const savedCourse = structuredClone(await courses.listCourses());
    const savedContent = structuredClone(await content.getCourseContent('course'));
    const thumbnailWrite = vi.spyOn(assets, 'saveThumbnail');
    const attachmentWrite = vi.spyOn(assets, 'saveComponentAttachment');
    const response = await fetch(base + path, { method: 'PUT', headers: {
      authorization: `Bearer ${token}`, 'Content-Type': type, 'X-Section-Id': 's',
    }, body: Buffer.alloc(bytes) });
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body).toEqual({ message: expect.stringMatching(/(large|limit|size)/i) });
    expect(body.message).toContain(limit); // US-T009-AC03: the API names the same limit as the editor

    expect(await courses.listCourses()).toEqual(savedCourse);
    expect(await content.getCourseContent('course')).toEqual(savedContent);
    expect(thumbnailWrite).not.toHaveBeenCalled(); expect(attachmentWrite).not.toHaveBeenCalled();
    thumbnailWrite.mockRestore(); attachmentWrite.mockRestore();
  });

  it('RD-02 classifies oversized JSON as 413', async () => {
    const response = await fetch(base + '/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x'.repeat(102401) }) });
    expect(response.status).toBe(413);
    expect(Object.keys(await response.json())).toEqual(['message']);
  });

  it('RD-03 preserves field validation 400', async () => {
    const response = await fetch(base + '/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'invalid', password: '' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: 'Invalid request body', issues: expect.any(Array) });
  });

  it.each([
    { type: 'application/json; charset=iso-8859-1', encoding: 'identity', body: '{}', status: 415 },
    { type: 'application/json', encoding: 'gzip', body: 'invalid compressed body', status: 400 },
    { type: 'application/json', encoding: 'unknown', body: '{}', status: 415 },
  ])('RD-03 classifies invalid request encoding as $status ($encoding, $type)', async ({ type, encoding, body, status }) => {
    const response = await fetch(base + '/auth/login', { method: 'POST',
      headers: { 'Content-Type': type, 'Content-Encoding': encoding }, body });
    expect(response.status).toBe(status);
    expect(Object.keys(await response.json())).toEqual(['message']);
  });

  it.each([
    '/courses/course/thumbnail', '/courses/course/content/components/text/attachments',
  ])('RD-03 rejects unsupported MIME with 415 on %s', async path => {
    const response = await fetch(base + path, { method: 'PUT', headers: { authorization: `Bearer ${token}`,
      'Content-Type': 'image/svg+xml', 'X-Section-Id': 's' }, body: '<svg/>' });
    expect(response.status).toBe(415);
    expect(Object.keys(await response.json())).toEqual(['message']);
  });

  it('RD-03 does not classify an application exception as a parser error', async () => {
    const failure = Object.assign(new Error('private provider detail'), { status: 413, type: 'entity.too.large' });
    const read = vi.spyOn(courses, 'listCourses').mockRejectedValueOnce(failure);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await fetch(base + '/courses');
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ message: 'Unexpected server error' });
    } finally { read.mockRestore(); log.mockRestore(); }
  });
});
