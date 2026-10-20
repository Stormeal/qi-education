/**
 * X4 inventory, audited against main 97cd1d5 (source line references at audit time).
 * A branch is one handler/status/cause, including shared helper exits per caller;
 * generic caught 500 and forwarded Mongo outage 503 count once per handler.
 * Shared authenticate 401 applies to every handler below and is covered by X1
 * routePermissions.test.ts; it is excluded from these semantic-handler totals.
 * No admin-only middleware occurs in these three registrations.
 *
 * lessonExtrasRoutes.ts: handle L28-36, entitled L37-43, membership L44-49.
 * GET notes L50: 404 course, 403 entitlement [baseline lessonExtras AC03];
 *   500 repository, 503 outage [new "extras persistence failures"].
 * POST notes L54: 403 entitlement, 400 schema/membership/500-note limit,
 *   500 repository [baseline AC03]; 404 course [new "missing courses"];
 *   503 outage [new "extras persistence failures"].
 * PATCH note L60: 400 schema, 404 private/missing note [baseline AC02/03];
 *   404 course [new "missing courses"], 403 entitlement [new "patch entitlement"];
 *   500 repository, 503 outage [new "extras persistence failures"].
 * DELETE note L67: 403 entitlement, 404 private/missing note [baseline AC02/03];
 *   404 course [new "missing courses"]; 500 repository, 503 outage [new failures].
 * POST feedback L72: 403 entitlement, 400 schema/membership [baseline AC05];
 *   404 course [new "missing courses"]; 500 repository, 503 outage [new failures].
 * GET count L82: 404 course, 403 unpublished/non-author [baseline AC06];
 *   500 repository, 503 outage [new "extras persistence failures"].
 * Totals: found 32; baseline 16; newly covered 16; left 0.
 *
 * learningProgress.ts: handle L31-37; entitledContent L38-46.
 * GET list L49: 500 repository, 503 outage [new "progress list failures"].
 * PUT completion L61: 404 course/lesson, 403 entitlement, 409 missing/current
 *   quiz proof, 500 repository [baseline learningProgress AP02/AP04/AP05];
 *   404 missing content [new "missing content"], 503 outage [new completion failure].
 * POST attempt L76: 403 entitlement, 400 input schema/invalid answer set,
 *   500 proof persistence [baseline learningProgress AP05 + simpleQuiz AC03/04];
 *   404 course/content [new "missing course"/"missing content"], 409 malformed
 *   stored schema [new "malformed stored"], 404 quiz/section/type [new "quiz membership"],
 *   409 unready assessment [new "unready stored"], 409 raw quiz identity mismatch
 *   [new "normalized legacy"], 503 outage [new "quiz proof outage"].
 * Totals: found 20; baseline 9; newly covered 11; left 0.
 *
 * accountCareersRoutes.ts: handle L14-20; service decisions accountCareers.ts
 * L99 (follow 404), L119 (focus 409), L127/134/138 (declare 404/409/409),
 * L148 (recognise 404). Every handler forwards unknown/Mongo failures.
 * GET careers L21: 500 repository, 503 outage [new "career operation failures"].
 * PUT follow L24: 404 unpublished path [baseline accountCareers US-L021-AC04];
 *   400 path schema [new "career input validation"], 500 repository/503 outage
 *   [new "career operation failures"].
 * DELETE follow L27: 400 path schema [new input validation]; 500/503 [new failures].
 * PUT focus L30: 409 not followed [baseline US-L021-AC02]; 400 schema [new input
 *   validation]; 500/503 [new "career operation failures"].
 * POST declare L33: 400 schema, 404 action, 409 not-followed/locked, 500 repository
 *   [baseline US-L019-AC04/06, US-L020-AC01]; 503 outage [new failures].
 * POST recognise L36: 400 schema, 404 unknown/unpublished action, 500 repository
 *   [baseline US-L023 refusals + AC04]; 503 outage [new failures].
 * Additionally all six handlers can incorrectly return caller-error 400 when
 * accountCareers.ts context (L56) parses a corrupt published definition. These
 * six internal-validation failure mappings are left uncovered under DEF-054 pending a
 * fix: valid requests should receive a server failure. A temporary isolated
 * probe reproduced this; no passing test endorses that incorrect response.
 * Totals: found 29; baseline 10; newly covered 13; left 6 (DEF-054 stored-schema defect).
 * Shared domain catches preserve messages/codes; schema errors forward to the
 * server 400 mapper; unexpected failures use generic 500; Mongo causes use safe
 * retryable 503. Existing global mapping variants: dependencyErrors.test.ts.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryLessonNotesRepository } from './lessonNotesRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { InMemoryAccountCareersRepository } from './accountCareersRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { careerPathContentSchema } from './careerPath.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const noteInput = { componentId: 'lesson', text: 'Keep this note', videoSeconds: null };
const feedbackInput = { componentId: 'lesson', kind: 'helpful', message: 'Useful lesson' };
const attempt = { sectionId: 'section', answers: [{ questionId: 'question', answerId: 'yes' }] };
const courseRoot = '/courses/x4-course';
const progressRoot = '/users/me/learning-progress';
const quizPath = `${progressRoot}/x4-course/components/quiz/quiz-attempts`;
const completionPath = `${progressRoot}/x4-course/lessons/lesson`;
const careerRoot = '/users/me/careers';
const lessonSections = () => updateCourseContentSchema.parse({ sections: [{ id: 'section', title: 'Lessons', components: [
  { id: 'lesson', type: 'text', title: 'Read this', content: 'Learning material' },
  { id: 'quiz', type: 'quiz', title: 'Assessment', quiz: { passPoints: 1, questions: [{
    id: 'question', question: 'Ready?', answers: [
      { id: 'yes', text: 'Yes', isCorrect: true }, { id: 'no', text: 'No', isCorrect: false },
    ],
  }] } },
] }] }).sections;
const publishedCareer = () => careerPathContentSchema.parse({ schemaVersion: 2, title: 'X4 career', steps: [
  { id: 'foundation', title: 'Foundation', actions: [{ id: 'foundation-exam', kind: 'exam', title: 'Exam' }], requirementBundles: [['foundation-exam']] },
] });
const failures = [
  { label: 'unexpected error', status: 500, error: () => new Error('Isolated storage failure'), body: { message: 'Unexpected server error' } },
  { label: 'Mongo outage', status: 503, error: () => new Error('Isolated wrapper', {
    cause: Object.assign(new Error('Isolated unavailable connection'), { name: 'MongoNetworkError' }),
  }), body: { message: 'Storage is temporarily unavailable. Please try again.', code: 'STORE_UNAVAILABLE', retryable: true } },
] as const;

describe.each(['', '/api'])('X4 learning semantic error branches (%s)', prefix => {
  let server: Server, base: string, userId: string, token: string, noteId: string;
  let auth: InMemoryAuthRepository, courses: InMemoryCourseRepository, content: InMemoryCourseContentRepository;
  let notes: InMemoryLessonNotesRepository, feedback: InMemoryFeedbackRepository, progress: InMemoryLearningProgressRepository;
  let accounts: InMemoryAccountCareersRepository, paths: InMemoryCareerPathRepository;
  const request = (path: string, method = 'GET', body?: unknown) => fetch(base + prefix + path, { method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  async function expectError(response: Response, status: number, body: unknown) {
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vary')).toContain('Authorization');
  }
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository(); content = new InMemoryCourseContentRepository();
    notes = new InMemoryLessonNotesRepository(); feedback = new InMemoryFeedbackRepository();
    progress = new InMemoryLearningProgressRepository(); accounts = new InMemoryAccountCareersRepository(); paths = new InMemoryCareerPathRepository();
    const student = (await auth.findByEmail('student@qi-education.local'))!;
    userId = student.id;
    token = createSessionToken(student, apiConfig.AUTH_TOKEN_SECRET!);
    await auth.enrollUserInCourse(userId, 'x4-course');
    await courses.createCourse(createCourseSchema.parse({ title: 'X4 learning', description: 'Isolated error branch tests.', teacher: 'Teacher', level: 'Beginner', status: 'published' }),
      { id: 'x4-course', ownerUserId: 'teacher', createdAt: '2026-10-20T10:00:00.000Z' });
    await content.updateCourseContent('x4-course', lessonSections());
    noteId = (await notes.add(userId, 'x4-course', noteInput)).id;
    const published = publishedCareer();
    await paths.savePath({ _id: 'x4-career', revision: 1, published, draft: published, updatedAt: '' });
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: feedback,
      learningProgressRepository: progress, lessonNotesRepository: notes, accountCareersRepository: accounts,
      careerPathRepository: paths, paymentService: null, muxVideoService: null, muxWebhookService: null,
      gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('No external GitHub calls'); } },
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it.each(['get', 'follow', 'unfollow', 'focus', 'declare', 'recognise'] as const)('DEF-054 stored career corruption is a server failure for %s', async operation => {
    const broken = publishedCareer(); broken.title = '';
    await paths.savePath({ _id: 'x4-career', revision: 2, published: broken, draft: broken, updatedAt: '' });
    const routes = {
      get: [careerRoot, 'GET', undefined], follow: [careerRoot + '/x4-career', 'PUT', undefined],
      unfollow: [careerRoot + '/x4-career', 'DELETE', undefined], focus: ['/users/me/career-focus', 'PUT', { pathId: 'x4-career' }],
      declare: ['/users/me/achievements', 'POST', { actionId: 'foundation-exam' }],
      recognise: ['/users/me/achievements/cv', 'POST', { actionIds: ['foundation-exam'] }],
    } as const;
    const [path, method, body] = routes[operation];
    await expectError(await request(path, method, body), 500, { message: 'Unexpected server error' });
    expect(await accounts.get(userId)).toBeNull();
    expect((await auth.findById(userId))?.enrolledCourseIds).toEqual(['x4-course']);
    expect(console.error).toHaveBeenCalledWith('Invalid stored career definition', expect.objectContaining({ careerId: 'x4-career' }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('"issues"');
  });
  it.each([
    ['POST', '/notes', noteInput], ['PATCH', '/notes/existing', { text: 'Changed' }],
    ['DELETE', '/notes/existing', undefined], ['POST', '/lesson-feedback', feedbackInput],
  ] as const)('US-L015 missing courses stop %s %s before private storage', async (method, suffix, body) => {
    const add = vi.spyOn(notes, 'add'), update = vi.spyOn(notes, 'update'), remove = vi.spyOn(notes, 'delete');
    const create = vi.spyOn(feedback, 'createFeedback');
    await expectError(await request('/courses/missing' + suffix, method, body), 404, { message: 'Course not found' });
    for (const write of [add, update, remove, create]) expect(write).not.toHaveBeenCalled();
    expect(await notes.list(userId, 'x4-course')).toHaveLength(1);
  });

  it('US-L015 patch entitlement is checked before looking up a private note', async () => {
    const course = (await courses.listCourses()).find(item => item.id === 'x4-course')!;
    await courses.updateCourse('x4-course', { ...course, status: 'draft' });
    const update = vi.spyOn(notes, 'update');
    await expectError(await request(`${courseRoot}/notes/${noteId}`, 'PATCH', { text: 'Changed' }), 403,
      { message: 'You do not have access to this course content.' });
    expect(update).not.toHaveBeenCalled();
    expect((await notes.list(userId, 'x4-course'))[0].text).toBe(noteInput.text);
  });

  describe.each(failures)('extras persistence failures: $label', failure => {
    it.each(['list', 'add', 'update', 'delete', 'feedback', 'count'] as const)(
      'US-L015 %s returns a safe error and retains prior data until a successful retry', async operation => {
        const before = await notes.list(userId, 'x4-course');
        const routes = {
          list: [courseRoot + '/notes', 'GET', undefined], add: [courseRoot + '/notes', 'POST', noteInput],
          update: [`${courseRoot}/notes/${noteId}`, 'PATCH', { text: 'Changed' }],
          delete: [`${courseRoot}/notes/${noteId}`, 'DELETE', undefined],
          feedback: [courseRoot + '/lesson-feedback', 'POST', feedbackInput], count: [courseRoot + '/learners/count', 'GET', undefined],
        } as const;
        const stub = operation === 'feedback' ? vi.spyOn(feedback, 'createFeedback')
          : operation === 'count' ? vi.spyOn(auth, 'countEnrolledUsers') : vi.spyOn(notes, operation);
        stub.mockRejectedValueOnce(failure.error());
        const [path, method, body] = routes[operation];
        await expectError(await request(path, method, body), failure.status, failure.body);
        expect(await notes.list(userId, 'x4-course')).toEqual(before);
        expect(await feedback.listFeedback()).toEqual([]);
        const retried = await request(path, method, body);
        expect(retried.status).toBe(operation === 'delete' ? 204 : ['add', 'feedback'].includes(operation) ? 201 : 200);
        if (operation === 'add') expect(await notes.list(userId, 'x4-course')).toHaveLength(2);
        if (operation === 'update') expect((await notes.list(userId, 'x4-course'))[0].text).toBe('Changed');
        if (operation === 'delete') expect(await notes.list(userId, 'x4-course')).toEqual([]);
        if (operation === 'feedback') expect(await feedback.listFeedback()).toHaveLength(1);
      });
  });

  it.each([
    ['PUT', completionPath, undefined], ['POST', quizPath, attempt],
  ] as const)('US-L002-AP04 missing content denies %s without storing progress', async (method, path, body) => {
    await content.deleteCourseContent('x4-course');
    await expectError(await request(path, method, body), 404, { message: 'Course content not found' });
    expect(await progress.list(userId)).toEqual([]);
  });

  it('US-L002-AP05 quiz attempts refuse a missing course before validating or persisting answers', async () => {
    await expectError(await request(quizPath.replace('x4-course', 'missing'), 'POST', attempt), 404, { message: 'Course not found' });
    expect(await progress.list(userId)).toEqual([]);
  });

  it.each(['missing section', 'missing component', 'text component'] as const)(
    'US-L002-AP05 quiz membership rejects %s without passing proof', async mismatch => {
      const path = mismatch === 'missing component' ? quizPath.replace('/quiz/', '/missing/')
        : mismatch === 'text component' ? quizPath.replace('/quiz/', '/lesson/') : quizPath;
      const body = mismatch === 'missing section' ? { ...attempt, sectionId: 'missing' } : attempt;
      await expectError(await request(path, 'POST', body), 404, { message: 'Quiz not found' });
      expect(await progress.list(userId)).toEqual([]);
    });

  it('US-L002-AP05 malformed stored assessments refuse grading rather than accepting a client answer', async () => {
    const sections = lessonSections();
    sections[0].components[1].title = '';
    await content.updateCourseContent('x4-course', sections);
    await expectError(await request(quizPath, 'POST', attempt), 409, { message: 'This assessment needs correction by its author.' });
    expect(await progress.list(userId)).toEqual([]);
  });

  it.each(['empty quiz', 'blank question', 'no correct answer', 'duplicate question'] as const)(
    'US-L002-AP05 unready stored assessment (%s) never grants passing proof', async problem => {
      const sections = lessonSections();
      const component = sections[0].components[1];
      if (component.type !== 'quiz') throw new Error('Expected isolated quiz fixture');
      if (problem === 'empty quiz') component.quiz.questions = [];
      if (problem === 'blank question') component.quiz.questions[0].question = ' ';
      if (problem === 'no correct answer') component.quiz.questions[0].answers.forEach(answer => { answer.isCorrect = false; });
      if (problem === 'duplicate question') component.quiz.questions.push(structuredClone(component.quiz.questions[0]));
      await content.updateCourseContent('x4-course', sections);
      await expectError(await request(quizPath, 'POST', attempt), 409, { message: 'This assessment needs correction by its author.' });
      expect(await progress.list(userId)).toEqual([]);
    });

  it('US-L002-AP05 normalized legacy IDs cannot mint proof for a different raw quiz identity', async () => {
    const sections = lessonSections();
    sections[0].components[1].id = ' quiz ';
    await content.updateCourseContent('x4-course', sections);
    await expectError(await request(quizPath, 'POST', attempt), 409, { message: 'Quiz changed before its passing proof was saved.' });
    expect(await progress.list(userId)).toEqual([]);
  });

  it.each(failures)('US-L002-AP02 progress list failures ($label) are not an empty successful progress list', async failure => {
    await progress.complete(userId, 'x4-course', 'lesson');
    vi.spyOn(progress, 'list').mockRejectedValueOnce(failure.error());
    await expectError(await request(progressRoot), failure.status, failure.body);
    expect(await (await request(progressRoot)).json()).toEqual({ progress: [{ courseId: 'x4-course', completedIds: ['lesson'] }] });
  });

  it('US-L002-AP02 completion outage preserves existing completion and accepts an idempotent retry', async () => {
    await progress.complete(userId, 'x4-course', 'old-lesson');
    vi.spyOn(progress, 'complete').mockRejectedValueOnce(failures[1].error());
    await expectError(await request(completionPath, 'PUT'), 503, failures[1].body);
    expect((await progress.get(userId, 'x4-course'))?.completedIds).toEqual(['old-lesson']);
    for (let retry = 0; retry < 2; retry++) expect((await request(completionPath, 'PUT')).status).toBe(200);
    expect((await progress.get(userId, 'x4-course'))?.completedIds).toEqual(['old-lesson', 'lesson']);
  });

  it('US-L002-AP05 quiz proof outage never acknowledges a pass and retries safely', async () => {
    vi.spyOn(progress, 'recordPass').mockRejectedValueOnce(failures[1].error());
    await expectError(await request(quizPath, 'POST', attempt), 503, failures[1].body);
    expect(await progress.get(userId, 'x4-course')).toBeNull();
    await expectError(await request(`${progressRoot}/x4-course/lessons/quiz`, 'PUT'), 409,
      { message: 'Pass this quiz on the server before saving its completion.' });
    expect((await request(quizPath, 'POST', attempt)).status).toBe(200);
    expect((await request(`${progressRoot}/x4-course/lessons/quiz`, 'PUT')).status).toBe(200);
    expect((await progress.get(userId, 'x4-course'))?.passedQuizzes).toHaveLength(1);
  });

  it.each([
    [careerRoot + '/INVALID-ID', 'PUT', undefined], [careerRoot + '/INVALID-ID', 'DELETE', undefined],
    ['/users/me/career-focus', 'PUT', { pathId: 'INVALID-ID' }],
  ] as const)('US-L021-AC06 career input validation refuses %s before account mutation', async (path, method, body) => {
    const mutate = vi.spyOn(accounts, 'mutate');
    const response = await request(path, method, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: 'Invalid request body', issues: expect.any(Array) });
    expect(mutate).not.toHaveBeenCalled();
    expect(await accounts.get(userId)).toBeNull();
  });

  describe.each(failures)('career operation failures: $label', failure => {
    it.each(['get', 'follow', 'unfollow', 'focus', 'declare', 'recognise'] as const)(
      'US-L019-AC04 US-L021-AC04 %s retains account state on failure and retries without duplication', async operation => {
        expect((await request(careerRoot + '/x4-career', 'PUT')).status).toBe(200);
        const before = await accounts.get(userId);
        const routes = {
          get: [careerRoot, 'GET', undefined], follow: [careerRoot + '/x4-career', 'PUT', undefined],
          unfollow: [careerRoot + '/x4-career', 'DELETE', undefined], focus: ['/users/me/career-focus', 'PUT', { pathId: 'x4-career' }],
          declare: ['/users/me/achievements', 'POST', { actionId: 'foundation-exam' }],
          recognise: ['/users/me/achievements/cv', 'POST', { actionIds: ['foundation-exam'] }],
        } as const;
        const stub = operation === 'get' ? vi.spyOn(accounts, 'get') : vi.spyOn(accounts, 'mutate');
        stub.mockRejectedValueOnce(failure.error());
        const [path, method, body] = routes[operation];
        await expectError(await request(path, method, body), failure.status, failure.body);
        expect(await accounts.get(userId)).toEqual(before);
        for (let retry = 0; retry < 2; retry++) expect((await request(path, method, body)).status).toBe(200);
        const saved = await accounts.get(userId);
        expect(saved?.followedPathIds).toEqual(operation === 'unfollow' ? [] : ['x4-career']);
        expect(saved?.focusPathId).toBe(operation === 'unfollow' ? null : 'x4-career');
        expect(saved?.achievements).toHaveLength(['declare', 'recognise'].includes(operation) ? 1 : 0);
        expect((await auth.findById(userId))?.enrolledCourseIds).toEqual(['x4-course']);
        expect(await progress.list(userId)).toEqual([]);
      });
  });

});
