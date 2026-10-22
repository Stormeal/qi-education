import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { canAuthorCourse } from './courseAccess.js';
import { freshAuthoringFetch } from './authoringTestRequest.js';
import { createServer } from './server.js';
import { courseTeacherIds, createCourseSchema } from './course.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { ReadOnlyCourseRepository, UnavailableCourseRepository } from './courseStore.js';
import { courseRequestReads, requestCachedCourses } from './courseRequestReads.js';
import { reviewedRepositories } from './courseReview.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';

const metadata = createCourseSchema.parse({ title: 'Course teachers',
  description: 'An isolated course for teacher assignment.', teacher: 'Display name', level: 'Beginner' });

describe('US-A005 teacher storage', () => {
  it('US-A005-AC06 reads an old course as its owner alone and respects an explicit empty list', () => {
    expect(courseTeacherIds({ ownerUserId: 'T' })).toEqual(['T']);
    expect(courseTeacherIds({ ownerUserId: '' })).toEqual([]);
    expect(courseTeacherIds({ ownerUserId: 'T', teacherIds: [] })).toEqual([]);
    expect(courseTeacherIds({ ownerUserId: 'B', teacherIds: ['B', 'A'] })).toEqual(['B', 'A']);
  });

  it('stores a seeded list, replaces it in order and clears the owner mirror with an empty list', async () => {
    const repository = new InMemoryCourseRepository();
    expect(await repository.createCourse(metadata, { id: 'c', createdAt: 'x', ownerUserId: 'ignored', teacherIds: ['A'] }))
      .toMatchObject({ teacherIds: ['A'], ownerUserId: 'A' });
    expect(await repository.updateCourseTeachers('c', ['B', 'A'])).toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
    expect((await repository.listCourses()).find(course => course.id === 'c'))
      .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
    expect(await repository.updateCourseTeachers('c', [])).toMatchObject({ teacherIds: [], ownerUserId: '' });
    expect(await repository.updateCourseTeachers('missing', [])).toBeNull();
  });

  it('refuses teacher writes through read-only and unavailable stores', async () => {
    await expect(new ReadOnlyCourseRepository(new InMemoryCourseRepository()).updateCourseTeachers('c', []))
      .rejects.toThrow('read-only');
    await expect(new UnavailableCourseRepository().updateCourseTeachers('c', [])).rejects.toThrow('unavailable');
  });

  it('refreshes request reads and keeps assignment outside the review snapshots', async () => {
    const stored = new InMemoryCourseRepository();
    const content = new InMemoryCourseContentRepository();
    await stored.createCourse({ ...metadata, status: 'published' }, { id: 'c', createdAt: 'x', ownerUserId: 'A' });
    const cached = requestCachedCourses(stored);
    const { courses, review } = reviewedRepositories(cached, content, new InMemoryCourseAssetRepository());
    await courseRequestReads.run({ reads: new Map(), reuseRecent: true }, async () => {
      await courses.listCourses();
      expect(await courses.updateCourseTeachers('c', ['B', 'A']))
        .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B', status: 'published' });
      expect((await courses.listCourses()).find(course => course.id === 'c'))
        .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
      expect((await review.state('c')).course).toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
      expect(await courses.updateCourseTeachers('missing', [])).toBeNull();
      expect(await content.getCourseContent('c')).toBeNull();
    });
  });
});

describe.each(['', '/api'])('US-A005 course teacher HTTP (%s)', prefix => {
  let server: Server;
  let base: string;
  let auth: InMemoryAuthRepository;
  let courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository;
  let teacherA: AuthUser;
  let teacherB: AuthUser;
  let admin: AuthUser;
  let student: AuthUser;

  beforeEach(async () => {
    auth = new InMemoryAuthRepository();
    courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository();
    teacherA = (await auth.findByEmail('teacher@qi-education.local'))!;
    teacherB = await auth.createUser({ ...teacherA, id: 'teacher-b', email: 'teacher-b@example.test', displayName: 'Teacher B' });
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    await courses.createCourse(metadata, { id: 'c', createdAt: '2026-10-22T00:00:00Z', teacherIds: [teacherA.id, teacherB.id] });
    server = createServer({ authRepository: auth, courseRepository: courses,
      courseContentRepository: content, courseAssetRepository: new InMemoryCourseAssetRepository(),
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

  it('US-A005-AC02 a second assigned teacher saves lessons, uploads a file and submits for review', async () => {
    const saved = await request('/courses/c/content', teacherB, 'PATCH', { sections: [{ id: 's', title: 'Introduction',
      components: [{ id: 'text', title: 'Lesson notes', type: 'text', content: 'Learn practical testing.' }] }] });
    expect(saved.status).toBe(200);
    expect((await content.getCourseContent('c'))?.sections[0].components[0]).toMatchObject({ id: 'text' });
    const uploaded = await fetch(base + '/courses/c/content/components/text/attachments', { method: 'PUT',
      headers: { ...headers(teacherB), 'Content-Type': 'text/plain', 'X-Section-Id': 's', 'X-File-Name': 'notes.txt' }, body: 'Lesson notes' });
    expect(uploaded.status).toBe(201);
    expect((await uploaded.json()).attachment).toMatchObject({ fileName: 'notes.txt' });
    const loaded = await request('/courses/c/content?view=author', teacherB);
    const state = (await loaded.json()).review;
    const submitted = await request('/courses/c/review', teacherB, 'POST', {
      action: 'submit', expectedVersion: state.version, revisionId: state.revisionId,
    });
    expect(submitted.status).toBe(200);
    expect((await submitted.json()).review.course).toMatchObject({ status: 'ready-for-review', teacherIds: [teacherA.id, teacherB.id], ownerUserId: teacherA.id });
    const catalog = await (await request('/courses', teacherB)).json();
    expect(catalog).toContainEqual(expect.objectContaining({ id: 'c', teacherIds: [teacherA.id, teacherB.id] }));
  });

  it('US-A005-AC03 a removed creator cannot reopen or save while the remaining teacher can', async () => {
    const opened = await request('/courses/c/content?view=author', teacherA);
    expect(opened.status).toBe(200);
    await courses.updateCourseTeachers('c', [teacherB.id]);
    expect((await request('/courses/c/content?view=author', teacherA)).status).toBe(403);
    expect((await request('/courses/c/content', teacherA, 'PATCH', { sections: [] })).status).toBe(403);
    expect((await request('/courses/c/content', teacherB, 'PATCH', { sections: [] })).status).toBe(200);
  });

  it('US-A005-AC06 an owner-only legacy course remains authorable by its teacher', async () => {
    await courses.createCourse(metadata, { id: 'legacy', createdAt: 'x', ownerUserId: teacherA.id });
    expect((await request('/courses/legacy/content', teacherA, 'PATCH', { sections: [] })).status).toBe(200);
    expect((await request('/courses/legacy/content', teacherB, 'PATCH', { sections: [] })).status).toBe(403);
  });

  it('US-A005-AC07 disabled and demoted teachers are refused using an existing token', async () => {
    const tokenHeaders = headers(teacherA);
    await auth.updateStatus(teacherA.id, 'disabled');
    expect((await fetch(base + '/courses/c/content?view=author', { headers: tokenHeaders })).status).toBe(401);
    await auth.updateStatus(teacherA.id, 'active');
    await auth.updateRole(teacherA.id, 'student');
    expect((await freshAuthoringFetch(base + '/courses/c/content', {
      method: 'PATCH', headers: tokenHeaders, body: JSON.stringify({ sections: [] }),
    })).status).toBe(403);
    const course = (await courses.listCourses()).find(item => item.id === 'c')!;
    expect(canAuthorCourse(course, toAuthenticatedUser({ ...teacherA, status: 'disabled' }))).toBe(false);
    expect(canAuthorCourse(course, toAuthenticatedUser({ ...teacherB, role: 'student' }))).toBe(false);
  });

  it.each(['teacher', 'admin'] as const)('a %s creator gets the correct teacher list despite forged assignment', async role => {
    const user = role === 'teacher' ? teacherA : admin;
    const teacherIds = role === 'teacher' ? [teacherA.id] : [];
    const created = await request('/courses', user, 'POST', { ...metadata, ownerUserId: teacherB.id, teacherIds: [teacherB.id] });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body).toMatchObject({ teacherIds, ownerUserId: teacherIds[0] ?? '' });
    expect(body.review.course).toMatchObject({ teacherIds, ownerUserId: teacherIds[0] ?? '' });
    expect((await courses.listCourses()).find(course => course.id === body.id))
      .toMatchObject({ teacherIds, ownerUserId: teacherIds[0] ?? '' });
  });
});
