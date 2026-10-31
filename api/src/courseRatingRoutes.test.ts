import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { InMemoryCourseRatingRepository } from './courseRatingRepository.js';
import { createServer } from './server.js';
import { apiConfig } from './config.js';
import { updateCourseContentSchema } from './courseContent.js';

describe.each(['', '/api'])('US-L028 ratings HTTP %s', prefix => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository, progress: InMemoryLearningProgressRepository, ratings: InMemoryCourseRatingRepository;
  let student: AuthUser, bob: AuthUser, teacher: AuthUser, admin: AuthUser;
  const courseId = 'demo-course-1';
  const mine = `/users/me/courses/${courseId}/rating`, reviews = `/courses/${courseId}/reviews`;
  const request = (path: string, method = 'GET', body?: unknown, user: AuthUser | null = student) => fetch(base + prefix + path, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { authorization: `Bearer ${createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const qualify = async (user: AuthUser) => { await auth.enrollUserInCourse(user.id, courseId); await progress.complete(user.id, courseId, 'lesson-a'); };
  const put = (stars: number, comment?: string, user = student) => request(mine, 'PUT', { stars, ...(comment === undefined ? {} : { comment }) }, user);
  const moderate = (id: string, hidden: boolean, user = admin) => request(`/admin/courses/${courseId}/reviews/${id}`, 'PATCH', { hidden }, user);

  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    const seed = (await auth.findByEmail('student@qi-education.local'))!;
    student = await auth.createUser({ ...seed, id: 'rating-ada', email: 'ada@example.test', displayName: 'Ada Byron', enrolledCourseIds: [] });
    bob = await auth.createUser({ ...seed, id: 'rating-bob', email: 'bob@example.test', displayName: 'Bob Private', enrolledCourseIds: [] });
    const course = (await courses.listCourses())[0]; course.ownerUserId = teacher.id; course.teacherIds = [teacher.id];
    content = new InMemoryCourseContentRepository();
    await content.createEmptyCourseContent(courseId);
    await content.updateCourseContent(courseId, updateCourseContentSchema.parse({ sections: [{ id: 'section', title: 'Introduction', components: [
      { id: 'lesson-a', type: 'text', title: 'Lesson A', content: 'Learn something useful.' },
    ] }] }).sections);
    progress = new InMemoryLearningProgressRepository(); ratings = new InMemoryCourseRatingRepository();
    await qualify(student);
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      learningProgressRepository: progress, courseRatingRepository: ratings }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); });

  it('AC01 saves and replaces a rating, normalizes comments, and reads only the caller rating', async () => {
    const initial = await request(mine);
    expect(initial.status).toBe(200);
    expect(initial.headers.get('cache-control')).toBe('private, no-store');
    expect(await initial.json()).toEqual({ canRate: true, rating: null });
    const first = await put(5, '  Helpful course  ');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ rating: { stars: 5, comment: 'Helpful course', hidden: false, updatedAt: expect.any(String) }, average: 5, count: 1 });
    const stored = (await ratings.get(courseId, student.id))!;
    expect(await (await put(3, '   ')).json()).toEqual({ rating: { stars: 3, hidden: false, updatedAt: expect.any(String) }, average: 3, count: 1 });
    expect(await ratings.get(courseId, student.id)).toMatchObject({ id: stored.id, createdAt: stored.createdAt, stars: 3 });
    expect(await ratings.listForCourse(courseId)).toHaveLength(1);
    expect(await (await request(mine, 'GET', undefined, bob)).json()).toEqual({ canRate: false, rating: null });
  });

  it.each(['not-enrolled', 'not-started', 'removed-lesson', 'another-course'])('AC03 refuses %s without storing anything', async reason => {
    if (reason !== 'not-enrolled') await auth.enrollUserInCourse(bob.id, courseId);
    if (reason === 'not-enrolled') await progress.complete(bob.id, courseId, 'lesson-a');
    if (reason === 'removed-lesson') await progress.complete(bob.id, courseId, 'removed');
    if (reason === 'another-course') await progress.complete(bob.id, 'other', 'lesson-a');
    expect(await (await request(mine, 'GET', undefined, bob)).json()).toEqual({ canRate: false, rating: null });
    const response = await put(4, undefined, bob);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: 'Complete a lesson in this course before rating it.' });
    expect(await ratings.listForCourse(courseId)).toEqual([]);
  });

  it('AC03 refuses both the owner and assigned teachers, including admins, even when enrolled and started', async () => {
    (await courses.listCourses())[0].teacherIds = [admin.id];
    for (const user of [teacher, admin]) {
      await qualify(user);
      expect((await (await request(mine, 'GET', undefined, user)).json()).canRate).toBe(false);
      const response = await put(5, 'Self promotion', user);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ message: 'Teachers cannot rate their own course.' });
    }
    expect(await ratings.listForCourse(courseId)).toEqual([]);
  });

  it('applies ordinary enrollment/progress requirements to admins who do not teach the course', async () => {
    expect((await put(5, undefined, admin)).status).toBe(403);
    await qualify(admin);
    expect((await put(5, undefined, admin)).status).toBe(200);
  });

  it('AC02 updates the published catalog aggregate without changing course state or review content', async () => {
    expect((await request(`/courses/${courseId}/review`, 'POST', { action: 'start-revision', expectedVersion: 0, revisionId: null }, teacher)).status).toBe(200);
    const before = structuredClone((await courses.listCourses())[0]);
    const beforeContent = await content.getCourseContent(courseId);
    await qualify(bob);
    await put(5, 'Excellent'); await put(2, 'Useful', bob);
    expect((await courses.listCourses())[0]).toEqual({ ...before, rating: 3.5, ratingCount: 2 });
    expect(await content.getCourseContent(courseId)).toEqual(beforeContent);
    const catalog = await (await request('/courses', 'GET', undefined, null)).json();
    expect(catalog.find((course: { id: string }) => course.id === courseId)).toMatchObject({ rating: 3.5, ratingCount: 2, status: 'published' });
    const response = await request(reviews, 'GET', undefined, null);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ average: 3.5, count: 2, reviews: expect.any(Array) });
    expect(body.reviews).toHaveLength(2);
    expect(body.reviews).toEqual(expect.arrayContaining([
      { id: expect.any(String), firstName: 'Ada', stars: 5, comment: 'Excellent', updatedAt: expect.any(String) },
      { id: expect.any(String), firstName: 'Bob', stars: 2, comment: 'Useful', updatedAt: expect.any(String) },
    ]));
    expect(JSON.stringify(body)).not.toContain(student.id); expect(JSON.stringify(body)).not.toContain(bob.email);
  });

  it('ignores legacy catalog rating inputs and accepts catalog changes without those derived fields', async () => {
    await put(4);
    const catalog = { isPremium: true, isBestseller: false, category: 'API Testing', languages: ['English'] };
    for (const legacy of [{ rating: 1, ratingCount: 999 }, { rating: 'ignored', ratingCount: -1 }, {}]) {
      const response = await request(`/courses/${courseId}/catalog-metadata`, 'PATCH', { ...catalog, ...legacy }, admin);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ...catalog, rating: 4, ratingCount: 1, status: 'published' });
    }
  });

  it('hides reviews from public lists and averages, preserves author/admin access, and keeps replacements hidden', async () => {
    await qualify(bob); await put(5, 'Good'); await put(1, 'Needs work', bob);
    const row = (await ratings.get(courseId, bob.id))!;
    expect((await moderate(row.id, true)).status).toBe(204);
    expect(await (await request(reviews, 'GET', undefined, null)).json()).toMatchObject({ average: 5, count: 1, reviews: [{ firstName: 'Ada' }] });
    expect((await courses.listCourses())[0]).toMatchObject({ rating: 5, ratingCount: 1 });
    const own = await (await request(reviews, 'GET', undefined, bob)).json();
    expect(own.reviews).toEqual(expect.arrayContaining([expect.objectContaining({ id: row.id, hidden: true, mine: true })]));
    const adminView = await (await request(reviews, 'GET', undefined, admin)).json();
    expect(adminView.reviews).toEqual(expect.arrayContaining([expect.objectContaining({ id: row.id, hidden: true })]));
    expect(await (await put(2, 'Replaced', bob)).json()).toMatchObject({ rating: { stars: 2, hidden: true }, average: 5, count: 1 });
    expect((await moderate(row.id, false)).status).toBe(204);
    expect((await courses.listCourses())[0]).toMatchObject({ rating: 3.5, ratingCount: 2 });
    expect((await moderate(row.id, true)).status).toBe(204);
    expect((await moderate((await ratings.get(courseId, student.id))!.id, true)).status).toBe(204);
    expect(await (await request(reviews, 'GET', undefined, null)).json()).toEqual({ average: 0, count: 0, reviews: [] });
    expect((await courses.listCourses())[0]).toMatchObject({ rating: 0, ratingCount: 0 });
  });

  it('checks strict bodies, session and admin permissions, and unknown targets before changes', async () => {
    for (const body of [{ stars: 0 }, { stars: 6 }, { stars: 2.5 }, { stars: '5' }, { stars: 3, hidden: true },
      { stars: 3, userId: bob.id }, { stars: 3, comment: 'x'.repeat(1001) }]) expect((await request(mine, 'PUT', body)).status).toBe(400);
    for (const method of ['GET', 'PUT']) expect((await request(mine, method, method === 'PUT' ? { stars: 4 } : undefined, null)).status).toBe(401);
    expect((await request('/users/me/courses/missing/rating')).status).toBe(404);
    expect((await request('/users/me/courses/missing/rating', 'PUT', { stars: 4 })).status).toBe(404);
    expect((await request('/courses/missing/reviews', 'GET', undefined, null)).status).toBe(404);
    expect((await request(`/admin/courses/${courseId}/reviews/missing`, 'PATCH', { hidden: true }, null)).status).toBe(401);
    expect((await request(`/admin/courses/${courseId}/reviews/missing`, 'PATCH', { hidden: true }, teacher)).status).toBe(403);
    for (const body of [{}, { hidden: 'yes' }, { hidden: true, stars: 1 }]) {
      expect((await request(`/admin/courses/${courseId}/reviews/missing`, 'PATCH', body, admin)).status).toBe(400);
    }
    expect((await moderate('missing', true)).status).toBe(404);
    expect((await request('/admin/courses/missing/reviews/missing', 'PATCH', { hidden: true }, admin)).status).toBe(404);
    expect(await ratings.listForCourse(courseId)).toEqual([]);
    await auth.updateStatus(student.id, 'disabled');
    expect((await put(4)).status).toBe(401);
  });

  it('uses course detail visibility for reviews of unpublished and archived courses', async () => {
    const course = (await courses.listCourses())[0]; course.status = 'draft';
    expect((await request(reviews, 'GET', undefined, null)).status).toBe(404);
    expect((await request(reviews)).status).toBe(404);
    expect((await request(reviews, 'GET', undefined, teacher)).status).toBe(200);
    expect((await request(reviews, 'GET', undefined, admin)).status).toBe(200);
    course.status = 'archived';
    expect((await request(reviews)).status).toBe(200);
    expect((await request(reviews, 'GET', undefined, bob)).status).toBe(404);
  });

  it('shows the newest 50 permitted reviews, computes numbers from all visible ratings, and anonymizes erased names', async () => {
    for (let index = 0; index < 52; index++) {
      vi.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(`2026-10-31T12:00:${String(index).padStart(2, '0')}.000Z`);
      await ratings.upsert(courseId, index === 51 ? student.id : `missing-${index}`, { stars: index === 0 ? 1 : 5 });
    }
    (await auth.findById(student.id))!.privacyErasure = { state: 'complete', startedAt: '2026-10-31T12:01:00.000Z' };
    const body = await (await request(reviews, 'GET', undefined, null)).json();
    expect(body).toMatchObject({ average: 4.9, count: 52 });
    expect(body.reviews).toHaveLength(50);
    expect(body.reviews[0]).toMatchObject({ firstName: 'Learner', updatedAt: '2026-10-31T12:00:51.000Z' });
    expect(body.reviews.at(-1).updatedAt).toBe('2026-10-31T12:00:02.000Z');
  });

  it('serializes overlapping ratings and moderation across server instances so catalog numbers stay current', async () => {
    await qualify(bob);
    const second = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      learningProgressRepository: progress, courseRatingRepository: ratings }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => second.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${(second.address() as AddressInfo).port}${prefix}${mine}`;
      const results = await Promise.all([put(5), fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json',
        authorization: `Bearer ${createSessionToken(bob, apiConfig.AUTH_TOKEN_SECRET)}` }, body: JSON.stringify({ stars: 1 }) })]);
      expect(results.map(response => response.status)).toEqual([200, 200]);
      expect((await courses.listCourses())[0]).toMatchObject({ rating: 3, ratingCount: 2 });
      expect((await moderate((await ratings.get(courseId, bob.id))!.id, true)).status).toBe(204);
      expect((await courses.listCourses())[0]).toMatchObject({ rating: 5, ratingCount: 1 });
    } finally { await new Promise<void>(resolve => { second.close(() => resolve()); second.closeAllConnections(); }); }
  });

  it('refuses changes during a course maintenance freeze and recovers aggregate persistence on retry', async () => {
    Object.defineProperty(courses, 'readOnly', { value: true, configurable: true });
    const frozen = await put(4);
    expect(frozen.status).toBe(503);
    expect(await frozen.json()).toEqual({
      message: 'Course details are briefly read-only for maintenance. Try again in a few minutes.', code: 'READ_ONLY', retryable: false,
    });
    expect(await ratings.listForCourse(courseId)).toEqual([]);
    Object.defineProperty(courses, 'readOnly', { value: false });
    vi.spyOn(courses, 'updateCourseCatalogMetadata').mockRejectedValueOnce(new Error('Synthetic aggregate failure'));
    expect((await put(4)).status).toBe(500);
    expect((await put(4)).status).toBe(200);
    expect((await courses.listCourses())[0]).toMatchObject({ rating: 4, ratingCount: 1 });
  });
});
