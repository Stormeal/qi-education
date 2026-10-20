/**
 * X4 inventory (line numbers refer to production sources at assignment start).
 * Unit: explicit handler decision/status exit, plus generic 500 and Mongo 503
 * propagation per handler. Different failing operations in one catch do not
 * multiply the count. Compound conditions are one decision. Common anonymous
 * 401 (routePermissions.test.ts), JSON/parser encoding and course-lock/review
 * middleware mappings are shared, excluded here. Author role/ownership 403 is
 * one gate per author handler (courseOwnership.test.ts). Raw size/MIME exits
 * are included. Cleanup's caught exception with a successful 200 is included.
 *
 * B = baseline test file/test; N = new test name fragment below; U = uncovered.
 * paymentRoutes.ts:
 * webhook :56 503 disabled N unavailable webhook; :66 400 signature B
 *   paymentRoutes/AC06; :72 500 exception B storage failure/retries enrollment;
 *   :67 -> server:1598 503 Mongo N payment storage errors [webhook].
 * checkout :79 400 return B foreign return; :80 503 disabled B no payment service;
 *   :82 404 course/:83 403 unpublished/:84 400 free/:86 409 enrolled B checkout
 *   refuses; :94 503 provider B AC05 provider failures; :81/87 500 exception
 *   N payment storage errors [checkout]; ->1598 503 Mongo N same.
 * confirm :98 400 schema B empty session; :99 503 disabled B no payment service;
 *   :102 503 provider B AC05; :104 404 missing/foreign session B refuses foreign;
 *   :107 500 exception N payment storage errors [confirm]; ->1598 503 Mongo same.
 * portal :112 400 return B foreign return; :113 503 disabled B no payment service;
 *   :115 404 no customer B AC07; :117 503 provider B AC05; :114 500 exception
 *   N payment storage errors [portal]; ->1598 503 Mongo same.
 * Payment total: 25 found = 17 baseline + 8 newly covered + 0 uncovered.
 *
 * server.ts subset:
 * Mux webhook :252 503 disabled N unavailable webhook; :267 401 signature B
 *   server/rejects invalid Mux webhook signatures; :271 500 + ->1598 503 Mongo
 *   N media storage errors [Mux webhook].
 * thumbnail PUT :280/2098 403 author B courseOwnership; :288 404 course N missing
 *   author resources; :293 503 unsafe assets N rejects unsafe asset storage;
 *   :303 415 MIME/:281 413 size B requestErrors/RD-03, RD-02;
 *   :308 400 empty N empty raw upload; :332 404 null metadata result U:
 *   reviewedRepositories.updateCourseThumbnail (courseReview.ts:177) delegates
 *   updateThumbnail (:155), which
 *   either returns an effective Course or throws; it cannot return null. Parent
 *   records DEF-055 for these obsolete null guards; no false passing test added.
 *   :341 500 + ->1598 503 Mongo N media storage errors [thumbnail PUT].
 * attachment PUT :351 403 author B courseOwnership; :364 404 course N missing
 *   author resources; :369 503 unsafe assets N rejects unsafe asset storage;
 *   :377 400 section N requires attachment section; :382 400 empty N empty raw
 *   upload; :389 404 content N missing author content; :396 404 component/type B
 *   questionImage/AC03 keeps other lesson MIME; :406 415 MIME B requestErrors,
 *   questionImage/AC03; :353 413 size B requestErrors/RD-02;
 *   :461 500 + ->1598 503 Mongo N media storage errors [attachment PUT].
 * thumbnail GET :751 404 hidden/missing pointer/:758 404 missing/foreign asset/
 *   :769 500 B thumbnailCache keeps nonexistent/missing/draft/foreign/store
 *   failures; ->1598 503 Mongo N thumbnail storage unavailable.
 * attachment GET :884 404 course N missing downloaded course; :889 403 access B
 *   server/stores attachments; :898 404 unbound B courseMove attachment follows
 *   lesson; :905 404 missing/foreign asset N missing download asset;
 *   :914 500 + ->1598 503 Mongo N media storage errors [attachment GET].
 * quiz POST :975 404 course N US-T013 missing quiz course; :977 403 access/
 *   :979 400 schema/:990 400 bad answer IDs B simpleQuiz/AC03;
 *   :982 409 stored schema N US-T013 malformed assessment;
 *   :985 404 quiz N US-T013 missing quiz; :987 409 readiness N US-T013 unfinished
 *   assessment; :992 500 + ->1598 503 Mongo N media storage errors [quiz POST].
 * mux-upload :998 403 author B courseOwnership; :1002 503 disabled N unavailable
 *   upload; :1006 400 schema N invalid media section; :1014 404 course N missing
 *   author resources; :1021 404 content N missing author content;
 *   :1028 404 component N missing video component; :1033 409 existing N existing
 *   video; :1049 503 provider B muxRoutes/VO-03;
 *   :1087 500 + ->1598 503 Mongo N media storage errors [mux-upload].
 * mux-video DELETE :1095 403 author B courseOwnership; :1098 400 schema N invalid
 *   media section; :1106 404 course N missing author resources; :1113 404 content
 *   N missing author content; :1120 404 component B courseLockResponse/error
 *   after release; :1169 500 + ->1598 503 Mongo N media storage errors [mux-video];
 *   :1163 caught cleanup/200 B muxRoutes/VO-01/04.
 * attachment DELETE :1261 403 author B courseOwnership; :1264 400 schema N invalid
 *   media section; :1275 404 course N missing author resources; :1282 404 content
 *   N missing author content; :1289 404 component B courseMove/old section;
 *   :1294 404 attachment N missing attachment reference; :1300 403 foreign asset
 *   B courseOwnership/cannot delete foreign; :1328 500 + ->1598 503 Mongo N media
 *   storage errors [attachment DELETE].
 * Server subset: 70 found = 24 baseline + 45 newly covered + 1 uncovered.
 * No shared provider, secrets or durable stores are used by this suite.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema } from './courseContent.js';
import { InMemoryPaymentRepository } from './paymentRepository.js';
import { FakePaymentService } from './paymentService.js';
import { AmbiguousCourseWriteError } from './courseMutationLock.js';
import type { MuxWebhookEvent } from './muxService.js';
import { createServer } from './server.js';

const componentPath = '/courses/course/content/components';
const thumbnailPath = '/courses/course/thumbnail';
const attachmentPath = `${componentPath}/text/attachments`;
const videoPath = `${componentPath}/video`;
const quizPath = `${componentPath}/quiz/quiz-attempts`;
const sections = () => updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons', components: [
  { id: 'text', type: 'text', title: 'Notes', content: 'Retain this lesson.' },
  { id: 'resources', type: 'resources', title: 'Resources' },
  { id: 'video', type: 'video', title: 'Video' },
  { id: 'quiz', type: 'quiz', title: 'Quiz', quiz: { passPoints: 1, questions: [
    { id: 'q', question: 'Correct?', answers: [{ id: 'yes', text: 'Yes', isCorrect: true }, { id: 'no', text: 'No', isCorrect: false }] },
  ] } },
] }] }).sections;
const mongoError = () => Object.assign(new Error('isolated storage failure'), { name: 'MongoNetworkError' });

describe('X4 US-T006 media / US-T014 assets / US-L024 payment error branches', () => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository;
  let content: InMemoryCourseContentRepository, assets: InMemoryCourseAssetRepository;
  let payments: InMemoryPaymentRepository, service: FakePaymentService, owner: AuthUser, student: AuthUser;
  const mux = {
    createDirectUpload: vi.fn(async () => ({ uploadId: 'upload', uploadUrl: 'https://isolated.test/upload', playbackPolicy: 'public' as const })),
    removeVideo: vi.fn(async () => {}),
  };
  const webhook = { unwrapWebhook: vi.fn(async (): Promise<MuxWebhookEvent> => ({ type: 'ignored', data: {} })) };

  function start(overrides: Parameters<typeof createServer>[0] = {}) {
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: assets, paymentRepository: payments, paymentService: service,
      muxVideoService: mux, muxWebhookService: webhook, ...overrides }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const close = () => new Promise<void>(resolve => server.close(() => resolve()));
  function request(path: string, method = 'POST', body?: unknown, user: AuthUser | null = owner, extra: Record<string, string> = {}) {
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(user ? { authorization: `Bearer ${createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET)}` } : {}), ...extra },
      ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body) }) });
  }
  async function errorResponse(response: Response, status: number, message: string) {
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message });
  }
  async function seedAttachment() {
    const asset = await assets.saveComponentAttachment({ courseId: 'course', componentId: 'text',
      contentType: 'application/pdf', fileName: 'notes.pdf', binary: Buffer.from('retained') });
    const updated = sections();
    updated[0].components[0].attachments = [{ id: 'reference', assetId: asset._id, fileName: asset.fileName,
      sizeBytes: asset.sizeBytes, createdAt: asset.createdAt, contentType: asset.contentType }];
    await content.updateCourseContent('course', updated);
    return asset;
  }
  async function paidSession() {
    const { url } = await service.createCheckout({ userId: student.id, email: student.email, courseId: 'course',
      courseTitle: 'Course', amountDkk: 499, customerId: null,
      successUrl: 'https://isolated.test/{CHECKOUT_SESSION_ID}', cancelUrl: 'https://isolated.test/cancel' });
    return url.split('/').at(-1)!;
  }
  beforeEach(async () => {
    vi.clearAllMocks();
    webhook.unwrapWebhook.mockResolvedValue({ type: 'ignored', data: {} });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository(); assets = new InMemoryCourseAssetRepository();
    payments = new InMemoryPaymentRepository(); service = new FakePaymentService();
    owner = (await auth.findByEmail('teacher@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    await courses.createCourse(createCourseSchema.parse({ title: 'Isolated media errors', description: 'X4 error coverage.',
      teacher: 'Owner', level: 'Beginner' }), { id: 'course', createdAt: '2026-10-20', ownerUserId: owner.id });
    await content.updateCourseContent('course', sections());
    start();
  });
  afterEach(async () => { vi.restoreAllMocks(); await close(); });

  it.each(['stripe', 'mux'])('unavailable webhook (%s) returns retryable configuration status', async provider => {
    await close(); start({ paymentService: null, muxWebhookService: null });
    await errorResponse(await request(`/webhooks/${provider}`, 'POST', {}, null), 503,
      provider === 'stripe' ? 'Purchases are temporarily unavailable.' : 'Mux webhooks are not configured.');
  });

  it.each(['checkout', 'confirm', 'portal', 'webhook'] as const)('US-L024 payment storage errors at %s preserve safe responses', async operation => {
    const sessionId = await paidSession();
    const before = await auth.findById(student.id);
    const returnUrl = 'http://localhost:4200/courses/course';
    await courses.updateCourse('course', { ...(await courses.listCourses()).find(c => c.id === 'course')!, status: 'published', priceDkk: 499 });
    for (const [failure, status] of [[new Error('private storage details'), 500], [mongoError(), 503]] as const) {
      const spy = operation === 'checkout' || operation === 'portal'
        ? vi.spyOn(payments, 'latestCustomerId').mockRejectedValueOnce(failure)
        : vi.spyOn(payments, 'add').mockRejectedValueOnce(failure);
      const path = operation === 'webhook' ? '/webhooks/stripe' : operation === 'portal'
        ? '/users/me/billing-portal' : `/users/me/courses/course/checkout${operation === 'confirm' ? '/confirm' : ''}`;
      const body = operation === 'webhook' ? { type: 'checkout.session.completed', data: { object: { id: sessionId, payment_status: 'paid' } } }
        : operation === 'confirm' ? { sessionId } : { returnUrl };
      const response = await request(path, 'POST', body, student, { 'stripe-signature': 'fake-signature' });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(status === 500 ? { message: 'Unexpected server error' }
        : { message: 'Storage is temporarily unavailable. Please try again.', code: 'STORE_UNAVAILABLE', retryable: true });
      expect((await auth.findById(student.id))!.enrolledCourseIds).toEqual(before!.enrolledCourseIds);
      spy.mockRestore();
    }
  });

  it.each([thumbnailPath, attachmentPath])('empty raw upload %s is refused without storing assets', async path => {
    const write = vi.spyOn(assets, path === thumbnailPath ? 'saveThumbnail' : 'saveComponentAttachment');
    const before = structuredClone(await content.getCourseContent('course'));
    await errorResponse(await request(path, 'PUT', Buffer.alloc(0), owner,
      { 'Content-Type': path === thumbnailPath ? 'image/png' : 'application/pdf', 'X-Section-Id': 's' }),
    400, path === thumbnailPath ? 'Thumbnail image data is required.' : 'Attachment data is required.');
    expect(write).not.toHaveBeenCalled();
    expect(await content.getCourseContent('course')).toEqual(before);
  });

  it('requires attachment section before storing bytes', async () => {
    const write = vi.spyOn(assets, 'saveComponentAttachment');
    await errorResponse(await request(attachmentPath, 'PUT', Buffer.from('bytes'), owner, { 'Content-Type': 'application/pdf' }),
      400, 'Section id is required.');
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['thumbnail', 'attachment'])('rejects unsafe asset storage for %s using memory fakes', async kind => {
    await close();
    // Storage tags exercise deployment consistency guards; methods stay in-memory.
    Object.defineProperty(content, 'storageType', { value: 'mongodb' });
    if (kind === 'thumbnail') Object.defineProperty(courses, 'storageType', { value: 'mongodb' });
    start();
    const write = vi.spyOn(assets, kind === 'thumbnail' ? 'saveThumbnail' : 'saveComponentAttachment');
    const response = await request(kind === 'thumbnail' ? thumbnailPath : attachmentPath, 'PUT', Buffer.from('bytes'), owner,
      { 'Content-Type': kind === 'thumbnail' ? 'image/png' : 'application/pdf', 'X-Section-Id': 's' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: kind === 'thumbnail'
      ? 'Thumbnail uploads require shared asset storage when courses are stored in MongoDB. Configure MongoDB course asset storage before uploading thumbnails.'
      : 'Attachment uploads require shared asset storage when course content is stored in MongoDB. Configure MongoDB course asset storage before uploading attachments.' });
    expect(write).not.toHaveBeenCalled();
  });

  const authorOperations: { path: string; method: string; body: unknown; headers: Record<string, string> }[] = [
    { path: thumbnailPath, method: 'PUT', body: Buffer.from('bytes'), headers: { 'Content-Type': 'image/png' } },
    { path: attachmentPath, method: 'PUT', body: Buffer.from('bytes'), headers: { 'Content-Type': 'application/pdf', 'X-Section-Id': 's' } },
    { path: videoPath + '/mux-upload', method: 'POST', body: { sectionId: 's' }, headers: {} },
    { path: videoPath + '/mux-video', method: 'DELETE', body: { sectionId: 's' }, headers: {} },
    { path: attachmentPath + '/missing', method: 'DELETE', body: { sectionId: 's' }, headers: {} },
  ];
  it.each(authorOperations)('missing author resources return 404 ($method $path)', async operation => {
    await errorResponse(await request(operation.path.replace('/course/', '/missing/'), operation.method,
      operation.body, owner, operation.headers), 404, 'Course not found');
  });
  it.each(authorOperations.slice(1))('missing author content returns 404 ($method $path)', async operation => {
    await content.deleteCourseContent('course');
    await errorResponse(await request(operation.path, operation.method, operation.body, owner, operation.headers),
      404, 'Course content not found');
  });
  it.each([videoPath + '/mux-upload', videoPath + '/mux-video', attachmentPath + '/missing'])('invalid media section returns field validation for %s', async path => {
    const response = await request(path, path.endsWith('mux-upload') ? 'POST' : 'DELETE', {});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: 'Invalid request body', issues: expect.any(Array) });
  });
  it('unavailable upload returns 503 before contacting Mux', async () => {
    await close(); start({ muxVideoService: null });
    await errorResponse(await request(videoPath + '/mux-upload', 'POST', { sectionId: 's' }), 503, 'Mux video uploads are not configured.');
    expect(mux.createDirectUpload).not.toHaveBeenCalled();
  });
  it('missing video component refuses Mux upload', async () => {
    await errorResponse(await request(videoPath.replace('/video', '/missing') + '/mux-upload', 'POST', { sectionId: 's' }),
      404, 'Video component not found');
    expect(mux.createDirectUpload).not.toHaveBeenCalled();
  });
  it('existing video prevents a second provider upload', async () => {
    const response = await request(videoPath + '/mux-upload', 'POST', { sectionId: 's' });
    expect(response.status).toBe(201);
    const before = structuredClone(await content.getCourseContent('course'));
    await errorResponse(await request(videoPath + '/mux-upload', 'POST', { sectionId: 's' }),
      409, 'Remove the existing video before uploading a new one.');
    expect(mux.createDirectUpload).toHaveBeenCalledTimes(1);
    expect(await content.getCourseContent('course')).toEqual(before);
  });
  it('missing attachment reference returns 404 without deleting an asset', async () => {
    const remove = vi.spyOn(assets, 'deleteAsset');
    await errorResponse(await request(attachmentPath + '/missing', 'DELETE', { sectionId: 's' }), 404, 'Attachment not found');
    expect(remove).not.toHaveBeenCalled();
  });
  it('missing downloaded course returns 404', async () => {
    await errorResponse(await request('/courses/missing/content/attachments/missing', 'GET'), 404, 'Course not found');
  });
  it.each(['missing', 'foreign'])('missing download asset (%s) returns 404 after reference check', async kind => {
    const asset = await seedAttachment();
    if (kind === 'missing') await assets.deleteAsset(asset._id, 'course');
    else vi.spyOn(assets, 'getComponentAttachment').mockResolvedValue({ ...asset, courseId: 'foreign' });
    await errorResponse(await request('/courses/course/content/attachments/' + asset._id, 'GET'), 404, 'Attachment not found');
  });
  it('US-T013 missing quiz course returns 404', async () => {
    await errorResponse(await request(quizPath.replace('/course/', '/missing/'), 'POST', { sectionId: 's', answers: [] }), 404, 'Course not found');
  });
  it.each(['missing', 'text'])('US-T013 missing quiz (%s) returns 404', async component => {
    await errorResponse(await request(quizPath.replace('/quiz/', `/${component}/`), 'POST', { sectionId: 's', answers: [] }), 404, 'Quiz not found');
  });
  it('US-T013 malformed assessment returns a correction conflict', async () => {
    const broken = sections();
    const quiz = broken[0].components[3];
    if (quiz.type !== 'quiz') throw new Error('Fixture');
    quiz.quiz.questions[0].answers = [];
    await content.updateCourseContent('course', broken);
    await errorResponse(await request(quizPath, 'POST', { sectionId: 's', answers: [] }), 409, 'This assessment needs correction by its author.');
  });
  it('US-T013 unfinished assessment returns a correction conflict', async () => {
    const unfinished = sections();
    const quiz = unfinished[0].components[3];
    if (quiz.type !== 'quiz') throw new Error('Fixture');
    quiz.quiz.questions[0].answers.forEach(answer => answer.isCorrect = false);
    await content.updateCourseContent('course', unfinished);
    await errorResponse(await request(quizPath, 'POST', { sectionId: 's', answers: [] }), 409, 'This assessment needs correction by its author.');
  });

  it.each(['Mux webhook', 'thumbnail PUT', 'attachment PUT', 'attachment GET', 'quiz POST', 'mux-upload', 'mux-video', 'attachment DELETE'] as const)
  ('media storage errors at %s keep safe error responses and original content', async operation => {
    const asset = await seedAttachment();
    if (operation === 'mux-video') {
      const draft = (await content.getCourseContent('course'))!.sections;
      const video = draft[0].components[2];
      if (video.type !== 'video') throw new Error('Fixture');
      video.mux = { provider: 'mux', uploadId: 'existing-upload', assetId: 'existing-asset', playbackId: 'playback',
        playbackPolicy: 'public', status: 'ready', durationSeconds: 30, thumbnailUrl: '', errorMessage: '', captions: [] };
      await content.updateCourseContent('course', draft);
    }
    if (operation === 'Mux webhook') webhook.unwrapWebhook.mockResolvedValue({ type: 'video.asset.ready', data: {
      id: 'asset', upload_id: 'upload', passthrough: JSON.stringify({ c: 'course', s: 's', m: 'video' }),
      playback_ids: [{ id: 'playback', policy: 'public' }],
    } });
    const before = structuredClone(await content.getCourseContent('course'));
    for (const [failure, status] of [[new Error('private storage details'), 500], [mongoError(), 503]] as const) {
      const spy = operation === 'thumbnail PUT' ? vi.spyOn(assets, 'saveThumbnail').mockRejectedValueOnce(failure)
        : operation === 'attachment PUT' ? vi.spyOn(assets, 'saveComponentAttachment').mockRejectedValueOnce(failure)
        : operation === 'attachment GET' || operation === 'attachment DELETE' ? vi.spyOn(assets, 'getComponentAttachment').mockRejectedValueOnce(failure)
        : operation === 'mux-upload' || operation === 'mux-video' ? vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(failure)
        : vi.spyOn(content, 'getCourseContent').mockRejectedValueOnce(failure);
      const response = operation === 'Mux webhook' ? await request('/webhooks/mux', 'POST', {}, null)
        : operation === 'thumbnail PUT' ? await request(thumbnailPath, 'PUT', Buffer.from('bytes'), owner, { 'Content-Type': 'image/png' })
        : operation === 'attachment PUT' ? await request(attachmentPath, 'PUT', Buffer.from('bytes'), owner, { 'Content-Type': 'application/pdf', 'X-Section-Id': 's' })
        : operation === 'attachment GET' ? await request('/courses/course/content/attachments/' + asset._id, 'GET')
        : operation === 'quiz POST' ? await request(quizPath, 'POST', { sectionId: 's', answers: [] })
        : operation === 'mux-upload' ? await request(videoPath + '/mux-upload', 'POST', { sectionId: 's' })
        : operation === 'mux-video' ? await request(videoPath + '/mux-video', 'DELETE', { sectionId: 's' })
        : await request(attachmentPath + '/' + asset._id, 'DELETE', { sectionId: 's' });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(status === 500 ? { message: 'Unexpected server error' }
        : { message: 'Storage is temporarily unavailable. Please try again.', code: 'STORE_UNAVAILABLE', retryable: true });
      spy.mockRestore();
      expect(await content.getCourseContent('course')).toEqual(before);
    }
  });
  it('thumbnail storage unavailable returns retryable 503', async () => {
    vi.spyOn(assets, 'getThumbnail').mockRejectedValueOnce(mongoError());
    await courses.updateCourseThumbnail('course', { thumbnailAssetId: 'stored-thumbnail' });
    const response = await request(thumbnailPath, 'GET');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Storage is temporarily unavailable. Please try again.', code: 'STORE_UNAVAILABLE', retryable: true });
  });

  it.each(['thumbnail', 'attachment'])('definite %s metadata-save failure cleans the newly created asset', async kind => {
    const before = structuredClone(await content.getCourseContent('course'));
    const save = vi.spyOn(assets, kind === 'thumbnail' ? 'saveThumbnail' : 'saveComponentAttachment');
    const remove = vi.spyOn(assets, 'deleteAsset');
    vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(new Error('isolated definite failure'));
    await errorResponse(await request(kind === 'thumbnail' ? thumbnailPath : attachmentPath, 'PUT', Buffer.from('new bytes'), owner,
      { 'Content-Type': kind === 'thumbnail' ? 'image/png' : 'application/pdf', 'X-Section-Id': 's' }), 500, 'Unexpected server error');
    const created = await save.mock.results[0].value;
    expect(remove).toHaveBeenCalledWith(created._id, 'course');
    expect(await (kind === 'thumbnail' ? assets.getThumbnail(created._id) : assets.getComponentAttachment(created._id))).toBeNull();
    expect(await content.getCourseContent('course')).toEqual(before);
  });
  it.each(['thumbnail', 'attachment'])('uncertain %s save retains bytes for recovery', async kind => {
    const save = vi.spyOn(assets, kind === 'thumbnail' ? 'saveThumbnail' : 'saveComponentAttachment');
    const remove = vi.spyOn(assets, 'deleteAsset');
    vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(new AmbiguousCourseWriteError(new Error('isolated uncertain outcome')));
    await errorResponse(await request(kind === 'thumbnail' ? thumbnailPath : attachmentPath, 'PUT', Buffer.from('recovery bytes'), owner,
      { 'Content-Type': kind === 'thumbnail' ? 'image/png' : 'application/pdf', 'X-Section-Id': 's' }), 500, 'Unexpected server error');
    const created = await save.mock.results[0].value;
    expect(remove).not.toHaveBeenCalled();
    expect(await (kind === 'thumbnail' ? assets.getThumbnail(created._id) : assets.getComponentAttachment(created._id)))
      .toMatchObject({ _id: created._id, binary: Buffer.from('recovery bytes') });
  });
});
