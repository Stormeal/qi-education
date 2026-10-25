import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { apiConfig } from './config.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { updateCourseContentSchema } from './courseContent.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { createServer } from './server.js';

const origin = 'https://stormeal.github.io';
const attachmentBytes = Buffer.from('%PDF-1.4 isolated X9 resource');

function expectSecurityHeaders(response: Response): void {
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-frame-options')).toBe('DENY');
  expect(response.headers.get('x-powered-by')).toBeNull();
}

function expectStorageHeaders(response: Response): void {
  for (const kind of ['auth', 'content', 'asset']) {
    expect(response.headers.get(`x-qi-education-${kind}-storage`)).toBe('memory');
  }
}

describe.each(['', '/api'])('X9 API response headers (%s)', prefix => {
  let server: Server;
  let base: string;
  let token: string;
  let attachmentId: string;
  let thumbnailId: string;
  let content: InMemoryCourseContentRepository;

  const request = (path: string, init: RequestInit = {}) => fetch(base + prefix + path, init);
  const authorization = () => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    expect(apiConfig.mode).toBe('isolated');
    const auth = new InMemoryAuthRepository();
    const courses = new InMemoryCourseRepository();
    const assets = new InMemoryCourseAssetRepository();
    content = new InMemoryCourseContentRepository();
    const student = (await auth.findByEmail('student@qi-education.local'))!;
    await auth.enrollUserInCourse(student.id, 'demo-course-1');
    token = createSessionToken(toAuthenticatedUser(student), apiConfig.AUTH_TOKEN_SECRET!);
    const attachment = await assets.saveComponentAttachment({ courseId: 'demo-course-1', componentId: 'lesson',
      contentType: 'application/pdf', fileName: 'x9-notes.pdf', binary: attachmentBytes });
    attachmentId = attachment._id;
    const thumbnail = await assets.saveThumbnail({ courseId: 'demo-course-1', contentType: 'image/png',
      fileName: 'x9-thumbnail.png', binary: Buffer.from('isolated X9 thumbnail') });
    thumbnailId = thumbnail._id;
    await courses.updateCourseThumbnail('demo-course-1', { thumbnailAssetId: thumbnailId });
    await content.updateCourseContent('demo-course-1', updateCourseContentSchema.parse({ sections: [{
      id: 'section', title: 'Resources', components: [{ id: 'lesson', title: 'Notes', type: 'text', content: 'Isolated lesson',
        attachments: [{ id: attachmentId, assetId: attachmentId, fileName: attachment.fileName,
          contentType: attachment.contentType, sizeBytes: attachment.sizeBytes, createdAt: attachment.createdAt }] }],
    }] }).sections);
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: assets, muxVideoService: null, muxWebhookService: null,
      gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('External services are forbidden in X9 tests'); } },
      signInLimitOptions: { limit: 1, now: () => 1_000 },
    }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    expect([3001, 4200]).not.toContain(port);
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it('sets the policy on JSON while preserving private caching, Vary, CORS and storage headers', async () => {
    const response = await request('/auth/me', { headers: { ...authorization(), Origin: origin } });
    expect(response.status).toBe(200);
    expectSecurityHeaders(response);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toEqual(expect.arrayContaining(['Origin', 'Authorization']));
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expectStorageHeaders(response);
    expect((await response.json()).user.email).toBe('student@qi-education.local');
  });

  it('sets the policy on a routing 404', async () => {
    const response = await request('/x9-route-does-not-exist');
    expect(response.status).toBe(404);
    expectSecurityHeaders(response);
    // Express's existing fallback policy stays intact; X9 adds no CSP middleware.
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'");
    await response.text();
  });

  it('sets the policy on a 401 without changing its private response headers', async () => {
    const response = await request('/auth/me');
    expect(response.status).toBe(401);
    expectSecurityHeaders(response);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    expectStorageHeaders(response);
    await response.json();
  });

  it('sets the policy on attachment downloads without changing binary or download headers', async () => {
    const response = await request(`/courses/demo-course-1/content/attachments/${attachmentId}`, { headers: authorization() });
    expect(response.status).toBe(200);
    expectSecurityHeaders(response);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="x9-notes.pdf"');
    expect(response.headers.get('content-length')).toBe(String(attachmentBytes.length));
    expectStorageHeaders(response);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(attachmentBytes);
  });

  it('preserves immutable versioned thumbnail caching', async () => {
    const response = await request(`/courses/demo-course-1/thumbnail?v=${thumbnailId}`);
    expect(response.status).toBe(200);
    expectSecurityHeaders(response);
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(response.headers.get('vary')?.split(/,\s*/)).toContain('Authorization');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(await response.text()).toBe('isolated X9 thumbnail');
  });

  it.each(['/health', '/health/config', '/health/auth', '/health/content'])('makes %s no-store', async path => {
    const response = await request(path);
    expect(response.status).toBe(200);
    expectSecurityHeaders(response);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expectStorageHeaders(response);
    expect((await response.json()).status).toBe('ok');
  });

  it('keeps unavailable health responses no-store too', async () => {
    vi.spyOn(content, 'checkHealth').mockRejectedValueOnce(new Error('Synthetic isolated health outage'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request('/health/content');
    expect(response.status).toBe(503);
    expectSecurityHeaders(response);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).status).toBe('unavailable');
  });

  it('preserves Retry-After on a rate-limited sign-in', async () => {
    const login = () => request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x9-unknown@example.invalid', password: 'WrongPassword123!' }) });
    const first = await login(); expect(first.status).toBe(401); await first.json();
    const response = await login();
    expect(response.status).toBe(429);
    expectSecurityHeaders(response);
    expect(response.headers.get('retry-after')).toBe('900');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expectStorageHeaders(response);
    await response.json();
  });

  it('sets the policy even when JSON parsing rejects a request before routes', async () => {
    const response = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(response.status).toBe(400);
    expectSecurityHeaders(response);
    await response.json();
  });

  it('sets the policy on CORS preflight without changing CORS behavior', async () => {
    const response = await request('/auth/me', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } });
    expect(response.status).toBe(204);
    expectSecurityHeaders(response);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET,HEAD,PUT,PATCH,POST,DELETE');
    expect(response.headers.get('vary')?.split(/,\s*/)).toEqual(expect.arrayContaining(['Origin', 'Access-Control-Request-Headers']));
  });
});
