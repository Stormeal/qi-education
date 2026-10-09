import { freshAuthoringFetch } from './authoringTestRequest.js';
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

const metadata = createCourseSchema.parse({ title: 'Original reviewed course', description: 'Original published description.', teacher: 'Owner', level: 'Beginner' });
const sections = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Lessons', components: [{ id: 'lesson', title: 'Original lesson', type: 'text', content: 'Original private body' }] }] }).sections;

describe('US-T006 retained media and recovery', () => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository,
    content: InMemoryCourseContentRepository, assets: InMemoryCourseAssetRepository;
  let teacher: AuthUser, admin: AuthUser, student: AuthUser, other: AuthUser;
  const mux = { createDirectUpload: vi.fn(async () => ({ uploadId: 'replacement', uploadUrl: 'https://isolated.test/upload', playbackPolicy: 'public' as const })), removeVideo: vi.fn(async (_video: { courseId: string; assetId: string; uploadId: string }) => {}) };
  function start() {
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: assets, feedbackRepository: new InMemoryFeedbackRepository(), muxVideoService: mux,
      muxWebhookService: { unwrapWebhook: async body => JSON.parse(body) }, gitHubFeedbackService: { hasConfig: () => false } as never }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  function request(path: string, user?: AuthUser, method = 'GET', body?: unknown) {
    return freshAuthoringFetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? {
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  async function author() {
    const response = await request('/courses/course/content?view=author', teacher);
    expect(response.status).toBe(200);
    return await response.json();
  }
  async function act(action: string, user = teacher, reason = '') {
    const state = (await author()).review;
    const response = await request('/courses/course/review', user, 'POST', {
      action, reason, revisionId: state ? state.revisionId : 'legacy-course', expectedVersion: state?.version ?? 0 });
    expect(response.status).toBe(200);
    return await response.json();
  }
  async function published() {
    const current = (await courses.listCourses()).find(course => course.id === 'course')!;
    await courses.updateCourse('course', { ...current, status: 'published' });
    student = (await auth.enrollUserInCourse(student.id, 'course'))!;
  }
  async function live() {
    const catalog = await (await request('/courses')).json();
    return catalog.find((course: { id: string }) => course.id === 'course');
  }
  beforeEach(async () => {
    vi.clearAllMocks();
    mux.removeVideo.mockResolvedValue(undefined);
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository(); assets = new InMemoryCourseAssetRepository();
    teacher = (await auth.findByEmail('teacher@qi-education.local'))!;
    admin = (await auth.findByEmail('admin@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    other = await auth.createUser({ ...teacher, id: 'other', email: 'other@example.test' });
    await courses.createCourse(metadata, { id: 'course', createdAt: '2026-10-09T00:00:00.000Z', ownerUserId: teacher.id });
    await content.updateCourseContent('course', sections); start();
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });


  async function video() {
    const sections = updateCourseContentSchema.parse({ sections: [{ id: 's', title: 'Video', components: [{ id: 'video', type: 'video', title: 'Video', mux: { uploadId: 'upload', assetId: 'asset', playbackId: 'playback', status: 'ready' } }] }] }).sections;
    await content.updateCourseContent('course', sections);
    return sections;
  }
  const remove = () => request('/courses/course/content/components/video/mux-video', teacher, 'DELETE', { sectionId: 's' });
  it('VO-01 preserves published playback after removal from a working revision', async () => {
    await video(); await published(); await act('start-revision');
    expect((await remove()).status).toBe(200);
    expect(mux.removeVideo).not.toHaveBeenCalled();
    expect((await author()).sections[0].components[0].mux).toBeUndefined();
    expect((await (await request('/courses/course/content', student)).json()).sections[0].components[0].mux.playbackId).toBe('playback');
  });
  it('VO-01 preserves another working component referencing the same asset', async () => {
    const sections = await video();
    sections[0].components.push({ ...sections[0].components[0], id: 'second' });
    await content.updateCourseContent('course', sections);
    expect((await remove()).status).toBe(200);
    expect(mux.removeVideo).not.toHaveBeenCalled();
    expect((await author()).sections[0].components[1].mux.assetId).toBe('asset');
  });
  it('VO-01/04 logs failed cleanup, permits repeat removal and reupload, and ignores an old callback', async () => {
    await video();
    mux.removeVideo.mockRejectedValueOnce(new Error('Isolated provider failure'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await remove()).status).toBe(200);
    expect(log).toHaveBeenCalledWith('Mux video cleanup required', expect.objectContaining({ courseId: 'course', assetId: 'asset', uploadId: 'upload' }));
    expect((await remove()).status).toBe(200);
    expect(mux.removeVideo).toHaveBeenCalledTimes(1);
    expect((await request('/courses/course/content/components/video/mux-upload', teacher, 'POST', { sectionId: 's' })).status).toBe(201);
    expect((await request('/webhooks/mux', undefined, 'POST', { type: 'video.asset.ready', data: { id: 'asset', upload_id: 'upload', passthrough: '{"c":"course","s":"s","m":"video"}', playback_ids: [{ id: 'playback', policy: 'public' }] } })).status).toBe(200);
    expect((await author()).sections[0].components[0].mux).toMatchObject({ uploadId: 'replacement', status: 'waiting', playbackId: '' });
  });
  it('VO-02 presents signed-only playback as a recoverable error', async () => {
    await video();
    expect((await request('/webhooks/mux', undefined, 'POST', { type: 'video.asset.ready', data: { id: 'asset', upload_id: 'upload', passthrough: '{"c":"course","s":"s","m":"video"}', playback_ids: [{ id: 'signed-playback', policy: 'signed' }] } })).status).toBe(200);
    expect((await author()).sections[0].components[0].mux).toMatchObject({ status: 'errored', errorMessage: expect.stringContaining('upload it again') });
  });
  it('VO-03 allows retry after provider upload creation fails without changing the draft', async () => {
    const sections = await video();
    const component = sections[0].components[0];
    if (component.type !== 'video') throw new Error('Missing video');
    delete component.mux;
    await content.updateCourseContent('course', sections);
    mux.createDirectUpload.mockRejectedValueOnce(new Error('Isolated provider unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const create = () => request('/courses/course/content/components/video/mux-upload', teacher, 'POST', { sectionId: 's' });
    expect((await create()).status).toBe(503);
    expect((await author()).sections[0].components[0].mux).toBeUndefined();
    expect((await create()).status).toBe(201);
  });

});
