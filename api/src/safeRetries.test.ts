import { authStoreDouble } from '../test/authStoreDouble.js';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository, type AuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { feedbackSheetHeaders, type FeedbackEntry } from './feedback.js';
import { GoogleSheetsFeedbackRepository, InMemoryFeedbackRepository, type FeedbackRepository } from './feedbackRepository.js';
import { GitHubFeedbackError, type GitHubFeedbackService } from './githubFeedback.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { createServer } from './server.js';

let accounts = authStoreDouble();
const sheet = vi.hoisted(() => ({
  rows: new Map<string, string[][]>(),
  beforeWrite: async (_operation: string, _range: string) => {},
}));
vi.mock('./googleSheets.js', () => ({
  ensureWorksheetHeaders: async () => {},
  createSheetsClient: () => ({ spreadsheets: { values: {
    get: async ({ range }: { range: string }) => ({ data: { values: structuredClone(sheet.rows.get(range.split('!')[0]) ?? []) } }),
    append: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      await sheet.beforeWrite('append', range);
      sheet.rows.get(range.split('!')[0])!.push(...structuredClone(requestBody.values));
      return {};
    },
    update: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
      await sheet.beforeWrite('update', range);
      const match = /!([A-Z]+)(\d+)(?::|$)/.exec(range)!;
      const column = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      const row = sheet.rows.get(range.split('!')[0])![Number(match[2]) - 1];
      row.splice(column, requestBody.values[0].length, ...structuredClone(requestBody.values[0]));
      return {};
    },
  } } }),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe.each(['', '/api'])('US-P003 isolated retry contracts (%s)', prefix => {
  let server: Server;
  let base: string;
  let student: AuthUser;
  let admin: AuthUser;
  let memoryAuth: InMemoryAuthRepository;

  beforeEach(async () => {
    memoryAuth = new InMemoryAuthRepository();
    student = (await memoryAuth.findByEmail('student@qi-education.local'))!;
    admin = (await memoryAuth.findByEmail('admin@qi-education.local'))!;
    sheet.rows.clear();
    accounts = authStoreDouble([student, admin]);
    sheet.rows.set('Feedback', [[...feedbackSheetHeaders]]);
    sheet.beforeWrite = async () => {};
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  });

  async function start(auth: AuthRepository = memoryAuth, feedback: FeedbackRepository = new InMemoryFeedbackRepository(),
    github: GitHubFeedbackService = { async createIssueFromFeedback() { throw new Error('Unexpected GitHub access'); } }) {
    const courses = new InMemoryCourseRepository();
    for (const id of ['course-a', 'course-b']) {
      const course = await courses.createCourse(createCourseSchema.parse({
        title: id, description: 'Isolated lesson.', teacher: 'Teacher', level: 'Beginner',
      }), { id, createdAt: '2026-10-11T00:00:00.000Z', ownerUserId: admin.id });
      await courses.updateCourse(id, { ...course, status: 'published' });
    }
    server = createServer({
      authRepository: auth, feedbackRepository: feedback, gitHubFeedbackService: github,
      courseRepository: courses, courseContentRepository: new InMemoryCourseContentRepository(),
      courseAssetRepository: new InMemoryCourseAssetRepository(), careerPathRepository: new InMemoryCareerPathRepository(),
      learningProgressRepository: new InMemoryLearningProgressRepository(), muxVideoService: null, muxWebhookService: null,
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown) {
    return fetch(base + prefix + path, { method, headers: {
      'Content-Type': 'application/json',
      ...(user ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }

  function received(path: string) {
    return new Promise<void>(resolve => {
      const listener = (request: { url?: string }) => {
        if (request.url === prefix + path) { server.off('request', listener); resolve(); }
      };
      server.on('request', listener);
    });
  }

  it.each(['memory', 'mongodb'] as const)('AC01 prevents duplicate normalized signup with the %s repository', async storage => {
    const auth = storage === 'memory' ? memoryAuth : accounts.repository();
    const entered = deferred(), release = deferred();
    const create = auth.createUser.bind(auth);
    vi.spyOn(auth, 'createUser').mockImplementationOnce(async user => {
      entered.resolve(); await release.promise; return create(user);
    });
    await start(auth);
    const input = { displayName: 'New Learner', email: 'Overlap@Example.test', password: 'Password123!' };
    const first = request('/auth/signup', undefined, 'POST', input);
    await entered.promise;
    const arrived = received('/signup');
    const second = request('/signup', undefined, 'POST', { ...input, email: 'overlap@example.test' });
    await arrived;
    await new Promise<void>(resolve => setImmediate(resolve));
    release.resolve();
    const responses = await Promise.all([first, second]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const loser = responses.find(response => response.status === 409)!;
    const duplicate = await request('/auth/signup', undefined, 'POST', input);
    expect(duplicate.status).toBe(409);
    expect(await loser.json()).toEqual(await duplicate.json());
    expect(await (await request('/auth/signup', undefined, 'POST', input)).json())
      .toEqual({ message: 'An account with this email already exists' });
    expect((await auth.listUsers()).filter(user => user.email === 'overlap@example.test')).toHaveLength(1);
    expect((await request('/auth/login', undefined, 'POST', { email: input.email, password: input.password })).status).toBe(200);
  });

  it('AC02 preserves both enrollments with the Mongo adapter under a paused update', async () => {
    const auth = accounts.repository();
    const entered = deferred(), release = deferred();
    accounts.beforeWrite = async field => {
      if (field === 'enrolledCourseIds') {
        accounts.beforeWrite = async () => {}; entered.resolve(); await release.promise;
      }
    };
    await start(auth);
    const first = request('/users/me/courses/course-a', student, 'POST');
    await entered.promise;
    const arrived = received('/users/me/courses/course-b');
    const second = request('/users/me/courses/course-b', student, 'POST');
    await arrived;
    await new Promise<void>(resolve => setImmediate(resolve));
    release.resolve();
    const responses = await Promise.all([first, second]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect((await auth.findById(student.id))!.enrolledCourseIds.sort()).toEqual(['course-a', 'course-b']);
    expect((await request('/users/me/courses/course-a', student, 'POST')).status).toBe(200);
    expect((await auth.findById(student.id))!.enrolledCourseIds.sort()).toEqual(['course-a', 'course-b']);
  });

  it('AC02 characterizes in-memory concurrent enrollment without a lost update', async () => {
    await start();
    const responses = await Promise.all(['course-a', 'course-b', 'course-a'].map(id => request(`/users/me/courses/${id}`, student, 'POST')));
    expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
    expect((await memoryAuth.findById(student.id))!.enrolledCourseIds.sort()).toEqual(['course-a', 'course-b']);
  });

  it.each(['memory', 'sheets'] as const)('AC03 reuses the created issue after the %s feedback save fails', async storage => {
    const feedback = storage === 'memory' ? new InMemoryFeedbackRepository() : new GoogleSheetsFeedbackRepository();
    const entry = await feedback.createFeedback({ page: 'Courses', rating: 'okay', message: 'Retry safely.' }, toAuthenticatedUser(student));
    const createdIssues: Array<{ number: number; url: string }> = [];
    const github: GitHubFeedbackService = {
      async createIssueFromFeedback(_feedback: FeedbackEntry) {
        const issue = { number: createdIssues.length + 1, url: `https://example.test/issues/${createdIssues.length + 1}` };
        createdIssues.push(issue); return issue;
      },
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    if (storage === 'memory') vi.spyOn(feedback, 'updateFeedbackTriage').mockRejectedValueOnce(new Error('Save failed'));
    else sheet.beforeWrite = async (_operation, range) => {
      if (/Feedback!J\d+:M\d+/.test(range)) { sheet.beforeWrite = async () => {}; throw new Error('Save failed'); }
    };
    await start(memoryAuth, feedback, github);
    const first = await request(`/feedback/${entry.id}/triage`, admin, 'PATCH', { workStatus: 'work', priority: 'high' });
    expect(first.status).toBe(500);
    expect((await feedback.findFeedbackById(entry.id))!.githubIssueUrl).toBeUndefined();
    const retry = await request(`/feedback/${entry.id}/triage`, admin, 'PATCH', { workStatus: 'work', priority: 'high' });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ...entry, workStatus: 'work', priority: 'high', githubIssueNumber: 1, githubIssueUrl: 'https://example.test/issues/1' });
    expect(createdIssues).toHaveLength(1);
    expect((await feedback.findFeedbackById(entry.id))!.githubIssueUrl).toBe('https://example.test/issues/1');
  });

  it('allows an unrelated signup while a signup is paused', async () => {
    const entered = deferred(), release = deferred();
    const create = memoryAuth.createUser.bind(memoryAuth);
    vi.spyOn(memoryAuth, 'createUser').mockImplementationOnce(async user => {
      entered.resolve(); await release.promise; return create(user);
    });
    await start();
    const input = { displayName: 'Learner', email: 'first@example.test', password: 'Password123!' };
    const first = request('/auth/signup', undefined, 'POST', input);
    await entered.promise;
    try {
      const unrelated = await request('/signup', undefined, 'POST', { ...input, email: 'second@example.test' });
      expect(unrelated.status).toBe(201);
      const body = await unrelated.json();
      expect(body).toMatchObject({ token: expect.any(String), user: { email: 'second@example.test', role: 'student', enrolledCourseIds: [] } });
      expect(body.user.passwordHash).toBeUndefined();
    } finally { release.resolve(); }
    expect((await first).status).toBe(201);
  });

  it.each(['memory', 'mongodb'] as const)('releases signup coordination after a %s write rejection', async storage => {
    const auth = storage === 'memory' ? memoryAuth : accounts.repository();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(auth, 'createUser').mockRejectedValueOnce(new Error('Write failed'));
    await start(auth);
    const input = { displayName: 'Learner', email: 'retry@example.test', password: 'Password123!' };
    expect((await request('/auth/signup', undefined, 'POST', input)).status).toBe(500);
    expect((await request('/signup', undefined, 'POST', input)).status).toBe(201);
    expect((await request('/auth/signup', undefined, 'POST', input)).status).toBe(409);
  });

  it('releases enrollment coordination after a failed Mongo write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = accounts.repository();
    vi.spyOn(auth, 'enrollUserInCourse').mockRejectedValueOnce(new Error('Write failed'));
    await start(auth);
    expect((await request('/users/me/courses/course-a', student, 'POST')).status).toBe(500);
    expect((await request('/users/me/courses/course-b', student, 'POST')).status).toBe(200);
    expect((await request('/users/me/courses/course-a', student, 'POST')).status).toBe(200);
    expect((await auth.findById(student.id))!.enrolledCourseIds.sort()).toEqual(['course-a', 'course-b']);
  });

  it('allows another user enrollment while a Mongo update is paused', async () => {
    const entered = deferred(), release = deferred();
    accounts.beforeWrite = async field => {
      if (field === 'enrolledCourseIds') { accounts.beforeWrite = async () => {}; entered.resolve(); await release.promise; }
    };
    const auth = accounts.repository();
    await start(auth);
    const first = request('/users/me/courses/course-a', student, 'POST');
    await entered.promise;
    try {
      expect((await request('/users/me/courses/course-b', admin, 'POST')).status).toBe(200);
      expect((await auth.findById(admin.id))!.enrolledCourseIds).toEqual(['course-b']);
    } finally { release.resolve(); }
    expect((await first).status).toBe(200);
    expect((await auth.findById(student.id))!.enrolledCourseIds).toEqual(['course-a']);
  });

  it.each(['memory', 'sheets'] as const)('serializes overlapping triage and retains an existing issue in %s', async storage => {
    const feedback = storage === 'memory' ? new InMemoryFeedbackRepository() : new GoogleSheetsFeedbackRepository();
    const entry = await feedback.createFeedback({ page: 'Courses', rating: 'okay', message: 'Overlap.' }, toAuthenticatedUser(student));
    const entered = deferred(), release = deferred();
    const issues: string[] = [];
    const github: GitHubFeedbackService = {
      async createIssueFromFeedback() {
        const number = issues.length + 1;
        issues.push(`https://example.test/issues/${number}`);
        if (number === 1) { entered.resolve(); await release.promise; }
        return { number, url: issues[number - 1] };
      },
    };
    await start(memoryAuth, feedback, github);
    const path = `/feedback/${entry.id}/triage`;
    const first = request(path, admin, 'PATCH', { workStatus: 'work', priority: 'low' });
    await entered.promise;
    const arrived = received(path);
    const second = request(path, admin, 'PATCH', { workStatus: 'work', priority: 'high' });
    await arrived;
    await new Promise<void>(resolve => setImmediate(resolve));
    release.resolve();
    for (const response of await Promise.all([first, second])) {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ githubIssueNumber: 1, githubIssueUrl: 'https://example.test/issues/1' });
    }
    const completed = await request(path, admin, 'PATCH', { workStatus: 'completed', priority: null });
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({ workStatus: 'completed', githubIssueNumber: 1, githubIssueUrl: 'https://example.test/issues/1' });
    expect((await request(path, admin, 'PATCH', { workStatus: 'work' })).status).toBe(200);
    expect(issues).toEqual(['https://example.test/issues/1']);
  });

  it('releases triage coordination after GitHub fails and never checkpoints a failed creation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const feedback = new InMemoryFeedbackRepository();
    const entry = await feedback.createFeedback({ page: 'Courses', rating: 'okay', message: '' }, toAuthenticatedUser(student));
    let attempts = 0;
    await start(memoryAuth, feedback, { async createIssueFromFeedback() {
      if (++attempts === 1) throw new GitHubFeedbackError('Unavailable');
      return { number: 8, url: 'https://example.test/issues/8' };
    } });
    const path = `/feedback/${entry.id}/triage`;
    const failed = await request(path, admin, 'PATCH', { workStatus: 'work' });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ message: 'GitHub feedback integration is unavailable.' });
    const retry = await request(path, admin, 'PATCH', { workStatus: 'work' });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ githubIssueNumber: 8, githubIssueUrl: 'https://example.test/issues/8' });
    expect(attempts).toBe(2);
  });

  it.each(['memory', 'sheets'] as const)('retains a pending issue over repeated %s save failures and non-work retry', async storage => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const feedback = storage === 'memory' ? new InMemoryFeedbackRepository() : new GoogleSheetsFeedbackRepository();
    const entry = await feedback.createFeedback({ page: 'Courses', rating: 'okay', message: '' }, toAuthenticatedUser(student));
    let failures = 2;
    if (storage === 'memory') vi.spyOn(feedback, 'updateFeedbackTriage')
      .mockRejectedValueOnce(new Error('Save failed')).mockRejectedValueOnce(new Error('Save failed'));
    else sheet.beforeWrite = async (_operation, range) => {
      if (/Feedback!J\d+:M\d+/.test(range) && failures-- > 0) throw new Error('Save failed');
    };
    let created = 0;
    await start(memoryAuth, feedback, { async createIssueFromFeedback() {
      created++; return { number: 3, url: 'https://example.test/issues/3' };
    } });
    const path = `/feedback/${entry.id}/triage`;
    for (let attempt = 0; attempt < 2; attempt++) expect((await request(path, admin, 'PATCH', { workStatus: 'work' })).status).toBe(500);
    const retry = await request(path, admin, 'PATCH', { workStatus: 'wont-do' });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ workStatus: 'wont-do', githubIssueNumber: 3, githubIssueUrl: 'https://example.test/issues/3' });
    expect((await request(path, admin, 'PATCH', { workStatus: 'work' })).status).toBe(200);
    expect(created).toBe(1);
  });

  it('does not create issues for forbidden, invalid, missing or non-work triage', async () => {
    const feedback = new InMemoryFeedbackRepository();
    const entry = await feedback.createFeedback({ page: 'Courses', rating: 'okay', message: '' }, toAuthenticatedUser(student));
    await start(memoryAuth, feedback);
    const path = `/feedback/${entry.id}/triage`;
    expect((await request(path, undefined, 'PATCH', { workStatus: 'work' })).status).toBe(401);
    expect((await request(path, student, 'PATCH', { workStatus: 'work' })).status).toBe(403);
    expect((await request(path, admin, 'PATCH', { workStatus: 'invalid' })).status).toBe(400);
    for (let attempt = 0; attempt < 2; attempt++) {
      const missing = await request('/feedback/missing/triage', admin, 'PATCH', { workStatus: 'work' });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ message: 'Feedback not found' });
    }
    const completed = await request(path, admin, 'PATCH', { workStatus: 'completed' });
    expect(completed.status).toBe(200);
    expect((await completed.json()).githubIssueUrl).toBeUndefined();
  });
});
