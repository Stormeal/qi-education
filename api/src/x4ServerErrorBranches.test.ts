import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { CareerPathConflictError, CareerPathSchemaError, InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { LocalMailSender } from './mailSender.js';
import { FakePaymentService } from './paymentService.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { careerPathContentSchema } from './careerPath.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

/*
 * X4 server inventory at 97cd1d5. B = baseline; N = new below; U = unreachable.
 * Count semantic handler/status/decision exits, including forwarded generic500
 * and Mongo503 per handler. Schema field variants/compound conditions count once.
 * Creator/admin/author403 is one gate per guarded handler. Shared authentication,
 * parsers, freezes, locks and revision-precondition exits are listed separately
 * below, not multiplied across every route. Aliases do not multiply counts.
 * Media/upload handlers are in x4MediaPaymentErrorBranches.test.ts (70 exits).
 * Counts below: 132 = 70 B + 61 N + 1 U; combined server: 202/94/106/2.
 * Every new denial test checks saved data or the absent downstream write.
 *
 * Handler (server.ts line) — error exits and evidence; total B/N/U.
 * GET health :501 / config :508: no local error exit (0/0/0).
 * GET health/auth :538: missing secret503 N secret unavailable; unavailable
 *   account store503 B safeOperation fails closed; 1/1/0.
 * GET health/content :557: caught503 B server content health failures; 1/0/0.
 * POST login aliases :584: unavailable503 B safeOperation/userStoreRoutes;
 *   schema400 B requestErrors RD03; credentials401 B server invalid login and
 *   signInLimit03; locked429 B signInLimit01/02; caught500/Mongo503 N login
 *   account read (also proves a successful retry releases reservation); 4/2/0.
 * POST signup aliases :625: unavailable503 B safeOperation; schema400 B server
 *   password rules; client429 B clientLimitRoutes AC06; precheck409 B server
 *   duplicate signup; duplicate-index409 B multiInstanceAccounts; caught mail
 *   failure201 B emailConfirmation AC03; caught500 B safeRetries releases signup;
 *   caught Mongo503 N signup account write; 7/1/0.
 * GET me aliases :671: no local error exit; common auth below (0/0/0).
 * POST enrollment :685: course404 B server missing course; unpublished403 B
 *   courseLifecycle LC04; paid402 B paymentRoutes AC01; vanished account404 N
 *   account disappears; caught500 B safeRetries releases enrollment; Mongo503
 *   N enrollment write; 4/2/0.
 * GET courses :729: caught500/Mongo503 B dependencyErrors; 2/0/0.
 * POST courses :774: creator403 B X1/courseOwnership; schema400 B server invalid
 *   input; status403 B courseReview direct publication; privileged fields403 B
 *   courseOwnership; borrowed thumbnail403 B courseOwnership; unsafe storage503
 *   B courseStoreRoutes AC01/02; rollback/caught500 B server removes content;
 *   caught Mongo503 N initial content creation; 7/1/0.
 * GET outline :826: invisible/missing404 B courseLifecycle LC03; caught500/
 *   Mongo503 N outline read; 1/2/0.
 * GET content :839: course404 B server missing content; access403 B lifecycle
 *   LC03/04; document404 N missing content document; caught503 B server content
 *   repository unavailable (all exceptions intentionally map here); 3/1/0.
 * PATCH content :918: author403/course404 B courseOwnership; schema400 B server
 *   invalid content; question-image schema400 and image reference400 B
 *   questionImage; assessment400 N duplicate component IDs; foreign attachment
 *   403 B ownership; caught500 B courseSave retry failed lessons; Mongo503 N
 *   lesson persistence; 7/2/0.
 * POST review :1171: author403 B courseReview AC05; course404 N missing review;
 *   action schema400 N invalid action; admin-decision403 N owner teacher;
 *   reason400/stale409 B courseReview AC04/06; start-state409/archive-state409/
 *   working-state409 N fresh draft action cases; empty-outline400/assessment400
 *   B courseReview AC01; caught500 B AC06 failed publication; Mongo503 N review
 *   persistence; 6/7/0.
 * PATCH metadata :1187: author403/course404 B ownership; schema400 N malformed
 *   metadata; privileged fields403 B ownership; stored schema400/assessment400
 *   N review through metadata; status409 B courseReview bypass; pricing409 N
 *   admin pricing bypass; null update404 :1224 U DEF-055 (review adapter returns
 *   Course or throws); caught500 B courseSave first legacy save failure;
 *   Mongo503 N metadata persistence; 5/5/1.
 * PATCH price :1237: admin403 B X1; schema400/target404 N price cases;
 *   caught500 B courseLockResponse uncertain write; Mongo503 N price write; 2/3/0.
 * PATCH catalog :1333: admin403 B X1; schema400/target404 N catalog cases;
 *   caught500/Mongo503 N catalog write; 1/4/0.
 * GET career list :1384: caught500/Mongo503 N public career list; 0/2/0.
 * GET career detail :1391: missing/unpublished404 B careerPath AC03;
 *   caught500/Mongo503 N public career detail; 1/2/0.
 * GET legacy selection :1400: caught500/Mongo503 N selected career read; 0/2/0.
 * PUT legacy selection :1407: schema400 N validation case; unpublished404 B
 *   careerPath L009; caught500 B P004 atomic last write; Mongo503 N selected
 *   career write; 2/2/0.
 * GET admin careers :1420: admin403 B X1; caught500/Mongo503 N admin career list;
 *   1/2/0.
 * PUT career draft :1426: admin403 B X1; ID400/body400 N validation cases;
 *   downgrade409 B careerMilestones schema protection; version409 B
 *   careerPathWithdrawal AC02; caught500/Mongo503 N career draft write; 3/4/0.
 * POST publish :1440: admin403 B X1; expected-version409 B withdrawal AC02;
 *   missing draft404 N nonexistent draft; readiness400 B careerPath T008-AC02;
 *   database conflict409/schema409 N database conflict or schema refusal;
 *   ambiguous/caught500/Mongo503 N publication write; 3/5/0.
 * POST unpublish :1468: admin403 B X1; version409/unpublished409 B withdrawal
 *   AC01/02; database conflict409/schema409 N database conflict or schema refusal;
 *   ambiguous/caught500/Mongo503 N withdrawal write; 3/4/0.
 * POST feedback :1490: schema400 N validation case; caught500/Mongo503 N
 *   feedback submission; 0/3/0.
 * GET feedback :1505: admin403 B X1; caught500/Mongo503 N feedback list; 1/2/0.
 * PATCH triage :1512: admin403 B X1; schema400/lookup404 B safeRetries forbidden,
 *   invalid, missing or non-work; post-write missing404 N feedback disappears;
 *   GitHub503 B server GitHub issue failure; caught500 B safeRetries failed save;
 *   Mongo503 N triage write; 5/2/0.
 *
 * Shared exits: authentication's unavailable503/missing-invalid-inactive401 and
 * caught500/503 are exercised by safeOperation, courseLifecycle LC02,
 * authStatusRepository/adminUsers/changePassword; X1 sweeps every protected route.
 * Optional auth uses the same guard. Creator/admin/author role/ownership403 and
 * author course404 are in X1/ownership. Parser invalid JSON400/other parse400/
 * oversized413/encoding415 are in requestErrors (no DEF-051 endorsement).
 * Account/course freeze503 and unsafe shared coordination503 are in
 * userStoreRoutes/courseStoreRoutes; lock acquisition409, retained uncertain
 * write error, release failure and response completion are in courseLockResponse.
 * Editable-state409 and revision missing428/stale409 are in courseReview/courseSave.
 * Global domain409, read-only503, store503, Zod400, nested/cyclic causes and safe
 * generic500 mappings are in dependencyErrors/requestErrors and domain suites.
 * Known DEF-047..052 are not re-recorded or turned into passing wrong-behavior tests.
 */
const metadata = createCourseSchema.parse({ title: 'X4 authoring course',
  description: 'A course for isolated failure-path checks.', teacher: 'Teacher', level: 'Beginner' });
const sections = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons',
  components: [{ id: 'text', title: 'Original lesson', type: 'text', content: 'Original work' }] }] }).sections;
const career = careerPathContentSchema.parse({ title: 'X4 career', summary: 'A useful goal.', outcomes: ['Learn'], estimatedHours: 2,
  steps: [{ id: 'first', title: 'Start', courses: [{ courseId: 'demo-course-1' }] }] });
const catalog = { isPremium: false, isBestseller: false, rating: 0, ratingCount: 0, category: 'Software Testing', languages: ['English'] };
const feedbackInput = { page: 'home', rating: 'okay', message: 'Keep the original report.' };
type Role = 'student' | 'teacher' | 'admin';
type FailureCase = { name: string; path: string; method?: string; role?: Role; body?: unknown;
  inject(error: Error): void; statuses: (500 | 503)[] };

describe.each(['', '/api'])('X4 server errors (%s)', prefix => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository, paths: InMemoryCareerPathRepository, feedback: InMemoryFeedbackRepository;
  let users: Record<Role, AuthUser>, feedbackId: string;
  const originalSecret = apiConfig.AUTH_TOKEN_SECRET;

  async function request(path: string, method = 'GET', body?: unknown, role?: Role, revision?: unknown) {
    return fetch(base + prefix + path, { method, headers: { 'Content-Type': 'application/json',
      ...(role ? { authorization: `Bearer ${createSessionToken(users[role], apiConfig.AUTH_TOKEN_SECRET!)}` } : {}),
      ...(revision === undefined ? {} : { 'X-Course-Revision': JSON.stringify(revision) }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function snapshot() {
    return structuredClone({ courses: await courses.listCourses(), content: await content.getCourseContent('x4-course'),
      paths: await paths.listPaths(), feedback: await feedback.listFeedback(), selection: await paths.getSelection(users.student.id),
      student: await auth.findById(users.student.id), accounts: await auth.listUsers() });
  }
  async function authorState() { return (await (await request('/courses/x4-course/content?view=author', 'GET', undefined, 'teacher')).json()).review; }
  async function expectError(response: Response, status: number, message?: string) {
    expect(response.status).toBe(status);
    const body = await response.json();
    if (message) expect(body.message).toBe(message);
    expect(body.message).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain('X4_PRIVATE_PROVIDER_DETAIL');
    return body;
  }

  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository(); paths = new InMemoryCareerPathRepository(); feedback = new InMemoryFeedbackRepository();
    users = { student: (await auth.findByEmail('student@qi-education.local'))!, teacher: (await auth.findByEmail('teacher@qi-education.local'))!,
      admin: (await auth.findByEmail('admin@qi-education.local'))! };
    await courses.createCourse(metadata, { id: 'x4-course', createdAt: '2026-10-20T10:00:00.000Z', ownerUserId: users.teacher.id });
    await content.updateCourseContent('x4-course', sections);
    await paths.savePath({ _id: 'x4-path', revision: 1, draft: career, published: career, updatedAt: '2026-10-20T10:00:00.000Z' });
    feedbackId = (await feedback.createFeedback(feedbackInput as Parameters<typeof feedback.createFeedback>[0], toAuthenticatedUser(users.student))).id;
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: new InMemoryCourseAssetRepository(), careerPathRepository: paths, feedbackRepository: feedback,
      mailSender: new LocalMailSender(() => {}), paymentService: new FakePaymentService(), muxVideoService: null, muxWebhookService: null,
      gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('External calls forbidden'); } },
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => {
    apiConfig.AUTH_TOKEN_SECRET = originalSecret;
    vi.restoreAllMocks();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const failures: FailureCase[] = [
    { name: 'US-P008 login account read', path: '/auth/login', method: 'POST', body: { email: 'student@qi-education.local', password: 'Password123!' },
      inject: error => { vi.spyOn(auth, 'findByEmail').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-P003 signup account write', path: '/auth/signup', method: 'POST', body: { email: 'x4-new@example.test', displayName: 'New learner', password: 'Password123!' },
      inject: error => { vi.spyOn(auth, 'createUser').mockRejectedValueOnce(error); }, statuses: [503] },
    { name: 'US-L001 outline read', path: '/courses/demo-course-1/outline', inject: error => { vi.spyOn(content, 'getCourseContent').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-P003 enrollment write', path: '/users/me/courses/demo-course-1', method: 'POST', role: 'student',
      inject: error => { vi.spyOn(auth, 'enrollUserInCourse').mockRejectedValueOnce(error); }, statuses: [503] },
    { name: 'US-T001 initial content creation', path: '/courses', method: 'POST', role: 'teacher', body: metadata,
      inject: error => { vi.spyOn(content, 'createEmptyCourseContent').mockRejectedValueOnce(error); }, statuses: [503] },
    { name: 'US-T005 lesson persistence', path: '/courses/x4-course/content', method: 'PATCH', role: 'teacher', body: { sections },
      inject: error => { vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(error); }, statuses: [503] },
    { name: 'US-T005 metadata persistence', path: '/courses/x4-course', method: 'PATCH', role: 'teacher', body: { ...metadata, title: 'Changed title' },
      inject: error => { vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(error); }, statuses: [503] },
    { name: 'US-T007 review persistence', path: '/courses/x4-course/review', method: 'POST', role: 'teacher',
      body: { action: 'submit', expectedVersion: 0, revisionId: 'legacy-x4-course' },
      inject: error => { vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(error); }, statuses: [503] },
    { name: 'US-L001 price write', path: '/courses/x4-course/price', method: 'PATCH', role: 'admin', body: { priceDkk: 499 },
      inject: error => { vi.spyOn(courses, 'updateCoursePrice').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-T007 catalog write', path: '/courses/x4-course/catalog-metadata', method: 'PATCH', role: 'admin', body: catalog,
      inject: error => { vi.spyOn(courses, 'updateCourseCatalogMetadata').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-L006 public career list', path: '/career-paths', inject: error => { vi.spyOn(paths, 'listPaths').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-L006 public career detail', path: '/career-paths/x4-path', inject: error => { vi.spyOn(paths, 'listPaths').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-L009 selected career read', path: '/users/me/career-path', role: 'student',
      inject: error => { vi.spyOn(paths, 'getSelection').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-L009 selected career write', path: '/users/me/career-path', method: 'PUT', role: 'student', body: { pathId: 'x4-path' },
      inject: error => { vi.spyOn(paths, 'saveSelection').mockRejectedValueOnce(error); }, statuses: [503] },
    { name: 'US-T008 admin career list', path: '/admin/career-paths', role: 'admin',
      inject: error => { vi.spyOn(paths, 'countSelections').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-T008 career draft write', path: '/admin/career-paths/x4-path', method: 'PUT', role: 'admin', body: career,
      inject: error => { vi.spyOn(paths, 'savePath').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-T008 career publication write', path: '/admin/career-paths/x4-path/publish', method: 'POST', role: 'admin',
      inject: error => { vi.spyOn(paths, 'savePath').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-T008 career withdrawal write', path: '/admin/career-paths/x4-path/unpublish', method: 'POST', role: 'admin',
      inject: error => { vi.spyOn(paths, 'savePath').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-P003 feedback submission', path: '/feedback', method: 'POST', role: 'student', body: feedbackInput,
      inject: error => { vi.spyOn(feedback, 'createFeedback').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-P003 feedback list', path: '/feedback', role: 'admin',
      inject: error => { vi.spyOn(feedback, 'listFeedback').mockRejectedValueOnce(error); }, statuses: [500, 503] },
    { name: 'US-P003 feedback triage write', path: '/feedback/fixture/triage', method: 'PATCH', role: 'admin', body: { workStatus: 'completed' },
      inject: error => { vi.spyOn(feedback, 'updateFeedbackTriage').mockRejectedValueOnce(error); }, statuses: [503] },
  ];

  it.each(failures.flatMap(row => row.statuses.map(status => ({ ...row, status }))))(
    '$name refuses false success and returns safe $status', async ({ path, method, role, body, inject, status }) => {
      const before = await snapshot();
      const revision = method === 'PATCH' && role === 'teacher' ? await authorState() : undefined;
      const error = Object.assign(new Error('X4_PRIVATE_PROVIDER_DETAIL'), { name: status === 503 ? 'MongoNetworkError' : 'Error' });
      inject(error);
      const response = await request(path.replace('/fixture/', `/${feedbackId}/`), method, body, role, revision);
      expect(await expectError(response, status)).toEqual(status === 503
        ? { message: 'Storage is temporarily unavailable. Please try again.', code: 'STORE_UNAVAILABLE', retryable: true }
        : { message: 'Unexpected server error' });
      expect(await snapshot()).toEqual(before);
      if (path === '/auth/login') expect((await request(path, method, body)).status).toBe(200);
    });

  it('US-P002 refuses health/auth, login and signup when the session secret is unavailable', async () => {
    apiConfig.AUTH_TOKEN_SECRET = '';
    for (const [path, method, body] of [
      ['/health/auth', 'GET', undefined], ['/auth/login', 'POST', { email: users.student.email, password: 'Password123!' }],
      ['/auth/signup', 'POST', { email: 'x4@example.test', displayName: 'X4 learner', password: 'Password123!' }],
    ] as const) await expectError(await request(path, method, body), 503);
    expect(await auth.findByEmail('x4@example.test')).toBeNull();
  });

  it('US-L001 refuses enrollment when the authenticated account disappears before the write', async () => {
    vi.spyOn(auth, 'enrollUserInCourse').mockResolvedValueOnce(null);
    await expectError(await request('/users/me/courses/demo-course-1', 'POST', undefined, 'student'), 404, 'User not found');
    expect((await auth.findById(users.student.id))!.enrolledCourseIds).toEqual([]);
  });

  it('US-L001 distinguishes a missing content document from a missing course', async () => {
    await auth.enrollUserInCourse(users.student.id, 'demo-course-1');
    await expectError(await request('/courses/demo-course-1/content', 'GET', undefined, 'student'), 404, 'Course content not found');
  });

  it.each(['price', 'catalog-metadata'])('US-T007 %s rejects invalid input before changing metadata', async suffix => {
    const before = await snapshot();
    await expectError(await request(`/courses/x4-course/${suffix}`, 'PATCH', suffix === 'price' ? { priceDkk: -1 } : {}, 'admin'), 400);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['price', 'catalog-metadata'])('US-T007 %s returns 404 when the update target does not exist', async suffix => {
    const before = await snapshot();
    await expectError(await request(`/courses/missing/${suffix}`, 'PATCH', suffix === 'price' ? { priceDkk: 499 } : catalog, 'admin'), 404, 'Course not found');
    expect(await snapshot()).toEqual(before);
  });

  it('US-T005 rejects malformed metadata without replacing the loaded draft', async () => {
    const before = await snapshot();
    await expectError(await request('/courses/x4-course', 'PATCH', { title: 'x' }, 'teacher'), 400);
    expect(await snapshot()).toEqual(before);
  });

  it('US-T005 refuses an outline with duplicate component IDs and preserves the prior lessons', async () => {
    const before = await snapshot();
    const duplicate = structuredClone(sections); duplicate[0].components.push(structuredClone(duplicate[0].components[0]));
    await expectError(await request('/courses/x4-course/content', 'PATCH', { sections: duplicate }, 'teacher', await authorState()), 400);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['malformed', 'unanswerable'])('US-T007 refuses review through metadata when stored assessment is %s', async kind => {
    const invalid = kind === 'malformed' ? { ...sections[0], components: null }
      : { id: 's', title: 'Assessment', components: [{ id: 'q', title: 'Quiz', type: 'quiz', quiz: { passPoints: 1, questions: [] }, attachments: [] }] };
    await content.updateCourseContent('x4-course', [invalid] as unknown as typeof sections);
    const before = await snapshot();
    await expectError(await request('/courses/x4-course', 'PATCH', { ...metadata, status: 'ready-for-review' }, 'teacher'), 400);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { action: 'invalid', status: 400 }, { action: 'start-revision', status: 409 },
    { action: 'archive', status: 409 }, { action: 'publish', status: 409 },
  ])('US-T007 refuses $action in a fresh draft without adding review history', async ({ action, status }) => {
    const before = await snapshot();
    await expectError(await request('/courses/x4-course/review', 'POST', { action, expectedVersion: 0, revisionId: 'legacy-x4-course' }, 'admin'), status);
    expect(await snapshot()).toEqual(before);
  });

  it('US-T007 refuses an owner teacher making an admin review decision', async () => {
    const before = await snapshot();
    await expectError(await request('/courses/x4-course/review', 'POST',
      { action: 'publish', expectedVersion: 0, revisionId: 'legacy-x4-course' }, 'teacher'), 403);
    expect(await snapshot()).toEqual(before);
  });

  it('US-T007 missing review target is refused before any publication write', async () => {
    const before = await snapshot();
    await expectError(await request('/courses/missing/review', 'POST',
      { action: 'publish', expectedVersion: 0, revisionId: null }, 'admin'), 404, 'Course not found');
    expect(await snapshot()).toEqual(before);
  });

  it('US-L001 refuses an admin pricing bypass through the metadata editor', async () => {
    const before = await snapshot();
    await expectError(await request('/courses/x4-course', 'PATCH', { ...metadata, priceDkk: 499 }, 'admin', await authorState()), 409);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['publish', 'unpublish'])('US-T008 %s preserves a database conflict or schema refusal', async operation => {
    const before = await snapshot();
    for (const error of [new CareerPathConflictError(), new CareerPathSchemaError()]) {
      vi.spyOn(paths, 'savePath').mockRejectedValueOnce(error);
      const response = await request(`/admin/career-paths/x4-path/${operation}`, 'POST', undefined, 'admin');
      expect(await expectError(response, 409)).toEqual({ message: error.message,
        code: error instanceof CareerPathSchemaError ? 'career-path-schema' : 'CAREER_PATH_CONFLICT' });
      expect(await snapshot()).toEqual(before);
    }
  });

  it.each([
    { path: '/users/me/career-path', method: 'PUT', body: {}, role: 'student' as const },
    { path: '/admin/career-paths/INVALID', method: 'PUT', body: career, role: 'admin' as const },
    { path: '/admin/career-paths/x4-path', method: 'PUT', body: { title: 'x' }, role: 'admin' as const },
    { path: '/feedback', method: 'POST', body: { rating: 'great' }, role: 'student' as const },
  ])('X4 validation refuses $method $path without writes', async ({ path, method, body, role }) => {
    const before = await snapshot();
    await expectError(await request(path, method, body, role), 400);
    expect(await snapshot()).toEqual(before);
  });

  it('US-T008 refuses publication of a nonexistent draft', async () => {
    const before = await snapshot();
    await expectError(await request('/admin/career-paths/missing/publish', 'POST', undefined, 'admin'), 404, 'Career path draft not found');
    expect(await snapshot()).toEqual(before);
  });

  it('US-P003 handles feedback disappearing between lookup and triage persistence', async () => {
    const before = await snapshot();
    vi.spyOn(feedback, 'updateFeedbackTriage').mockResolvedValueOnce(null);
    await expectError(await request(`/feedback/${feedbackId}/triage`, 'PATCH', { workStatus: 'completed' }, 'admin'), 404, 'Feedback not found');
    expect(await snapshot()).toEqual(before);
  });
});
