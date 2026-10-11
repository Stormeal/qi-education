import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { InMemoryCourseAssetRepository, type CourseThumbnailAsset } from './courseAssetRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { createServer } from './server.js';

describe.each(['', '/api'])('US-P006-AC06 thumbnail browser caching (%s)', (prefix) => {
  let server: Server;
  let base: string;
  let courses: InMemoryCourseRepository;
  let assets: InMemoryCourseAssetRepository;
  let teacher: AuthUser;
  let student: AuthUser;
  let admin: AuthUser;
  let original: CourseThumbnailAsset;

  function request(path: string, user?: AuthUser, init: RequestInit = {}) {
    return fetch(base + prefix + path, {
      ...init,
      headers: {
        ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}),
        ...init.headers,
      },
    });
  }

  beforeEach(async () => {
    const auth = new InMemoryAuthRepository();
    courses = new InMemoryCourseRepository();
    assets = new InMemoryCourseAssetRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    const metadata = createCourseSchema.parse({
      title: 'Thumbnail cache course', description: 'Isolated course.', teacher: 'Owner', level: 'Beginner',
    });
    const course = await courses.createCourse(metadata, {
      id: 'cache-course', createdAt: '2026-10-11T00:00:00.000Z', ownerUserId: teacher.id,
    });
    await courses.updateCourse(course.id, { ...course, status: 'published' });
    original = await assets.saveThumbnail({
      courseId: course.id, contentType: 'image/png', fileName: 'original.png', binary: Buffer.from('original image'),
    });
    await courses.updateCourseThumbnail(course.id, { thumbnailAssetId: original._id });
    const content = new InMemoryCourseContentRepository();
    await content.updateCourseContent(course.id, updateCourseContentSchema.parse({ sections: [{
      id: 'section', title: 'Lessons', components: [{ id: 'lesson', title: 'Lesson', type: 'text', content: 'Lesson body' }],
    }] }).sections);
    server = createServer({
      authRepository: auth, courseRepository: courses, courseAssetRepository: assets,
      courseContentRepository: content,
      careerPathRepository: new InMemoryCareerPathRepository(),
      learningProgressRepository: new InMemoryLearningProgressRepository(),
      feedbackRepository: new InMemoryFeedbackRepository(),
      gitHubFeedbackService: { hasConfig: () => false } as never,
      muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it.each(['anonymous', 'signed-in'] as const)('DEF-021 caches the exact published asset privately for the %s caller', async (caller) => {
    const response = await request(`/courses/cache-course/thumbnail?v=${original._id}`, caller === 'signed-in' ? student : undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe('14');
    expect(await response.text()).toBe('original image');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
  });

  async function expectMissing(response: Response) {
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    expect(await response.json()).toEqual({ message: 'Course thumbnail not found' });
  }

  it.each(['anonymous', 'signed-in'] as const)('keeps unversioned reads private and no-store for the %s caller', async (caller) => {
    const response = await request('/courses/cache-course/thumbnail', caller === 'signed-in' ? student : undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe('14');
    expect(await response.text()).toBe('original image');
  });

  it.each(['', '?v=', '?v[]=other', '?v=other&v=another'])('keeps existing unversioned/invalid query behavior (%s)', async (query) => {
    const response = await request('/courses/cache-course/thumbnail' + query);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('original image');
  });

  it.each(['anonymous', 'signed-in', 'author'] as const)('keeps wrong versions 404/no-store for the %s caller', async (caller) => {
    await expectMissing(await request('/courses/cache-course/thumbnail?v=wrong',
      caller === 'signed-in' ? student : caller === 'author' ? teacher : undefined));
  });

  it.each(['anonymous', 'signed-in'] as const)('keeps a draft thumbnail 404/no-store for the %s non-author', async (caller) => {
    const course = (await courses.listCourses()).find(item => item.id === 'cache-course')!;
    await courses.updateCourse(course.id, { ...course, status: 'draft' });
    await expectMissing(await request(`/courses/cache-course/thumbnail?v=${original._id}`,
      caller === 'signed-in' ? student : undefined));
  });

  it('keeps nonexistent courses, missing pointers and missing assets 404/no-store', async () => {
    await expectMissing(await request(`/courses/missing/thumbnail?v=${original._id}`));
    await courses.updateCourseThumbnail('cache-course', { thumbnailAssetId: '' });
    await expectMissing(await request('/courses/cache-course/thumbnail'));
    await courses.updateCourseThumbnail('cache-course', { thumbnailAssetId: original._id });
    await assets.deleteAsset(original._id, 'cache-course');
    await expectMissing(await request(`/courses/cache-course/thumbnail?v=${original._id}`));
  });

  it('keeps foreign-course assets 404/no-store even when v matches', async () => {
    const foreign = await assets.saveThumbnail({
      courseId: 'foreign-course', contentType: 'image/png', fileName: 'foreign.png', binary: Buffer.from('foreign image'),
    });
    await courses.updateCourseThumbnail('cache-course', { thumbnailAssetId: foreign._id });
    await expectMissing(await request(`/courses/cache-course/thumbnail?v=${foreign._id}`));
  });

  it('uses the asset actually returned to determine cacheability', async () => {
    // A repository returns a different ID for the selected pointer: preserve its
    // existing 200/body behavior, but do not cache those bytes under the wrong v.
    vi.spyOn(assets, 'getThumbnail').mockResolvedValue({ ...original, _id: 'different-asset' });
    const response = await request(`/courses/cache-course/thumbnail?v=${original._id}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('original image');
  });

  it.each(['course', 'asset'] as const)('keeps %s repository failures 500/no-store', async (boundary) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    if (boundary === 'course') vi.spyOn(courses, 'listCourses').mockRejectedValueOnce(new Error('Store unavailable'));
    else vi.spyOn(assets, 'getThumbnail').mockRejectedValueOnce(new Error('Store unavailable'));
    const response = await request(`/courses/cache-course/thumbnail?v=${original._id}`, student);
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    expect(await response.json()).toEqual({ message: 'Unexpected server error' });
  });

  it('keeps invalid authentication 401/no-store on a matching version', async () => {
    const response = await request(`/courses/cache-course/thumbnail?v=${original._id}`, undefined,
      { headers: { authorization: 'Bearer invalid' } });
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
  });

  it('keeps author-only revision previews and rejects a replaced live version for learners', async () => {
    async function act(action: string, user = teacher) {
      const loaded = await request('/courses/cache-course/content?view=author', teacher);
      expect(loaded.status).toBe(200);
      const { review } = await loaded.json();
      const response = await request('/courses/cache-course/review', user, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revisionId: review.revisionId, expectedVersion: review.version }),
      });
      expect(response.status).toBe(200);
    }
    await act('start-revision');
    const uploaded = await request('/courses/cache-course/thumbnail', teacher, {
      method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('pending image'),
    });
    expect(uploaded.status).toBe(200);
    const pending = await uploaded.json();
    for (const user of [undefined, student]) {
      await expectMissing(await request(`/courses/cache-course/thumbnail?v=${pending.thumbnailAssetId}`, user));
      const live = await request(`/courses/cache-course/thumbnail?v=${original._id}`, user);
      expect(live.status).toBe(200);
      expect(live.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
      expect(await live.text()).toBe('original image');
    }
    const preview = await request(`/courses/cache-course/thumbnail?v=${pending.thumbnailAssetId}`, teacher);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(preview.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    expect(preview.headers.get('content-type')).toBe('image/png');
    expect(preview.headers.get('content-length')).toBe('13');
    expect(await preview.text()).toBe('pending image');
    await act('submit');
    await act('publish', admin);
    for (const user of [undefined, student]) {
      await expectMissing(await request(`/courses/cache-course/thumbnail?v=${original._id}`, user));
      const replacement = await request(`/courses/cache-course/thumbnail?v=${pending.thumbnailAssetId}`, user);
      expect(replacement.status).toBe(200);
      expect(replacement.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
      expect(await replacement.text()).toBe('pending image');
    }
  });

  it('keeps other course routes private/no-store even with a matching v query', async () => {
    for (const path of ['/courses', '/courses/cache-course/outline', '/courses/cache-course/content?view=author']) {
      const response = await request(path + (path.includes('?') ? '&' : '?') + `v=${original._id}`, teacher);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    }
  });
});
