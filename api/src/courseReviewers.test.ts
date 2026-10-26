import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { freshAuthoringFetch } from './authoringTestRequest.js';
import { createServer } from './server.js';
import { createCourseSchema } from './course.js';
import { InMemoryCourseRepository, MongoCourseRepository } from './courseRepository.js';
import { ReadOnlyCourseRepository, UnavailableCourseRepository } from './courseStore.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { fakeCourseCollection } from '../test/fakeCourseCollection.js';

const metadata = createCourseSchema.parse({ title: 'Course reviewers',
  description: 'An isolated course for peer review.', teacher: 'Author', level: 'Beginner' });

describe('US-A007 reviewer storage', () => {
  it.each(['memory', 'mongo'])('saves and clears reviewer ids without changing teachers (%s)', async kind => {
    const fake = fakeCourseCollection();
    const repository = kind === 'memory' ? new InMemoryCourseRepository() : new MongoCourseRepository(async () => fake.collection);
    await repository.createCourse(metadata, { id: 'c', createdAt: 'x', teacherIds: ['author'] });
    expect(await repository.updateCourseReviewers('c', ['r2', 'r1']))
      .toMatchObject({ reviewerIds: ['r2', 'r1'], teacherIds: ['author'], ownerUserId: 'author' });
    expect((await repository.listCourses()).find(course => course.id === 'c')?.reviewerIds).toEqual(['r2', 'r1']);
    expect(await repository.updateCourseReviewers('c', [])).toMatchObject({ reviewerIds: [] });
    expect(await repository.updateCourseReviewers('missing', [])).toBeNull();
  });
  it('refuses reviewer writes through frozen and unavailable stores', async () => {
    await expect(new ReadOnlyCourseRepository(new InMemoryCourseRepository()).updateCourseReviewers('c', []))
      .rejects.toThrow('read-only');
    await expect(new UnavailableCourseRepository().updateCourseReviewers('c', [])).rejects.toThrow('unavailable');
  });
});

describe.each(['', '/api'])('US-A007 course reviewer API (%s)', prefix => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository, assets: InMemoryCourseAssetRepository;
  let teacher: AuthUser, reviewer: AuthUser, admin: AuthUser, student: AuthUser;

  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository(); assets = new InMemoryCourseAssetRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    reviewer = await auth.createUser({ ...teacher, id: 'reviewer', email: 'reviewer@example.test', displayName: 'Reviewer' });
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    await courses.createCourse(metadata, { id: 'c', createdAt: '2026-10-26T00:00:00Z', teacherIds: [teacher.id] });
    server = createServer({ authRepository: auth, courseRepository: courses,
      courseContentRepository: content, courseAssetRepository: assets,
      muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  function headers(user?: AuthUser) {
    return { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}`,
    } : {}) };
  }
  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown) {
    return freshAuthoringFetch(base + path, { method, headers: headers(user),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  function view(user: AuthUser, active = true) {
    return { id: user.id, displayName: user.displayName, email: user.email, active };
  }
  function assign(reviewerIds: string[]) { return request('/courses/c/reviewers', admin, 'PUT', { reviewerIds }); }

  it('US-A007-AC01 admin assigns teacher and admin reviewers', async () => {
    const saved = await assign([reviewer.id, admin.id]);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ reviewers: [view(reviewer), view(admin)] });
    const loaded = await request('/courses/c/reviewers', admin);
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toEqual({ reviewers: [view(reviewer), view(admin)] });
    expect(loaded.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each(['student', 'author', 'disabled', 'missing'])('US-A007-AC01 refuses a new %s reviewer', async kind => {
    if (kind === 'disabled') await auth.updateStatus(reviewer.id, 'disabled');
    const id = kind === 'student' ? student.id : kind === 'author' ? teacher.id : kind === 'missing' ? 'missing' : reviewer.id;
    expect((await assign([id])).status).toBe(400);
    expect((await courses.listCourses()).find(course => course.id === 'c')?.reviewerIds ?? []).toEqual([]);
  });
  it('refuses more than 20 or duplicates', async () => {
    expect((await assign(Array.from({ length: 21 }, (_, index) => `r${index}`))).status).toBe(400);
    expect((await assign([reviewer.id, reviewer.id])).status).toBe(400);
  });
  it('US-A007-AC01 teacher cannot read or change reviewers', async () => {
    for (const user of [teacher, reviewer, student]) {
      expect((await request('/courses/c/reviewers', user)).status).toBe(403);
      expect((await request('/courses/c/reviewers', user, 'PUT', { reviewerIds: [] })).status).toBe(403);
    }
  });
  it('teacher assignment refuses a reviewer', async () => {
    expect((await assign([reviewer.id])).status).toBe(200);
    const response = await request('/courses/c/teachers', admin, 'PUT', { teacherIds: [reviewer.id] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: `${reviewer.id} reviews this course and cannot also teach it.` });
  });
  it('keeps a disabled or demoted reviewer already stored', async () => {
    expect((await assign([reviewer.id, admin.id])).status).toBe(200);
    await auth.updateStatus(reviewer.id, 'disabled');
    const saved = await assign([reviewer.id, admin.id]);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ reviewers: [view(reviewer, false), view(admin)] });
    await auth.updateRole(reviewer.id, 'student');
    expect((await assign([reviewer.id])).status).toBe(200);
    expect((await assign([])).status).toBe(200);
  });
  it('returns 404 for an unknown course', async () => {
    expect((await request('/courses/missing/reviewers', admin)).status).toBe(404);
    expect((await request('/courses/missing/reviewers', admin, 'PUT', { reviewerIds: [] })).status).toBe(404);
  });
});
