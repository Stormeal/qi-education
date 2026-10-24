import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { careerPathContentSchema, versionRequirements } from './careerPath.js';
import { InMemoryAccountCareersRepository } from './accountCareersRepository.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const milestone = (id: string, extra = {}) => ({
  id, title: id, stage: 'Foundation', courses: [], prerequisiteStepIds: [],
  actions: [{ id: `${id}-exam`, kind: 'exam', title: `${id} exam` }, { id: `${id}-lab`, kind: 'activity', title: `${id} lab` }],
  requirementBundles: [[`${id}-exam`]], ...extra,
});
const career = (steps: ReturnType<typeof milestone>[]) => careerPathContentSchema.parse({ schemaVersion: 2, title: 'Analyst', steps });
const now = '2026-10-24T10:00:00.000Z';

describe('US-A004-AC06 requirement versions at publish', () => {
  it('starts new milestones at version 1 and carries unchanged or reordered routes', () => {
    const first = versionRequirements(career([milestone('a', { changeNote: 'ignored' })]), null, [], now);
    expect(first.issues).toEqual([]);
    expect(first.content.steps[0]).toMatchObject({ requirementVersion: 1, requirementChange: null, requirementHistory: [], changeNote: '' });

    const previous = career([milestone('a', { requirementBundles: [['a-exam'], ['a-lab']], requirementVersion: 3,
      requirementChange: { note: 'Earlier', changedAt: '2026-01-01' }, requirementHistory: [{ version: 2, bundles: [['a-lab']] }] })]);
    const reordered = career([milestone('a', { requirementBundles: [['a-lab'], ['a-exam']], title: 'Renamed' })]);
    expect(versionRequirements(reordered, previous, [], now).content.steps[0]).toMatchObject({ title: 'Renamed', requirementVersion: 3,
      requirementChange: { note: 'Earlier' }, requirementHistory: [{ version: 2, bundles: [['a-lab']] }] });
  });

  it('refuses changed routes without a note and versions them with one', () => {
    const previous = career([milestone('a')]);
    const changed = career([milestone('a', { requirementBundles: [['a-exam', 'a-lab']] })]);
    expect(versionRequirements(changed, previous, [], now).issues).toEqual([{ stepId: 'a', message: 'a: Explain what changed for learners.' }]);

    changed.steps[0].changeNote = 'The lab is now required too.';
    const { content, issues } = versionRequirements(changed, previous, [], now);
    expect(issues).toEqual([]);
    expect(content.steps[0]).toMatchObject({ requirementVersion: 2, changeNote: '',
      requirementChange: { note: 'The lab is now required too.', changedAt: now }, requirementHistory: [{ version: 1, bundles: [['a-exam']] }] });
  });

  it('a milestone reused from another career keeps that career\'s version', () => {
    const shared = career([milestone('shared', { requirementVersion: 4 })]);
    expect(versionRequirements(career([milestone('shared')]), null, [shared], now).content.steps[0].requirementVersion).toBe(4);
  });

  it('keeps the last 10 earlier versions', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({ version: index + 1, bundles: [['a-lab']] }));
    const previous = career([milestone('a', { requirementVersion: 11, requirementHistory: history })]);
    const changed = career([milestone('a', { requirementBundles: [['a-lab']], changeNote: 'Lab only' })]);
    const versions = versionRequirements(changed, previous, [], now).content.steps[0].requirementHistory.map(item => item.version);
    expect(versions).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe.each(['', '/api'])('US-A004-AC06 changed criteria over HTTP (%s)', prefix => {
  let server: Server, base: string, student: AuthUser, admin: AuthUser;
  const request = (route: string, account: AuthUser, method = 'GET', body?: unknown) => fetch(base + prefix + route, { method,
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${createSessionToken(toAuthenticatedUser(account), apiConfig.AUTH_TOKEN_SECRET!)}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const publish = async (steps: ReturnType<typeof milestone>[]) => {
    expect((await request('/admin/career-paths/test-analyst', admin, 'PUT', career(steps))).status).toBe(200);
    return request('/admin/career-paths/test-analyst/publish', admin, 'POST');
  };

  beforeEach(async () => {
    const auth = new InMemoryAuthRepository();
    student = (await auth.findByEmail('student@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    server = createServer({ authRepository: auth, careerPathRepository: new InMemoryCareerPathRepository(),
      accountCareersRepository: new InMemoryAccountCareersRepository() }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it('a learner keeps their evidence, sees the note, and learns the earlier version was met', async () => {
    expect((await publish([milestone('analysis')])).status).toBe(200);
    expect((await request('/users/me/careers/test-analyst', student, 'PUT')).status).toBe(200);
    expect((await request('/users/me/achievements', student, 'POST', { actionId: 'analysis-exam' })).status).toBe(200);

    const refused = await publish([milestone('analysis', { requirementBundles: [['analysis-exam', 'analysis-lab']] })]);
    expect(refused.status).toBe(400);
    expect((await refused.json()).issues).toEqual([{ stepId: 'analysis', message: 'analysis: Explain what changed for learners.' }]);

    const published = await publish([milestone('analysis', { requirementBundles: [['analysis-exam', 'analysis-lab']], changeNote: 'Add the lab.' })]);
    expect(published.status).toBe(200);
    expect((await published.json()).draft.steps[0]).toMatchObject({ requirementVersion: 2, changeNote: '' });

    const view = await (await request('/career-paths/test-analyst', student)).json();
    expect(view.steps[0]).toMatchObject({ requirementVersion: 2, requirementChange: { note: 'Add the lab.', changedAt: expect.any(String) } });
    const account = await (await request('/users/me/careers', student)).json();
    expect(account).toMatchObject({ followedPathIds: ['test-analyst'], achievements: [{ actionId: 'analysis-exam' }],
      milestoneStates: { analysis: 'ready' }, earlierCriteriaMet: ['analysis'] });

    expect((await request('/users/me/achievements', student, 'POST', { actionId: 'analysis-lab' })).status).toBe(200);
    expect(await (await request('/users/me/careers', student)).json()).toMatchObject({ milestoneStates: { analysis: 'achieved' }, earlierCriteriaMet: [] });
  });

  it('DEF-062 an action ID left out for one publication cannot come back with a different meaning', async () => {
    const withActions = (actions: { id: string; kind: string; title: string }[], extra = {}) =>
      milestone('analysis', { actions, requirementBundles: [[actions[0].id]], ...extra });
    expect((await publish([withActions([{ id: 'analysis-exam', kind: 'exam', title: 'Original Foundation Exam' }])])).status).toBe(200);
    expect((await publish([withActions([{ id: 'analysis-gap', kind: 'exam', title: 'Gap exam' }], { changeNote: 'New exam.' })])).status).toBe(200);

    const reused = await publish([withActions([{ id: 'analysis-exam', kind: 'exam', title: 'Entirely Different Advanced Exam' }], { changeNote: 'Back.' })]);
    expect(reused.status).toBe(400);
    expect((await reused.json()).message).toContain('Action identity "analysis-exam" already means a published qualification.');

    // The same meaning may come back.
    expect((await publish([withActions([{ id: 'analysis-exam', kind: 'exam', title: 'Original Foundation Exam' }], { changeNote: 'Back.' })])).status).toBe(200);
  });
});
