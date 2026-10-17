import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from './server.js';
import { apiConfig } from './config.js';
import { createSessionToken, toAuthenticatedUser, authSheetHeaders, authUserToSheetRow, type AuthUser } from './auth.js';
import { InMemoryAuthRepository, GoogleSheetsAuthRepository, type AuthRepository } from './authRepository.js';
import { MongoAuthRepository } from './mongoAuthRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { createCourseSchema } from './course.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryPasswordResetRepository } from './passwordResetRepository.js';
import { InMemoryUserChangeRepository } from './userChangeRepository.js';
import { LocalMailSender } from './mailSender.js';
import { resetTokenHash } from './passwordResetDelivery.js';
import { fakeAuthCollection } from '../test/fakeAuthCollection.js';

const sheets = vi.hoisted(() => ({ rows: [] as string[][], reads: 0, writes: 0 }));
vi.mock('./googleSheets.js', () => ({ ensureWorksheetHeaders: async () => { sheets.writes++; }, createSheetsClient: () => ({ spreadsheets: { values: {
  get: async () => { sheets.reads++; return { data: { values: structuredClone(sheets.rows) } }; },
  append: async () => { sheets.writes++; throw new Error('Unexpected Sheet write'); }, update: async () => { sheets.writes++; throw new Error('Unexpected Sheet write'); },
} } }) }));
const servers: Server[] = [];
const originalReadOnly = apiConfig.USER_STORE_READ_ONLY;
afterEach(async () => { apiConfig.USER_STORE_READ_ONLY = originalReadOnly; vi.restoreAllMocks(); await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
const headers = (user: AuthUser) => ({ authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` });
async function setup(kind: string, sharedFake = fakeAuthCollection()) {
  const memory = new InMemoryAuthRepository(); const users = await memory.listUsers();
  const auth: AuthRepository = kind === 'mongodb' ? new MongoAuthRepository(async () => sharedFake.collection) : kind === 'google-sheets' ? new GoogleSheetsAuthRepository() : memory;
  if (kind === 'mongodb' && !sharedFake.documents.size) for (const user of users) await auth.createUser(user);
  const actual = kind === 'mongodb' ? await auth.listUsers() : users;
  const student = actual.find(user => user.role === 'student')!, admin = actual.find(user => user.role === 'admin')!;
  sheets.rows = [[...authSheetHeaders], ...actual.map(authUserToSheetRow)]; sheets.reads = 0; sheets.writes = 0;
  const courses = new InMemoryCourseRepository();
  await courses.createCourse(createCourseSchema.parse({ title: 'Account query course', description: 'Isolated account route tests.', teacher: 'Teacher', level: 'Beginner', status: 'published' }), { id: 'course', ownerUserId: admin.id });
  const tokens = new InMemoryPasswordResetRepository(), mail = new LocalMailSender(() => {}), changes = new InMemoryUserChangeRepository();
  const server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: new InMemoryCourseContentRepository(),
    courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(), passwordResetRepository: tokens,
    userChangeRepository: changes, mailSender: mail, muxVideoService: null, muxWebhookService: null,
    gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('No real GitHub'); } },
  }).listen(0); servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, user?: AuthUser, method = 'GET', body?: unknown) => fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(user ? headers(user) : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { auth, student, admin, tokens, mail, changes, request, fake: sharedFake };
}
describe.each(['memory', 'mongodb', 'google-sheets'])('US-P014 HTTP store %s', kind => {
  it.each(['', '/api'])('AC09 freezes every account-write workflow and side effect, while sign-in/reads remain available (%s)', async prefix => {
    apiConfig.USER_STORE_READ_ONLY = '1';
    const { auth, student, admin, tokens, mail, changes, request, fake } = await setup(kind);
    const raw = 'R'.repeat(43), hash = resetTokenHash(raw)!;
    await tokens.reserve(student.id, hash, Date.now()); await tokens.activate(student.id, hash);
    const before = await auth.listUsers(), mongoBefore = structuredClone([...fake.documents.values()]);
    const consume = vi.spyOn(tokens, 'consume'), reserve = vi.spyOn(tokens, 'reserve'), invalidate = vi.spyOn(tokens, 'invalidateAll');
    const paths = [
      ['/auth/signup', undefined, 'POST', { displayName: 'New User', email: 'new@example.test', password: 'Password123!' }],
      ['/signup', undefined, 'POST', { displayName: 'New User', email: 'new@example.test', password: 'Password123!' }],
      ['/users/me/courses/course', student, 'POST', undefined],
      ['/users/me/password', student, 'POST', { currentPassword: 'Password123!', newPassword: 'Changed456!' }],
      ['/auth/password-reset/request', undefined, 'POST', { email: student.email }],
      ['/auth/password-reset/confirm', undefined, 'POST', { token: raw, password: 'Changed456!' }],
      [`/admin/users/${student.id}/role`, admin, 'PATCH', { role: 'teacher' }],
      [`/admin/users/${student.id}/status`, admin, 'PATCH', { status: 'disabled' }],
      [`/admin/users/${student.id}/password-reset`, admin, 'POST', undefined],
    ] as const;
    for (const [path, actor, method, body] of paths) {
      for (const variant of [path, path.toUpperCase(), path + '/']) {
        const response = await request(prefix + variant, actor, method, body);
        expect(response.status, variant).toBe(503);
        expect(await response.json()).toEqual({ message: 'Accounts are briefly read-only for maintenance. Try again in a few minutes.' });
      }
    }
    expect(await auth.listUsers()).toEqual(before); expect([...fake.documents.values()]).toEqual(mongoBefore); expect(sheets.writes).toBe(0);
    expect(consume).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
    expect(mail.messages).toEqual([]); expect(await changes.recent()).toEqual([]);
    expect((await request(prefix + '/auth/password-reset/check', undefined, 'POST', { token: raw })).status).toBe(204);
    expect((await request(prefix + '/auth/login', undefined, 'POST', { email: student.email, password: 'Password123!' })).status).toBe(200);
    expect((await request(prefix + '/courses', student)).status).toBe(200);
    expect((await request(prefix + '/users/me/learning-progress', student)).status).toBe(200);
    expect(await (await request(prefix + '/health/auth')).json()).toEqual({ status: 'ok', store: kind, readOnly: true });
    expect((await (await request(prefix + '/health/config')).json()).auth.storage).toBe(kind);
  });
});
describe('US-P014 HTTP Mongo guarantees', () => {
  it('AC07 preserves the default signup validation response', async () => {
    const { request } = await setup('memory');
    const response = await request('/auth/signup', undefined, 'POST', { displayName: 'Ada', email: ' Ada@Example.test ', password: 'Password123!' });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Invalid request body');
  });
  it('AC01 makes no Users sheet reads, authenticates by ID once and counts by query', async () => {
    const { auth, student, request, fake } = await setup('mongodb');
    await auth.enrollUserInCourse(student.id, 'course');
    const list = vi.spyOn(auth, 'listUsers');
    for (const path of ['/auth/me', '/courses', '/users/me/learning-progress', '/courses/course/learners/count']) {
      fake.calls.finds.length = 0;
      const response = await request(path, student); expect(response.status).toBe(200);
      if (path.endsWith('/count')) expect(await response.json()).toEqual({ enrolledLearners: 1 });
      expect(fake.calls.finds).toEqual([{ _id: student.id }]);
    }
    expect(list).not.toHaveBeenCalled(); expect(sheets.reads).toBe(0); expect(fake.calls.counts).toEqual([{ enrolledCourseIds: 'course' }]);
    expect(await (await request('/health/auth')).json()).toEqual({ status: 'ok', store: 'mongodb', readOnly: false });
  });
  it('AC02 revokes a token on the next request and preserves existing access-change logs', async () => {
    const { student, admin, request, fake, changes } = await setup('mongodb');
    const second = new MongoAuthRepository(async () => fake.collection);
    expect((await request('/auth/me', student)).status).toBe(200);
    expect((await request(`/admin/users/${student.id}/role`, admin, 'PATCH', { role: 'teacher' })).status).toBe(200);
    expect((await (await request('/auth/me', student)).json()).user.role).toBe('teacher');
    expect((await changes.recent())[0]).toMatchObject({ field: 'role', from: 'student', to: 'teacher' });
    await second.updateStatus(student.id, 'disabled');
    expect((await request('/auth/me', student)).status).toBe(401);
  });
  it('AC03 concurrent cross-instance signup normalizes email and returns the existing 409 body', async () => {
    const fake = fakeAuthCollection(); const one = await setup('mongodb', fake), two = await setup('mongodb', fake);
    const responses = await Promise.all([one.request('/auth/signup', undefined, 'POST', { displayName: 'Ada', email: ' Ada@Example.test ', password: 'Password123!' }),
      two.request('/auth/signup', undefined, 'POST', { displayName: 'Ada', email: 'ada@example.test', password: 'Password123!' })]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(await responses.find(response => response.status === 409)!.json()).toEqual({ message: 'An account with this email already exists' });
    expect((await one.auth.listUsers()).filter(user => user.email === 'ada@example.test')).toHaveLength(1);
  });
});
