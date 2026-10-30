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
import { apiConfig } from './config.js';
import { createServer } from './server.js';
import { careerPathContentSchema, careerPathIssues, careerPathSeeds, type CareerPathDocument } from './careerPath.js';

const step = (id: string, courses: { courseId?: string; title?: string }[], extra = {}) =>
  ({ id, title: `Step ${id}`, courses, ...extra });
const path = (steps: unknown[]) => ({ title: 'Test Manager', summary: 'Lead a team.', outcomes: ['Plan test work'], estimatedHours: 40, steps });

describe('US-L023 action CV keywords', () => {
  const content = (extra = {}) => ({ schemaVersion: 2, ...path([step('foundation', [], {
    actions: [{ id: 'foundation-exam', kind: 'exam', title: 'Foundation exam', ...extra }],
    requirementBundles: [['foundation-exam']],
  })]) });

  it('US-L023-AC07 parses cvKeywords with defaults and limits', () => {
    expect(careerPathContentSchema.parse(content()).steps[0].actions[0]).toMatchObject({ cvKeywords: [] });
    expect(careerPathContentSchema.parse(content({ cvKeywords: ['  CTFL ', 'CTFL'] })).steps[0].actions[0])
      .toMatchObject({ cvKeywords: ['CTFL'] });
    for (const cvKeywords of [Array.from({ length: 11 }, (_, i) => `keyword ${i}`), [''], ['   '], ['x'.repeat(81)]]) {
      expect(careerPathContentSchema.safeParse(content({ cvKeywords })).success).toBe(false);
    }
    expect(careerPathContentSchema.safeParse(content({ cvKeywords: ['x'.repeat(80)] })).success).toBe(true);
  });

  it('US-L023-AC07 a keyword change keeps the published action ID valid', () => {
    const previous = careerPathContentSchema.parse(content({ cvKeywords: ['CTFL'] }));
    const changed = careerPathContentSchema.parse(content({ cvKeywords: ['ISTQB Foundation'] }));
    expect(careerPathIssues(changed, [], [], previous)).toEqual([]);
    // Foundation can be shared with another published career whose keywords have not been edited.
    expect(careerPathIssues(changed, [], [previous], previous)).toEqual([]);
  });

  it('US-L023 starter keywords name certifications, not job titles', () => {
    const actions = Object.values(careerPathSeeds).flatMap(path => path.steps.flatMap(step => step.actions));
    const foundation = actions.find(action => action.id === 'foundation-exam')!;
    expect(foundation).toMatchObject({ cvKeywords: ['ISTQB Foundation', 'Certified Tester Foundation Level', 'CTFL'] });
    const titles = ['Test Automation Engineer', 'Technical Test Analyst', 'Test Manager', 'Test Analyst', 'Advanced Test Analyst'];
    for (const action of actions) for (const keyword of action.cvKeywords) {
      expect(titles.map(title => title.toLowerCase())).not.toContain(keyword.toLowerCase());
    }
  });
});

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

  it('DEF-066 reads stored null requirement metadata across public, learner and admin views without rewriting it', async () => {
    const published = careerPathContentSchema.parse({ schemaVersion: 2, ...path([step('legacy-foundation', [], {
      actions: [{ id: 'legacy-foundation-exam', kind: 'exam', title: 'Foundation exam' }],
      requirementBundles: [['legacy-foundation-exam']],
    })]) });
    const legacy = { ...published, steps: published.steps.map(item => ({ ...item,
      requirementVersion: null, requirementHistory: null })) };
    const stored = await paths.savePath({ _id: 'legacy-null', revision: 1, published: legacy, draft: legacy,
      updatedAt: '2026-10-01T00:00:00.000Z' } as unknown as CareerPathDocument);
    const writes = vi.spyOn(paths, 'savePath');

    const replies = await Promise.all([request('/career-paths'), request('/career-paths/legacy-null'),
      request('/users/me/careers', student), request('/admin/career-paths', admin)]);
    expect(replies.map(reply => reply.status)).toEqual([200, 200, 200, 200]);
    for (const reply of replies.slice(0, 2)) {
      const body = await reply.json();
      const view = Array.isArray(body) ? body.find(item => item.id === 'legacy-null') : body;
      expect(view).toMatchObject({ revision: 1, steps: [{ requirementVersion: 1, requirementHistory: [] }] });
    }
    const account = replies[2];
    expect(await account.json()).toMatchObject({ followedPathIds: [], achievements: [],
      milestoneStates: { 'legacy-foundation': 'ready' }, earlierCriteriaMet: [] });

    const adminReply = replies[3];
    const adminRows = await adminReply.json();
    const adminView = adminRows.find((item: { id: string }) => item.id === 'legacy-null');
    expect(adminView).toMatchObject({ revision: 1, updatedAt: stored.updatedAt,
      published: { steps: [{ requirementVersion: 1, requirementHistory: [] }] },
      draft: { steps: [{ requirementVersion: 1, requirementHistory: [] }] } });
    expect(writes).not.toHaveBeenCalled();
  });

  it('DEF-066 still rejects null requirement metadata in a new admin request', async () => {
    const invalid = { schemaVersion: 2, ...path([step('new-foundation', [], {
      actions: [{ id: 'new-foundation-exam', kind: 'exam', title: 'Foundation exam' }],
      requirementBundles: [['new-foundation-exam']], requirementVersion: null, requirementHistory: null,
    })]) };
    const writes = vi.spyOn(paths, 'savePath');
    const reply = await request('/admin/career-paths/new-null', admin, 'PUT', invalid);
    expect(reply.status).toBe(400);
    expect(writes).not.toHaveBeenCalled();
  });

  it('US-L023-AC07 public career data includes cvKeywords', async () => {
    const content = { schemaVersion: 2, ...path([step('foundation', [], {
      actions: [{ id: 'foundation-exam', kind: 'exam', title: 'Foundation exam', cvKeywords: [' CTFL ', 'CTFL'] },
        { id: 'foundation-activity', kind: 'activity', title: 'Other evidence' }],
      requirementBundles: [['foundation-exam'], ['foundation-activity']],
    })]) };
    expect((await publish('keyword-path', content)).status).toBe(200);
    for (const route of ['/career-paths', '/career-paths/keyword-path']) {
      const reply = await request(route);
      expect(reply.status).toBe(200);
      const body = await reply.json();
      const published = Array.isArray(body) ? body.find(item => item.id === 'keyword-path') : body;
      expect(published.steps[0].actions.map((action: { cvKeywords: string[] }) => action.cvKeywords)).toEqual([['CTFL'], []]);
    }
  });

  it('US-L023-AC07 publishes keyword-only edits to an action shared with another career', async () => {
    const original = careerPathSeeds['technical-tester'];
    expect((await publish('technical-tester', original)).status).toBe(200);
    expect((await publish('test-manager', careerPathSeeds['test-manager'])).status).toBe(200);
    const changed = { ...original, steps: original.steps.map(step => ({ ...step,
      actions: step.actions.map(action => action.id === 'foundation-exam'
        ? { ...action, cvKeywords: [...action.cvKeywords, 'ISTQB CTFL'] } : action),
    })) };
    expect((await publish('technical-tester', changed)).status).toBe(200);
    const published = await (await request('/career-paths/technical-tester')).json();
    expect(published.steps[0].actions[0].cvKeywords).toContain('ISTQB CTFL');
  });

  it('US-P004-AC03 omits private draft catalog titles through a published reference and grants no access', async () => {
    await publish('test-manager', path([step('a', [{ courseId: 'demo-course-1', title: 'Curator public label' }])]));
    // Replace the catalog at the HTTP boundary with a course that is now private.
    const courses = new InMemoryCourseRepository();
    const course = (await courses.listCourses())[0];
    await courses.updateCourse(course.id, { ...course, title: 'Private unpublished revision title', status: 'draft' });
    await new Promise<void>(resolve => server.close(() => resolve()));
    server = createServer({ authRepository: auth, careerPathRepository: paths, courseRepository: courses,
      courseContentRepository: new InMemoryCourseContentRepository(), courseAssetRepository: new InMemoryCourseAssetRepository(),
      feedbackRepository: new InMemoryFeedbackRepository(), muxVideoService: null, muxWebhookService: null }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const route of ['/career-paths', '/career-paths/test-manager']) {
      const view = JSON.stringify(await (await request(route)).json());
      expect(view).not.toContain('Private unpublished revision title');
      expect(view).toContain('Curator public label');
      expect(view).toContain('"available":false');
    }
    expect((await request('/users/me/career-path', student, 'PUT', { pathId: 'test-manager', _id: teacher.id })).status).toBe(200);
    expect(await (await request('/users/me/career-path?userId=' + student.id, teacher)).json()).toEqual({ selection: null });
    expect((await request('/users/' + student.id + '/career-path', teacher)).status).toBe(404);
    expect((await request('/courses/' + course.id + '/content', student)).status).toBe(403);
    expect((await auth.findById(student.id))!.enrolledCourseIds).toEqual([]);
  });

  it('US-P004-AC04 identifies the atomic last write and a retried choice without changing the DTO', async () => {
    await publish('test-manager', path([step('a', [{ title: 'Preview' }])]));
    await publish('agile-tester', path([step('b', [{ title: 'Preview' }])]));
    const save = paths.saveSelection.bind(paths);
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(paths, 'saveSelection').mockImplementationOnce(async selection => { entered(); await gate; await save(selection); });
    const delayed = request('/users/me/career-path', student, 'PUT', { pathId: 'test-manager' });
    await waiting;
    const fast = await request('/users/me/career-path', student, 'PUT', { pathId: 'agile-tester' });
    expect(fast.status).toBe(200);
    release(); const last = await (await delayed).json();
    expect(await (await request('/users/me/career-path', student)).json()).toEqual(last);
    expect(Object.keys(last.selection).sort()).toEqual(['_id', 'pathId', 'revision', 'selectedAt']);
    const retry = await (await request('/users/me/career-path', student, 'PUT', { pathId: 'test-manager' })).json();
    expect(await (await request('/users/me/career-path', student)).json()).toEqual(retry);
    expect(retry.selection).toMatchObject({ pathId: 'test-manager', revision: 1 });
    vi.spyOn(paths, 'saveSelection').mockRejectedValueOnce(new Error('Isolated save failed'));
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request('/users/me/career-path', student, 'PUT', { pathId: 'agile-tester' })).status).toBe(500);
    logging.mockRestore();
    expect(await (await request('/users/me/career-path', student)).json()).toEqual(retry);
    vi.restoreAllMocks();
  });

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
