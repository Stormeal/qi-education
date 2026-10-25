import type { Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryAccountProfileRepository } from './accountProfileRepository.js';
import { InMemoryAccountCareersRepository } from './accountCareersRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { careerPathContentSchema } from './careerPath.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { updateCourseContentSchema } from './courseContent.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryInstructorProfileRepository } from './instructorProfileRepository.js';
import { InMemoryLessonNotesRepository } from './lessonNotesRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { InMemoryPaymentRepository } from './paymentRepository.js';
import { FakePaymentService } from './paymentService.js';
import { LocalMailSender } from './mailSender.js';
import { ConfiguredMuxWebhookService } from './muxService.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

type Permission = 'public' | 'signed-in' | 'admin';
type Route = { method: string; path: string };
type RouterLayer = {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle?: { stack?: RouterLayer[] };
};

// Each entry deliberately describes a method AND a path, not a naming convention.
// The /api prefix is an alias implemented by server.ts; both forms are probed.
// "signed-in" includes additional author/course-entitlement rules. Review actions
// are signed-in because teachers can submit; publish itself also requires admin.
const permissionTable: Record<string, Permission> = {
  'GET /users/me/organization': 'signed-in',
  'POST /users/me/organization-request': 'signed-in',
  'PUT /users/me/organization-request': 'signed-in',
  'DELETE /users/me/organization': 'signed-in',
  'GET /admin/organization-requests': 'admin',
  'POST /admin/organization-requests/:id/decision': 'admin',
  'GET /admin/organizations': 'admin',
  'POST /admin/organizations/:id/suspend': 'admin',
  'POST /admin/organizations/:id/reactivate': 'admin',
  'GET /organization-prices': 'signed-in',
  'PUT /admin/organization-prices/careers/:pathId': 'admin',
  'PUT /admin/organization-prices/courses/:courseId': 'admin',
  'GET /organizations/:id/members': 'signed-in',
  'DELETE /organizations/:id/members/:userId': 'signed-in',
  'POST /organizations/:id/members/:userId/promote': 'signed-in',
  'PUT /organizations/:id/members/:userId/career': 'signed-in',
  'GET /organizations/:id/invitations': 'signed-in',
  'POST /organizations/:id/invitations': 'signed-in',
  'POST /organizations/:id/invitations/:inviteId/resend': 'signed-in',
  'DELETE /organizations/:id/invitations/:inviteId': 'signed-in',
  'POST /organization-invitations/check': 'public',
  'POST /organization-invitations/accept': 'signed-in',
  'GET /organizations/:id/course-requests': 'signed-in',
  'POST /organizations/:id/course-requests': 'signed-in',
  'POST /organizations/:id/course-requests/:requestId/decision': 'signed-in',
  'POST /webhooks/mux': 'public',
  'POST /webhooks/stripe': 'public',
  'PUT /courses/:id/thumbnail': 'signed-in',
  'PUT /courses/:id/content/components/:componentId/attachments': 'signed-in',
  'GET /health': 'public',
  'GET /health/config': 'public',
  'GET /health/auth': 'public',
  'GET /health/content': 'public',
  'POST /auth/password-reset/request': 'public',
  'POST /auth/password-reset/check': 'public',
  'POST /auth/password-reset/confirm': 'public',
  'POST /auth/email-confirmation/confirm': 'public',
  'POST /auth/email-confirmation/resend': 'signed-in',
  'POST /users/me/password': 'signed-in',
  'GET /admin/users': 'admin',
  'PATCH /admin/users/:userId/role': 'admin',
  'PATCH /admin/users/:userId/status': 'admin',
  'GET /admin/users/changes': 'admin',
  'POST /admin/users/:userId/password-reset': 'admin',
  'GET /admin/course-locks': 'admin',
  'GET /courses/:id/teachers': 'admin',
  'PUT /courses/:id/teachers': 'admin',
  'POST /auth/login': 'public',
  'POST /login': 'public',
  'POST /auth/signup': 'public',
  'POST /signup': 'public',
  'GET /auth/me': 'signed-in',
  'GET /me': 'signed-in',
  'GET /users/me/instructor-profile': 'signed-in',
  'PUT /users/me/instructor-profile': 'signed-in',
  'GET /instructors': 'public',
  'GET /admin/instructor-profiles': 'admin',
  'DELETE /admin/instructor-profiles/:userId': 'admin',
  'GET /users/me/profile': 'signed-in',
  'PUT /users/me/profile': 'signed-in',
  'POST /users/me/courses/:id/checkout': 'signed-in',
  'POST /users/me/courses/:id/checkout/confirm': 'signed-in',
  'POST /users/me/billing-portal': 'signed-in',
  'GET /users/me/payments': 'signed-in',
  'GET /users/me/payments/:id/receipt': 'signed-in',
  'POST /users/me/courses/:id': 'signed-in',
  'GET /courses': 'public',
  'GET /courses/:id/thumbnail': 'public',
  'POST /courses': 'signed-in',
  'GET /courses/:id/outline': 'public',
  'GET /courses/:id/content': 'signed-in',
  'GET /courses/:id/content/attachments/:assetId': 'signed-in',
  'PATCH /courses/:id/content': 'signed-in',
  'POST /courses/:id/content/components/:componentId/quiz-attempts': 'signed-in',
  'POST /courses/:id/content/components/:componentId/mux-upload': 'signed-in',
  'DELETE /courses/:id/content/components/:componentId/mux-video': 'signed-in',
  'POST /courses/:id/review': 'signed-in',
  'PATCH /courses/:id': 'signed-in',
  'PATCH /courses/:id/price': 'admin',
  'DELETE /courses/:id/content/components/:componentId/attachments/:assetId': 'signed-in',
  'PATCH /courses/:id/catalog-metadata': 'admin',
  'GET /courses/:courseId/notes': 'signed-in',
  'POST /courses/:courseId/notes': 'signed-in',
  'PATCH /courses/:courseId/notes/:noteId': 'signed-in',
  'DELETE /courses/:courseId/notes/:noteId': 'signed-in',
  'POST /courses/:courseId/lesson-feedback': 'signed-in',
  'GET /courses/:courseId/learners/count': 'signed-in',
  'GET /users/me/learning-progress': 'signed-in',
  'PUT /users/me/learning-progress/:courseId/lessons/:componentId': 'signed-in',
  'POST /users/me/learning-progress/:courseId/components/:componentId/quiz-attempts': 'signed-in',
  'GET /users/me/careers': 'signed-in',
  'PUT /users/me/careers/:pathId': 'signed-in',
  'DELETE /users/me/careers/:pathId': 'signed-in',
  'PUT /users/me/career-focus': 'signed-in',
  'POST /users/me/achievements': 'signed-in',
  'POST /users/me/achievements/cv': 'signed-in',
  'GET /career-paths': 'public',
  'GET /career-paths/:id': 'public',
  'GET /users/me/career-path': 'signed-in',
  'PUT /users/me/career-path': 'signed-in',
  'GET /admin/career-paths': 'admin',
  'GET /admin/review-queue': 'admin',
  'PUT /admin/career-paths/:id': 'admin',
  'POST /admin/career-paths/:id/publish': 'admin',
  'POST /admin/career-paths/:id/unpublish': 'admin',
  'POST /feedback': 'signed-in',
  'GET /feedback': 'admin',
  'PATCH /feedback/:id/triage': 'admin',
};

function registeredRoutes(app: Express): Route[] {
  const stack = (app as unknown as { router: { stack: RouterLayer[] } }).router.stack;
  const found = new Map<string, Route>();
  for (const layer of stack) {
    // Do not silently miss future mounted routers whose mount paths are opaque
    // in Express 5. Extend enumeration alongside such a routing change.
    if (layer.handle?.stack) throw new Error('Nested router: extend enumeration and add this route to the permission table');
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const method of Object.keys(layer.route.methods)) {
      for (const path of paths) {
        if (typeof path !== 'string') throw new Error('Unsupported path: add this route to the permission table');
        const plain = path.replace(/^\/api(?=\/|$)/, '') || '/';
        for (const variant of [plain, `/api${plain}`]) {
          const route = { method: method.toUpperCase(), path: variant };
          found.set(`${route.method} ${route.path}`, route);
        }
      }
    }
  }
  return [...found.values()];
}
const key = (route: Route) => `${route.method} ${route.path.replace(/^\/api(?=\/|$)/, '') || '/'}`;
function assertPermissionTable(routes: Route[]) {
  const missing = routes.filter(route => !permissionTable[key(route)]).map(route => `${route.method} ${route.path}`);
  expect(missing, `add this route to the permission table:\n${missing.join('\n')}`).toEqual([]);
  const registered = new Set(routes.map(key));
  expect(Object.keys(permissionTable).filter(entry => !registered.has(entry)), 'Remove stale permission table entries').toEqual([]);
}
const inventory = registeredRoutes(createServer());
const courseId = 'demo-course-1';

async function fixture() {
  expect(apiConfig.mode).toBe('isolated');
  const auth = new InMemoryAuthRepository();
  const learnerA = (await auth.findByEmail('student@qi-education.local'))!;
  const learnerB = await auth.createUser({ ...learnerA, id: 'x1-learner-b', email: 'x1-b@example.test' });
  const profiles = new InMemoryAccountProfileRepository(), notes = new InMemoryLessonNotesRepository();
  const progress = new InMemoryLearningProgressRepository(), accounts = new InMemoryAccountCareersRepository();
  const careers = new InMemoryCareerPathRepository(), courses = new InMemoryCourseRepository();
  const content = new InMemoryCourseContentRepository(), payments = new InMemoryPaymentRepository();
  const paymentService = new FakePaymentService();
  const published = careerPathContentSchema.parse({ schemaVersion: 2, title: 'X1 career', steps: [
    { id: 'foundation', title: 'Foundation', prerequisiteStepIds: [], courses: [],
      actions: [{ id: 'x1-exam', kind: 'exam', title: 'Exam' }], requirementBundles: [['x1-exam']] },
  ] });
  await careers.savePath({ _id: 'x1-career', revision: 1, draft: published, published, updatedAt: '2026-10-20T00:00:00.000Z' });
  await content.createEmptyCourseContent(courseId);
  await content.updateCourseContent(courseId, updateCourseContentSchema.parse({ sections: [{ id: 'intro', title: 'Introduction', components: [
    { id: 'lesson-a', type: 'text', title: 'A', content: 'First lesson' },
    { id: 'lesson-b', type: 'text', title: 'B', content: 'Second lesson' },
  ] }] }).sections);
  for (const user of [learnerA, learnerB]) await auth.enrollUserInCourse(user.id, courseId);
  const app = createServer({ authRepository: auth, accountProfileRepository: profiles,
    accountCareersRepository: accounts, careerPathRepository: careers, courseRepository: courses,
    courseContentRepository: content, courseAssetRepository: new InMemoryCourseAssetRepository(),
    feedbackRepository: new InMemoryFeedbackRepository(), instructorProfileRepository: new InMemoryInstructorProfileRepository(),
    learningProgressRepository: progress, lessonNotesRepository: notes, paymentRepository: payments, paymentService,
    mailSender: new LocalMailSender(() => {}), muxVideoService: null,
    // The real verifier uses only local crypto; this is a fixture, never a configured secret.
    muxWebhookService: new ConfiguredMuxWebhookService('x1-webhook-fixture'),
    gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('X1 must never call GitHub.'); } },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, method = 'GET', user?: AuthUser, body?: unknown) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET)}` } : {}) },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  return { app, server, request, auth, learnerA, learnerB, profiles, notes, progress, accounts, payments, paymentService, courses };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const close = (server: Server) => new Promise<void>(resolve => server.close(() => resolve()));

describe('X1 every registered route and /api alias', () => {
  let f: Fixture;
  beforeAll(async () => { f = await fixture(); });
  afterAll(async () => { await close(f.server); });

  it('permission table covers every registered method/path and has no stale entries', () => {
    assertPermissionTable(registeredRoutes(f.app));
  });
  it('fails clearly when a newly registered route has no permission entry', () => {
    const app = createServer();
    app.get('/x1-unclassified', (_request, response) => { response.json({}); });
    expect(() => assertPermissionTable(registeredRoutes(app))).toThrow(/add this route to the permission table:[\s\S]*GET \/x1-unclassified/);
  });
  it.each(inventory)('$method $path enforces its explicit permission class', async route => {
    const permission = permissionTable[key(route)];
    expect(permission, `add this route to the permission table: ${route.method} ${route.path}`).toBeDefined();
    const path = route.path.replace(/:[A-Za-z][A-Za-z0-9_]*/g, 'x1-unknown');
    const anonymous = await f.request(path, route.method);
    if (permission === 'public') {
      if (/\/webhooks\//.test(path)) {
        expect([400, 401], `Unsigned ${route.method} ${path} must be refused`).toContain(anonymous.status);
      } else {
        expect(anonymous.status, `${route.method} ${path} should not require authentication`).not.toBe(401);
        expect(anonymous.status).not.toBe(403);
      }
    } else {
      expect(anonymous.status >= 200 && anonymous.status < 300, `${route.method} ${path} must not succeed without a token`).toBe(false);
      expect(anonymous.status, `${route.method} ${path}: anonymous must get 401`).toBe(401);
      const signedIn = await f.request(path, route.method, f.learnerA);
      if (permission === 'admin') expect(signedIn.status, `${route.method} ${path}: student must get 403`).toBe(403);
      else expect(signedIn.status, `${route.method} ${path}: a valid token must pass authentication`).not.toBe(401);
      // Express also serves HEAD using a GET handler unless HEAD is registered explicitly.
      if (route.method === 'GET') {
        expect((await f.request(path, 'HEAD')).status).toBe(401);
        if (permission === 'admin') expect((await f.request(path, 'HEAD', f.learnerA)).status).toBe(403);
      }
    }
  });
});

describe.each(['', '/api'])('X1 personal resource isolation (%s)', prefix => {
  let f: Fixture;
  beforeEach(async () => { f = await fixture(); });
  afterEach(async () => { await close(f.server); });
  const profile = (bio: string) => ({ bio, jobTitle: 'Tester', company: 'QI', learningGoals: '', avatarColor: '#123456' });
  const request = (path: string, method = 'GET', user = f.learnerA, body?: unknown) => f.request(prefix + path, method, user, body);

  it('profile: forged body/query/path identities cannot read or overwrite learner B', async () => {
    expect((await request('/users/me/profile', 'PUT', f.learnerB, profile('B private bio'))).status).toBe(200);
    const before = await (await request('/users/me/profile', 'GET', f.learnerB)).json();
    const forged = `?userId=${f.learnerB.id}&_id=${f.learnerB.id}`;
    expect(await (await request('/users/me/profile' + forged)).json()).toMatchObject({ bio: '' });
    expect((await request('/users/me/profile' + forged, 'PUT', f.learnerA,
      { ...profile('A own bio'), userId: f.learnerB.id, _id: f.learnerB.id })).status).toBe(200);
    expect(await (await request('/users/me/profile')).json()).toMatchObject({ bio: 'A own bio' });
    for (const method of ['GET', 'PUT']) {
      expect((await request(`/users/${f.learnerB.id}/profile`, method, f.learnerA, profile('Overwrite B'))).status).toBe(404);
    }
    expect(await (await request('/users/me/profile', 'GET', f.learnerB)).json()).toEqual(before);
    expect((await f.profiles.get(f.learnerB.id))?.bio).toBe('B private bio');
  });

  it('notes: B note ids cannot be listed, edited or deleted with A token', async () => {
    const root = `/courses/${courseId}/notes`, forged = `?userId=${f.learnerB.id}`;
    const created = await request(root, 'POST', f.learnerB, { componentId: 'lesson-b', text: 'B private note', videoSeconds: null });
    expect(created.status).toBe(201);
    const { note } = await created.json();
    const before = await (await request(root, 'GET', f.learnerB)).json();
    expect(await (await request(root + forged)).json()).toEqual({ notes: [] });
    expect((await request(`${root}/${note.id}${forged}`, 'PATCH', f.learnerA,
      { text: 'Overwrite B', userId: f.learnerB.id })).status).toBe(404);
    expect((await request(`${root}/${note.id}${forged}`, 'DELETE')).status).toBe(404);
    expect((await request(root + forged, 'POST', f.learnerA,
      { componentId: 'lesson-a', text: 'A own note', videoSeconds: null, userId: f.learnerB.id })).status).toBe(201);
    expect((await (await request(root)).json()).notes).toEqual([expect.objectContaining({ text: 'A own note' })]);
    expect(await (await request(root, 'GET', f.learnerB)).json()).toEqual(before);
    expect(await f.notes.list(f.learnerB.id, courseId)).toEqual([note]);
  });

  it('progress: forged account selectors cannot read B completion or save into B', async () => {
    const root = '/users/me/learning-progress', forged = `?userId=${f.learnerB.id}`;
    expect((await request(`${root}/${courseId}/lessons/lesson-b`, 'PUT', f.learnerB)).status).toBe(200);
    const before = await (await request(root, 'GET', f.learnerB)).json();
    expect(before).toEqual({ progress: [{ courseId, completedIds: ['lesson-b'] }] });
    expect(await (await request(root + forged)).json()).toEqual({ progress: [] });
    expect((await request(`${root}/${courseId}/lessons/lesson-a${forged}`, 'PUT', f.learnerA,
      { userId: f.learnerB.id, completedIds: ['lesson-b'] })).status).toBe(200);
    expect(await (await request(root)).json()).toEqual({ progress: [{ courseId, completedIds: ['lesson-a'] }] });
    expect((await request(`/users/${f.learnerB.id}/learning-progress`)).status).toBe(404);
    expect((await request(`/users/${f.learnerB.id}/learning-progress/${courseId}/lessons/lesson-a`, 'PUT')).status).toBe(404);
    expect(await (await request(root, 'GET', f.learnerB)).json()).toEqual(before);
    expect((await f.progress.get(f.learnerB.id, courseId))?.completedIds).toEqual(['lesson-b']);
  });

  it('careers: B follow, focus, legacy selection and achievements stay private and unchanged', async () => {
    const root = '/users/me/careers', forged = `?userId=${f.learnerB.id}`;
    expect((await request('/users/me/career-path', 'PUT', f.learnerB, { pathId: 'x1-career' })).status).toBe(200);
    expect((await request('/users/me/achievements', 'POST', f.learnerB, { actionId: 'x1-exam' })).status).toBe(200);
    const before = await (await request(root, 'GET', f.learnerB)).json();
    const legacyBefore = await (await request('/users/me/career-path', 'GET', f.learnerB)).json();
    expect(before).toMatchObject({ followedPathIds: ['x1-career'], focusPathId: 'x1-career', achievements: [expect.objectContaining({ actionId: 'x1-exam' })] });
    expect(await (await request(root + forged)).json()).toMatchObject({ followedPathIds: [], focusPathId: null, achievements: [] });
    expect(await (await request('/users/me/career-path' + forged)).json()).toEqual({ selection: null });
    expect((await request(`${root}/x1-career${forged}`, 'PUT', f.learnerA, { userId: f.learnerB.id })).status).toBe(200);
    expect((await request('/users/me/career-focus' + forged, 'PUT', f.learnerA, { pathId: 'x1-career', userId: f.learnerB.id })).status).toBe(200);
    expect((await request(`${root}/x1-career${forged}`, 'DELETE')).status).toBe(200);
    expect((await request('/users/me/achievements/cv' + forged, 'POST', f.learnerA,
      { actionIds: ['x1-exam'], userId: f.learnerB.id })).status).toBe(200);
    expect((await (await request(root)).json()).achievements).toEqual([expect.objectContaining({ actionId: 'x1-exam', provenance: 'cv' })]);
    expect((await request(`/users/${f.learnerB.id}/careers`)).status).toBe(404);
    expect(await (await request(root, 'GET', f.learnerB)).json()).toEqual(before);
    expect(await (await request('/users/me/career-path', 'GET', f.learnerB)).json()).toEqual(legacyBefore);
  });

  it('payments: B session and customer cannot be confirmed or opened by A token', async () => {
    const returnUrl = `http://localhost:4200/courses/${courseId}`;
    const { url } = await f.paymentService.createCheckout({ userId: f.learnerB.id, email: f.learnerB.email,
      courseId, courseTitle: 'X1 course', amountDkk: 499, customerId: 'x1-customer-b',
      successUrl: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: returnUrl });
    const sessionId = new URL(url).searchParams.get('session_id')!;
    const payment = { _id: sessionId, userId: f.learnerB.id, courseId, amountDkk: 499,
      stripeCustomerId: 'x1-customer-b', paidAt: '2026-10-20T00:00:00.000Z' };
    expect(await f.payments.add(payment)).toBe(true);
    const before = structuredClone(await f.auth.findById(f.learnerB.id));
    expect((await request('/users/me/billing-portal', 'POST', f.learnerB, { returnUrl })).status).toBe(200);
    const forged = `?userId=${f.learnerB.id}`;
    const confirmed = await request(`/users/me/courses/${courseId}/checkout/confirm${forged}`, 'POST', f.learnerA,
      { sessionId, userId: f.learnerB.id });
    expect(confirmed.status).toBe(404);
    expect(await confirmed.json()).toEqual({ message: 'Checkout session not found.' });
    const portal = await request('/users/me/billing-portal' + forged, 'POST', f.learnerA,
      { returnUrl, userId: f.learnerB.id, customerId: 'x1-customer-b' });
    expect(portal.status).toBe(404); expect(await portal.json()).toEqual({ message: 'No payments yet.' });
    expect((await request(`/users/${f.learnerB.id}/billing-portal`, 'POST', f.learnerA, { returnUrl })).status).toBe(404);
    expect(await f.payments.latestCustomerId(f.learnerA.id)).toBeNull();
    expect(await f.payments.latestCustomerId(f.learnerB.id)).toBe('x1-customer-b');
    expect(await f.payments.add(payment)).toBe(false);
    expect(await f.auth.findById(f.learnerB.id)).toEqual(before);
  });
});
