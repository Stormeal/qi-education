import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { careerPathContentSchema, type CareerPathDocument } from './careerPath.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const content = (title = 'Original path') => ({ title, steps: [{ id: 'foundation', title: 'Foundation', courses: [{ title: 'Preview course' }] }] });
const versionHeader = (version: string) => ({ 'X-Expected-Updated-At': version });

describe.each(['', '/api'])('US-A003 career path withdrawal and edit protection (%s)', (prefix) => {
  let server: Server, base: string, paths: InMemoryCareerPathRepository;
  let admin: AuthUser, teacher: AuthUser, student: AuthUser;
  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown, extraHeaders: Record<string, string> = {}) {
    return fetch(base + prefix + path, {
      method, headers: { 'Content-Type': 'application/json', ...extraHeaders, ...(user ? {
        authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET)}`,
      } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const save = (title = 'Original path', headers: Record<string, string> = {}) => request('/admin/career-paths/test-manager', admin, 'PUT', content(title), headers);
  const publish = (headers: Record<string, string> = {}) => request('/admin/career-paths/test-manager/publish', admin, 'POST', undefined, headers);
  const withdraw = (headers: Record<string, string> = {}) => request('/admin/career-paths/test-manager/unpublish', admin, 'POST', undefined, headers);
  const stored = async () => (await paths.listPaths()).find((path) => path._id === 'test-manager')!;

  beforeEach(async () => {
    const auth = new InMemoryAuthRepository();
    paths = new InMemoryCareerPathRepository();
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    server = createServer({ authRepository: auth, careerPathRepository: paths,
      courseRepository: new InMemoryCourseRepository(), courseContentRepository: new InMemoryCourseContentRepository(),
      courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
      learningProgressRepository: new InMemoryLearningProgressRepository(),
      gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('Shared provider access forbidden'); } },
      muxVideoService: null, muxWebhookService: null,
    }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('AC01 withdraws, keeps newer draft/revision/selections, then republishes for the same learner', async () => {
    expect((await save()).status).toBe(200);
    expect((await publish()).status).toBe(200);
    expect((await request('/users/me/career-path', student, 'PUT', { pathId: 'test-manager' })).status).toBe(200);
    const selection = await paths.getSelection(student.id);
    const draftResponse = await save('Newer unpublished draft');
    const draft = await draftResponse.json();
    const response = await withdraw(versionHeader(draft.updatedAt));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(Object.keys(result).sort()).toEqual(['draft', 'id', 'learners', 'published', 'revision', 'updatedAt']);
    expect(result).toMatchObject({ id: 'test-manager', published: null, revision: 1, learners: 1, draft: { title: 'Newer unpublished draft' } });
    expect(result.updatedAt).not.toBe(draft.updatedAt);
    expect((await stored()).draft).toEqual(result.draft);
    expect(await paths.getSelection(student.id)).toEqual(selection);
    expect(await (await request('/career-paths')).json()).toEqual([]);
    const detail = await request('/career-paths/test-manager');
    expect(detail.status).toBe(404);
    expect(await detail.json()).toEqual({ message: 'Career path not found' });
    expect((await request('/users/me/career-path', teacher, 'PUT', { pathId: 'test-manager' })).status).toBe(404);
    expect((await (await request('/users/me/career-path', student)).json()).selection).toEqual(selection);
    const restored = await publish(versionHeader(result.updatedAt));
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ revision: 2, learners: 1, published: { title: 'Newer unpublished draft' } });
    expect((await (await request('/career-paths/test-manager')).json()).revision).toBe(2);
    expect(await paths.getSelection(student.id)).toEqual(selection);
  });

  it('AC01 retains editable published content when an existing path has no draft', async () => {
    const published = careerPathContentSchema.parse(content());
    await paths.savePath({ _id: 'test-manager', revision: 7, published, draft: null, updatedAt: '2026-10-10T10:00:00.000Z' });
    const response = await withdraw();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ published: null, draft: published, revision: 7 });
  });

  it('AC01 refuses anonymous/student/teacher withdrawal before side effects', async () => {
    await save(); await publish();
    const before = structuredClone(await stored());
    for (const user of [undefined, student, teacher]) {
      expect((await request('/admin/career-paths/test-manager/unpublish', user, 'POST')).status).toBe(user ? 403 : 401);
      expect(await stored()).toEqual(before);
    }
  });

  it('AC01 returns 409 with only a message for missing, unsaved or already withdrawn paths', async () => {
    for (const id of ['unknown-path', 'test-manager']) {
      const response = await request(`/admin/career-paths/${id}/unpublish`, admin, 'POST');
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ message: expect.any(String) });
    }
    expect(await paths.listPaths()).toEqual([]);
    await save(); await publish();
    expect((await withdraw()).status).toBe(200);
    const before = structuredClone(await stored());
    expect((await withdraw()).status).toBe(409);
    expect(await stored()).toEqual(before);
  });

  it.each(['save', 'publish', 'unpublish'])('AC02 refuses stale %s without modifying content or selections', async (operation) => {
    await save(); await publish();
    await request('/users/me/career-path', student, 'PUT', { pathId: 'test-manager' });
    const old = (await stored()).updatedAt;
    await save('Other admin changes');
    const before = structuredClone(await stored());
    const selection = await paths.getSelection(student.id);
    const response = operation === 'save' ? await save('Stale overwrite', versionHeader(old))
      : operation === 'publish' ? await publish(versionHeader(old)) : await withdraw(versionHeader(old));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: expect.any(String), code: 'CAREER_PATH_CONFLICT' });
    expect(await stored()).toEqual(before);
    expect(await paths.getSelection(student.id)).toEqual(selection);
  });

  it('AC02 refuses concurrent writes after both routes have read the same version', async () => {
    await save();
    const expected = (await stored()).updatedAt;
    const originalSave = paths.savePath.bind(paths);
    let arrivals = 0, release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(paths, 'savePath').mockImplementation(async (document: CareerPathDocument, version?: string) => {
      if (++arrivals === 2) release();
      await gate;
      return originalSave(document, version);
    });
    const responses = await Promise.all([save('First admin edit', versionHeader(expected)), publish(versionHeader(expected))]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await responses.find((response) => response.status === 409)!.json()).toEqual({ message: expect.any(String), code: 'CAREER_PATH_CONFLICT' });
    const winner = await responses.find((response) => response.status === 200)!.json();
    // A winning publish also records its action identities (DEF-062); they are stored only, never in the admin response.
    const { publishedActions: _known, ...document } = (await stored())!;
    expect(document).toEqual({ _id: winner.id, draft: winner.draft, published: winner.published, revision: winner.revision, updatedAt: winner.updatedAt });
  });

  it('AC02 refuses a protected edit after a delayed legacy save, even when both legacy routes read the same version', async () => {
    await paths.savePath({ _id: 'test-manager', revision: 1, published: null, draft: careerPathContentSchema.parse(content()), updatedAt: '2099-01-01T00:00:00.000Z' });
    const originalSave = paths.savePath.bind(paths);
    let reached!: () => void, release!: () => void;
    const delayed = new Promise<void>((resolve) => { reached = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(paths, 'savePath').mockImplementation(async (document, version) => {
      if (document.draft?.title === 'Delayed legacy edit') { reached(); await gate; }
      return originalSave(document, version);
    });
    const pendingLegacy = save('Delayed legacy edit');
    await delayed;
    const loaded = await (await save('Immediate legacy edit')).json();
    release();
    const legacy = await pendingLegacy;
    expect(legacy.status).toBe(200);
    const latest = await legacy.json();
    expect(latest.updatedAt).not.toBe(loaded.updatedAt);
    const rejected = await save('Protected stale overwrite', versionHeader(loaded.updatedAt));
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).code).toBe('CAREER_PATH_CONFLICT');
    expect((await stored()).draft?.title).toBe('Delayed legacy edit');
  });

  it.each([undefined, ''])('AC03 saves and publishes without a nonempty version (%s) using the original DTO', async (version) => {
    const headers = version === undefined ? {} : versionHeader(version);
    const first = await (await save('First', headers)).json();
    expect(first).toMatchObject({ id: 'test-manager', revision: 0, published: null, learners: 0 });
    expect(Object.keys(first).sort()).toEqual(['draft', 'id', 'learners', 'published', 'revision', 'updatedAt']);
    const second = await save('Legacy replacement', headers);
    expect(second.status).toBe(200);
    const live = await publish(headers);
    expect(live.status).toBe(200);
    expect(await live.json()).toMatchObject({ revision: 1, published: { title: 'Legacy replacement' } });
  });

  it('AC03 directly publishes an unsaved starter with no version, but never accepts a fictional nonempty version', async () => {
    const list = await (await request('/admin/career-paths', admin)).json();
    expect(list.find((path: { id: string }) => path.id === 'test-manager').updatedAt).toBe('');
    for (const operation of ['save', 'publish']) {
      const response = operation === 'save' ? await save('Fictional version', versionHeader('never-stored')) : await publish(versionHeader('never-stored'));
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('CAREER_PATH_CONFLICT');
      expect(await paths.listPaths()).toEqual([]);
    }
    expect((await publish()).status).toBe(200);
  });

  it('AC02 versions advance despite a fixed/backward clock, and a used version cannot write twice', async () => {
    await paths.savePath({ _id: 'test-manager', revision: 1, published: null, draft: careerPathContentSchema.parse(content()), updatedAt: '2099-01-01T00:00:00.000Z' });
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T00:00:00.000Z'));
    const old = (await stored()).updatedAt;
    const first = await save('One', versionHeader(old));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.updatedAt).toBe(new Date(Date.parse(old) + 1).toISOString());
    expect((await save('Two', versionHeader(old))).status).toBe(409);
    const next = await save('Two', versionHeader(firstBody.updatedAt));
    expect(next.status).toBe(200);
    expect((await next.json()).updatedAt).toBe(new Date(Date.parse(old) + 2).toISOString());
  });

  it('allows the version header in CORS preflight from an existing frontend origin', async () => {
    const response = await request('/admin/career-paths/test-manager/unpublish', undefined, 'OPTIONS', undefined, {
      Origin: 'https://stormeal.github.io', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,x-expected-updated-at',
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://stormeal.github.io');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-expected-updated-at');
  });
});
