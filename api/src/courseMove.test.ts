import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema } from './courseContent.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

describe('US-T012-AC05 media after moving a lesson', () => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository,
    content: InMemoryCourseContentRepository, assets: InMemoryCourseAssetRepository, owner: AuthUser, student: AuthUser;
  const mux = { createDirectUpload: vi.fn(async () => ({ uploadId: 'replacement', uploadUrl: 'https://isolated.test/upload',
    playbackPolicy: 'public' as const })), removeVideo: vi.fn(async () => {}) };
  const headers = (user = owner) => ({ authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}` });
  const request = (path: string, method = 'GET', body?: unknown, user = owner) => fetch(base + path, {
    method, headers: { ...headers(user), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  async function author() { const response = await request('/courses/course/content?view=author'); expect(response.status).toBe(200); return response.json(); }
  async function move() {
    const doc = await author(); const [lesson] = doc.sections[0].components.splice(0, 1);
    doc.sections[1].components.push(lesson);
    const response = await fetch(base + '/courses/course/content', { method: 'PATCH', headers: {
      ...headers(), 'Content-Type': 'application/json',
      'X-Course-Revision': JSON.stringify({ revisionId: doc.review.revisionId, version: doc.review.version }),
    }, body: JSON.stringify({ sections: doc.sections }) });
    expect(response.status).toBe(200);
    return response.json();
  }
  async function video(status = 'ready') {
    await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: [
      { id: 'old', title: 'Old', components: [{ id: 'lesson', title: 'Video', type: 'video',
        mux: { uploadId: 'upload', assetId: 'asset', playbackId: status === 'ready' ? 'playback' : '', status } }] },
      { id: 'new', title: 'New', components: [] },
    ] }).sections);
  }
  async function callback(uploadId = 'upload', passthroughSection = 'old', prefix = '') {
    return fetch(base + prefix + '/webhooks/mux', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      type: 'video.asset.ready', data: { id: 'asset', upload_id: uploadId,
        passthrough: JSON.stringify({ c: 'course', s: passthroughSection, m: 'lesson' }), playback_ids: [{ id: 'callback-playback', policy: 'public' }] },
    }) });
  }
  beforeEach(async () => {
    vi.clearAllMocks(); auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository();
    content = new InMemoryCourseContentRepository(); assets = new InMemoryCourseAssetRepository();
    owner = (await auth.findByEmail('teacher@qi-education.local'))!; student = (await auth.findByEmail('student@qi-education.local'))!;
    await courses.createCourse(createCourseSchema.parse({ title: 'Moved lesson', description: 'Isolated move', teacher: 'Owner', level: 'Beginner' }),
      { id: 'course', createdAt: '2026-10-10T00:00:00Z', ownerUserId: owner.id });
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: assets, careerPathRepository: new InMemoryCareerPathRepository(),
      learningProgressRepository: new InMemoryLearningProgressRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
      muxVideoService: mux, muxWebhookService: { unwrapWebhook: async body => JSON.parse(body) },
      gitHubFeedbackService: { hasConfig: () => false } as never }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { vi.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });

  it('retains saved ready playback and accepts remove/reupload using the destination chapter', async () => {
    await video(); const saved = await move();
    expect(saved.sections[1].components[0].mux).toMatchObject({ uploadId: 'upload', playbackId: 'playback', status: 'ready' });
    expect((await request('/courses/course/content/components/lesson/mux-video', 'DELETE', { sectionId: 'old' })).status).toBe(404);
    expect((await request('/courses/course/content/components/lesson/mux-video', 'DELETE', { sectionId: 'new' })).status).toBe(200);
    expect((await request('/courses/course/content/components/lesson/mux-upload', 'POST', { sectionId: 'new' })).status).toBe(201);
    expect((await author()).sections[1].components[0].mux).toMatchObject({ uploadId: 'replacement', status: 'waiting' });
    expect(mux.createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({ sectionId: 'new', componentId: 'lesson' }));
  });
  it.each(['', '/api'])('resolves a matching pending callback carrying the old chapter ID (%s)', async prefix => {
    await video('processing'); await move(); expect((await callback('upload', 'old', prefix)).status).toBe(200);
    expect((await author()).sections[1].components[0].mux).toMatchObject({ playbackId: 'callback-playback', status: 'ready' });
  });
  it('does not apply an old-chapter callback to a replacement upload', async () => {
    await video('processing'); await move();
    await request('/courses/course/content/components/lesson/mux-video', 'DELETE', { sectionId: 'new' });
    await request('/courses/course/content/components/lesson/mux-upload', 'POST', { sectionId: 'new' });
    expect((await callback()).status).toBe(200);
    expect((await author()).sections[1].components[0].mux).toMatchObject({ uploadId: 'replacement', playbackId: '', status: 'waiting' });
  });
  it('preserves live playback while a working lesson moves and a pending callback resolves in both snapshots', async () => {
    await video('processing'); const metadata = (await courses.listCourses()).find(item => item.id === 'course')!;
    await courses.updateCourse('course', { ...metadata, status: 'published' }); student = (await auth.enrollUserInCourse(student.id, 'course'))!;
    const doc = await author();
    expect((await request('/courses/course/review', 'POST', { action: 'start-revision', revisionId: doc.review.revisionId, expectedVersion: doc.review.version })).status).toBe(200);
    await move(); expect((await callback()).status).toBe(200);
    const live = await (await request('/courses/course/content', 'GET', undefined, student)).json();
    expect(live.sections[0].components[0].mux.playbackId).toBe('callback-playback');
    expect(live.sections[1].components).toEqual([]);
    expect((await author()).sections[1].components[0].mux.playbackId).toBe('callback-playback');
  });
  it.each(['text', 'resources'])('keeps %s attachments downloadable and allows adding/removing after the move', async type => {
    const asset = await assets.saveComponentAttachment({ courseId: 'course', componentId: 'lesson', fileName: 'original.pdf',
      contentType: 'application/pdf', binary: Buffer.from('original bytes') });
    await content.updateCourseContent('course', updateCourseContentSchema.parse({ sections: [
      { id: 'old', title: 'Old', components: [{ id: 'lesson', type, title: 'Documents', content: '<p>Reading</p>', attachments: [
        { id: 'attachment', assetId: asset._id, fileName: 'original.pdf', contentType: 'application/pdf', sizeBytes: asset.sizeBytes, createdAt: asset.createdAt },
      ] }] }, { id: 'new', title: 'New', components: [] },
    ] }).sections);
    await move(); const download = await request(`/courses/course/content/attachments/${asset._id}`);
    expect(download.status).toBe(200); expect(await download.text()).toBe('original bytes');
    expect((await request(`/courses/course/content/attachments/${asset._id}`, 'GET', undefined, student)).status).toBe(403);
    const upload = await fetch(base + '/courses/course/content/components/lesson/attachments', { method: 'PUT', headers: {
      ...headers(), 'Content-Type': 'application/pdf', 'x-section-id': 'new', 'x-file-name': 'new.pdf',
    }, body: Buffer.from('new bytes') });
    expect(upload.status, await upload.clone().text()).toBe(201); const uploaded = await upload.json();
    expect(uploaded.content.sections[1].components[0].attachments).toHaveLength(2);
    expect((await request(`/courses/course/content/components/lesson/attachments/${asset._id}`, 'DELETE', { sectionId: 'old' })).status).toBe(404);
    expect((await request(`/courses/course/content/components/lesson/attachments/${asset._id}`, 'DELETE', { sectionId: 'new' })).status).toBe(200);
    expect((await request(`/courses/course/content/attachments/${asset._id}`)).status).toBe(404);
    expect(await (await request(`/courses/course/content/attachments/${uploaded.attachment.assetId}`)).text()).toBe('new bytes');
  });
});
