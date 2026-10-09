// US-P001: one release-candidate journey across teacher, admin and learner roles.
// Runs the real Express app over HTTP with in-memory stores only: no shared user
// data is touched and any attempt to create a GitHub issue fails the run.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const answers = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Answer ${id}`, description: `Why ${id}`, isCorrect: id === 'b' }));
const sections = [{ id: 'intro', title: 'Introduction', components: [
  { id: 'lesson', title: 'Welcome', type: 'text', content: 'Private lesson body' },
  { id: 'quiz', title: 'Check', type: 'quiz', quiz: { passPoints: 1, questions: [{ id: 'q1', question: 'Pick b', points: 1, answers }] } },
  { id: 'files', title: 'Files', type: 'resources' },
] }];

describe('US-P001 release journey: author, review, enroll, learn', () => {
  let server: Server, base: string, auth: InMemoryAuthRepository;
  let teacher: AuthUser, otherTeacher: AuthUser, admin: AuthUser, student: AuthUser;
  let courseId = '';

  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers, ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const review = async (user: AuthUser) =>
    (await (await request(`/courses/${courseId}/content?view=author`, user)).json()).review as { version: number; revisionId: string | null };
  // Authoring saves must name the revision they were based on (US-T005).
  const save = async (user: AuthUser, path: string, body: unknown) => {
    const { version, revisionId } = (await review(user).catch(() => null)) ?? { version: 0, revisionId: null };
    return request(path, user, 'PATCH', body, { 'X-Course-Revision': JSON.stringify({ version, revisionId }) });
  };
  const act = async (user: AuthUser, action: string) => {
    const { version, revisionId } = await review(admin);
    return request(`/courses/${courseId}/review`, user, 'POST', { action, expectedVersion: version, revisionId, reason: '' });
  };
  const catalogIds = async (user?: AuthUser) =>
    ((await (await request('/courses', user)).json()) as { id: string }[]).map((course) => course.id);

  beforeAll(async () => {
    auth = new InMemoryAuthRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    otherTeacher = await auth.createUser({ ...teacher, id: 'other-teacher', email: 'other-teacher@example.test' });
    server = createServer({ authRepository: auth, careerPathRepository: new InMemoryCareerPathRepository(),
      courseRepository: new InMemoryCourseRepository(), courseContentRepository: new InMemoryCourseContentRepository(),
      courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
      muxVideoService: null, muxWebhookService: null,
      gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('The journey must never create a GitHub issue.'); } },
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it('1. a teacher creates a private draft and writes a lesson and a quiz', async () => {
    const created = await request('/courses', teacher, 'POST',
      { title: 'Journey course', description: 'A course used by the release journey.', level: 'Beginner', teacher: 'Teacher Demo' });
    expect(created.status).toBe(201);
    courseId = (await created.json()).id;

    expect((await save(teacher, `/courses/${courseId}/content`, { sections })).status).toBe(200);
    // Resources lessons take handouts: PDF and Word are accepted, executables are not.
    const attach = (type: string) => fetch(`${base}/courses/${courseId}/content/components/files/attachments`, { method: 'PUT',
      headers: { 'Content-Type': type, 'X-Section-Id': 'intro', 'X-File-Name': 'handout',
        authorization: `Bearer ${createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!)}` }, body: Buffer.from('file') });
    expect((await attach('application/pdf')).status).toBe(201);
    expect((await attach('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).status).toBe(201);
    expect((await attach('application/x-msdownload')).status).toBe(415);
    expect(await catalogIds()).not.toContain(courseId);
    expect(await catalogIds(student)).not.toContain(courseId);
    expect(await catalogIds(teacher)).toContain(courseId);
  });

  it('2. nobody else can author or read the draft', async () => {
    expect((await save(otherTeacher, `/courses/${courseId}/content`, { sections: [] })).status).toBe(403);
    expect((await save(student, `/courses/${courseId}/content`, { sections: [] })).status).toBe(403);
    expect((await request(`/courses/${courseId}/content`, undefined)).status).toBe(401);
    expect((await request(`/courses/${courseId}/content`, student)).status).toBe(403);
    expect((await request(`/courses/${courseId}/content?view=author`, otherTeacher)).status).toBe(403);
    expect((await request(`/users/me/courses/${courseId}`, student, 'POST')).status).toBe(403);
    expect((await request(`/courses/${courseId}/price`, teacher, 'PATCH', { priceDkk: 100 })).status).toBe(403);
  });

  it('3. the teacher submits; only an admin can publish', async () => {
    expect((await act(teacher, 'submit')).status).toBe(200);
    expect((await act(teacher, 'publish')).status).toBe(403);
    expect((await save(teacher, `/courses/${courseId}/content`, { sections })).status).toBe(409);
    expect(await catalogIds()).not.toContain(courseId);

    expect((await act(admin, 'publish')).status).toBe(200);
    expect(await catalogIds()).toContain(courseId);
  });

  it('4. the public sees an outline only; a learner must enroll to read lessons', async () => {
    const outline = await (await request(`/courses/${courseId}/outline`)).json();
    expect(JSON.stringify(outline)).not.toContain('Private lesson body');
    expect(outline.sections[0].components.map((component: { title: string }) => component.title)).toEqual(['Welcome', 'Check', 'Files']);
    expect((await request(`/courses/${courseId}/content`, student)).status).toBe(403);

    expect((await request(`/users/me/courses/${courseId}`, student, 'POST')).status).toBe(200);
    const content = await request(`/courses/${courseId}/content`, student);
    expect(content.status).toBe(200);
    const body = JSON.stringify(await content.json());
    expect(body).toContain('Private lesson body');
    expect(body).not.toContain('isCorrect');
    expect(body).not.toContain('"review"');
  });

  it('5. quiz progress is graded by the server: a wrong answer fails, the right one passes', async () => {
    const attempt = (answerId: string, user = student) =>
      request(`/courses/${courseId}/content/components/quiz/quiz-attempts`, user, 'POST',
        { sectionId: 'intro', answers: [{ questionId: 'q1', answerId }] });
    expect(await (await attempt('a')).json()).toMatchObject({ passed: false, score: 0, totalPoints: 1 });
    expect(await (await attempt('b')).json()).toMatchObject({ passed: true, score: 1 });
    expect((await attempt('b', otherTeacher)).status).toBe(403);
  });

  it('6. published learning cannot be changed without a new reviewed revision', async () => {
    expect((await save(teacher, `/courses/${courseId}/content`, { sections: [] })).status).toBe(409);
    expect((await request(`/courses/${courseId}/content`, student)).status).toBe(200);
    expect((await request('/feedback', student)).status).toBe(403);
  });
});
