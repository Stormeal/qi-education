import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

describe.each(['', '/api'])('US-T005 reliable saves %s', prefix => {
  let server: Server, url: string, owner: AuthUser, content: InMemoryCourseContentRepository;
  const metadata = createCourseSchema.parse({ title: 'Original title', description: 'Original description', teacher: 'Teacher', level: 'Beginner' });
  const sections = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Original section', components: [{ id: 'c', type: 'text', title: 'Lesson', content: 'Original body' }] }] }).sections;
  function request(path: string, method = 'GET', body?: unknown, revision?: unknown) {
    return fetch(url + path, { method, headers: { 'Content-Type': 'application/json',
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(owner), apiConfig.AUTH_TOKEN_SECRET!)}`,
      ...(revision === undefined ? {} : { 'X-Course-Revision': JSON.stringify(revision) }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function author() { return (await request('/content?view=author')).json(); }
  beforeEach(async () => {
    const auth = new InMemoryAuthRepository(), courses = new InMemoryCourseRepository();
    owner = (await auth.findByEmail('teacher@qi-education.local'))!;
    content = new InMemoryCourseContentRepository();
    await courses.createCourse(metadata, { id: 'course', createdAt: new Date().toISOString(), ownerUserId: owner.id });
    await content.updateCourseContent('course', sections);
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
      muxVideoService: null, muxWebhookService: null, gitHubFeedbackService: { hasConfig: () => false } as never }).listen(0);
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}/courses/course`;
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });
  it('AC01 rejects stale metadata and outline without replacing newer work', async () => {
    const old = (await author()).review;
    const newer = await request('', 'PATCH', { ...metadata, title: 'Newer title' }, old);
    expect(newer.status).toBe(200); expect((await newer.json()).review.version).toBe(old.version + 1);
    for (const [path, body] of [['', { ...metadata, title: 'Stale title' }], ['/content', { sections: [] }]] as const) {
      const stale = await request(path, 'PATCH', body, old);
      expect(stale.status).toBe(409); expect((await stale.json()).code).toBe('AUTHORING_CONFLICT');
    }
    const saved = await author(); expect(saved.review.course.title).toBe('Newer title'); expect(saved.sections).toEqual(sections);
  });
  it('RS-01 requires a valid snapshot precondition', async () => {
    for (const revision of [undefined, { version: -1 }, { version: 0, revisionId: null }]) {
      const response = await request('/content', 'PATCH', { sections: [] }, revision);
      expect(response.status).toBe(revision && 'revisionId' in revision ? 409 : 428);
    }
    expect((await author()).sections).toEqual(sections);
  });
  it('AC01 allows only one simultaneous writer of the same loaded snapshot', async () => {
    const old = (await author()).review;
    const responses = await Promise.all(['First writer', 'Second writer'].map(title => request('', 'PATCH', { ...metadata, title }, old)));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await author()).review.version).toBe(old.version + 1);
  });
  it('AC02 retries failed lessons with the metadata acknowledgement and rejects an intervening write', async () => {
    const old = (await author()).review;
    const details = await (await request('', 'PATCH', { ...metadata, title: 'Saved details' }, old)).json();
    vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(new Error('Storage unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request('/content', 'PATCH', { sections: [] }, details.review)).status).toBe(500);
    expect((await author()).review.course.title).toBe('Saved details'); expect((await author()).sections).toEqual(sections);
    expect((await request('/content', 'PATCH', { sections: [] }, details.review)).status).toBe(200);
    expect((await request('', 'PATCH', { ...metadata, title: 'Stale retry' }, details.review)).status).toBe(409);
  });
  it('AC02 first legacy save failure never changes data under the original revision', async () => {
    const old = (await author()).review;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(content, 'saveCourseReview').mockRejectedValueOnce(new Error('First workflow write failed'));
    expect((await request('', 'PATCH', { ...metadata, title: 'Unacknowledged details' }, old)).status).toBe(500);
    expect((await author()).review).toMatchObject({ version: old.version, course: { title: 'Original title' } });
    vi.mocked(content.saveCourseReview).mockRejectedValueOnce(new Error('First workflow write failed'));
    expect((await request('/content', 'PATCH', { sections: [] }, old)).status).toBe(500);
    expect((await author()).sections).toEqual(sections);
  });
  it('AC01 offers reconciliation when another session freezes the loaded revision', async () => {
    const old = (await author()).review;
    const decision = await fetch(url + '/review', { method: 'POST', headers: { 'Content-Type': 'application/json',
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(owner), apiConfig.AUTH_TOKEN_SECRET!)}` },
      body: JSON.stringify({ action: 'submit', expectedVersion: old.version, revisionId: old.revisionId }) });
    expect(decision.status).toBe(200);
    const stale = await request('', 'PATCH', { ...metadata, title: 'Preserved local title' }, old);
    expect(stale.status).toBe(409); expect((await stale.json()).code).toBe('AUTHORING_CONFLICT');
  });
});
