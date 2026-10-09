import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const step = (id: string, courses: { courseId?: string; title?: string }[], extra = {}) =>
  ({ id, title: `Step ${id}`, courses, ...extra });
const path = (steps: unknown[]) => ({ title: 'Test Manager', summary: 'Lead a team.', outcomes: ['Plan test work'], estimatedHours: 40, steps });

describe.each(['', '/api'])('career paths: US-L006, US-L009, US-T008 (%s)', (prefix) => {
  let server: Server, base: string, auth: InMemoryAuthRepository, paths: InMemoryCareerPathRepository;
  let teacher: AuthUser, admin: AuthUser, student: AuthUser;
  function request(url: string, user?: AuthUser, method = 'GET', body?: unknown) {
    return fetch(base + prefix + url, { method, headers: { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function publish(id: string, content: unknown) {
    expect((await request(`/admin/career-paths/${id}`, admin, 'PUT', content)).status).toBe(200);
    return request(`/admin/career-paths/${id}/publish`, admin, 'POST');
  }
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); paths = new InMemoryCareerPathRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    server = createServer({ authRepository: auth, careerPathRepository: paths, courseRepository: new InMemoryCourseRepository(),
      courseContentRepository: new InMemoryCourseContentRepository(), courseAssetRepository: new InMemoryCourseAssetRepository(),
      feedbackRepository: new InMemoryFeedbackRepository(), muxVideoService: null, muxWebhookService: null }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it('US-L006-AC02/T008 seeds are admin-only drafts and nothing is public until published', async () => {
    expect(await (await request('/career-paths')).json()).toEqual([]);
    const drafts = await (await request('/admin/career-paths', admin)).json();
    expect(drafts.map((item: { id: string }) => item.id)).toEqual(
      ['technical-tester', 'test-manager', 'test-analyst', 'agile-tester', 'ai-testing-specialist']);
    expect(drafts.every((item: { published: unknown; revision: number }) => item.published === null && item.revision === 0)).toBe(true);
    expect(await paths.listPaths()).toEqual([]);
  });

  it('US-T008-AC01/L006-AC01 publishes a coherent path with real, alternative and preview courses', async () => {
    const response = await publish('test-manager', path([
      step('a', [{ courseId: 'demo-course-1' }, { title: 'Preview alternative' }]),
      step('b', [{ title: 'Not built yet' }], { required: false, prerequisiteStepIds: ['a'] }),
    ]));
    expect(response.status).toBe(200);
    expect((await response.json()).revision).toBe(1);

    const [published] = await (await request('/career-paths')).json();
    expect(published).toMatchObject({ id: 'test-manager', revision: 1, title: 'Test Manager', estimatedHours: 40 });
    expect(published.steps[0].courses).toEqual([
      { courseId: 'demo-course-1', title: 'Career Discovery Workshop', placeholder: false, available: true },
      { courseId: '', title: 'Preview alternative', placeholder: true, available: false },
    ]);
    expect(published.steps[1]).toMatchObject({ required: false, prerequisiteStepIds: ['a'] });
    expect((await request('/career-paths/test-manager')).status).toBe(200);
  });

  it('US-L006-AC03 returns 404 for a missing or unpublished path', async () => {
    for (const id of ['nope', 'test-manager']) {
      const response = await request(`/career-paths/${id}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ message: 'Career path not found' });
    }
  });

  it('US-T008-AC02 rejects a missing course, duplicate required course and prerequisite loop, keeping the draft', async () => {
    const response = await publish('test-manager', path([
      step('a', [{ courseId: 'gone' }], { prerequisiteStepIds: ['b'] }),
      step('b', [{ courseId: 'demo-course-1' }], { prerequisiteStepIds: ['a'] }),
      step('c', [{ courseId: 'demo-course-1' }]),
      step('d', []),
    ]));
    expect(response.status).toBe(400);
    const { issues } = await response.json();
    const messages = (id: string) => issues.filter((issue: { stepId: string }) => issue.stepId === id).map((issue: { message: string }) => issue.message).join(' ');
    expect(messages('a')).toMatch(/no longer exists/);
    expect(messages('a')).toMatch(/loop/);
    expect(messages('c')).toMatch(/already required/);
    expect(messages('d')).toMatch(/at least one course/);

    expect(await (await request('/career-paths')).json()).toEqual([]);
    const draft = (await (await request('/admin/career-paths', admin)).json()).find((item: { id: string }) => item.id === 'test-manager');
    expect(draft.draft.steps).toHaveLength(4);
    expect(draft.revision).toBe(0);
  });

  it('US-T008-AC04 denies curation to teachers, students and anonymous callers before persistence', async () => {
    for (const user of [teacher, student, undefined]) {
      const expected = user ? 403 : 401;
      expect((await request('/admin/career-paths', user)).status).toBe(expected);
      expect((await request('/admin/career-paths/test-manager', user, 'PUT', path([]))).status).toBe(expected);
      expect((await request('/admin/career-paths/test-manager/publish', user, 'POST')).status).toBe(expected);
    }
    expect(await paths.listPaths()).toEqual([]);
  });

  it('US-L009-AC02/03 saves one selection per account with its revision and never enrolls', async () => {
    await publish('test-manager', path([step('a', [{ courseId: 'demo-course-1' }])]));
    expect(await (await request('/users/me/career-path', student)).json()).toEqual({ selection: null });
    expect((await request('/users/me/career-path', undefined, 'PUT', { pathId: 'test-manager' })).status).toBe(401);
    expect((await request('/users/me/career-path', student, 'PUT', { pathId: 'agile-tester' })).status).toBe(404);

    const saved = await request('/users/me/career-path', student, 'PUT', { pathId: 'test-manager' });
    expect(saved.status).toBe(200);
    const { selection } = await (await request('/users/me/career-path', student)).json();
    expect(selection).toMatchObject({ pathId: 'test-manager', revision: 1 });
    expect(await (await request('/users/me/career-path', teacher)).json()).toEqual({ selection: null });
    expect((await auth.findById(student.id))!.enrolledCourseIds).toEqual([]);
  });

  it('US-T008-AC03 a new revision keeps the learner selection and reports followers to the curator', async () => {
    await publish('test-manager', path([step('a', [{ courseId: 'demo-course-1' }])]));
    await request('/users/me/career-path', student, 'PUT', { pathId: 'test-manager' });
    const republished = await (await publish('test-manager', path([step('b', [{ title: 'Replacement' }])]))).json();
    expect(republished).toMatchObject({ revision: 2, learners: 1 });
    const { selection } = await (await request('/users/me/career-path', student)).json();
    expect(selection).toMatchObject({ pathId: 'test-manager', revision: 1 });
    expect((await (await request('/career-paths/test-manager')).json()).revision).toBe(2);
  });
});
