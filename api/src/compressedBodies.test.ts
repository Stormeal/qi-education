import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { deflateSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshAuthoringFetch } from './authoringTestRequest.js';
import { createSessionToken, toAuthenticatedUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema } from './courseContent.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { FakePaymentService } from './paymentService.js';
import { createServer } from './server.js';

const sections = [{ id: 's', title: 'Chapter', components: [{ id: 'lesson', title: 'Notes', type: 'text', content: 'Original text' }] }];
const webhook = JSON.stringify({ type: 'isolated.unhandled.event', data: {} });
const routes = [
  { name: 'JSON', method: 'POST', path: '/auth/login', type: 'application/json', status: 200,
    bytes: Buffer.from(JSON.stringify({ email: 'teacher@qi-education.local', password: 'Password123!' })) },
  { name: 'course content JSON', method: 'PATCH', path: '/courses/course/content', type: 'application/json', status: 200,
    bytes: Buffer.from(JSON.stringify({ sections })) },
  { name: 'thumbnail raw upload', method: 'PUT', path: '/courses/course/thumbnail', type: 'image/png', status: 200,
    bytes: Buffer.from('isolated PNG bytes') },
  { name: 'attachment raw upload', method: 'PUT', path: '/courses/course/content/components/lesson/attachments', type: 'application/pdf', status: 201,
    bytes: Buffer.from('%PDF isolated attachment') },
  { name: 'Mux raw webhook', method: 'POST', path: '/webhooks/mux', type: 'application/json', status: 200, bytes: Buffer.from(webhook) },
  { name: 'Stripe raw webhook', method: 'POST', path: '/webhooks/stripe', type: 'application/json', status: 200, bytes: Buffer.from(webhook) },
];

describe.each(['', '/api'])('US-P018-AC04 compressed body policy (%s)', prefix => {
  let server: Server;
  let base: string;
  let token: string;
  let content: InMemoryCourseContentRepository;
  let assets: InMemoryCourseAssetRepository;
  const unwrapWebhook = vi.fn(async (_body: string) => ({ type: 'isolated.unhandled.event', data: {} }));
  const payments = new FakePaymentService();
  const stripeRead = vi.spyOn(payments, 'readWebhookEvent');

  beforeAll(async () => {
    expect(apiConfig.mode).toBe('isolated');
    const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository(); assets = new InMemoryCourseAssetRepository();
    const teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    token = createSessionToken(toAuthenticatedUser(teacher), apiConfig.AUTH_TOKEN_SECRET!);
    await courses.createCourse(createCourseSchema.parse({ title: 'Compression fixture', description: 'Isolated body parser verification.',
      level: 'Beginner', teacher: 'Teacher' }), { id: 'course', ownerUserId: teacher.id });
    await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections }).sections);
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: assets, paymentService: payments, muxVideoService: null,
      muxWebhookService: { unwrapWebhook }, gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('No external providers'); } },
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    expect([3001, 4200]).not.toContain(port);
    base = `http://127.0.0.1:${port}`;
  });
  beforeEach(() => { unwrapWebhook.mockClear(); stripeRead.mockClear(); });
  afterAll(async () => { stripeRead.mockRestore(); await new Promise<void>(resolve => server.close(() => resolve())); });

  function send(route: typeof routes[number], encoding?: string): Promise<Response> {
    const bytes = encoding === 'gzip' ? gzipSync(route.bytes) : encoding === 'deflate' ? deflateSync(route.bytes) : route.bytes;
    return freshAuthoringFetch(base + prefix + route.path, { method: route.method, headers: {
      authorization: `Bearer ${token}`, 'Content-Type': route.type, 'X-Section-Id': 's', 'X-File-Name': 'notes.pdf',
      'stripe-signature': 'fake-signature', ...(encoding ? { 'Content-Encoding': encoding } : {}),
    }, body: bytes });
  }

  it.each(routes.flatMap(route => ['gzip', 'deflate'].map(encoding => ({ ...route, encoding }))))(
    'refuses $encoding on $name before store or webhook effects', async route => {
      const before = structuredClone(await content.getCourseContent('course'));
      const thumbnailWrite = vi.spyOn(assets, 'saveThumbnail');
      const attachmentWrite = vi.spyOn(assets, 'saveComponentAttachment');
      try {
        const response = await send(route, route.encoding);
        expect(response.status).toBe(415);
        expect(await response.json()).toEqual({ message: 'Compressed request bodies are not accepted.' });
        expect(await content.getCourseContent('course')).toEqual(before);
        expect(thumbnailWrite).not.toHaveBeenCalled(); expect(attachmentWrite).not.toHaveBeenCalled();
        expect(unwrapWebhook).not.toHaveBeenCalled(); expect(stripeRead).not.toHaveBeenCalled();
      } finally { thumbnailWrite.mockRestore(); attachmentWrite.mockRestore(); }
    },
  );

  it.each(routes.flatMap(route => [undefined, 'identity'].map(encoding => ({ ...route, encoding }))))(
    'preserves uncompressed $name with Content-Encoding=$encoding', async route => {
      const response = await send(route, route.encoding);
      expect(response.status).toBe(route.status);
      const body = await response.json();
      if (route.name === 'JSON') expect(body.user.email).toBe('teacher@qi-education.local');
      if (route.name === 'course content JSON') expect(body.sections[0].components[0].content).toBe('Original text');
      if (route.name === 'thumbnail raw upload') {
        const download = await fetch(base + prefix + '/courses/course/thumbnail', { headers: { authorization: `Bearer ${token}` } });
        expect(download.status).toBe(200); expect(Buffer.from(await download.arrayBuffer())).toEqual(route.bytes);
      }
      if (route.name === 'attachment raw upload') {
        const download = await fetch(base + prefix + `/courses/course/content/attachments/${body.attachment.assetId}`, { headers: { authorization: `Bearer ${token}` } });
        expect(download.status).toBe(200); expect(Buffer.from(await download.arrayBuffer())).toEqual(route.bytes);
      }
      if (route.name === 'Mux raw webhook') { expect(body).toEqual({ received: true }); expect(unwrapWebhook.mock.calls[0][0]).toBe(webhook); }
      if (route.name === 'Stripe raw webhook') { expect(body).toEqual({ received: true }); expect(stripeRead).toHaveBeenCalledWith(webhook, 'fake-signature'); }
    },
  );

  it('refuses an unknown content encoding with the same safe 415 envelope', async () => {
    const response = await send(routes[0], 'unknown');
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ message: 'Compressed request bodies are not accepted.' });
  });
});
