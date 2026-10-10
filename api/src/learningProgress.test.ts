import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { createCourseSchema, updateCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const sections = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons', components: [
  { id: 'one', title: 'First lesson', type: 'text', content: 'Read this.' },
  { id: 'two', title: 'Second lesson', type: 'resources', content: 'Resources.' },
  { id: 'quiz', title: 'Assessment', type: 'quiz', quiz: { passPoints: 1, questions: [{
    id: 'q', question: 'Which answer?', points: 1, answers: [
      { id: 'a', text: 'Correct', isCorrect: true }, { id: 'b', text: 'Wrong' },
      { id: 'c', text: 'Third' }, { id: 'd', text: 'Fourth' },
    ],
  }] } },
] }] }).sections;
const metadata = { title: 'Progress course', description: 'An isolated account progress course.', teacher: 'Teacher', level: 'Beginner', status: 'published' };

describe.each(['', '/api'])('account completion: US-L002-AC02 (%s)', prefix => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository, student: AuthUser, other: AuthUser;
  let progress: InMemoryLearningProgressRepository;
  const root = '/users/me/learning-progress';
  function request(path: string, user: AuthUser | undefined = student, method = 'GET', body?: unknown) {
    return fetch(base + prefix + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}`,
    } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const save = (id: string, user = student) => request(`${root}/course/lessons/${id}`, user, 'PUT');
  const grade = (answerId: string, user = student) => request(`${root}/course/components/quiz/quiz-attempts`, user, 'POST',
    { sectionId: 's', answers: [{ questionId: 'q', answerId }] });
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository(); content = new InMemoryCourseContentRepository();
    progress = new InMemoryLearningProgressRepository();
    student = (await auth.findByEmail('student@qi-education.local'))!;
    other = await auth.createUser({ ...student, id: 'other', email: 'other@example.test' });
    await auth.enrollUserInCourse(student.id, 'course');
    await courses.createCourse(createCourseSchema.parse(metadata), { id: 'course', ownerUserId: 'teacher' });
    await content.createEmptyCourseContent('course'); await content.updateCourseContent('course', sections);
    server = createServer({ authRepository: auth, courseRepository: courses, learningProgressRepository: progress, careerPathRepository: new InMemoryCareerPathRepository(),
      courseContentRepository: content, courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
      gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('No shared GitHub calls'); } },
      muxVideoService: null, muxWebhookService: null }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });

  it('AP-02 uncertain save acknowledgement is safely retried as a union', async () => {
    const complete = progress.complete.bind(progress);
    vi.spyOn(progress, 'complete').mockImplementationOnce(async (...args) => {
      await complete(...args); throw new Error('Isolated acknowledgement lost');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await save('one')).status).toBe(500);
    expect((await save('two')).status).toBe(200);
    expect((await save('one')).status).toBe(200);
    const { progress: restored } = await (await request(root)).json();
    expect(restored[0].completedIds.sort()).toEqual(['one', 'two']);
  });

  it('AP-05 never reports a passing account assessment before proof persistence succeeds', async () => {
    vi.spyOn(progress, 'recordPass').mockRejectedValueOnce(new Error('Isolated proof store unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await grade('a')).status).toBe(500);
    expect((await save('quiz')).status).toBe(409);
    expect((await grade('a')).status).toBe(200);
    expect((await save('quiz')).status).toBe(200);
  });

  it('AP-01 unions two devices and repeated writes, and a fresh session restores the same IDs', async () => {
    expect(await (await request(root)).json()).toEqual({ progress: [] });
    const replies = await Promise.all([save('one'), save('two'), save('one')]);
    expect(replies.map(reply => reply.status)).toEqual([200, 200, 200]);
    const fresh = { ...student };
    const reply = await request(root, fresh);
    expect(reply.headers.get('cache-control')).toContain('no-store');
    expect(reply.headers.get('vary')).toContain('Authorization');
    const body = await reply.json();
    expect(body.progress).toHaveLength(1);
    expect(body.progress[0].courseId).toBe('course');
    expect(body.progress[0].completedIds.sort()).toEqual(['one', 'two']);
  });

  it('AP-04 denies anonymous, unenrolled and unknown-lesson writes and cannot select another account', async () => {
    const anonymous = await fetch(base + prefix + root);
    expect(anonymous.status).toBe(401);
    expect((await save('one', other)).status).toBe(403);
    expect((await save('missing')).status).toBe(404);
    expect((await request(`${root}/missing/lessons/one`, student, 'PUT')).status).toBe(404);
    expect((await request(`${root}/course/lessons/one?userId=other`, student, 'PUT', { userId: 'other' })).status).toBe(200);
    expect(await (await request(root, other)).json()).toEqual({ progress: [] });
    expect((await request('/users/other/learning-progress')).status).toBe(404);
  });

  it('AP-05 forbids forged/failed quiz completion, stores passing proof without finishing, then accepts Finish', async () => {
    expect((await save('quiz')).status).toBe(409);
    const failed = await grade('b');
    expect(failed.status).toBe(200); expect((await failed.json()).passed).toBe(false);
    expect((await save('quiz')).status).toBe(409);
    const passed = await grade('a');
    expect(passed.status).toBe(200); expect((await passed.json()).passed).toBe(true);
    expect(await (await request(root)).json()).toEqual({ progress: [] });
    expect((await save('quiz')).status).toBe(200);
    expect(await (await request(root)).json()).toEqual({ progress: [{ courseId: 'course', completedIds: ['quiz'] }] });
    await auth.enrollUserInCourse(other.id, 'course');
    expect((await save('quiz', other)).status).toBe(409);
  });

  it('AP-05 rejects malformed, duplicate, unknown and inaccessible quiz answers without granting completion', async () => {
    expect((await grade('unknown')).status).toBe(400);
    expect((await grade('a', other)).status).toBe(403);
    expect((await request(`${root}/course/components/quiz/quiz-attempts`, student, 'POST', { sectionId: 's', answers: [
      { questionId: 'q', answerId: 'a' }, { questionId: 'q', answerId: 'a' },
    ] })).status).toBe(400);
    expect((await save('quiz')).status).toBe(409);
  });

  it('AP-04 omits completion after entitlement withdrawal and restores existing archived access', async () => {
    await save('one');
    await courses.updateCourse('course', updateCourseSchema.parse({ ...metadata, status: 'draft' }));
    expect(await (await request(root)).json()).toEqual({ progress: [] });
    expect((await save('two')).status).toBe(403);
    await courses.updateCourse('course', updateCourseSchema.parse({ ...metadata, status: 'archived' }));
    expect(await (await request(root)).json()).toEqual({ progress: [{ courseId: 'course', completedIds: ['one'] }] });
  });

  it('AP-05 current quiz changes require fresh evidence; existing legacy grading route stays compatible', async () => {
    const legacy = await request('/courses/course/content/components/quiz/quiz-attempts', student, 'POST',
      { sectionId: 's', answers: [{ questionId: 'q', answerId: 'a' }] });
    expect(legacy.status).toBe(200); expect((await legacy.json()).passed).toBe(true);
    expect((await save('quiz')).status).toBe(409);
    await grade('a');
    const changed = structuredClone(sections);
    const quiz = changed[0].components[2];
    if (quiz.type !== 'quiz') throw new Error('Expected quiz fixture');
    quiz.quiz.questions[0].question = 'Revised assessment?';
    await content.updateCourseContent('course', changed);
    expect((await save('quiz')).status).toBe(409);
  });
});
