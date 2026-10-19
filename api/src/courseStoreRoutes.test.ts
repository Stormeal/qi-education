import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from './server.js';
import { apiConfig } from './config.js';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository, type CourseRepository } from './courseRepository.js';
import { MongoCourseRepository } from './mongoCourseRepository.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { freshAuthoringFetch } from './authoringTestRequest.js';
import { fakeCourseCollection } from '../test/fakeCourseCollection.js';

const servers: Server[] = [];
const originalReadOnly = apiConfig.COURSE_STORE_READ_ONLY;
afterEach(async () => { apiConfig.COURSE_STORE_READ_ONLY = originalReadOnly; vi.restoreAllMocks(); await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
const metadata = createCourseSchema.parse({ title: 'Course store journey', description: 'Isolated complete course repository flow.', teacher: 'Teacher Demo', level: 'Beginner' });
async function setup(kind: string, safe = true, freeze = false) {
  const auth = new InMemoryAuthRepository(), memory = new InMemoryCourseRepository(), fake = fakeCourseCollection();
  const teacher = (await auth.findByEmail('teacher@qi-education.local'))!, admin = (await auth.findByEmail('admin@qi-education.local'))!, student = (await auth.findByEmail('student@qi-education.local'))!;
  const courses: CourseRepository = kind === 'mongodb' ? new MongoCourseRepository(async () => fake.collection) : memory;
  const course = await memory.createCourse(metadata, { id: 'course', createdAt: '2026-10-17T00:00:00.000Z', ownerUserId: teacher.id });
  if (kind === 'mongodb') await courses.createCourse(metadata, { id: course.id, createdAt: course.createdAt, ownerUserId: teacher.id });
  const content = new InMemoryCourseContentRepository(), assets = new InMemoryCourseAssetRepository();
  await content.updateCourseContent(course.id, updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons', components: [{ id: 'lesson', type: 'text', title: 'Read', content: 'Private lesson' }] }] }).sections);
  if (kind !== 'memory' && safe) { Object.defineProperty(content, 'storageType', { value: 'mongodb' }); Object.defineProperty(assets, 'storageType', { value: 'mongodb' }); }
  apiConfig.COURSE_STORE_READ_ONLY = freeze ? '1' : '0';
  const server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content, courseAssetRepository: assets,
    feedbackRepository: new InMemoryFeedbackRepository(), muxVideoService: null, muxWebhookService: null,
    gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('No real GitHub'); } },
  }).listen(0); servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, user?: AuthUser, method = 'GET', body?: unknown) => freshAuthoringFetch(base + path, { method,
    headers: { 'Content-Type': Buffer.isBuffer(body) ? 'image/png' : 'application/json', ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}) },
    ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }) });
  const act = async (action: string, actor = teacher, prefix = '') => {
    const { review } = await (await request(`${prefix}/courses/course/content?view=author`, actor)).json();
    return request(`${prefix}/courses/course/review`, actor, 'POST', { action, expectedVersion: review.version, revisionId: review.revisionId, reason: 'Test review' });
  };
  return { auth, teacher, admin, student, courses, content, assets, fake, request, act };
}

describe.each(['memory', 'mongodb'])('US-P015 freeze (%s)', kind => {
  it.each(['', '/api'])('AC05 refuses all details writes before side effects; reads/content/review remain available (%s)', async prefix => {
    const { courses, content, assets, fake, teacher, admin, request, act } = await setup(kind, true, true);
    const before = structuredClone(await courses.listCourses()), mongoBefore = structuredClone([...fake.documents.values()]);
    const thumbnail = vi.spyOn(assets, 'saveThumbnail'), save = vi.spyOn(content, 'saveCourseReview'), create = vi.spyOn(content, 'createEmptyCourseContent'), lock = vi.spyOn(content, 'withCourseMutationLock');
    for (const [path, actor, method, body] of [
      ['/courses', teacher, 'POST', metadata], ['/courses/course', teacher, 'PATCH', metadata],
      ['/courses/course/price', admin, 'PATCH', { priceDkk: 500 }],
      ['/courses/course/catalog-metadata', admin, 'PATCH', { isPremium: true, isBestseller: false, rating: 4, ratingCount: 1, category: 'API Testing', languages: ['English'] }],
      ['/courses/course/thumbnail', teacher, 'PUT', Buffer.from('image')],
    ] as const) for (const variant of [path, path.toUpperCase(), path + '/']) {
      const response = await request(prefix + variant, actor, method, body);
      expect(response.status, variant).toBe(503);
      expect(await response.json()).toEqual({ message: 'Course details are briefly read-only for maintenance. Try again in a few minutes.' });
    }
    expect(thumbnail).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(lock).not.toHaveBeenCalled();
    expect(await courses.listCourses()).toEqual(before); expect([...fake.documents.values()]).toEqual(mongoBefore);
    for (const path of ['/courses', '/courses/course/outline', '/courses/course/content?view=author', '/users/me/learning-progress']) expect((await request(prefix + path, teacher)).status).toBe(200);
    const sections = [{ id: 's', title: 'Changed content', components: [{ id: 'lesson', type: 'text', title: 'Read', content: 'New instructions' }] }];
    expect((await request(prefix + '/courses/course/content', teacher, 'PATCH', { sections })).status).toBe(200);
    // Review actions store only review/content snapshots, never base details.
    expect((await act('submit', teacher, prefix)).status).toBe(200); expect((await act('publish', admin, prefix)).status).toBe(200);
    expect((await act('archive', admin, prefix)).status).toBe(200);
    expect(await courses.listCourses()).toEqual(before); expect([...fake.documents.values()]).toEqual(mongoBefore);
    expect((await (await request(prefix + '/health/config')).json()).courses).toEqual({ storage: kind, readOnly: true });
    expect(await (await request(prefix + '/health/auth')).json()).toEqual({ status: 'ok', store: 'memory', readOnly: false });
  });
});

describe('US-P015 Mongo HTTP behavior', () => {
  it.each(['', '/api'])('AC01/02 keeps published metadata, permissions, catalog fields and thumbnails with no Courses reads (%s)', async prefix => {
    const { auth, teacher, admin, student, request, act } = await setup('mongodb');
    expect((await request(prefix + '/courses/course', student, 'PATCH', metadata)).status).toBe(403);
    const edit = { ...metadata, title: 'Reviewed Mongo title' };
    expect((await request(prefix + '/courses/course', teacher, 'PATCH', edit)).status).toBe(200);
    expect((await request(prefix + '/courses/course/thumbnail', teacher, 'PUT', Buffer.from('png'))).status).toBe(200);
    expect((await request(prefix + '/courses/course/price', admin, 'PATCH', { priceDkk: 500 })).status).toBe(200);
    const catalog = { isPremium: true, isBestseller: true, rating: 4.5, ratingCount: 23, category: 'API Testing', languages: ['Danish', 'English'] };
    expect((await request(prefix + '/courses/course/catalog-metadata', admin, 'PATCH', catalog)).status).toBe(200);
    expect((await act('submit', teacher, prefix)).status).toBe(200); expect((await act('publish', admin, prefix)).status).toBe(200);
    await auth.enrollUserInCourse(student.id, 'course');
    const listed = await (await request(prefix + '/courses')).json();
    expect(listed).toHaveLength(1); expect(listed[0]).toMatchObject({ ...catalog, title: 'Reviewed Mongo title', status: 'published', priceDkk: 500 });
    for (const path of ['/courses/course/outline', '/courses/course/content', '/courses/course/notes', '/courses/course/learners/count', '/courses/course/thumbnail']) expect((await request(prefix + path, student)).status).toBe(200);
    expect((await (await request(prefix + '/health/config')).json()).courses).toEqual({ storage: 'mongodb', readOnly: false });

  });
  it.each(['', '/api'])('shared Mongo metadata refuses unsafe in-memory content on create and locked operations (%s)', async prefix => {
    const { request, teacher, content, fake } = await setup('mongodb', false);
    const before = structuredClone([...fake.documents.values()]); const create = vi.spyOn(content, 'createEmptyCourseContent'), lock = vi.spyOn(content, 'withCourseMutationLock');
    expect((await request(prefix + '/courses', teacher, 'POST', metadata)).status).toBe(503);
    expect((await request(prefix + '/courses/course/content', teacher, 'PATCH', { sections: [] })).status).toBe(503);
    expect(create).not.toHaveBeenCalled(); expect(lock).not.toHaveBeenCalled(); expect([...fake.documents.values()]).toEqual(before);
  });
});
