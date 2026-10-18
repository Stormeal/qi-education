import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { careerPathContentSchema } from './careerPath.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';
import { InMemoryAccountCareersRepository } from './accountCareersRepository.js';
import { milestoneStates } from './accountCareers.js';

const node = (id: string, prerequisiteStepIds: string[] = [], extra = {}) => ({
  id, title: id, prerequisiteStepIds, courses: [], actions: [{ id: `${id}-exam`, kind: 'exam', title: `${id} exam` }],
  requirementBundles: [[`${id}-exam`]], ...extra,
});
const tree = (steps: ReturnType<typeof node>[]) => ({ schemaVersion: 2, title: 'Career tree', steps });

describe('US-L023 milestone state rules', () => {
  it('US-L023-AC05 a satisfied milestone is achieved even when its prerequisite is not', () => {
    const steps = careerPathContentSchema.parse(tree([node('a'), node('b', ['a']), node('c', ['b'])])).steps;
    expect(milestoneStates(steps, new Set(['b-exam']))).toEqual({ a: 'ready', b: 'achieved', c: 'ready' });
  });

  it('US-L023-AC05 keeps missing and cyclic dependencies locked even with evidence', () => {
    const steps = careerPathContentSchema.parse(tree([node('orphan', ['missing']), node('a', ['b']), node('b', ['a'])])).steps;
    expect(milestoneStates(steps, new Set(['orphan-exam', 'a-exam', 'b-exam'])))
      .toEqual({ orphan: 'locked', a: 'locked', b: 'locked' });
  });

  it('US-L023-AC05 an empty route never satisfies a milestone', () => {
    const steps = careerPathContentSchema.parse(tree([node('empty')])).steps;
    steps[0].requirementBundles = [[]];
    expect(milestoneStates(steps, new Set())).toEqual({ empty: 'ready' });
  });
});

describe.each(['', '/api'])('US-L019/L020/L021 account careers API (%s)', prefix => {
  let server: Server, base: string, paths: InMemoryCareerPathRepository;
  let auth: InMemoryAuthRepository, progress: InMemoryLearningProgressRepository, content: InMemoryCourseContentRepository;
  let accounts: InMemoryAccountCareersRepository;
  let student: AuthUser, other: AuthUser, admin: AuthUser;
  const request = (route: string, method = 'GET', body?: unknown, account: AuthUser | null = student, headers = {}) =>
    fetch(base + prefix + route, { method, headers: { 'Content-Type': 'application/json', ...headers,
      ...(account ? { authorization: `Bearer ${createSessionToken(toAuthenticatedUser(account), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const state = async (account = student) => (await request('/users/me/careers', 'GET', undefined, account)).json();
  const follow = (id: string) => request(`/users/me/careers/${id}`, 'PUT');
  const declare = (actionId: string, extra = {}) => request('/users/me/achievements', 'POST', { actionId, ...extra });
  const recognise = (actionIds: string[], extra = {}) => request('/users/me/achievements/cv', 'POST', { actionIds, ...extra });
  async function savePublished(id: string, steps: ReturnType<typeof node>[]) {
    const published = careerPathContentSchema.parse(tree(steps));
    await paths.savePath({ _id: id, revision: 1, published, draft: published, updatedAt: '' });
  }
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); paths = new InMemoryCareerPathRepository();
    progress = new InMemoryLearningProgressRepository(); content = new InMemoryCourseContentRepository();
    accounts = new InMemoryAccountCareersRepository();
    student = (await auth.findByEmail('student@qi-education.local'))!;
    other = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    await savePublished('technical-tester', [node('foundation'), node('automation', ['foundation'], { roleMilestone: true }),
      node('analysis', ['foundation']), node('further', ['automation'])]);
    await savePublished('test-manager', [node('foundation'), node('management', ['foundation'])]);
    await savePublished('test-analyst', [node('foundation'), node('analyst', ['foundation'])]);
    server = createServer({ authRepository: auth, careerPathRepository: paths, learningProgressRepository: progress, accountCareersRepository: accounts,
      courseRepository: new InMemoryCourseRepository(), courseContentRepository: content,
      courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
      muxVideoService: null, muxWebhookService: null }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });

  it('US-L023-AC02 saves cv achievements without following', async () => {
    const response = await recognise(['foundation-exam'], { provenance: 'self-reported', userId: other.id, declaredAt: 'fake' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toContain('Authorization');
    const saved = await response.json();
    expect(saved.achievements).toEqual([{ actionId: 'foundation-exam', provenance: 'cv', declaredAt: expect.any(String) }]);
    expect(Number.isFinite(Date.parse(saved.achievements[0].declaredAt))).toBe(true);
    expect(saved).toMatchObject({ followedPathIds: [], focusPathId: null, satisfiedActionIds: ['foundation-exam'],
      milestoneStates: { foundation: 'achieved' } });
    expect(await state()).toEqual(saved);
    expect((await state(other)).achievements).toEqual([]);
  });

  it('US-L023-AC05 saves on a locked milestone and the manual rule is unchanged', async () => {
    const response = await recognise(['further-exam']);
    expect(response.status).toBe(200);
    expect((await response.json()).milestoneStates).toMatchObject({ further: 'achieved', automation: 'locked', foundation: 'ready' });
    await follow('technical-tester');
    const denied = await declare('automation-exam');
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({ code: 'milestone-locked' });
  });

  it('US-L023-AC04 keeps existing provenance and never duplicates', async () => {
    await follow('technical-tester');
    const manual = await (await declare('foundation-exam')).json();
    const response = await recognise(['foundation-exam', 'analysis-exam', 'analysis-exam']);
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.achievements).toEqual([manual.achievements[0],
      { actionId: 'analysis-exam', provenance: 'cv', declaredAt: expect.any(String) }]);
    expect(await (await recognise(['foundation-exam', 'analysis-exam'])).json()).toEqual(saved);
  });

  it('US-L023 refuses unknown IDs atomically and invalid or anonymous requests', async () => {
    const mutate = vi.spyOn(accounts, 'mutate');
    const missing = await recognise(['foundation-exam', 'unknown-action']);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ message: 'Achievement action not found' });
    expect(await accounts.get(student.id)).toBeNull();
    expect((await state()).achievements).toEqual([]);
    for (const body of [{}, { actionIds: [] }, { actionIds: Array(51).fill('foundation-exam') },
      { actionIds: ['INVALID ID'] }, { actionIds: [null] }, { actionIds: 'foundation-exam' }]) {
      const response = await request('/users/me/achievements/cv', 'POST', body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ message: expect.any(String) });
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    const anonymous = await request('/users/me/achievements/cv', 'POST', { actionIds: ['foundation-exam'] }, null);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toBe('private, no-store');
    expect(mutate).not.toHaveBeenCalled();
    expect((await recognise(Array(50).fill('foundation-exam'))).status).toBe(200);
    expect((await state()).achievements).toHaveLength(1);
  });

  it('US-L023 only recognises actions from published milestone-format careers', async () => {
    const draft = careerPathContentSchema.parse(tree([node('draft-only')]));
    const legacy = careerPathContentSchema.parse({ ...tree([node('legacy-only')]), schemaVersion: 1 });
    await paths.savePath({ _id: 'draft-path', revision: 0, published: null, draft, updatedAt: '' });
    await paths.savePath({ _id: 'legacy-path', revision: 1, published: legacy, draft: legacy, updatedAt: '' });
    for (const id of ['draft-only-exam', 'legacy-only-exam']) {
      expect((await recognise(['foundation-exam', id])).status).toBe(404);
      expect(await accounts.get(student.id)).toBeNull();
    }
  });

  it('US-L023-AC04 concurrent CV saves preserve all unique achievements and retry after a failed write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(accounts, 'mutate').mockRejectedValueOnce(new Error('Isolated CV write failure'));
    expect((await recognise(['foundation-exam', 'analysis-exam'])).status).toBe(500);
    expect((await state()).achievements).toEqual([]);
    const replies = await Promise.all([recognise(['foundation-exam', 'analysis-exam']), recognise(['analysis-exam', 'further-exam'])]);
    expect(replies.map(response => response.status)).toEqual([200, 200]);
    const saved = await state();
    expect(saved.achievements).toHaveLength(3);
    expect(saved.satisfiedActionIds).toEqual(expect.arrayContaining(['foundation-exam', 'analysis-exam', 'further-exam']));
    expect(await (await recognise(['foundation-exam', 'analysis-exam', 'further-exam'])).json()).toEqual(saved);
  });

  it('US-L019-AC01 starts empty and publishes ready/locked states without inventing qualifications', async () => {
    expect(await state()).toEqual({ followedPathIds: [], focusPathId: null, achievements: [], satisfiedActionIds: [],
      milestoneStates: { foundation: 'ready', automation: 'locked', analysis: 'locked', further: 'locked', management: 'locked', analyst: 'locked' } });
  });

  it('US-L021-AC01 US-L021-AC04 preserves concurrent follows, follow order, idempotency and enrollments', async () => {
    const replies = await Promise.all([follow('technical-tester'), follow('test-manager')]);
    expect(replies.map(reply => reply.status)).toEqual([200, 200]);
    const saved = await state();
    expect(saved.followedPathIds).toHaveLength(2);
    expect(saved.followedPathIds).toEqual(expect.arrayContaining(['technical-tester', 'test-manager']));
    expect(saved.followedPathIds).toContain(saved.focusPathId);
    expect(await (await follow('technical-tester')).json()).toEqual(saved);
    expect((await auth.findById(student.id))!.enrolledCourseIds).toEqual([]);
    expect((await follow('unpublished')).status).toBe(404);
  });

  it('US-L021-AC02 focus requires following and public exploration changes no account data', async () => {
    await follow('technical-tester');
    const before = await state();
    await request('/career-paths/test-manager');
    expect(await state()).toEqual(before);
    const denied = await request('/users/me/career-focus', 'PUT', { pathId: 'test-manager' });
    expect(denied.status).toBe(409); expect(await denied.json()).toMatchObject({ code: 'career-not-followed' });
    await follow('test-manager');
    const focused = await (await request('/users/me/career-focus', 'PUT', { pathId: 'test-manager' })).json();
    expect(focused).toMatchObject({ followedPathIds: ['technical-tester', 'test-manager'], focusPathId: 'test-manager' });
    expect(await (await declare('management-exam')).json()).toMatchObject({ code: 'milestone-locked' });
  });

  it('US-L019-AC02 US-L019-AC03 US-L020-AC03 saves one server-owned shared Foundation declaration across reloads/accounts', async () => {
    await follow('technical-tester'); await follow('test-manager');
    const response = await declare('foundation-exam', { userId: other.id, provenance: 'verified', declaredAt: 'fake' });
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.achievements).toEqual([{ actionId: 'foundation-exam', provenance: 'self-reported', declaredAt: expect.any(String) }]);
    expect(Number.isFinite(Date.parse(saved.achievements[0].declaredAt))).toBe(true);
    expect(saved.milestoneStates).toMatchObject({ foundation: 'achieved', automation: 'ready', analysis: 'ready', management: 'ready' });
    expect(await (await declare('foundation-exam')).json()).toEqual(saved);
    expect(await state()).toEqual(saved);
    expect((await state(other)).achievements).toEqual([]);
  });

  it('US-L019-AC06 US-L021-AC06 protects authentication, validation, privacy and account identity on all private routes', async () => {
    for (const [route, method, body] of [
      ['/users/me/careers', 'GET', undefined], ['/users/me/careers/technical-tester', 'PUT', undefined],
      ['/users/me/careers/technical-tester', 'DELETE', undefined], ['/users/me/career-focus', 'PUT', { pathId: 'technical-tester' }],
      ['/users/me/achievements', 'POST', { actionId: 'foundation-exam' }],
    ] as const) {
      const denied = await request(route, method, body, null);
      expect(denied.status).toBe(401); expect(denied.headers.get('cache-control')).toBe('private, no-store');
      expect(denied.headers.get('vary')).toContain('Authorization');
    }
    expect((await request('/users/me/achievements', 'POST', {})).status).toBe(400);
    expect((await declare('unknown-action')).status).toBe(404);
    const denied = await declare('foundation-exam');
    expect(denied.status).toBe(409); expect(await denied.json()).toMatchObject({ code: 'career-not-followed' });
    await request('/users/me/careers/technical-tester', 'PUT', { userId: other.id });
    expect((await state(other)).followedPathIds).toEqual([]);
    expect((await request(`/users/${student.id}/careers`, 'GET', undefined, other)).status).toBe(404);
  });

  it('US-L020-AC01 US-L020-AC02 US-L020-AC05 enforces locks and leaves siblings/further development available', async () => {
    await follow('technical-tester');
    const locked = await declare('automation-exam');
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ code: 'milestone-locked', message: expect.stringContaining('foundation') });
    expect((await state()).achievements).toEqual([]);
    await declare('foundation-exam');
    const achieved = await (await declare('automation-exam')).json();
    expect(achieved.milestoneStates).toMatchObject({ automation: 'achieved', analysis: 'ready', further: 'ready' });
    expect((await declare('analysis-exam')).status).toBe(200);
  });

  it('US-L020-AC04 checks all cross-career prerequisites and reuses evidence after unfollow', async () => {
    await savePublished('composite', [node('architect', ['automation', 'management', 'analyst'])]);
    for (const id of ['technical-tester', 'test-manager', 'test-analyst', 'composite']) await follow(id);
    for (const id of ['foundation-exam', 'automation-exam', 'management-exam']) expect((await declare(id)).status).toBe(200);
    expect((await state()).milestoneStates.architect).toBe('locked');
    expect((await declare('architect-exam')).status).toBe(409);
    await declare('analyst-exam');
    for (const id of ['technical-tester', 'test-manager', 'test-analyst']) await request(`/users/me/careers/${id}`, 'DELETE');
    expect((await state()).milestoneStates.architect).toBe('ready');
    expect((await declare('architect-exam')).status).toBe(200);
  });

  it('US-L021-AC03 unfollow retains achievements and clears focused goal without selecting another', async () => {
    await follow('technical-tester'); await follow('test-manager'); await declare('foundation-exam');
    const removed = await (await request('/users/me/careers/technical-tester', 'DELETE')).json();
    expect(removed).toMatchObject({ followedPathIds: ['test-manager'], focusPathId: null,
      achievements: [{ actionId: 'foundation-exam' }], milestoneStates: { foundation: 'achieved' } });
    expect(await (await request('/users/me/careers/technical-tester', 'DELETE')).json()).toEqual(removed);
    await request('/users/me/careers/test-manager', 'DELETE');
    expect((await state()).achievements).toEqual(removed.achievements);
  });

  it('US-L021-AC05 maps legacy selection on read, persists on first write and legacy PUT follows/focuses additively', async () => {
    const selection = { _id: student.id, pathId: 'test-manager', revision: 1, selectedAt: new Date().toISOString() };
    await paths.saveSelection(selection);
    expect(await state()).toMatchObject({ followedPathIds: ['test-manager'], focusPathId: 'test-manager' });
    await follow('technical-tester');
    const legacy = await request('/users/me/career-path', 'PUT', { pathId: 'test-analyst' });
    expect(await legacy.json()).toEqual({ selection: { ...selection, pathId: 'test-analyst', selectedAt: expect.any(String) } });
    expect(await state()).toMatchObject({ followedPathIds: ['test-manager', 'technical-tester', 'test-analyst'], focusPathId: 'test-analyst' });
    await request('/users/me/careers/test-analyst', 'DELETE');
    expect(await paths.getSelection(student.id)).toMatchObject({ pathId: 'test-analyst' });
    await paths.saveSelection({ ...selection, _id: other.id, pathId: 'withdrawn' });
    expect(await state(other)).toMatchObject({ followedPathIds: [], focusPathId: null });
    expect(await paths.getSelection(other.id)).toMatchObject({ pathId: 'withdrawn' });
  });

  it('US-L021-AC05 first legacy PUT preserves the previously mapped goal before replacing the selection', async () => {
    await paths.saveSelection({ _id: student.id, pathId: 'test-manager', revision: 1, selectedAt: new Date().toISOString() });
    expect(await state()).toMatchObject({ followedPathIds: ['test-manager'] });
    expect(await accounts.get(student.id)).toBeNull();
    expect((await request('/users/me/career-path', 'PUT', { pathId: 'technical-tester' })).status).toBe(200);
    expect(await state()).toMatchObject({ followedPathIds: ['test-manager', 'technical-tester'], focusPathId: 'technical-tester' });
  });

  it('US-L019-AC04 US-L021-AC04 failed writes preserve saved state and interrupted replies reconcile to one declaration', async () => {
    await follow('technical-tester');
    const saved = await state();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const operation of [() => follow('test-manager'), () => request('/users/me/careers/technical-tester', 'DELETE'), () => declare('foundation-exam')]) {
      vi.spyOn(accounts, 'mutate').mockRejectedValueOnce(new Error('Isolated write failure'));
      expect((await operation()).status).toBe(500);
      expect(await state()).toEqual(saved);
    }
    const mutate = accounts.mutate.bind(accounts);
    vi.spyOn(accounts, 'mutate').mockImplementationOnce(async (...args) => {
      await mutate(...args); throw new Error('Isolated reply lost after persistence');
    });
    expect((await declare('foundation-exam')).status).toBe(500);
    const persisted = await state();
    expect(await (await declare('foundation-exam')).json()).toEqual(persisted);
    expect(persisted.achievements).toHaveLength(1);
  });

  it('US-A004-AC03 refuses a cross-path publish cycle and leaves both published graphs unchanged', async () => {
    await savePublished('first-path', [node('first')]);
    await savePublished('second-path', [node('second', ['first'])]);
    const before = await paths.listPaths();
    expect((await request('/admin/career-paths/first-path', 'PUT', tree([node('first', ['second'])]), admin)).status).toBe(200);
    const denied = await request('/admin/career-paths/first-path/publish', 'POST', undefined, admin);
    expect(denied.status).toBe(400);
    expect((await denied.json()).message).toMatch(/loop/i);
    expect((await paths.listPaths()).map(path => path.published)).toEqual(before.map(path => path.published));
  });

  it('US-A004-AC03 US-A004-AC05 serializes concurrent graph publications before validation', async () => {
    await savePublished('first-path', [node('first')]);
    await savePublished('second-path', [node('second')]);
    await request('/admin/career-paths/first-path', 'PUT', tree([node('first', ['second'])]), admin);
    await request('/admin/career-paths/second-path', 'PUT', tree([node('second', ['first'])]), admin);
    let entered!: () => void, release!: () => void, secondEntered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const secondWaiting = new Promise<void>(resolve => { secondEntered = resolve; });
    const save = paths.savePath.bind(paths);
    vi.spyOn(paths, 'savePath').mockImplementationOnce(async (...args) => { entered(); await gate; return save(...args); });
    const lock = paths.withPublicationLock.bind(paths);
    let entries = 0;
    vi.spyOn(paths, 'withPublicationLock').mockImplementation(async operation => {
      if (++entries === 2) secondEntered();
      return lock(operation);
    });
    const first = request('/admin/career-paths/first-path/publish', 'POST', undefined, admin);
    await waiting;
    const second = request('/admin/career-paths/second-path/publish', 'POST', undefined, admin);
    await secondWaiting;
    release();
    expect((await first).status).toBe(200);
    const refused = await second;
    expect(refused.status).toBe(400); expect((await refused.json()).message).toMatch(/loop/i);
  });

  it('US-A004-AC06 refuses reusing a published action ID for a different qualification', async () => {
    const changed = tree([node('automation', ['foundation'], { actions: [{ id: 'automation-exam', kind: 'activity', title: 'Different qualification' }] }), node('foundation')]);
    expect((await request('/admin/career-paths/technical-tester', 'PUT', changed, admin)).status).toBe(200);
    const refused = await request('/admin/career-paths/technical-tester/publish', 'POST', undefined, admin);
    expect(refused.status).toBe(400);
    expect((await refused.json()).message).toMatch(/action.*identity.*version/i);
  });

  it('US-A004-AC05 a v2 draft save cannot restore a publication snapshot read before another publish', async () => {
    const original = (await paths.listPaths()).find(path => path._id === 'technical-tester')!;
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const save = paths.savePath.bind(paths);
    vi.spyOn(paths, 'savePath').mockImplementationOnce(async (...args) => { entered(); await gate; return save(...args); });
    const delayed = request('/admin/career-paths/technical-tester', 'PUT', { ...original.draft, title: 'Delayed edit' }, admin);
    await waiting;
    expect((await request('/admin/career-paths/technical-tester/publish', 'POST', undefined, admin)).status).toBe(200);
    release();
    expect((await delayed).status).toBe(409);
    expect((await paths.listPaths()).find(path => path._id === original._id)?.revision).toBe(2);
  });

  it('US-A004-AC06 publishing layout/title changes keeps stable declarations and followed careers', async () => {
    await follow('technical-tester'); await declare('foundation-exam');
    const before = await state();
    const original = (await paths.listPaths()).find(path => path._id === 'technical-tester')!.published!;
    const changed = { ...original, title: 'New route title', steps: original.steps.map(step => ({ ...step, title: `New ${step.title}`, stage: 'Rearranged' })) };
    expect((await request('/admin/career-paths/technical-tester', 'PUT', changed, admin)).status).toBe(200);
    expect((await request('/admin/career-paths/technical-tester/publish', 'POST', undefined, admin)).status).toBe(200);
    expect(await state()).toEqual(before);
  });

  it('US-L019-AC05 reads real current course completion and alternative bundles without modifying learning or enrollment', async () => {
    const courseId = 'demo-course-1';
    const courseAction = { id: 'course-evidence', kind: 'course', title: 'Course', courseId };
    await savePublished('course-path', [node('course-node', [], { courses: [{ courseId }], actions: [courseAction,
      { id: 'activity-one', kind: 'activity', title: 'One' }, { id: 'activity-two', kind: 'activity', title: 'Two' }],
      requirementBundles: [['course-evidence'], ['activity-one', 'activity-two']] }), node('exam-node', [], { courses: [{ courseId }] })]);
    await content.createEmptyCourseContent(courseId);
    await content.updateCourseContent(courseId, [{ id: 'section', title: 'Lessons', components: [
      { id: 'lesson-one', type: 'text', title: 'One', content: 'One', durationMinutes: 1 },
      { id: 'lesson-two', type: 'text', title: 'Two', content: 'Two', durationMinutes: 1 },
    ] }]);
    await follow('course-path');
    await progress.complete(student.id, courseId, 'obsolete');
    await progress.complete(student.id, courseId, 'lesson-one');
    expect((await state()).milestoneStates['course-node']).toBe('ready');
    const before = await progress.list(student.id);
    await declare('course-evidence');
    expect(await progress.list(student.id)).toEqual(before);
    expect((await auth.findById(student.id))!.enrolledCourseIds).toEqual([]);
    expect((await state()).milestoneStates['exam-node']).toBe('ready');
    // A different account uses genuine course evidence, without declarations.
    await progress.complete(other.id, courseId, 'lesson-one'); await progress.complete(other.id, courseId, 'lesson-two');
    expect(await state(other)).toMatchObject({ achievements: [], satisfiedActionIds: ['course-evidence'],
      milestoneStates: { 'course-node': 'achieved', 'exam-node': 'ready' } });
    // All members of an alternative bundle are needed.
    await declare('activity-one');
    expect((await state()).satisfiedActionIds).not.toContain('activity-two');
  });

  it('US-A004-AC03 US-A004-AC05 US-A004-AC06 refuses conflicting publication, stale writes and legacy v2 stripping', async () => {
    const original = (await paths.listPaths()).find(path => path._id === 'technical-tester')!;
    const stripped = await request('/admin/career-paths/technical-tester', 'PUT', { title: 'Old editor', steps: [] }, admin);
    expect(stripped.status).toBe(409); expect(await stripped.json()).toMatchObject({ code: 'career-path-schema' });
    expect((await paths.listPaths()).find(path => path._id === original._id)).toEqual(original);
    const changed = tree([node('foundation', [], { actions: [{ id: 'foundation-exam', kind: 'activity', title: 'Changed meaning' }] })]);
    expect((await request('/admin/career-paths/technical-tester', 'PUT', changed, admin)).status).toBe(200);
    const publish = await request('/admin/career-paths/technical-tester/publish', 'POST', undefined, admin);
    expect(publish.status).toBe(400); expect(await publish.json()).toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ stepId: 'foundation' })]) });
    expect((await paths.listPaths()).find(path => path._id === original._id)?.published).toEqual(original.published);
    expect((await request('/admin/career-paths/technical-tester', 'PUT', tree([node('foundation')]), admin,
      { 'X-Expected-Updated-At': original.updatedAt })).status).toBe(409);
    expect((await request('/admin/career-paths/technical-tester', 'PUT', tree([node('foundation')]), student)).status).toBe(403);
  });

  it('US-L019-AC04 US-L021-AC04 propagates failed reads without false success and supports a safe retry', async () => {
    await follow('technical-tester');
    vi.spyOn(paths, 'listPaths').mockRejectedValueOnce(new Error('Isolated unavailable read'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await declare('foundation-exam')).status).toBe(500);
    expect((await state()).achievements).toEqual([]);
    expect((await declare('foundation-exam')).status).toBe(200);
    expect((await state()).achievements).toHaveLength(1);
  });
});
