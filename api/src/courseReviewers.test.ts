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
import { updateCourseContentSchema } from './courseContent.js';
import { canReviewCourse } from './courseAccess.js';

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
  async function state() { return (await (await request('/courses/c/content?view=author', teacher)).json()).review; }
  async function act(action: string, user = teacher, reason = '') {
    const current = await state();
    return request('/courses/c/review', user, 'POST', { action, reason,
      expectedVersion: current.version, revisionId: current.revisionId });
  }
  async function submitted() {
    await content.updateCourseContent('c', updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Assessment',
      components: [{ id: 'quiz', title: 'Check understanding', type: 'quiz', quiz: { passPoints: 1, questions: [{ id: 'q',
        question: 'Which answer?', answers: [{ id: 'a', text: 'Correct', isCorrect: true }, { id: 'b', text: 'Incorrect', isCorrect: false }] }] } }] }] }).sections);
    expect((await assign([reviewer.id])).status).toBe(200);
    expect((await act('submit')).status).toBe(200);
  }

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

  it('US-A007-AC02 reviewer reads author content of a submitted course and sends verdicts', async () => {
    await submitted();
    const loaded = await request('/courses/c/content?view=author', reviewer);
    expect(loaded.status).toBe(200);
    const body = await loaded.json();
    expect(body.view).toBe('author');
    expect(body.sections[0].components[0].quiz.questions[0].answers[0].isCorrect).toBe(true);
    expect(body.review.reviewers).toEqual({ total: 1, approved: 0, viewerVerdict: 'waiting' });
    expect(body.review.history[0].action).toBe('submit');
    const catalog = await (await request('/courses?view=author', reviewer)).json();
    expect(catalog).toContainEqual(expect.objectContaining({ id: 'c', status: 'ready-for-review' }));
    const blank = await act('request-changes', reviewer, '  ');
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ message: 'Enter a comment before requesting changes.' });
    const changes = await act('request-changes', reviewer, 'Explain the answer');
    expect(changes.status).toBe(200);
    expect((await changes.json()).review.reviewers.viewerVerdict).toBe('changes-requested');
    expect((await state()).history.at(-1)).toMatchObject({ action: 'request-changes', actorId: reviewer.id, reason: 'Explain the answer' });
    const approved = await act('approve', reviewer);
    expect(approved.status).toBe(200);
    expect((await approved.json()).review.reviewers).toEqual({ total: 1, approved: 1, viewerVerdict: 'approved' });
    expect((await act('publish', admin)).status).toBe(200);
  });
  it('reviewer reads thumbnail and attachments', async () => {
    const thumbnail = await assets.saveThumbnail({ courseId: 'c', contentType: 'image/png', fileName: 'thumbnail.png', binary: Buffer.from('image') });
    await courses.updateCourseThumbnail('c', { thumbnailAssetId: thumbnail._id });
    const attachment = await assets.saveComponentAttachment({ courseId: 'c', componentId: 'text', contentType: 'text/plain', fileName: 'notes.txt', binary: Buffer.from('review notes') });
    await content.updateCourseContent('c', updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Resources', components: [
      { id: 'text', title: 'Read me', type: 'text', content: 'Lesson', attachments: [{ id: 'att', assetId: attachment._id,
        fileName: 'notes.txt', contentType: 'text/plain', sizeBytes: attachment.sizeBytes, createdAt: attachment.createdAt }] },
      { id: 'video', title: 'Watch me', type: 'video', mux: { status: 'ready', playbackId: 'review-playback' } },
    ] }] }).sections);
    expect((await assign([reviewer.id])).status).toBe(200);
    expect((await act('submit')).status).toBe(200);
    const image = await request(`/courses/c/thumbnail?v=${thumbnail._id}`, reviewer);
    expect(image.status).toBe(200); expect(await image.text()).toBe('image');
    const file = await request(`/courses/c/content/attachments/${attachment._id}`, reviewer);
    expect(file.status).toBe(200); expect(await file.text()).toBe('review notes');
    const loaded = await (await request('/courses/c/content?view=author', reviewer)).json();
    expect(loaded.sections[0].components[1].mux.playbackId).toBe('review-playback');
  });
  it('reviewer cannot author', async () => {
    await submitted(); const before = await state();
    expect((await request('/courses/c', reviewer, 'PATCH', metadata)).status).toBe(403);
    expect((await request('/courses/c/content', reviewer, 'PATCH', { sections: [] })).status).toBe(403);
    for (const action of ['submit', 'publish', 'return', 'archive', 'start-revision']) {
      expect((await act(action, reviewer, 'Please clarify')).status).toBe(403);
    }
    expect((await request('/courses/c/price', reviewer, 'PATCH', { priceDkk: 100 })).status).toBe(403);
    expect((await request('/courses/c/catalog-metadata', reviewer, 'PATCH', {})).status).toBe(403);
    expect(await state()).toEqual(before);
  });
  it('unassigned teacher cannot read author view or give a verdict', async () => {
    await submitted();
    const other = await auth.createUser({ ...reviewer, id: 'unassigned', email: 'unassigned@example.test' });
    expect((await request('/courses/c/content?view=author', other)).status).toBe(403);
    expect((await act('approve', other)).status).toBe(403);
    expect((await act('approve', admin)).status).toBe(403);
  });
  it('disabled reviewer cannot read; demoted reviewer loses access and still blocks publishing', async () => {
    await submitted();
    const course = (await courses.listCourses()).find(item => item.id === 'c')!;
    expect(canReviewCourse(course, toAuthenticatedUser({ ...reviewer, status: 'disabled' }))).toBe(false);
    await auth.updateStatus(reviewer.id, 'disabled');
    expect((await request('/courses/c/content?view=author', reviewer)).status).toBe(401);
    await auth.updateStatus(reviewer.id, 'active'); await auth.updateRole(reviewer.id, 'student');
    expect((await request('/courses/c/content?view=author', reviewer)).status).toBe(403);
    expect((await act('approve', reviewer)).status).toBe(403);
    const blocked = await act('publish', admin);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ message: 'Waiting for 1 of 1 reviewers to approve this revision.' });
  });
});
