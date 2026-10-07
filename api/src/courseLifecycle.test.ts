import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema, updateCourseSchema, type CourseStatus } from './course.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository, MongoCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { createServer } from './server.js';
import { updateCourseContentSchema } from './courseContent.js';
import { AmbiguousCourseWriteError, MongoCourseMutationLock, type CourseMutationLockDocument } from './courseMutationLock.js';

const metadata = { title: 'Lifecycle regression course', description: 'Isolated lifecycle behavior checks.',
  teacher: 'Course teacher', level: 'Beginner', status: 'draft', priceDkk: null };
const validSections = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons', components: [
  { id: 'text', type: 'text', title: 'Private lesson', content: 'Secret lesson body', resourceUrl: 'https://example.test/private' },
  { id: 'quiz', type: 'quiz', title: 'Assessment', quiz: { passPoints: 1, questions: [{
    id: 'q', question: 'Which answer is correct?', points: 1, answers: [
      { id: 'a', text: 'Correct choice', isCorrect: true, description: 'Private rubric' },
      { id: 'b', text: 'Wrong choice', description: 'Try another answer' },
      { id: 'c', text: 'Third choice' }, { id: 'd', text: 'Fourth choice' },
    ],
  }] } },
] }] }).sections;

describe('course lifecycle boundaries (DEF-002, DEF-003, DEF-004)', () => {
  let server: Server;
  let baseUrl: string;
  let auth: InMemoryAuthRepository;
  let courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository;
  let assets: InMemoryCourseAssetRepository;
  let teacher: AuthUser;
  let admin: AuthUser;
  let student: AuthUser;
  let otherTeacher: AuthUser;

  beforeEach(async () => {
    auth = new InMemoryAuthRepository();
    courses = new InMemoryCourseRepository();
    const listCourses = courses.listCourses.bind(courses);
    vi.spyOn(courses, 'listCourses').mockImplementation(async () => (await listCourses()).filter((course) => course.id !== 'demo-course-1'));
    content = new InMemoryCourseContentRepository();
    assets = new InMemoryCourseAssetRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    otherTeacher = await auth.createUser({ ...teacher, id: 'other-teacher', email: 'other@example.test' });
    await courses.createCourse(createCourseSchema.parse(metadata), {
      id: 'course', createdAt: '2026-10-04T00:00:00.000Z', ownerUserId: teacher.id,
    });
    await content.createEmptyCourseContent('course', '2026-10-04T00:00:00.000Z');
    server = createServer({ authRepository: auth, courseRepository: courses,
      courseContentRepository: content, courseAssetRepository: assets, muxVideoService: null,
    }).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function headers(user?: AuthUser) {
    return { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}`,
    } : {}) };
  }
  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown) {
    return fetch(`${baseUrl}${path}`, { method, headers: headers(user),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function setStatus(status: CourseStatus, priceDkk: number | null = null) {
    await courses.updateCourse('course', updateCourseSchema.parse({ ...metadata, status, priceDkk }));
  }

  it.each(['read', 'write'])('retains durable ownership only for an uncertain %s failure', async (stage) => {
    const records = new Map<string, CourseMutationLockDocument>();
    const collection = {
      insertOne: vi.fn(async (document: CourseMutationLockDocument) => {
        if (records.has(document._id)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
        records.set(document._id, document); return { acknowledged: true, insertedId: document._id };
      }),
      deleteOne: vi.fn(async (filter: { _id: string; owner: string }) => {
        const matches = records.get(filter._id)?.owner === filter.owner;
        if (matches) records.delete(filter._id);
        return { acknowledged: true, deletedCount: matches ? 1 : 0 };
      }),
    };
    const lock = new MongoCourseMutationLock(async () => collection as never);
    vi.spyOn(content, 'withCourseMutationLock').mockImplementation((id, operation) => lock.run(id, operation));
    if (stage === 'read') {
      const list = vi.mocked(courses.listCourses).getMockImplementation()!;
      let calls = 0;
      vi.mocked(courses.listCourses).mockImplementation(() => ++calls === 3 ? Promise.reject(new Error('Read unavailable')) : list());
    } else vi.spyOn(courses, 'updateCourse').mockRejectedValue(new AmbiguousCourseWriteError(new Error('Write acknowledgement lost')));
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request('/courses/course', teacher, 'PATCH', metadata);
    expect(response.status).toBe(500);
    expect(records.has('course')).toBe(stage === 'write');
    expect(collection.deleteOne).toHaveBeenCalledTimes(stage === 'write' ? 0 : 1);
    if (stage === 'read') expect((await request('/courses/course/outline', teacher)).status).toBe(200);
    logging.mockRestore();
  });

  it.each(['read', 'write'])('coordinates a real Mongo repository %s failure at the provider boundary', async (stage) => {
    const locks = { insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }) };
    const existing = { _id: 'course', sections: validSections, createdAt: '', updatedAt: '' };
    const findOne = vi.fn().mockResolvedValue(existing);
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    if (stage === 'read') findOne.mockRejectedValueOnce(new Error('Read unavailable'));
    else updateOne.mockRejectedValueOnce(new Error('Write acknowledgement lost'));
    const mongo = new MongoCourseContentRepository(async () => ({ findOne, updateOne,
      insertOne: vi.fn(), deleteOne: vi.fn() }) as never,
      new MongoCourseMutationLock(async () => locks as never));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createServer({ authRepository: auth, courseRepository: courses,
      courseContentRepository: mongo, courseAssetRepository: assets, muxVideoService: null }).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request('/courses/course/content', teacher, 'PATCH', { sections: validSections })).status).toBe(500);
    expect(locks.deleteOne).toHaveBeenCalledTimes(stage === 'read' ? 1 : 0);
    expect(updateOne).toHaveBeenCalledTimes(stage === 'read' ? 0 : 1);
    if (stage === 'read') expect((await request('/courses/course/outline', teacher)).status).toBe(200);
  });

  it('preserves the newly referenced thumbnail if cleanup of the old asset fails', async () => {
    const old = await assets.saveThumbnail({ courseId: 'course', contentType: 'image/png', fileName: 'old.png', binary: Buffer.from('old') });
    await courses.updateCourseThumbnail('course', { thumbnailAssetId: old._id });
    const remove = assets.deleteAsset.bind(assets);
    vi.spyOn(assets, 'deleteAsset').mockImplementation((id, courseId) => id === old._id
      ? Promise.reject(new Error('Collection unavailable before deletion')) : remove(id, courseId));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await fetch(`${baseUrl}/courses/course/thumbnail`, { method: 'PUT',
      headers: { ...headers(teacher), 'Content-Type': 'image/png' }, body: Buffer.from('new') });
    expect(response.status).toBe(500);
    const linked = (await courses.listCourses())[0].thumbnailAssetId;
    expect(linked).not.toBe(old._id);
    expect(await assets.getThumbnail(linked)).not.toBeNull();
    expect(assets.deleteAsset).toHaveBeenCalledTimes(1);
  });

  it('LC-02 serializes ordinary teacher saves with admin publication and pricing', async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    const update = courses.updateCourse.bind(courses);
    vi.spyOn(courses, 'updateCourse').mockImplementation(async (id, input) => {
      if (input.title === 'Slow teacher save') { entered(); await resume; }
      return update(id, input);
    });
    const { status: _status, priceDkk: _price, ...ordinary } = metadata;
    const teacherSave = request('/courses/course', teacher, 'PATCH', { ...ordinary, title: 'Slow teacher save' });
    await started;
    const publication = request('/courses/course', admin, 'PATCH', { ...metadata, status: 'published', priceDkk: 500 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    const responses = await Promise.all([teacherSave, publication]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await courses.listCourses())[0]).toMatchObject({ status: 'published', priceDkk: 500 });
  });

  it('LC-03 pairs entitlement and content reads consistently during withdrawal to draft', async () => {
    await content.updateCourseContent('course', validSections);
    await setStatus('published');
    await auth.enrollUserInCourse(student.id, 'course');
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const resume = new Promise<void>((resolve) => { release = resolve; });
    const get = content.getCourseContent.bind(content);
    let reads = 0;
    vi.spyOn(content, 'getCourseContent').mockImplementation(async (id) => {
      if (reads++ === 0) { entered(); await resume; }
      return get(id);
    });
    const read = request('/courses/course/content', student);
    await started;
    const draft = structuredClone(validSections);
    draft[0].components[0].content = 'Unreleased author draft';
    const mutation = request('/courses/course', admin, 'PATCH', metadata).then(async (response) => {
      expect(response.status).toBe(200);
      return request('/courses/course/content', teacher, 'PATCH', { sections: draft });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    const [response, saved] = await Promise.all([read, mutation]);
    expect(response.status).toBe(200);
    expect((await response.json()).sections[0].components[0].content).toBe('Secret lesson body');
    expect(saved.status).toBe(200);
    expect((await request('/courses/course/content', student)).status).toBe(403);
  });

  for (const prefix of ['', '/api']) {
    it(`LC-03 ${prefix} filters private metadata by identity and returns no-store responses`, async () => {
      for (const user of [undefined, student, otherTeacher]) {
        const response = await request(`${prefix}/courses`, user);
        expect(await response.json()).toEqual([]);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(response.headers.get('vary')).toContain('Authorization');
      }
      for (const user of [teacher, admin]) {
        expect((await (await request(`${prefix}/courses`, user)).json()).map((c: { id: string }) => c.id)).toEqual(['course']);
      }
      await setStatus('published');
      expect((await (await request(`${prefix}/courses`)).json()).map((c: { id: string }) => c.id)).toEqual(['course']);
      const invalid = await fetch(`${baseUrl}${prefix}/courses`, { headers: { authorization: 'Bearer invalid' } });
      expect(invalid.status).toBe(401);
    });

    it(`LC-03 ${prefix} exposes only a published title outline to visitors and unenrolled users`, async () => {
      await content.updateCourseContent('course', validSections);
      expect((await request(`${prefix}/courses/course/content`)).status).toBe(401);
      expect((await request(`${prefix}/courses/course/outline`)).status).toBe(404);
      await setStatus('published');
      const response = await request(`${prefix}/courses/course/outline`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ _id: 'course', view: 'outline', sections: [{ id: 's', title: 'Lessons', components: [
        { id: 'text', type: 'text', title: 'Private lesson', durationMinutes: 0 },
        { id: 'quiz', type: 'quiz', title: 'Assessment', durationMinutes: 0 },
      ] }] });
      for (const user of [student, otherTeacher]) {
        expect((await request(`${prefix}/courses/course/content`, user)).status).toBe(403);
      }
      for (const user of [teacher, admin]) {
        const author = await request(`${prefix}/courses/course/content?view=author`, user);
        expect(author.status).toBe(200);
        expect((await author.json()).sections[0].components[1].quiz.questions[0].answers[0].isCorrect).toBe(true);
      }
    });

    it(`LC-03/04 ${prefix} retains archived entitlement, redacts learner answers, and denies author mode`, async () => {
      await content.updateCourseContent('course', validSections);
      await auth.enrollUserInCourse(student.id, 'course');
      for (const status of ['published', 'archived'] as const) {
        await setStatus(status);
        const response = await request(`${prefix}/courses/course/content`, student);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.sections[0].components[0].content).toBe('Secret lesson body');
        expect(body.sections[0].components[1].quiz.questions[0].answers).toEqual([
          { id: 'a', text: 'Correct choice' }, { id: 'b', text: 'Wrong choice' },
          { id: 'c', text: 'Third choice' }, { id: 'd', text: 'Fourth choice' },
        ]);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect((await request(`${prefix}/courses/course/content?view=author`, student)).status).toBe(403);
      }
      expect((await (await request(`${prefix}/courses`, student)).json()).map((c: { id: string }) => c.id)).toEqual(['course']);
      expect(await (await request(`${prefix}/courses`)).json()).toEqual([]);
      await setStatus('draft');
      expect((await request(`${prefix}/courses/course/content`, student)).status).toBe(403);
    });

    it(`LC-03 ${prefix} protects private thumbnails and attachments from unrelated teachers`, async () => {
      const thumbnail = await assets.saveThumbnail({ courseId: 'course', binary: Buffer.from('thumbnail'), contentType: 'image/png', fileName: 'thumbnail.png' });
      await courses.updateCourseThumbnail('course', { thumbnailAssetId: thumbnail._id });
      const attachment = await assets.saveComponentAttachment({ courseId: 'course', componentId: 'text',
        binary: Buffer.from('private attachment'), contentType: 'text/plain', fileName: 'notes.txt' });
      const sections = structuredClone(validSections);
      sections[0].components[0].attachments = [{ id: attachment._id, assetId: attachment._id, fileName: 'notes.txt',
        contentType: 'text/plain', sizeBytes: attachment.sizeBytes, createdAt: attachment.createdAt }];
      await content.updateCourseContent('course', sections);
      const resourcePath = `${prefix}/courses/course/content/attachments/${attachment._id}`;
      for (const user of [undefined, student, otherTeacher]) {
        expect((await request(`${prefix}/courses/course/thumbnail`, user)).status).toBe(404);
      }
      expect((await request(resourcePath, otherTeacher)).status).toBe(403);
      for (const user of [teacher, admin]) {
        expect((await request(`${prefix}/courses/course/thumbnail`, user)).status).toBe(200);
        expect((await request(resourcePath, user)).status).toBe(200);
      }
      await auth.enrollUserInCourse(student.id, 'course');
      await setStatus('archived');
      expect((await request(resourcePath, student)).status).toBe(200);
      expect((await request(resourcePath, otherTeacher)).status).toBe(403);
      expect((await request(`${prefix}/courses/course/thumbnail`, student)).status).toBe(200);
    });

    it(`LC-06 ${prefix} scores stored answers and returns feedback only after authorized submission`, async () => {
      await content.updateCourseContent('course', validSections);
      await setStatus('published');
      const path = `${prefix}/courses/course/content/components/quiz/quiz-attempts`;
      const answers = { sectionId: 's', answers: [{ questionId: 'q', answerId: 'a' }], score: 999 };
      expect((await request(path, undefined, 'POST', answers)).status).toBe(401);
      expect((await request(path, student, 'POST', answers)).status).toBe(403);
      await auth.enrollUserInCourse(student.id, 'course');
      for (const [answerId, score, passed] of [['a', 1, true], ['b', 0, false]] as const) {
        const response = await request(path, student, 'POST', { sectionId: 's', answers: [{ questionId: 'q', answerId }] });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ score, totalPoints: 1, passPoints: 1, passed,
          feedback: [{ questionId: 'q', answerId, correct: passed }] });
        expect(JSON.stringify(body)).not.toContain('isCorrect');
        expect(JSON.stringify(body)).not.toContain('correctAnswerId');
      }
      const skipped = await request(path, student, 'POST', { sectionId: 's', answers: [] });
      expect(await skipped.json()).toMatchObject({ score: 0, passed: false, feedback: [] });
      for (const invalid of [[{ questionId: 'q', answerId: 'unknown' }], [{ questionId: 'unknown', answerId: 'a' }],
        [{ questionId: 'q', answerId: 'a' }, { questionId: 'q', answerId: 'b' }]]) {
        expect((await request(path, student, 'POST', { sectionId: 's', answers: invalid })).status).toBe(400);
      }
      await setStatus('archived');
      expect((await request(path, student, 'POST', answers)).status).toBe(200);
    });

    it.each([{ status: 'published' }, { status: 'archived' }, { status: 'ready-for-review' },
      { priceDkk: 100 }, { isPremium: true }, { isBestseller: true }, { rating: 4 },
      { ratingCount: 3 }, { category: 'API Testing' }, { languages: ['English'] },
    ])(`LC-01 ${prefix} denies teacher restricted creation %j before storage`, async (fields) => {
      const create = vi.spyOn(courses, 'createCourse');
      const createContent = vi.spyOn(content, 'createEmptyCourseContent');
      const response = await request(`${prefix}/courses`, teacher, 'POST', { ...metadata, ...fields });
      expect(response.status).toBe(403);
      expect(create).not.toHaveBeenCalled();
      expect(createContent).not.toHaveBeenCalled();
    });

    it.each([{ status: 'published' }, { status: 'archived' }, { priceDkk: 100 },
      { isPremium: true }, { category: 'API Testing' }, { languages: ['English'] }, { rating: 5 }, { ratingCount: 99 }, { isBestseller: true }])(
      `LC-02 ${prefix} denies teacher restricted update %j`, async (fields) => {
        const update = vi.spyOn(courses, 'updateCourse');
        const response = await request(`${prefix}/courses/course`, teacher, 'PATCH', { ...metadata, ...fields });
        expect(response.status).toBe(403);
        expect(update).not.toHaveBeenCalled();
      });

    it(`LC-02 ${prefix} preserves omitted restricted fields and accepts an unchanged price/status`, async () => {
      await setStatus('published', 500);
      const { status: _status, priceDkk: _price, ...ordinary } = metadata;
      for (const fields of [{ ...ordinary, title: 'Omitted restricted values' },
        { ...metadata, title: 'Echoed restricted values', status: 'published', priceDkk: 500 }]) {
        const response = await request(`${prefix}/courses/course`, teacher, 'PATCH', fields);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ title: fields.title, status: 'published', priceDkk: 500 });
      }
      const response = await request(`${prefix}/courses/course`, teacher, 'PATCH', { ...metadata, priceDkk: 500 });
      expect(response.status).toBe(403);
    });

    it(`LC-01/02 ${prefix} permits ordinary teacher drafts/review and admin controls`, async () => {
      const created = await request(`${prefix}/courses`, teacher, 'POST', metadata);
      expect(created.status).toBe(201);
      expect((await request(`${prefix}/courses/course`, teacher, 'PATCH', {
        ...metadata, status: 'ready-for-review',
      })).status).toBe(200);
      const published = await request(`${prefix}/courses/course`, admin, 'PATCH', {
        ...metadata, status: 'published', priceDkk: 400,
      });
      expect(published.status).toBe(200);
      expect(await published.json()).toMatchObject({ status: 'published', priceDkk: 400 });
    });

    it.each(['draft', 'ready-for-review', 'archived'] as const)(
      `LC-04 ${prefix} denies new enrollment in %s without a write`, async (status) => {
        await setStatus(status);
        const enroll = vi.spyOn(auth, 'enrollUserInCourse');
        const response = await request(`${prefix}/users/me/courses/course`, student, 'POST');
        expect(response.status).toBe(403);
        expect(enroll).not.toHaveBeenCalled();
        expect((await auth.findById(student.id))?.enrolledCourseIds).toEqual([]);
      });

    it(`LC-04 ${prefix} preserves published enrollment idempotency`, async () => {
      await setStatus('published');
      for (let index = 0; index < 2; index++) {
        const response = await request(`${prefix}/users/me/courses/course`, student, 'POST');
        expect(response.status).toBe(200);
        expect((await response.json()).user.enrolledCourseIds).toEqual(['course']);
      }
    });
  }
});
